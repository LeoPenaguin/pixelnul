package board

import (
	"context"
	"errors"
	"strconv"
	"strings"

	"github.com/redis/go-redis/v9"
)

// Store keeps the world in Redis. For a chunk "cx:cy":
//
//	chunk:cx:cy  65,536-byte string, one colour per pixel (missing or short = white)
//	meta:cx:cy   hash, "n:{offset}" = colour change count, "t:{offset}" = time of the last one (Unix ms)
//
// and for the whole world:
//
//	stats:hourly hash, "{Unix hour}" = paints during that hour (counted since this key exists)
type Store struct{ rdb redis.UniversalClient }

// NewStore stores the world in the given Redis.
func NewStore(rdb redis.UniversalClient) *Store { return &Store{rdb} }

// Info is a pixel's state. LastChange is nil if its colour never changed.
type Info struct {
	X          int    `json:"x"`
	Y          int    `json:"y"`
	C          int    `json:"c"`
	Changes    int64  `json:"changes"`
	LastChange *int64 `json:"lastChange"`
}

// Atomic paint: writes the byte, bumps the counters and timestamps the change. Every paint
// counts, same colour included: repainting a pixel is a deliberate (and paid) move.
// ponytail: stats:hourly keeps one field per hour forever (~9k a year); trim it if that ever matters.
var paintScript = redis.NewScript(`
local off = tonumber(ARGV[1])
redis.call('SETRANGE', KEYS[1], off, string.char(tonumber(ARGV[2])))
redis.call('HINCRBY', KEYS[2], 'n:' .. off, 1)
redis.call('HSET', KEYS[2], 't:' .. off, ARGV[3])
redis.call('HINCRBY', KEYS[3], ARGV[4], 1)
return 1
`)

const hourMs = 3_600_000

// Paint sets a pixel at time `at` (Unix ms).
func (s *Store) Paint(ctx context.Context, p Pixel, at int64) error {
	id, off := Locate(p.X, p.Y)
	keys := []string{"chunk:" + id, "meta:" + id, "stats:hourly"}
	return paintScript.Run(ctx, s.rdb, keys, off, p.C, at, at/hourMs).Err()
}

// Chunk returns a chunk's raw bytes; empty if it was never painted.
func (s *Store) Chunk(ctx context.Context, cx, cy int) ([]byte, error) {
	data, err := s.rdb.Get(ctx, "chunk:"+ChunkID(cx, cy)).Bytes()
	if errors.Is(err, redis.Nil) {
		return nil, nil
	}
	return data, err
}

// Info reads a pixel's colour and history.
func (s *Store) Info(ctx context.Context, x, y int) (Info, error) {
	id, off := Locate(x, y)
	o := strconv.FormatInt(off, 10)
	pipe := s.rdb.Pipeline()
	color := pipe.GetRange(ctx, "chunk:"+id, off, off)
	meta := pipe.HMGet(ctx, "meta:"+id, "n:"+o, "t:"+o)
	if _, err := pipe.Exec(ctx); err != nil {
		return Info{}, err
	}
	info := Info{X: x, Y: y}
	if v := color.Val(); len(v) == 1 {
		info.C = int(v[0])
	}
	if v, ok := meta.Val()[0].(string); ok {
		info.Changes, _ = strconv.ParseInt(v, 10, 64)
	}
	if v, ok := meta.Val()[1].(string); ok {
		last, _ := strconv.ParseInt(v, 10, 64)
		info.LastChange = &last
	}
	return info, nil
}

// Heat returns a chunk's change counts, one byte per pixel (capped at 255); empty if no pixel of
// the chunk was ever painted.
func (s *Store) Heat(ctx context.Context, cx, cy int) ([]byte, error) {
	meta, err := s.rdb.HGetAll(ctx, "meta:"+ChunkID(cx, cy)).Result()
	if err != nil || len(meta) == 0 {
		return nil, err
	}
	heat := make([]byte, ChunkSize*ChunkSize)
	for off, n := range changeCounts(meta) {
		heat[off] = byte(max(0, min(n, 255)))
	}
	return heat, nil
}

