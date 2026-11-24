package server

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/LeoPenaguin/pixels/server/internal/account"
	"github.com/LeoPenaguin/pixels/server/internal/board"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"
)

type testEnv struct {
	s   *Server
	mr  *miniredis.Miniredis
	url string
}

// newTestEnv runs a full server on an in-memory Redis, with a fast broadcast loop; tweaks adjust
// the server before it starts.
func newTestEnv(t *testing.T, o Options, tweaks ...func(*Server)) testEnv {
	t.Helper()
	mr := miniredis.RunT(t)
	rdb := redis.NewClient(&redis.Options{Addr: mr.Addr(), MaxRetries: -1})
	s := New(board.NewStore(rdb), account.NewStore(rdb), o)
	s.flushEvery = 5 * time.Millisecond
	s.forgetEvery = 5 * time.Millisecond
	s.now = func() time.Time { return time.UnixMilli(42) }
	for _, f := range tweaks {
		f(s)
	}
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	go s.Loop(ctx)
	ts := httptest.NewServer(s.Handler())
	t.Cleanup(ts.Close)
	return testEnv{s, mr, ts.URL}
}

func get(t *testing.T, url string) (code int, body []byte) {
	t.Helper()
	req, err := http.NewRequestWithContext(context.Background(), http.MethodGet, url, http.NoBody)
	if err != nil {
		t.Fatal(err)
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = res.Body.Close() }()
	body, _ = io.ReadAll(res.Body)
	return res.StatusCode, body
}

func TestNewDefaults(t *testing.T) {
	s := New(nil, nil, Options{Burst: 0})
	if s.opts.Burst != 1 {
		t.Error("the quota must allow at least one pixel")
	}
}

func TestConfig(t *testing.T) {
	e := newTestEnv(t, Options{Burst: 7, Refill: 1500 * time.Millisecond})
	code, body := get(t, e.url+"/api/config")
	var cfg struct {
		ChunkSize, WorldWidth, WorldHeight int
		Palette                            [][]string
		Quota                              struct{ Burst, RefillMs int }
	}
	if err := json.Unmarshal(body, &cfg); err != nil || code != 200 {
		t.Fatal(code, err)
	}
	if cfg.ChunkSize != 256 || cfg.WorldWidth != board.WorldWidth || cfg.WorldHeight != board.WorldHeight || len(cfg.Palette) != len(board.PaletteRows) ||
		cfg.Quota.Burst != 7 || cfg.Quota.RefillMs != 1500 {
		t.Errorf("config = %+v", cfg)
	}
}

func TestChunkRoute(t *testing.T) {
	e := newTestEnv(t, Options{Burst: 1})
	_ = e.mr.Set("chunk:-3:1", "\x05")
	if code, body := get(t, e.url+"/api/chunks/-3/1"); code != 200 || string(body) != "\x05" {
		t.Errorf("chunk = %d %q", code, body)
	}
	if code, body := get(t, e.url+"/api/chunks/0/0"); code != 200 || len(body) != 0 {
		t.Errorf("never-painted chunk = %d %q; want empty 200", code, body)
	}
	// Without gzip support, raw bytes (the client above negotiates gzip transparently).
	req, _ := http.NewRequestWithContext(context.Background(), http.MethodGet, e.url+"/api/chunks/-3/1", http.NoBody)
	req.Header.Set("Accept-Encoding", "identity")
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	raw, _ := io.ReadAll(res.Body)
	_ = res.Body.Close()
	if res.Header.Get("Content-Encoding") != "" || string(raw) != "\x05" {
		t.Errorf("identity chunk = %q %q", res.Header.Get("Content-Encoding"), raw)
	}
	for _, bad := range []string{"x/0", "0/y", "4/0", "-5/0", "0/3", "0/-4"} {
		if code, _ := get(t, e.url+"/api/chunks/"+bad); code != 400 {
			t.Errorf("/api/chunks/%s = %d; want 400", bad, code)
		}
	}
	e.mr.Close()
	if code, _ := get(t, e.url+"/api/chunks/0/0"); code != 500 {
		t.Errorf("Redis down = %d; want 500", code)
	}
}

