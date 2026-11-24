// Package server serves the board over HTTP and WebSocket: routes, quotas, pixel broadcast.
package server

import (
	"compress/gzip"
	"context"
	"encoding/json"
	"mime"
	"net"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/LeoPenaguin/pixels/server/internal/account"
	"github.com/LeoPenaguin/pixels/server/internal/board"

	"golang.org/x/time/rate"
)

const (
	maxConnsIP   = 10
	lookupsBurst = 20               // pixel history lookups in a row per IP
	lookupsRate  = 10               // per second after that: the front asks at most ~5/s (after a 200 ms pause)
	statsMaxAge  = 10 * time.Second // the stats scan the whole world: computed at most this often
)

// jsonOnly refuses a body that is not JSON (415). A page of another site can only send a form or
// text without a CORS preflight: on top of SameSite=Lax, this keeps every change out of its reach.
func jsonOnly(h http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if mt, _, _ := mime.ParseMediaType(r.Header.Get("Content-Type")); mt != "application/json" {
			http.Error(w, "JSON only", http.StatusUnsupportedMediaType)
			return
		}
		h(w, r)
	}
}

// Options tunes the pixel quota and the sign-in.
type Options struct {
	Burst  int           // pixels that can be painted in a row
	Refill time.Duration // time to regain one pixel; 0 = unlimited
	// Sign-in providers; none = sign-in off. PublicURL is where the site is served (e.g.
	// https://pixels.example): the providers call back under it, and https makes cookies Secure.
	Providers []*Provider
	PublicURL string
	Admins    map[string]bool // user ids allowed to moderate (fill a rectangle, ban); needs sign-in
}

// Server is the state shared by the routes (storage, quotas, connections, broadcast).
type Server struct {
	store     *board.Store
	accounts  *account.Store
	providers map[string]*Provider // by name
	opts      Options
	quotas    *quotas // per account when sign-in is on, per IP otherwise
	lookups   *quotas // pixel history requests, per IP
	conns     *connLimit
	hub       *hub

	// ponytail: global lock around painting so Redis order = broadcast order. One Redis round trip
	// per paint under it: ~20k pixels/s with a local Redis, ~1/RTT with a remote one (1 ms → 1k/s);
	// beyond that, lock per chunk.
	paintMu sync.Mutex

	statsMu   sync.Mutex
	stats     []byte // last /api/stats answer
	statsTime time.Time

	flushEvery   time.Duration // batch broadcast interval
	forgetEvery  time.Duration // quota cleanup interval
	pingEvery    time.Duration // WebSocket liveness check interval
	writeTimeout time.Duration // a WebSocket write or ping slower than this closes the connection
	now          func() time.Time
}

// New creates a server; Loop must run for pixels to be broadcast.
func New(store *board.Store, accounts *account.Store, o Options) *Server {
	o.Burst = max(o.Burst, 1)
	every := rate.Inf
	if o.Refill > 0 {
		every = rate.Every(o.Refill)
	}
	providers := make(map[string]*Provider, len(o.Providers))
	for _, p := range o.Providers {
		providers[p.Name] = p
	}
	return &Server{
		store:        store,
		accounts:     accounts,
		providers:    providers,
		opts:         o,
		quotas:       newQuotas(o.Burst, every),
		lookups:      newQuotas(lookupsBurst, lookupsRate),
		conns:        newConnLimit(maxConnsIP),
		hub:          newHub(),
		flushEvery:   100 * time.Millisecond,
		forgetEvery:  time.Minute,
		pingEvery:    30 * time.Second,
		writeTimeout: 10 * time.Second,
		now:          time.Now,
	}
}

