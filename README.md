# pixelnul

![Pixel the cat, in a few pixels](web/public/favicon.svg)

**One canvas. 921,600 pixels. Everyone paints at once.**

pixelnul is a giant shared canvas, 1280 × 720 pixels, where anyone can drop a pixel and watch everyone else's land live. Draw something alone and it lasts a minute. Draw it with friends and it might survive the night.

It is named after Pixel, a tabby cat with a white blaze and a short temper. He is the logo. He does not care about your drawing.

## How it works

1. **Pick a colour.** The palette sits at the bottom of the screen (or press `C`).
2. **Click.** Your pixel appears for everyone, instantly.
3. **Wait a little.** You get a small stock of pixels that refills over time, so nobody can flood the board alone: big drawings need a team.
4. **Wander around.** Drag to move, pinch or Ctrl + scroll to zoom, like a Figma board. The minimap shows where the action is.

Watching is free. To paint, sign in with Google or Discord and choose a pseudo.

## What else is in there

- **Every pixel has a story.** Hover one to see how many times it was repainted, when, and by whom.
- **Stats.** The day's best painters, the most fought-over pixel, the colours on the board, the activity hour by hour.
- **Take it home.** Download the whole canvas as a crisp PNG, up to four times its size.
- **For everyone.** Fully usable with a keyboard and a screen reader, colours have names, animations calm down when your system asks.
- **Kept friendly.** A flag button reports hateful content (or a bug), and moderators can wipe a zone in a few clicks.
- **No ads, no tracking, no paid pixels.** Same rules for everyone.

## Run it yourself

You need Go, Node, pnpm and Redis.

```bash
redis-server --daemonize yes
cd server && go run .            # keeps running: open a second terminal
cd web && pnpm install && pnpm dev
```

Then open <http://localhost:5173>.

## Under the hood

A Go server keeps the canvas in Redis and broadcasts every pixel over WebSockets; the front is Svelte 5, drawing on one full-screen `<canvas>`. The interface is in French.

Curious about the details (protocol, storage, protections, configuration, tests)? It is all in [docs/technical.md](docs/technical.md). Conventions for contributors are in [CLAUDE.md](CLAUDE.md).
