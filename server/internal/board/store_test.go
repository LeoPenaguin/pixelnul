package board

import (
	"context"
	"strconv"
	"strings"
	"testing"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"
)

func newTestStore(t *testing.T) (*Store, *miniredis.Miniredis) {
	t.Helper()
	mr := miniredis.RunT(t)
	return NewStore(redis.NewClient(&redis.Options{Addr: mr.Addr(), MaxRetries: -1})), mr
}

func TestPaint(t *testing.T) {
	s, mr := newTestStore(t)
	ctx := context.Background()
	for i, c := range []int{5, 5, 7} {
		if err := s.Paint(ctx, Pixel{300, 1, c}, int64(i)); err != nil {
			t.Fatal(err)
		}
	}
	_, off := Locate(300, 1)
	if b, _ := mr.Get("chunk:1:0"); b[off] != 7 {
		t.Errorf("byte = %d; want 7", b[off])
	}
	if info, _ := s.Info(ctx, 300, 1); info.Changes != 3 {
		t.Errorf("changes = %d; want 3: repainting the same colour counts too", info.Changes)
	}
}

func TestChunk(t *testing.T) {
	s, mr := newTestStore(t)
	ctx := context.Background()
	if data, err := s.Chunk(ctx, 0, 0); err != nil || data != nil {
		t.Errorf("never-painted chunk: %v, %v; want empty", data, err)
	}
	_ = mr.Set("chunk:-1:2", "\x00\x03")
	if data, err := s.Chunk(ctx, -1, 2); err != nil || string(data) != "\x00\x03" {
		t.Errorf("Chunk = %q, %v", data, err)
	}
	mr.Close()
	if _, err := s.Chunk(ctx, 0, 0); err == nil {
		t.Error("a Redis failure must be returned")
	}
}

func TestInfo(t *testing.T) {
	s, mr := newTestStore(t)
	ctx := context.Background()

	info, err := s.Info(ctx, -3, 4)
	if err != nil || info != (Info{X: -3, Y: 4}) {
		t.Errorf("never-painted pixel: %+v, %v", info, err)
	}

	_ = s.Paint(ctx, Pixel{-3, 4, 9}, 1234)
	_ = s.Paint(ctx, Pixel{-3, 4, 2}, 5678)
	info, err = s.Info(ctx, -3, 4)
	if err != nil || info.C != 2 || info.Changes != 2 || info.LastChange == nil || *info.LastChange != 5678 {
		t.Errorf("Info = %+v, %v; want colour 2, 2 changes, last at 5678", info, err)
	}

	mr.Close()
	if _, err := s.Info(ctx, 0, 0); err == nil {
		t.Error("a Redis failure must be returned")
	}
}

func TestHeat(t *testing.T) {
	s, mr := newTestStore(t)
	ctx := context.Background()
	if heat, err := s.Heat(ctx, 0, 0); err != nil || heat != nil {
		t.Errorf("never-painted chunk: %v, %v; want empty", heat, err)
	}
	for range 3 {
		_ = s.Paint(ctx, Pixel{1, 2, 5}, 0)
	}
	// Capped at 255; malformed fields (another writer, a future format) are skipped.
	mr.HSet("meta:0:0", "n:7", "300", "n:x", "1", "n:70000", "1", "n:9", "y")
	heat, err := s.Heat(ctx, 0, 0)
	if _, off := Locate(1, 2); err != nil || len(heat) != ChunkSize*ChunkSize || heat[off] != 3 || heat[7] != 255 || heat[9] != 0 {
		t.Errorf("heat = %d bytes, %v", len(heat), err)
	}
	mr.Close()
	if _, err := s.Heat(ctx, 0, 0); err == nil {
		t.Error("a Redis failure must be returned")
	}
}

func TestStats(t *testing.T) {
	s, mr := newTestStore(t)
	ctx := context.Background()
	const now = 100*hourMs + 5

	st, err := s.Stats(ctx, now)
	if err != nil || st.Placed != 0 || st.Painted != 0 || st.Hottest != nil || st.Colors[0] != WorldWidth*WorldHeight || len(st.Hours) != 24 {
		t.Fatalf("empty world: %+v, %v", st, err)
	}

	paint := func(x, y, c int, at int64) {
		t.Helper()
		if e := s.Paint(ctx, Pixel{x, y, c}, at); e != nil {
			t.Fatal(e)
		}
	}
	paint(5, 5, 3, now)
	paint(5, 5, 4, now)  // same pixel: 2 changes, colour 4 now
	paint(-5, 1, 4, now) // tie candidates with 2 changes: (-5, 1) is above (5, 5)
	paint(-5, 1, 4, now)
	paint(9, 1, 2, now-2*hourMs) // 2 hours ago, tied with (-5, 1) on the same row but further right
	paint(9, 1, 2, now-2*hourMs)
	// Left by a former, larger world: outside the current one, ignored.
	_, off := Locate(-700, 0)
	mr.HSet("meta:-3:0", "n:"+strconv.FormatInt(off, 10), "50")
	_ = mr.Set("chunk:-3:0", strings.Repeat("\x03", int(off)+1))
	// A byte that is not a palette colour (corruption) at (256, 256): ignored.
	_ = mr.Set("chunk:1:1", "\xff")

	st, err = s.Stats(ctx, now)
	if err != nil {
		t.Fatal(err)
	}
	if st.Placed != 6 || st.Painted != 3 || *st.Hottest != (Hot{-5, 1, 2}) {
		t.Errorf("placed %d, painted %d, hottest %+v", st.Placed, st.Painted, st.Hottest)
	}
	if st.Colors[4] != 2 || st.Colors[2] != 1 || st.Colors[3] != 0 || st.Colors[0] != WorldWidth*WorldHeight-3 {
		t.Errorf("colors = %v", st.Colors[:5])
	}
	if st.Hours[23] != 4 || st.Hours[21] != 2 || st.Hours[22] != 0 {
		t.Errorf("hours = %v", st.Hours)
	}

	mr.Close()
	if _, err := s.Stats(ctx, now); err == nil {
		t.Error("a Redis failure must be returned")
	}
}