// Handler returns the HTTP and WebSocket routes.
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/config", s.config)
	mux.HandleFunc("GET /api/chunks/{cx}/{cy}", s.chunkRoute(s.store.Chunk))
	mux.HandleFunc("GET /api/heat/{cx}/{cy}", s.chunkRoute(s.store.Heat))
	mux.HandleFunc("GET /api/stats", s.statsRoute)
	mux.HandleFunc("GET /api/pixels/{x}/{y}", s.pixelInfo)
	mux.HandleFunc("GET /ws", s.ws)
	mux.HandleFunc("GET /api/me", s.me)
	if s.auth() {
		mux.HandleFunc("GET /api/auth/{provider}/login", s.login)
		mux.HandleFunc("GET /api/auth/{provider}/callback", s.callback)
		mux.HandleFunc("POST /api/auth/logout", jsonOnly(s.logout))
		mux.HandleFunc("POST /api/me/pseudo", jsonOnly(s.setPseudo))
		mux.HandleFunc("DELETE /api/me", jsonOnly(s.deleteMe))
		mux.HandleFunc("POST /api/admin/fill", jsonOnly(s.fill))
		mux.HandleFunc("POST /api/admin/ban", jsonOnly(s.ban))
	}
	return mux
}

// Loop broadcasts batches and cleans up quotas until ctx is cancelled.
func (s *Server) Loop(ctx context.Context) {
	flush := time.NewTicker(s.flushEvery)
	forget := time.NewTicker(s.forgetEvery)
	defer flush.Stop()
	defer forget.Stop()
	for {
		select {
		case <-flush.C:
			s.hub.flush()
		case <-forget.C:
			s.quotas.forgetIdle(s.conns.connected)
			s.lookups.forgetIdle(func(string) bool { return false })
		case <-ctx.Done():
			return
		}
	}
}

// sendQuota tells a client how many pixels its quota holds.
func (s *Server) sendQuota(q *rate.Limiter, reply chan []byte) {
	if s.opts.Refill > 0 {
		trySend(reply, mustJSON(map[string]any{"t": "q", "n": q.Tokens()}))
	}
}

// place paints a pixel for a user ("" if anonymous) if its quota (counted under `key`) allows
// it, and returns the remaining quota.
func (s *Server) place(ctx context.Context, key, user string, p board.Pixel, reply chan []byte) {
	if user != "" && !s.accounts.CanPaint(ctx, user) { // banned or deleted since the connection opened
		return
	}
	q := s.quotas.get(key)
	ok := q.Allow()
	s.sendQuota(q, reply)
	if !ok {
		return
	}
	s.paintMu.Lock()
	defer s.paintMu.Unlock()
	if err := s.store.Paint(ctx, p, s.now().UnixMilli(), user); err == nil {
		s.hub.queue(p)
	}
}

// auth tells if sign-in is on (painting then needs an account with a pseudo).
func (s *Server) auth() bool { return len(s.providers) > 0 }

func (s *Server) config(w http.ResponseWriter, _ *http.Request) {
	names := make([]string, len(s.opts.Providers)) // in the configured order: the front shows them so
	for i, p := range s.opts.Providers {
		names[i] = p.Name
	}
	writeJSON(w, map[string]any{
		"chunkSize":   board.ChunkSize,
		"worldWidth":  board.WorldWidth,
		"worldHeight": board.WorldHeight,
		"palette":     board.PaletteRows,
		"quota":       map[string]any{"burst": s.opts.Burst, "refillMs": s.opts.Refill.Milliseconds()},
		"auth":        names,
	})
}

// chunkRoute serves one byte per pixel of a chunk: its colours (Chunk) or its change counts
// (Heat). It may be shorter than 65,536 bytes (or empty): the rest is 0.
func (s *Server) chunkRoute(get func(ctx context.Context, cx, cy int) ([]byte, error)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		cx, err1 := strconv.Atoi(r.PathValue("cx"))
		cy, err2 := strconv.Atoi(r.PathValue("cy"))
		if err1 != nil || err2 != nil || !board.ChunkInWorld(cx, cy) {
			http.Error(w, "bad chunk", http.StatusBadRequest)
			return
		}
		data, err := get(r.Context(), cx, cy)
		if err != nil {
			http.Error(w, "redis error", http.StatusInternalServerError)
			return
		}
		writeBytes(w, r, data)
	}
}