func TestPixelRoute(t *testing.T) {
	e := newTestEnv(t, Options{Burst: 1})
	code, body := get(t, e.url+"/api/pixels/-1/2")
	var info board.Info
	if err := json.Unmarshal(body, &info); err != nil || code != 200 || info != (board.Info{X: -1, Y: 2}) {
		t.Errorf("pixel = %d %s", code, body)
	}
	for _, bad := range []string{"x/0", "0/y", "640/0", "0/360", "-641/0"} {
		if code, _ := get(t, e.url+"/api/pixels/"+bad); code != 400 {
			t.Errorf("/api/pixels/%s = %d; want 400", bad, code)
		}
	}
	e.mr.Close()
	if code, _ := get(t, e.url+"/api/pixels/0/0"); code != 500 {
		t.Errorf("Redis down = %d; want 500", code)
	}
}

func TestPixelRouteNamesTheLastPainter(t *testing.T) {
	e := newTestEnv(t, Options{Burst: 1})
	tok := signedIn(t, e, "a", "Minou")
	u, _, _ := e.s.accounts.SessionUser(context.Background(), tok)
	_ = e.s.store.Paint(context.Background(), board.Pixel{X: 1, Y: 1, C: 2}, 0, u.ID)
	if _, body := get(t, e.url+"/api/pixels/1/1"); !strings.Contains(string(body), `"by":"Minou"`) {
		t.Errorf("pixel = %s; want by Minou", body)
	}
	if _, body := get(t, e.url+"/api/pixels/0/0"); !strings.Contains(string(body), `"by":null`) {
		t.Errorf("never painted = %s; want by null", body)
	}
	e.mr.Del("user:" + u.ID)
	_ = e.mr.Set("user:"+u.ID, "not a hash")
	if code, _ := get(t, e.url+"/api/pixels/1/1"); code != 500 {
		t.Errorf("Redis error on the pseudo = %d; want 500", code)
	}
}

func TestPixelRouteRateLimit(t *testing.T) {
	e := newTestEnv(t, Options{Burst: 1})
	limited := 0
	for range lookupsBurst + 10 {
		if code, _ := get(t, e.url+"/api/pixels/0/0"); code == 429 {
			limited++
		}
	}
	if limited == 0 {
		t.Error("a flood of history lookups must be refused with 429")
	}
}

func TestPlaceIgnoresRedisErrors(t *testing.T) {
	e := newTestEnv(t, Options{Burst: 1})
	e.mr.Close()
	e.s.place(context.Background(), "ip", "", board.Pixel{X: 1, Y: 1, C: 1}, make(chan []byte, 1))
	e.s.hub.pendMu.Lock()
	defer e.s.hub.pendMu.Unlock()
	if len(e.s.hub.pending) != 0 {
		t.Error("a pixel that was not written must not be broadcast")
	}
}

func TestForgetLoop(t *testing.T) {
	e := newTestEnv(t, Options{Burst: 1})
	e.s.quotas.get("parti")
	deadline := time.Now().Add(time.Second)
	for {
		e.s.quotas.mu.Lock()
		n := len(e.s.quotas.m)
		e.s.quotas.mu.Unlock()
		if n == 0 {
			return
		}
		if time.Now().After(deadline) {
			t.Fatal("the quota cleanup did not run")
		}
		time.Sleep(5 * time.Millisecond)
	}
}

func TestHeatRoute(t *testing.T) {
	e := newTestEnv(t, Options{Burst: 1})
	_ = e.s.store.Paint(context.Background(), board.Pixel{X: 0, Y: 0, C: 1}, 0, "")
	if code, body := get(t, e.url+"/api/heat/0/0"); code != 200 || len(body) != board.ChunkSize*board.ChunkSize || body[0] != 1 {
		t.Errorf("heat = %d, %d bytes", code, len(body))
	}
	if code, _ := get(t, e.url+"/api/heat/99/0"); code != 400 {
		t.Errorf("outside the world = %d; want 400", code)
	}
}

