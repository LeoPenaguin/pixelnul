package server

import (
	"encoding/json"
	"sync"

	"github.com/LeoPenaguin/pixelnul/server/internal/board"
)

const sendBuffer = 256 // queued messages per client before it starts dropping

// hub broadcasts painted pixels to every connected client, in batches.
// ponytail: in memory, single process. Several instances → Redis Pub/Sub.
type hub struct {
	mu      sync.Mutex
	clients map[chan []byte]string // → visitor: an account or an IP

	pendMu  sync.Mutex
	pending map[[2]int]int // pixels painted since the last batch; for the same pixel, the last one wins
}

func newHub() *hub {
	return &hub{clients: map[chan []byte]string{}, pending: map[[2]int]int{}}
}

func (h *hub) subscribe(visitor string) chan []byte {
	c := make(chan []byte, sendBuffer)
	h.mu.Lock()
	h.clients[c] = visitor
	h.mu.Unlock()
	return c
}

func (h *hub) unsubscribe(c chan []byte) {
	h.mu.Lock()
	delete(h.clients, c)
	h.mu.Unlock()
}

// online is the number of connected visitors: several tabs of one account or one IP count once.
func (h *hub) online() int {
	h.mu.Lock()
	defer h.mu.Unlock()
	seen := make(map[string]struct{}, len(h.clients))
	for _, v := range h.clients {
		seen[v] = struct{}{}
	}
	return len(seen)
}

// queue adds pixels to the next batch, all under one lock so that a flush never splits them.
func (h *hub) queue(ps ...board.Pixel) {
	h.pendMu.Lock()
	for _, p := range ps {
		h.pending[[2]int{p.X, p.Y}] = p.C
	}
	h.pendMu.Unlock()
}

// flush sends every pending pixel in a single {"t":"b","p":[x,y,c, x,y,c, …]} message:
// N paints × M clients messages become one message per client per batch.
func (h *hub) flush() {
	h.pendMu.Lock()
	batch := h.pending
	h.pending = map[[2]int]int{}
	h.pendMu.Unlock()
	if len(batch) == 0 {
		return
	}
	flat := make([]int, 0, len(batch)*3)
	for k, c := range batch {
		flat = append(flat, k[0], k[1], c)
	}
	msg := mustJSON(map[string]any{"t": "b", "p": flat})
	h.mu.Lock()
	for c := range h.clients {
		trySend(c, msg)
	}
	h.mu.Unlock()
}

// reload drops the pending pixels (painted before a reset) and tells every client to reload its chunks:
// {"t":"r"}.
func (h *hub) reload() {
	h.pendMu.Lock()
	h.pending = map[[2]int]int{}
	h.pendMu.Unlock()
	msg := mustJSON(map[string]string{"t": "r"})
	h.mu.Lock()
	for c := range h.clients {
		trySend(c, msg)
	}
	h.mu.Unlock()
}

// trySend drops the message for a slow client (full buffer); it reloads chunks when it reconnects.
func trySend(c chan []byte, msg []byte) {
	select {
	case c <- msg:
	default:
	}
}

func mustJSON(v any) []byte {
	b, _ := json.Marshal(v)
	return b
}
