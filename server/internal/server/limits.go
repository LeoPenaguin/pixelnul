package server

import (
	"sync"

	"golang.org/x/time/rate"
)

// quotas is a token bucket per key (an account, or an IP without sign-in): `burst` pixels in a
// row, then one more every `refill` (refill = 0: unlimited). Buckets outlive disconnection,
// otherwise reconnecting would refill them.
type quotas struct {
	burst int
	every rate.Limit

	mu sync.Mutex
	m  map[string]*rate.Limiter
}

func newQuotas(burst int, every rate.Limit) *quotas {
	return &quotas{burst: burst, every: every, m: map[string]*rate.Limiter{}}
}

func (q *quotas) get(key string) *rate.Limiter {
	q.mu.Lock()
	defer q.mu.Unlock()
	l := q.m[key]
	if l == nil {
		l = rate.NewLimiter(q.every, q.burst)
		q.m[key] = l
	}
	return l
}

// forgetIdle drops full buckets of disconnected keys so the map does not grow forever. A full
// bucket is the same as a new one: dropping it changes nothing, even for a connected account.
func (q *quotas) forgetIdle(connected func(key string) bool) {
	q.mu.Lock()
	defer q.mu.Unlock()
	for key, l := range q.m {
		if !connected(key) && l.Tokens() >= float64(q.burst) {
			delete(q.m, key)
		}
	}
}

// connLimit caps simultaneous WebSocket connections per IP.
type connLimit struct {
	max int

	mu sync.Mutex
	n  map[string]int
}

func newConnLimit(limit int) *connLimit { return &connLimit{max: limit, n: map[string]int{}} }

// acquire reserves a connection for the IP; false if it already has too many.
func (c *connLimit) acquire(ip string) bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.n[ip] >= c.max {
		return false
	}
	c.n[ip]++
	return true
}

func (c *connLimit) release(ip string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.n[ip]--
	if c.n[ip] <= 0 {
		delete(c.n, ip)
	}
}

func (c *connLimit) connected(ip string) bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.n[ip] > 0
}
