package server

import (
	"context"
	"net/http"
	"time"

	"github.com/LeoPenaguin/pixelnul/server/internal/board"

	"github.com/coder/websocket"
	"golang.org/x/time/rate"
)

// Protocol: the client sends {"x","y","c"}; the server answers {"t":"q","n"} (remaining quota)
// and broadcasts {"t":"b","p":[…]} batches. With sign-in on, only a signed-in user with a pseudo
// can paint, and its quota (sent on connection) follows the account across tabs and devices;
// the user is read once, at connection: the front reconnects after signing in or out.
func (s *Server) ws(w http.ResponseWriter, r *http.Request) {
	ip := clientIP(r)
	key, user, canPaint := ip, "", true
	if s.auth() {
		u, ok := s.user(r)
		key, user, canPaint = "u:"+u.ID, u.ID, ok && u.Pseudo != ""
	}
	if !s.conns.acquire(ip) {
		http.Error(w, "too many connections", http.StatusTooManyRequests)
		return
	}
	defer s.conns.release(ip)

	// Accept checks the Origin (same origin only): in dev, Vite proxies /ws.
	// Batches of digits compress well. No context takeover: no 1.2 MB writer kept per connection;
	// messages under 512 bytes go uncompressed, and Safari does not negotiate it at all.
	// ponytail: each batch is compressed once per client; compress once for all if CPU becomes the limit.
	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{CompressionMode: websocket.CompressionNoContextTakeover})
	if err != nil {
		return
	}
	defer func() { _ = conn.CloseNow() }()
	conn.SetReadLimit(256)

	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()
	send := s.hub.subscribe()
	defer s.hub.unsubscribe(send)
	go s.writeLoop(ctx, conn, send)
	if canPaint && user != "" {
		s.sendQuota(s.quotas.get(key), send)
	}

	flood := rate.NewLimiter(10, 20) // messages per second: beyond that, the connection is closed
	for {
		_, data, err := conn.Read(ctx)
		if err != nil {
			return
		}
		if !flood.Allow() {
			_ = conn.Close(websocket.StatusPolicyViolation, "rate limit")
			return
		}
		if p, ok := board.ParsePixel(data); ok && canPaint {
			s.place(ctx, key, user, p, send)
		}
	}
}

// writeLoop sends messages to the client and pings it. A write or ping slower than writeTimeout
// (client gone without a word, or no longer reading) closes the connection, which also fails the
// read and frees its slot.
func (s *Server) writeLoop(ctx context.Context, conn *websocket.Conn, send chan []byte) {
	ping := time.NewTicker(s.pingEvery)
	defer ping.Stop()
	for {
		var write func(context.Context) error
		select {
		case msg := <-send:
			write = func(ctx context.Context) error { return conn.Write(ctx, websocket.MessageText, msg) }
		case <-ping.C:
			write = conn.Ping // answered by the browser while the connection reads
		case <-ctx.Done():
			return
		}
		wctx, cancel := context.WithTimeout(ctx, s.writeTimeout)
		err := write(wctx)
		cancel()
		if err != nil {
			_ = conn.CloseNow()
			return
		}
	}
}