// statsRoute returns the world statistics and the number of connected clients, recomputed at
// most every statsMaxAge.
func (s *Server) statsRoute(w http.ResponseWriter, r *http.Request) {
	s.statsMu.Lock()
	defer s.statsMu.Unlock()
	if now := s.now(); s.stats == nil || now.Sub(s.statsTime) >= statsMaxAge {
		st, err := s.store.Stats(r.Context(), now.UnixMilli())
		if err != nil {
			http.Error(w, "redis error", http.StatusInternalServerError)
			return
		}
		top, err := s.topPlayers(r.Context(), st.Top)
		if err != nil {
			http.Error(w, "redis error", http.StatusInternalServerError)
			return
		}
		s.stats = mustJSON(struct {
			board.Stats
			Online int      `json:"online"`
			Top    []player `json:"top"`
		}{st, s.hub.online(), top})
		s.statsTime = now
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	_, _ = w.Write(s.stats)
}

type player struct {
	Pseudo string `json:"pseudo"`
	N      int64  `json:"n"`
}

// topLen is how many of the day's best painters the stats show.
const topLen = 10

// topPlayers names the day's best painters, skipping deleted accounts.
func (s *Server) topPlayers(ctx context.Context, scores []board.Score) ([]player, error) {
	ids := make([]string, len(scores))
	for i, sc := range scores {
		ids[i] = sc.User
	}
	pseudos, err := s.accounts.Pseudos(ctx, ids)
	if err != nil {
		return nil, err
	}
	top := []player{}
	for i, p := range pseudos {
		if p != "" && len(top) < topLen {
			top = append(top, player{p, scores[i].N})
		}
	}
	return top, nil
}

// writeBytes sends raw bytes, gzipped when the client accepts it.
func writeBytes(w http.ResponseWriter, r *http.Request, data []byte) {
	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Vary", "Accept-Encoding")
	// Mostly white (zeros): 64 KB shrinks to a few hundred bytes.
	if !strings.Contains(r.Header.Get("Accept-Encoding"), "gzip") {
		_, _ = w.Write(data)
		return
	}
	w.Header().Set("Content-Encoding", "gzip")
	gz := gzip.NewWriter(w)
	_, _ = gz.Write(data)
	_ = gz.Close()
}

// pixelInfo returns the colour, change count, time of the last change (null if never changed) and
// pseudo of the last painter.
func (s *Server) pixelInfo(w http.ResponseWriter, r *http.Request) {
	if !s.lookups.get(clientIP(r)).Allow() {
		http.Error(w, "too many requests", http.StatusTooManyRequests)
		return
	}
	x, err1 := strconv.Atoi(r.PathValue("x"))
	y, err2 := strconv.Atoi(r.PathValue("y"))
	if err1 != nil || err2 != nil || !board.InWorld(x, y) {
		http.Error(w, "bad pixel", http.StatusBadRequest)
		return
	}
	info, err := s.store.Info(r.Context(), x, y)
	if err != nil {
		http.Error(w, "redis error", http.StatusInternalServerError)
		return
	}
	// The last painter's pseudo; null if anonymous or deleted.
	var by *string
	if info.User != "" {
		pseudos, err := s.accounts.Pseudos(r.Context(), []string{info.User})
		if err != nil {
			http.Error(w, "redis error", http.StatusInternalServerError)
			return
		}
		if pseudos[0] != "" {
			by = &pseudos[0]
		}
	}
	w.Header().Set("Cache-Control", "no-store")
	writeJSON(w, struct {
		board.Info
		By *string `json:"by"`
	}{info, by})
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}

// clientIP is the IP quotas and limits are counted against. A loopback peer is the local reverse proxy,
// which appends the real client as the last X-Forwarded-For entry; earlier entries are client-supplied.
func clientIP(r *http.Request) string {
	ip, _, _ := net.SplitHostPort(r.RemoteAddr)
	fwd := r.Header.Values("X-Forwarded-For")
	if len(fwd) == 0 || !net.ParseIP(ip).IsLoopback() {
		return ip
	}
	hops := strings.Split(fwd[len(fwd)-1], ",")
	return strings.TrimSpace(hops[len(hops)-1])
}