func TestStatsTopNamesTheDaysBestPainters(t *testing.T) {
	e := newTestEnv(t, Options{Burst: 1})
	ctx := context.Background()
	route := func() (int, string) {
		e.s.stats = nil // no cache between the steps
		w := httptest.NewRecorder()
		e.s.statsRoute(w, httptest.NewRequestWithContext(ctx, http.MethodGet, "/api/stats", http.NoBody))
		return w.Code, w.Body.String()
	}
	if _, body := route(); !strings.Contains(body, `"top":[]`) {
		t.Errorf("nobody painted today: %s", body)
	}
	ids := make([]string, 12)
	for i := range ids {
		tok := signedIn(t, e, fmt.Sprint("g", i), fmt.Sprint("joueur", i))
		u, _, _ := e.s.accounts.SessionUser(ctx, tok)
		ids[i] = u.ID
		for range i + 1 { // joueur11 paints most
			_ = e.s.store.Paint(ctx, board.Pixel{X: i, Y: 0, C: 1}, 42, u.ID)
		}
	}
	e.mr.Del("user:" + ids[11]) // deleted account: skipped
	_, body := route()
	var st struct{ Top []player }
	_ = json.Unmarshal([]byte(body), &st)
	if len(st.Top) != topLen || st.Top[0] != (player{"joueur10", 11}) || st.Top[9] != (player{"joueur1", 2}) {
		t.Errorf("top = %+v", st.Top)
	}
	e.mr.Del("user:" + ids[0])
	_ = e.mr.Set("user:"+ids[0], "not a hash")
	if code, _ := route(); code != 500 {
		t.Errorf("Redis error on the pseudos = %d; want 500", code)
	}
}