// changeCounts extracts offset → change count from a meta hash (skipping the "t:" fields).
func changeCounts(meta map[string]string) map[int]int64 {
	counts := make(map[int]int64, len(meta)/2)
	for k, v := range meta {
		off, ok := strings.CutPrefix(k, "n:")
		if !ok {
			continue
		}
		o, err1 := strconv.Atoi(off)
		n, err2 := strconv.ParseInt(v, 10, 64)
		if err1 == nil && err2 == nil && o >= 0 && o < ChunkSize*ChunkSize {
			counts[o] = n
		}
	}
	return counts
}

// Hot is the most changed pixel.
type Hot struct {
	X       int   `json:"x"`
	Y       int   `json:"y"`
	Changes int64 `json:"changes"`
}

// Stats sums up the world.
type Stats struct {
	Placed  int64   `json:"placed"`  // paints since the beginning, repaints included
	Painted int     `json:"painted"` // pixels painted at least once
	Pixels  int     `json:"pixels"`  // pixels in the world
	Hottest *Hot    `json:"hottest"` // nil while nothing is painted
	Colors  []int   `json:"colors"`  // pixels of each palette colour on the board (index 0 = white, unpainted included)
	Hours   []int64 `json:"hours"`   // paints during each of the last 24 hours, oldest first, current hour last
}

// Stats reads the whole world. Pixels outside the world (left by a former, larger size) are ignored.
// ponytail: scans every chunk (1.5 MB for 1280 × 720); callers cache it. A much bigger world
// would need running totals kept by the paint script.
func (s *Store) Stats(ctx context.Context, now int64) (Stats, error) {
	type chunk struct {
		cx, cy int
		data   *redis.StringCmd
		meta   *redis.MapStringStringCmd
	}
	var chunks []chunk
	pipe := s.rdb.Pipeline()
	for cy := (-WorldHeight / 2) >> ChunkShift; cy <= (WorldHeight/2-1)>>ChunkShift; cy++ {
		for cx := (-WorldWidth / 2) >> ChunkShift; cx <= (WorldWidth/2-1)>>ChunkShift; cx++ {
			id := ChunkID(cx, cy)
			chunks = append(chunks, chunk{cx, cy, pipe.Get(ctx, "chunk:"+id), pipe.HGetAll(ctx, "meta:"+id)})
		}
	}
	hour := now / hourMs
	fields := make([]string, 24)
	for i := range fields {
		fields[i] = strconv.FormatInt(hour-23+int64(i), 10)
	}
	hours := pipe.HMGet(ctx, "stats:hourly", fields...)
	if _, err := pipe.Exec(ctx); err != nil && !errors.Is(err, redis.Nil) {
		return Stats{}, err
	}

	st := Stats{Pixels: WorldWidth * WorldHeight, Colors: make([]int, len(Palette)), Hours: make([]int64, 24)}
	inWorld := func(c chunk, off int) (int, int, bool) {
		x, y := c.cx*ChunkSize+off%ChunkSize, c.cy*ChunkSize+off/ChunkSize
		return x, y, InWorld(x, y)
	}
	painted := 0 // pixels of a colour other than white
	for _, c := range chunks {
		for off, b := range []byte(c.data.Val()) {
			if _, _, ok := inWorld(c, off); ok && b != 0 && int(b) < len(Palette) {
				st.Colors[b]++
				painted++
			}
		}
		for off, n := range changeCounts(c.meta.Val()) {
			x, y, ok := inWorld(c, off)
			if !ok {
				continue
			}
			st.Placed += n
			st.Painted++
			// Ties: the topmost, then leftmost pixel, so the answer does not depend on map order.
			if h := st.Hottest; h == nil || n > h.Changes || n == h.Changes && (y < h.Y || y == h.Y && x < h.X) {
				st.Hottest = &Hot{x, y, n}
			}
		}
	}
	st.Colors[0] = st.Pixels - painted
	for i, v := range hours.Val() {
		if v, ok := v.(string); ok {
			st.Hours[i], _ = strconv.ParseInt(v, 10, 64)
		}
	}
	return st, nil
}
