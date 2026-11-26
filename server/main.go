// Command server runs pixels: one 1280 × 720 grid split into 256×256 chunks stored in Redis.
// All the logic lives in internal/; this file only starts it.
package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"strings"
	"syscall"

	"github.com/LeoPenaguin/pixelnul/server/internal/server"
)

func main() {
	if err := run(); err != nil {
		log.Fatal(err)
	}
}

// run serves until Ctrl+C or SIGTERM (graceful shutdown: open connections finish).
func run() error {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	loadDotEnv()
	return server.Run(ctx, os.Getenv)
}

// loadDotEnv reads the KEY=value lines of .env (# comments allowed) into the environment, for secrets kept out
// of Git. Variables already set win, so production can configure everything without the file.
func loadDotEnv() {
	data, err := os.ReadFile(".env")
	if err != nil {
		return // no file: environment only
	}
	for line := range strings.Lines(string(data)) {
		k, v, ok := strings.Cut(strings.TrimSpace(line), "=")
		if k = strings.TrimSpace(k); !ok || k == "" || strings.HasPrefix(k, "#") {
			continue
		}
		if _, set := os.LookupEnv(k); !set {
			_ = os.Setenv(k, strings.Trim(strings.TrimSpace(v), `"'`))
		}
	}
}