func TestStatsRoute(t *testing.T) {
	e := newTestEnv(t, Options{Burst: 1})
	clock := time.UnixMilli(42)
	e.s.now = func() time.Time { return clock } // the route is called directly below: no concurrent reader
	stats := func() (code int, st struct {
		board.Stats
		Online int
	},
	) {
		t.Helper()
		w := httptest.NewRecorder()
		e.s.statsRoute(w, httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/api/stats", http.NoBody))
		_ = json.Unmarshal(w.Body.Bytes(), &st)
		return w.Code, st
	}
	c := e.s.hub.subscribe() // one connected client
	defer e.s.hub.unsubscribe(c)

	if code, st := stats(); code != 200 || st.Placed != 0 || st.Online != 1 || st.Pixels != board.WorldWidth*board.WorldHeight {
		t.Errorf("stats = %d %+v", code, st)
	}
	_ = e.s.store.Paint(context.Background(), board.Pixel{X: 0, Y: 0, C: 1}, 0, "")
	if _, st := stats(); st.Placed != 0 {
		t.Error("within statsMaxAge, the cached answer is served")
	}
	clock = clock.Add(statsMaxAge)
	if _, st := stats(); st.Placed != 1 {
		t.Error("after statsMaxAge, the stats are recomputed")
	}
	clock = clock.Add(statsMaxAge)
	e.mr.Close()
	if code, _ := stats(); code != 500 {
		t.Errorf("redis down = %d; want 500", code)
	}
}

func TestClientIPTrustsOnlyTheLocalProxy(t *testing.T) {
	for _, tc := range []struct{ remote, fwd, want string }{
		{"203.0.113.7:1234", "", "203.0.113.7"},
		{"203.0.113.7:1234", "198.51.100.1", "203.0.113.7"},
		{"127.0.0.1:1234", "", "127.0.0.1"},
		{"127.0.0.1:1234", "6.6.6.6, 198.51.100.1", "198.51.100.1"},
		{"[::1]:1234", "198.51.100.2", "198.51.100.2"},
	} {
		r := httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/", http.NoBody)
		r.RemoteAddr = tc.remote
		if tc.fwd != "" {
			r.Header.Set("X-Forwarded-For", tc.fwd)
		}
		if got := clientIP(r); got != tc.want {
			t.Errorf("clientIP(%s, XFF %q) = %s; want %s", tc.remote, tc.fwd, got, tc.want)
		}
	}
}

// adminEnv: sign-in on, with an admin (session adminTok) and a painter "Kevin" (session kevinTok).
func adminEnv(t *testing.T) (e testEnv, adminTok, kevinTok string) {
	t.Helper()
	o := signInOn(t, 100, 0)
	o.Admins = map[string]bool{}
	e = newTestEnv(t, o)
	adminTok = signedIn(t, e, "admin", "Chef")
	u, _, _ := e.s.accounts.SessionUser(context.Background(), adminTok)
	o.Admins[u.ID] = true // the server holds the same map
	return e, adminTok, signedIn(t, e, "k", "Kevin")
}

func TestMeTellsAdmins(t *testing.T) {
	e, adminTok, kevinTok := adminEnv(t)
	if got := me(t, e, adminTok); !strings.Contains(got, `"admin":true`) {
		t.Errorf("admin me = %s", got)
	}
	if got := me(t, e, kevinTok); !strings.Contains(got, `"admin":false`) || !strings.Contains(got, `"banned":false`) {
		t.Errorf("painter me = %s", got)
	}
}

func TestAdminRoutesNeedAnAdmin(t *testing.T) {
	e, _, kevinTok := adminEnv(t)
	for _, route := range []string{"/api/admin/fill", "/api/admin/ban"} {
		for _, tok := range []string{"", kevinTok} {
			if res := request(t, http.MethodPost, e.url+route, `{}`, "session="+tok); res.code != http.StatusForbidden {
				t.Errorf("%s by %q = %d; want 403", route, tok, res.code)
			}
		}
	}
}

func TestFillRoute(t *testing.T) {
	e, adminTok, _ := adminEnv(t)
	ws := dial(t, e)
	if res := request(t, http.MethodPost, e.url+"/api/admin/fill", `{"x0":2,"y0":1,"x1":0,"y1":0,"c":5}`, "session="+adminTok); res.code != http.StatusNoContent {
		t.Fatalf("fill = %d %s", res.code, res.body)
	}
	if m := read(t, ws); m.T != "b" || len(m.P) != 3*6 {
		t.Errorf("the 3 × 2 rectangle must be broadcast: %+v", m)
	}
	if info, _ := e.s.store.Info(context.Background(), 2, 0); info.C != 5 {
		t.Errorf("corner = %+v; want colour 5", info)
	}
	for _, c := range []struct {
		body string
		want int
	}{
		{`pas du json`, http.StatusBadRequest},
		{`{"x0":0,"y0":0,"x1":640,"y1":0,"c":1}`, http.StatusBadRequest},
		{`{"x0":0,"y0":0,"x1":0,"y1":0,"c":999}`, http.StatusBadRequest},
		{`{"x0":-640,"y0":-360,"x1":639,"y1":359,"c":1}`, http.StatusRequestEntityTooLarge},
	} {
		if res := request(t, http.MethodPost, e.url+"/api/admin/fill", c.body, "session="+adminTok); res.code != c.want {
			t.Errorf("%s = %d; want %d", c.body, res.code, c.want)
		}
	}
	e.mr.HSet("count:0:0", "not", "a string") // SETRANGE fails
	if res := request(t, http.MethodPost, e.url+"/api/admin/fill", `{"x0":0,"y0":0,"x1":0,"y1":0,"c":1}`, "session="+adminTok); res.code != http.StatusInternalServerError {
		t.Errorf("Redis error = %d; want 500", res.code)
	}
}

func TestBanStopsPaintingAtOnce(t *testing.T) {
	e, adminTok, kevinTok := adminEnv(t)
	kevin := dialAs(t, e, kevinTok)
	modo := dialAs(t, e, adminTok)
	for _, c := range []struct {
		body string
		want int
	}{
		{`pas du json`, http.StatusBadRequest},
		{`{"pseudo":"personne","banned":true}`, http.StatusNotFound},
		{`{"pseudo":" kevin ","banned":true}`, http.StatusNoContent},
	} {
		if res := request(t, http.MethodPost, e.url+"/api/admin/ban", c.body, "session="+adminTok); res.code != c.want {
			t.Errorf("%s = %d %s; want %d", c.body, res.code, res.body, c.want)
		}
	}
	if got := me(t, e, kevinTok); !strings.Contains(got, `"banned":true`) {
		t.Errorf("banned me = %s", got)
	}
	send(t, kevin, `{"x":1,"y":1,"c":5}`) // already connected: refused all the same
	send(t, modo, `{"x":2,"y":2,"c":5}`)
	if m := read(t, modo); m.T != "b" || len(m.P) != 3 || m.P[0] != 2 {
		t.Errorf("only the admin's pixel must be painted: %+v", m)
	}
}
