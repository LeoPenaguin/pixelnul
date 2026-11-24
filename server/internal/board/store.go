package board

import (
	"context"
	"encoding/binary"
	"errors"
	"fmt"
	"strconv"
	"strings"

	"github.com/redis/go-redis/v9"
)

// Store keeps the world in Redis. For a chunk "cx:cy", one fixed-width record per pixel at its offset
// (missing or short = zero: white, never changed), integers big-endian:
//
//	chunk:cx:cy    1 byte: colour index (65,536 bytes when full)
//	count:cx:cy    4 bytes: colour change count (256 KB)
//	time:cx:cy     8 bytes: time of the last change, Unix ms (512 KB)
//	painter:cx:cy  16 bytes: user id of the last painter, zero-padded; all zero if anonymous (1 MB)
//
// so a full chunk takes under 2 MB, and the stats read the counts as one string instead of a hash field each.
// For the whole world:
//
//	stats:hourly hash, "{Unix hour}" = paints during that hour (counted since this key exists)
//	top:{day}    sorted set, user id → paints during that UTC day (Unix ms / 86,400,000); kept 2 days
type Store struct{ rdb redis.UniversalClient }

// NewStore stores the world in the given Redis.
func NewStore(rdb redis.UniversalClient) *Store { return &Store{rdb} }

// Record widths, in bytes.
const (
	countLen   = 4
	timeLen    = 8
	PainterLen = 16 // the longest user id a paint can record: account ids are 8 random bytes in hex
)

// Info is a pixel's state. LastChange is nil if its colour never changed; User is the id of its
// last painter, "" if anonymous.
type Info struct {
	X          int    `json:"x"`
	Y          int    `json:"y"`
	C          int    `json:"c"`
	Changes    int64  `json:"changes"`
	LastChange *int64 `json:"lastChange"`
	User       string `json:"-"`
}

// Big-endian helpers for the scripts (Lua 5.1 numbers are doubles: exact up to 2^53, times included).
const luaBytes = `
local function be(n, w)
  local s = ''
  for _ = 1, w do s = string.char(n % 256) .. s; n = math.floor(n / 256) end
  return s
end
local function num(s)
  local n = 0
  for i = 1, #s do n = n * 256 + s:byte(i) end
  return n
end
`

// Atomic paint: writes the byte, bumps the count, timestamps the change and records the painter.
// Every paint counts, same colour included: repainting a pixel is a deliberate (and paid) move.
// No per-paint history: moderation paints over.
// KEYS: chunk, count, time, painter, stats:hourly, top:{day}. ARGV: offset, colour, now, hour, padded painter, user.
// ponytail: stats:hourly keeps one field per hour forever (~9k a year, a few hundred KB).
var paintScript = redis.NewScript(luaBytes + `
local off = tonumber(ARGV[1])
redis.call('SETRANGE', KEYS[1], off, string.char(tonumber(ARGV[2])))
local n = num(redis.call('GETRANGE', KEYS[2], off * 4, off * 4 + 3)) + 1
redis.call('SETRANGE', KEYS[2], off * 4, be(n, 4))
redis.call('SETRANGE', KEYS[3], off * 8, be(tonumber(ARGV[3]), 8))
redis.call('SETRANGE', KEYS[4], off * 16, ARGV[5])
if ARGV[6] ~= '' then
  redis.call('ZINCRBY', KEYS[6], 1, ARGV[6])
  redis.call('EXPIRE', KEYS[6], 172800)
end
redis.call('HINCRBY', KEYS[5], ARGV[4], 1)
return 1
`)

const (
	hourMs = 3_600_000
	// ponytail: "today" is the UTC day (it starts at 1 or 2 am in France); a local day would need
	// the visitor's time zone in the key.
	dayMs = 86_400_000
)

// chunkKeys are the keys of a chunk: colours, counts, times, painters.
func chunkKeys(id string) []string {
	return []string{"chunk:" + id, "count:" + id, "time:" + id, "painter:" + id}
}

// Paint sets a pixel at time `at` (Unix ms) for a user ("" if anonymous, at most PainterLen bytes).
func (s *Store) Paint(ctx context.Context, p Pixel, at int64, user string) error {
	if len(user) > PainterLen {
		return fmt.Errorf("user id %q: longer than %d bytes", user, PainterLen)
	}
	id, off := Locate(p.X, p.Y)
	keys := append(chunkKeys(id), "stats:hourly", "top:"+strconv.FormatInt(at/dayMs, 10))
	padded := user + strings.Repeat("\x00", PainterLen-len(user))
	return paintScript.Run(ctx, s.rdb, keys, off, p.C, at, at/hourMs, padded, user).Err()
}

// KEYS: chunk, count, time, painter. ARGV: colour, then one (offset, width) pair per row segment.
var fillScript = redis.NewScript(`
local c = string.char(tonumber(ARGV[1]))
for i = 2, #ARGV, 2 do
  local off, w = tonumber(ARGV[i]), tonumber(ARGV[i + 1])
  redis.call('SETRANGE', KEYS[1], off, string.rep(c, w))
  redis.call('SETRANGE', KEYS[2], off * 4, string.rep('\0', 4 * w))
  redis.call('SETRANGE', KEYS[3], off * 8, string.rep('\0', 8 * w))
  redis.call('SETRANGE', KEYS[4], off * 16, string.rep('\0', 16 * w))
end
return 1
`)

