// Test accounts, written straight into Redis (database 14) before the run: no sign-in provider needed.
import { createHash } from 'node:crypto'
import { createConnection } from 'node:net'
import { expect, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test'

export const ACCOUNTS = {
  player: { id: 'e2eplayer', pseudo: 'Joueur', token: 'e2e-player-session' },
  admin: { id: 'e2eadmin', pseudo: 'Chef', token: 'e2e-admin-session' },
}
export type Role = keyof typeof ACCOUNTS

/** Signs a browser context in (its pages and page.request share the cookie). */
export async function signIn(context: BrowserContext, role: Role) {
  await context.addCookies([{ name: 'session', value: ACCOUNTS[role].token, domain: 'localhost', path: '/' }])
}

/** Opens the app and waits for the configuration (commands are inert before that). */
export async function open(page: Page) {
  await page.bringToFront() // several players: the front page receives the keyboard
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Zoomer', exact: true })).toBeVisible()
}

export type PixelInfo = { x: number; y: number; c: number; changes: number }

/** A random white pixel near the origin (reachable with the keyboard cursor), so painting it black
 *  is always a change, whatever earlier runs left in Redis. Returns its current history too. */
export async function whitePixel(request: APIRequestContext): Promise<PixelInfo> {
  for (;;) {
    const [x, y] = [0, 0].map(() => Math.floor(Math.random() * 61) - 30)
    const res = await request.get(`/api/pixels/${String(x)}/${String(y)}`)
    const info = (await res.json()) as PixelInfo
    if (info.c === 0) return info
  }
}

const resp = (c: string[]) =>
  `*${String(c.length)}\r\n${c.map((a) => `$${String(Buffer.byteLength(a))}\r\n${a}\r\n`).join('')}`

/** Sends commands to the test Redis over its plain-text protocol; rejects on any error reply. */
function redis(cmds: string[][]): Promise<void> {
  return new Promise((resolve, reject) => {
    let out = ''
    const sock = createConnection(6379, 'localhost', () => {
      sock.end([['SELECT', '14'], ...cmds].map(resp).join(''))
    })
    sock.on('data', (d) => (out += d.toString()))
    sock.on('error', reject)
    sock.on('close', () => {
      if (/(^|\r\n)-/.test(out)) reject(new Error(`redis: ${out}`))
      else resolve()
    })
  })
}

/** Playwright global setup: (re)creates the accounts and their sessions. */
export default async function seed() {
  const now = String(Date.now())
  await redis(
    Object.values(ACCOUNTS).flatMap(({ id, pseudo, token }) => [
      ['DEL', `user:${id}`],
      ['HSET', `user:${id}`, 'google', id, 'pseudo', pseudo, 'pkey', pseudo.toLowerCase(), 'created', now],
      ['SET', `google:${id}`, id],
      ['SET', `pseudo:${pseudo.toLowerCase()}`, id],
      ['SET', `session:${createHash('sha256').update(token).digest('hex')}`, id, 'EX', '86400'],
    ]),
  )
}
