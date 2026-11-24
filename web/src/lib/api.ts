// HTTP calls to the server (chunks are loaded by engine/chunks.ts).

/** Board configuration. palette = colour rows; a colour's index = its position once the rows are flattened. */
export type Config = {
  chunkSize: number
  worldWidth: number // the world is centred on 0, 0
  worldHeight: number
  palette: string[][]
  quota: { burst: number; refillMs: number } // refillMs = 0: unlimited
  auth: string[] // sign-in providers ('google', 'discord'); any: painting needs an account with a pseudo
}

/** Signed-in user; pseudo is empty until chosen. admin: may moderate; banned: may no longer paint. */
export type User = { id: string; pseudo: string; admin: boolean; banned: boolean }

/** A pixel's history; lastChange (Unix ms) is null if its colour never changed; by = pseudo of the
 *  last painter, null if anonymous or deleted. */
export type PixelInfo = {
  x: number
  y: number
  c: number
  changes: number
  lastChange: number | null
  by: string | null
}

async function getJSON<T>(url: string): Promise<T> {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`${url} : ${String(r.status)}`)
  return r.json() as Promise<T>
}

/** World statistics, recomputed by the server at most every 10 s. colors[c] = pixels of colour c on the
 *  board (0 = white, never painted included); hours = paints per hour over the last 24 h, oldest first. */
export type Stats = {
  placed: number
  painted: number
  pixels: number
  online: number
  hottest: { x: number; y: number; changes: number } | null
  colors: number[]
  hours: number[]
  top: { pseudo: string; n: number }[] // most paints today (UTC day), best first
}

export const fetchConfig = () => getJSON<Config>('/api/config')

export const fetchStats = () => getJSON<Stats>('/api/stats')

export const fetchPixelInfo = (x: number, y: number) => getJSON<PixelInfo>(`/api/pixels/${String(x)}/${String(y)}`)

/** Signed-in user, or null. */
export const fetchMe = () => getJSON<User | null>('/api/me')

// JSON body: not a "simple" request, so another site cannot send it with our cookie.
const postJSON = (url: string, body: unknown) =>
  fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

const LATER = 'Impossible pour le moment'

/** Chooses or changes the pseudo. Resolves to the reason of a refusal, or null once saved. */
export async function savePseudo(pseudo: string): Promise<string | null> {
  const r = await postJSON('/api/me/pseudo', { pseudo })
  if (r.ok) return null
  if (r.status === 400 || r.status === 409) return (await r.text()).trim()
  return "Impossible d'enregistrer pour le moment"
}

/** Admin: fills a rectangle, corners included, in colour c. Resolves to the reason of a refusal, or null once done. */
export async function fillRect(x0: number, y0: number, x1: number, y1: number, c: number): Promise<string | null> {
  const r = await postJSON('/api/admin/fill', { x0, y0, x1, y1, c })
  if (r.ok) return null
  if (r.status === 400) return 'Un coin est hors de la toile'
  if (r.status === 413) return 'Trop grand : 65 536 pixels au plus'
  return LATER
}

/** Admin: bans the owner of a pseudo, or lifts the ban. Resolves to the reason of a refusal, or null once done. */
export async function setBanned(pseudo: string, banned: boolean): Promise<string | null> {
  const r = await postJSON('/api/admin/ban', { pseudo, banned })
  if (r.ok) return null
  if (r.status === 404) return (await r.text()).trim()
  return LATER
}

async function send(method: string, url: string) {
  const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' } })
  if (!r.ok) throw new Error(`${url} : ${String(r.status)}`)
}

export const signOut = () => send('POST', '/api/auth/logout')

/** Deletes the account; its past pixels stay, anonymous. */
export const deleteAccount = () => send('DELETE', '/api/me')