// Fill paints the rectangle [x0, x1] × [y0, y1] (inside the world) in colour c and erases its pixels'
// history (counts, so the heatmap; time; painter): a moderation tool, nothing of what was there shows.
func (s *Store) Fill(ctx context.Context, x0, y0, x1, y1, c int) error {
	segs := map[string][]any{} // chunk id → offset, width pairs
	for y := y0; y <= y1; y++ {
		for x := x0; x <= x1; {
			id, off := Locate(x, y)
			w := min(x1-x+1, ChunkSize-(x&(ChunkSize-1))) // up to the end of the row or of the chunk
			segs[id] = append(segs[id], off, w)
			x += w
		}
	}
	for id, pairs := range segs {
		args := append([]any{c}, pairs...)
		if err := fillScript.Run(ctx, s.rdb, chunkKeys(id), args...).Err(); err != nil {
			return err
		}
	}
	return nil
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
	keys := chunkKeys(id)
	pipe := s.rdb.Pipeline()
	color := pipe.GetRange(ctx, keys[0], off, off)
	count := pipe.GetRange(ctx, keys[1], off*countLen, off*countLen+countLen-1)
	last := pipe.GetRange(ctx, keys[2], off*timeLen, off*timeLen+timeLen-1)
	painter := pipe.GetRange(ctx, keys[3], off*PainterLen, off*PainterLen+PainterLen-1)
	if _, err := pipe.Exec(ctx); err != nil {
		return Info{}, err
	}
	info := Info{X: x, Y: y, User: strings.TrimRight(painter.Val(), "\x00")}
	if v := color.Val(); len(v) == 1 {
		info.C = int(v[0])
	}
	if v := count.Val(); len(v) == countLen {
		info.Changes = int64(binary.BigEndian.Uint32([]byte(v)))
	}
	if v := last.Val(); len(v) == timeLen {
		if t := int64(binary.BigEndian.Uint64([]byte(v))); t != 0 { //nolint:gosec // G115: Unix ms, far below 2^63
			info.LastChange = &t
		}
	}
	return info, nil
}

// counts decodes a count string: offset i's change count is counts[i].
func counts(data string) []int64 {
	out := make([]int64, len(data)/countLen)
	for i := range out {
		out[i] = int64(binary.BigEndian.Uint32([]byte(data[i*countLen : (i+1)*countLen])))
	}
	return out
}

// Heat returns a chunk's change counts, one byte per pixel (capped at 255); empty if no pixel of
// the chunk was ever painted.
func (s *Store) Heat(ctx context.Context, cx, cy int) ([]byte, error) {
	data, err := s.rdb.Get(ctx, "count:"+ChunkID(cx, cy)).Result()
	if errors.Is(err, redis.Nil) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	heat := make([]byte, ChunkSize*ChunkSize)
	for off, n := range counts(data) {
		heat[off] = byte(max(0, min(n, 255)))
	}
	return heat, nil
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
	Top     []Score `json:"-"`       // most paints today (UTC), best first, at most TopSize
}

// Score is a user's paint count.
type Score struct {
	User string
	N    int64
}

// TopSize is how many of the day's best painters Stats reads (extra ones cover deleted accounts).
const TopSize = 20

// Stats reads the whole world. Pixels outside the world (left by a former, larger size) are ignored.
// ponytail: reads every chunk's colours and counts (~7.5 MB for 1280 × 720); callers cache it. A much
// bigger world would need running totals kept by the paint script.
func (s *Store) Stats(ctx context.Context, now int64) (Stats, error) {
	type chunk struct {
		cx, cy int
		data   *redis.StringCmd
		counts *redis.StringCmd
	}
	var chunks []chunk
	pipe := s.rdb.Pipeline()
	for cy := (-WorldHeight / 2) >> ChunkShift; cy <= (WorldHeight/2-1)>>ChunkShift; cy++ {
		for cx := (-WorldWidth / 2) >> ChunkShift; cx <= (WorldWidth/2-1)>>ChunkShift; cx++ {
			id := ChunkID(cx, cy)
			chunks = append(chunks, chunk{cx, cy, pipe.Get(ctx, "chunk:"+id), pipe.Get(ctx, "count:"+id)})
		}
	}
	hour := now / hourMs
	fields := make([]string, 24)
	for i := range fields {
		fields[i] = strconv.FormatInt(hour-23+int64(i), 10)
	}
	hours := pipe.HMGet(ctx, "stats:hourly", fields...)
	top := pipe.ZRevRangeWithScores(ctx, "top:"+strconv.FormatInt(now/dayMs, 10), 0, TopSize-1)
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
		for off, n := range counts(c.counts.Val()) {
			x, y, ok := inWorld(c, off)
			if !ok || n == 0 {
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
	for _, z := range top.Val() {
		st.Top = append(st.Top, Score{z.Member.(string), int64(z.Score)}) //nolint:forcetypeassert // go-redis returns string members
	}
	return st, nil
}
