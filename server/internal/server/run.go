package server

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/LeoPenaguin/pixels/server/internal/account"
	"github.com/LeoPenaguin/pixels/server/internal/board"

	"github.com/redis/go-redis/v9"
)

// Run reads its configuration from the environment, connects to Redis and serves until ctx is cancelled.
func Run(ctx context.Context, getenv func(string) string) error {
	env := func(k, def string) string {
		if v := getenv(k); v != "" {
			return v
		}
		return def
	}
	burst, err := strconv.Atoi(env("PIXEL_BURST", "10"))
	if err != nil {
		return fmt.Errorf("PIXEL_BURST: %w", err)
	}
	refillMs, err := strconv.Atoi(env("PIXEL_REFILL_MS", "1000"))
	if err != nil {
		return fmt.Errorf("PIXEL_REFILL_MS: %w", err)
	}
	opt, err := redis.ParseURL(env("REDIS_URL", "redis://localhost:6379"))
	if err != nil {
		return fmt.Errorf("REDIS_URL: %w", err)
	}
	rdb := redis.NewClient(opt)
	defer func() { _ = rdb.Close() }()
	if err := rdb.Ping(ctx).Err(); err != nil {
		return fmt.Errorf("redis: %w", err)
	}

	o := Options{Burst: burst, Refill: time.Duration(refillMs) * time.Millisecond}
	if id := getenv("GOOGLE_CLIENT_ID"); id != "" {
		o.Google = &Google{ //nolint:gosec // G101: the secret comes from the environment
			ClientID:  id,
			Secret:    getenv("GOOGLE_CLIENT_SECRET"),
			PublicURL: env("PUBLIC_URL", "http://localhost:5173"),
			AuthURL:   "https://accounts.google.com/o/oauth2/v2/auth",
			TokenURL:  "https://oauth2.googleapis.com/token",
		}
		if o.Google.Secret == "" {
			return errors.New("GOOGLE_CLIENT_SECRET is required with GOOGLE_CLIENT_ID")
		}
	}
	s := New(board.NewStore(rdb), account.NewStore(rdb), o)
	srv := &http.Server{Addr: env("ADDR", ":3007"), Handler: s.Handler(), ReadHeaderTimeout: 10 * time.Second}
	go s.Loop(ctx)
	go func() {
		<-ctx.Done()
		stop, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
		defer cancel()
		_ = srv.Shutdown(stop)
	}()
	log.Println("listening on", srv.Addr)
	if err := srv.ListenAndServe(); !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	return nil
}
