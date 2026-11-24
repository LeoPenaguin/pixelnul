# TODO

What the 2026-11-24 audit could not fix in the code, and what to keep an eye on. Delete an item once done.

## Before the next deploy

- [ ] **Wipe the old history keys** on the test server: `redis-cli --scan --pattern 'meta:*' | xargs redis-cli del`.
  The history now lives in `count:`, `time:` and `painter:` strings; the old pixels keep their colour but start
  with no history.
- [ ] **Everyone signs in again once.** Session tokens are now stored hashed (`session:{sha256(token)}`): the
  old `session:{token}` keys no longer match and expire by themselves within 30 days. Nothing to migrate.
- [ ] **Check the reverse proxy.** It must run on the same machine and append the client to `X-Forwarded-For`
  (see README, server configuration). Otherwise the per-IP limits apply to the whole site at once.
- [ ] **Check the first CI run** (`.github/workflows/ci.yml`, never run yet): action versions, Redis service,
  Playwright install. Then make it required on `main` (branch protection).

## To fix later

- [ ] **Security headers**, set by whatever serves the front (nothing in the repo does): `Content-Security-Policy`
  (at least `default-src 'self'; connect-src 'self'; img-src 'self' data: blob:; frame-ancestors 'none'`, to test
  against the built app), `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy:
  same-origin`. Without `frame-ancestors`, another site can frame the board and trick visitors into painting.
- [ ] **Remove the `pnpm` overrides** (`web/pnpm-workspace.yaml`: `minimatch`, `katex`) once `typescript-eslint` and
  `markdownlint-cli2` ship the patched versions themselves (`pnpm why minimatch katex`).

## Watch points (known ceilings)

The code marks its deliberate shortcuts with `ponytail:` comments (`grep -rn "ponytail:" server web/src`).
The ones that matter first:

- **Paint throughput**: one global lock and one Redis round trip per paint, ~1/RTT pixels/s
  (1k/s with a remote Redis at 1 ms). Lock per chunk beyond that.
- **Single process**: the broadcast hub and the quotas live in memory. Several instances need Redis Pub/Sub
  and quotas in Redis.
- **No Redis Cluster**: the Lua scripts touch keys they compute themselves.
- **No sign-in configured = quota per IP**: an IPv6 user can rotate addresses inside their /64. Keep a provider on in production.
- **Painter ids**: a paint records at most 16 bytes of user id (`board.PainterLen`), the length of account ids
  (8 random bytes in hex). Longer ids are refused: change both together.
- **Admin fill**: capped at 65,536 pixels, sent as one batch to every client.
- **`stats:hourly`** keeps one field per hour forever (a few hundred KB a year).
- **Palette**: append only, never reorder (`PaletteRows`).
- **E2E logs**: a Vite `ws proxy socket error: ECONNRESET` showed up once in nine runs, at teardown; tests still
  passed. Look closer if it becomes frequent.
