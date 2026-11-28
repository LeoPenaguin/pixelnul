import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { FakeWebSocket, stubWebSocket } from '../test/fakes'
import { Live, wsUrl } from './live'

const handlers = () => ({ onOpen: vi.fn(), onClose: vi.fn(), onPixel: vi.fn(), onQuota: vi.fn(), onReset: vi.fn() })

beforeEach(stubWebSocket)
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

test('connects to /ws on the same host and relays messages', () => {
  const h = handlers()
  const live = new Live(h)
  live.connect()
  const ws = FakeWebSocket.last
  expect(ws.url).toBe(`ws://${location.host}/ws`)
  expect(live.send(1, 2, 3)).toBe(false) // not open yet

  ws.open()
  expect(h.onOpen).toHaveBeenCalled()
  expect(live.open).toBe(true)
  expect(live.send(1, 2, 3)).toBe(true)
  expect(ws.sent).toEqual([{ x: 1, y: 2, c: 3 }])

  ws.receive({ t: 'q', n: 4.5 })
  expect(h.onQuota).toHaveBeenCalledWith(4.5)
  ws.receive({ t: 'b', p: [1, 2, 3, -4, 5, 6] })
  expect(h.onPixel.mock.calls).toEqual([
    [1, 2, 3],
    [-4, 5, 6],
  ])
  ws.receive({ t: 'r' })
  expect(h.onReset).toHaveBeenCalledOnce()
})

test('reconnects after a drop, not after close()', () => {
  vi.useFakeTimers()
  const h = handlers()
  const live = new Live(h)
  live.connect()
  FakeWebSocket.last.close()
  expect(h.onClose).toHaveBeenCalledTimes(1)
  vi.advanceTimersByTime(999)
  expect(FakeWebSocket.instances).toHaveLength(1) // at least 1 s
  vi.advanceTimersByTime(1001)
  expect(FakeWebSocket.instances).toHaveLength(2) // at most 2 s

  live.close()
  vi.advanceTimersByTime(5000)
  expect(FakeWebSocket.instances).toHaveLength(2)
  expect(h.onClose).toHaveBeenCalledTimes(1)
})

test('reconnect() opens a new connection without signalling a drop', () => {
  const h = handlers()
  const live = new Live(h)
  live.connect()
  const first = FakeWebSocket.last
  live.reconnect()
  expect(first.readyState).toBe(3)
  expect(FakeWebSocket.instances).toHaveLength(2)
  expect(h.onClose).not.toHaveBeenCalled()
  new Live(h).reconnect() // never connected: just connects
  expect(FakeWebSocket.instances).toHaveLength(3)
})

test('uses wss over https', () => {
  expect(wsUrl({ protocol: 'https:', host: 'pixels.example' })).toBe('wss://pixels.example/ws')
  expect(wsUrl({ protocol: 'http:', host: 'localhost:5173' })).toBe('ws://localhost:5173/ws')
})

test('close() without a connection does not throw', () => {
  expect(() => {
    new Live(handlers()).close()
  }).not.toThrow()
})
