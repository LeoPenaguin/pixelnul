# Pixels

A 1280 × 720 collaborative pixel canvas in the spirit of r/place, navigated like a Figma board.

- **server/**: Go. HTTP + WebSocket, storage in Redis.
- **web/**: Svelte 5 + Vite. One full-screen `<canvas>`. The UI is in French.

## Run locally

Requirements: Go, Node, pnpm and Redis (`brew install go redis pnpm golangci-lint`).

```bash
redis-server --daemonize yes
```

```bash
cd server && go run .
```

```bash
cd web && pnpm install && pnpm dev
```

Then open <http://localhost:5173> (Vite proxies `/api` and `/ws` to the Go server on `:3007`).

## Development

`pnpm install` also installs the Git hooks (Husky). Every command below is also run by a hook.

| What | Command | Hook |
| --- | --- | --- |
| Front lint (Prettier + ESLint + markdownlint) | `cd web && pnpm lint` (fix: `pnpm format`) | pre-commit |
| Front type check | `cd web && pnpm check` | pre-commit |
| Go lint + format check | `cd server && golangci-lint run ./...` (fix: `golangci-lint fmt`) | pre-commit |
| Commit message | Conventional Commits, checked by commitlint | commit-msg |
| Branch name | `<type>/<kebab-case>` | pre-push |
| Front unit tests, 100 % coverage | `cd web && pnpm test` | pre-push |
| Go tests, 100 % coverage | `cd server && go test -race -cover ./internal/...` | pre-push |
| End-to-end tests | `cd web && pnpm test:e2e` | pre-push |

- Front unit tests run in a real headless Chromium (Vitest browser mode). Once: `cd web && pnpm exec playwright install chromium`.
- Go tests use an in-memory Redis (miniredis): no Redis needed.
- End-to-end tests start their own Go server (`:3017`, Redis database 14) and Vite (`:5183`): Redis must be running.

See [CLAUDE.md](CLAUDE.md) for conventions (naming, commits, branches, layout).

## Controls

- Drag, wheel or two fingers: pan. Ctrl + wheel, pinch or `+` / `-`: zoom.
- Click (without dragging): paint a pixel with the selected colour. Outside the 1280 × 720 world (grey area), nothing is painted.
- The cursor shows what a click would do: crosshair = paint, hand = outside the world (pan only), forbidden = no pixel left or offline, closed hand while dragging.
- Phones (small touch screens): no X / Y panel and no minimap, the board is navigated by hand.
- Bottom toolbar: palette button (`C`), showing the current colour and its name (never colour alone). Clicking a colour picks it and closes the palette; arrow keys browse it, Escape closes it. Quota gauge.
- Bottom-right buttons: zoom in / out, back to 0, 0 (`0`), download, settings, shortcut list (`?`, hidden on small touch screens).
- Download: an image of the whole board, ×1 to ×4 (pixels stay square), in PNG (lossless: pixels stay sharp). Built in the browser from the chunks.
- Settings (remembered in the browser): grid (`G`), interface size 100 / 125 / 150 % (the board is not affected).
- The coordinates (top left) follow the pointer or the keyboard cursor, with the history of that pixel.
- Recenter, button / keyboard zoom and jumps are animated; a far jump starts a few screens before the target.
- Minimap (top right, hidden on small touch screens): drag to pan, click to fly there.
- On load, the view opens on 0, 0.
- Keyboard: arrows move a cursor (Shift: 10 pixels, the view follows), Enter or Space paints.
- Accessibility: every control has a name (colours have French names), the board announces the targeted and painted pixels to screen readers, and animations are disabled when the system asks for reduced motion.
- Hovering a pixel shows how many times it was painted, when it was last painted and by whom (pseudo).
- Heatmap (`H`, flame button): the board shows how many times each pixel was painted instead of its colour; painting is off meanwhile, and its legend takes the toolbar's place. A snapshot, reloaded each time it is turned on.
- Accounts (when a sign-in provider is configured: Google, Discord): watching is free, painting needs a sign-in and a pseudo chosen at the first one. The account menu changes the pseudo, signs out, or deletes the account (its past pixels stay, anonymous). Without any provider configured, anyone can paint, counted by IP.
- Stats (site panel): paints in total, share of the board painted, connected tabs, paints per hour over the last 24 h, colours on the board, the day's 10 best painters (UTC day), the most disputed pixel.

## How it works

- The world is 1280 × 720 (16:9) and centred on 0, 0: x from -640 to 639, y from -360 to 359. It is stored in 256×256 chunks (6 × 4, the border ones partly outside). The size is `WorldWidth` / `WorldHeight` in `server/internal/board/pixel.go`; resizing needs no data migration (pixels outside a smaller world stay in Redis, hidden, and come back if it grows again).
- Each chunk is a Redis string `chunk:{cx}:{cy}` of 65,536 bytes, one byte = palette index (0 = white = never painted).
- History lives in the hash `meta:{cx}:{cy}`: `n:{offset}` = paint count, `t:{offset}` = time of the last paint (Unix ms), `u:{offset}` = user id of the last painter (missing when anonymous).
- The sorted set `top:{day}` (UTC day = Unix ms / 86,400,000) counts each user's paints that day; it expires after 2 days.
- The hash `stats:hourly` counts paints per Unix hour (`{hour}` = count), from the moment it was introduced.
- Painting runs an atomic Lua script: it writes the byte (`SETRANGE`), bumps the counter, and timestamps the paint. There is no per-paint history: moderation paints over. Repainting the same colour counts too: it costs a pixel and is broadcast like any other.
- Accounts: `{provider}:{sub}` → user id (`google:{sub}`, `discord:{id}`; the same person through two providers is two accounts); `user:{id}` hash (`google` or `discord` = that id, `pseudo`, `pkey`, `created`, `banned` = `1` when banned); `pseudo:{lower-case pseudo}` → user id (unique regardless of case); `session:{token}` → user id, 30 days. Only the account id is requested (Google: scope `openid`; Discord: scope `identify`, of which only `id` is kept): no name, no e-mail.
- `GET /api/config` returns the palette, quota and sign-in providers (`auth`, e.g. `["google", "discord"]`, empty when off); `GET /api/chunks/{cx}/{cy}` the raw chunk bytes (gzipped when the client accepts it); `GET /api/pixels/{x}/{y}` returns `{x, y, c, changes, lastChange, by}` (`by` = pseudo of the last painter, or null); `GET /api/heat/{cx}/{cy}` the paint counts of a chunk, one byte per pixel (capped at 255); `GET /api/stats` the world statistics (recomputed at most every 10 s).
- Sign-in: `GET /api/auth/{provider}/login` → the provider → `GET /api/auth/{provider}/callback`, which sets an `HttpOnly`, `SameSite=Lax` session cookie (`Secure` when `PUBLIC_URL` is https). `GET /api/me` returns `{id, pseudo, admin, banned}` or `null`; `POST /api/me/pseudo` `{"pseudo"}` (400 invalid, 409 taken); `POST /api/auth/logout`; `DELETE /api/me` deletes the account.
- WebSocket `/ws`: the client sends `{"x","y","c"}`. With sign-in on, the account is read when the connection opens (the front reconnects after signing in or out), pixels from a connection without an account with a pseudo are ignored, and the quota is sent right away. The server answers `{"t":"q","n"}` (remaining quota) and broadcasts every 100 ms a batch `{"t":"b","p":[x,y,c, x,y,c, …]}` of every pixel painted meanwhile. Messages over 512 bytes are compressed (permessage-deflate) when the browser supports it.

- Moderation (accounts listed in `ADMIN_IDS`, otherwise 403): `POST /api/admin/fill` `{"x0","y0","x1","y1","c"}` paints a rectangle, corners included, in any order (400 outside the world, 413 over 65,536 pixels); it erases those pixels' history too (paint counts, so the heatmap, last change, last painter): nothing of what was there shows. `POST /api/admin/ban` `{"pseudo","banned"}` bans the account owning a pseudo, or lifts the ban (404 unknown pseudo). The front shows a « Modération » button to admins.

## Protections

- Strict validation: integers, within world bounds, colour in the palette.
- Quota (token bucket): 10 pixels in a row, then one more every second, per account (shared by its tabs and devices), or per IP without sign-in. The quota survives disconnection.
- Batched broadcast every 100 ms: outgoing messages no longer scale with clicks.
- Anti-flood: 10 messages/s (burst 20) per connection, beyond that the connection is closed; messages are 256 bytes max.
- 10 WebSocket connections max per IP; cross-origin WebSockets are refused.
- A banned account can no longer paint, from its next pixel (checked on every paint).
- Pixel history (`/api/pixels`): 20 requests in a row per IP, then 10 per second; beyond that, 429.

## Server configuration (environment variables)

Also read from `server/.env` (ignored by Git; template: `server/.env.example`). Variables already set in the environment win.

| Variable | Default |
| --- | --- |
| `ADDR` | `:3007` |
| `REDIS_URL` | `redis://localhost:6379` |
| `PIXEL_BURST` | `10` (pixels in a row) |
| `PIXEL_REFILL_MS` | `1000` (time to regain one pixel; `0` = unlimited, handy in dev: `PIXEL_REFILL_MS=0 go run .`) |
| `GOOGLE_CLIENT_ID`, `DISCORD_CLIENT_ID` | empty: that provider is off; none set: sign-in off, anyone paints |
| `GOOGLE_CLIENT_SECRET`, `DISCORD_CLIENT_SECRET` | required with the matching client id |
| `PUBLIC_URL` | `http://localhost:5173` (the site's address; each provider calls back `{PUBLIC_URL}/api/auth/{provider}/callback`) |
| `ADMIN_IDS` | empty (user ids allowed to moderate, separated by commas; sign in, then read your `id` at `/api/me`) |
