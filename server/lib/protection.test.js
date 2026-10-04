import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createTokenBucket } from './tokenBucket.js'
import { createIpGuard } from './ipGuard.js'
import { createConcurrencyLimiter } from './concurrency.js'

// Reloj falso: se avanza a mano, los tests no esperan de verdad.
function fakeClock(start = 1_000_000) {
  let t = start
  return { now: () => t, advance: ms => { t += ms } }
}

// ─── Cubo de fichas ───────────────────────────────────────

test('tokenBucket: permite una ráfaga de `capacity` y luego corta', () => {
  const clock = fakeClock()
  const bucket = createTokenBucket({ capacity: 5, refillPerSec: 1, now: clock.now })
  for (let i = 0; i < 5; i++) assert.equal(bucket.take(), true, `ficha ${i + 1}`)
  assert.equal(bucket.take(), false)
})

test('tokenBucket: se rellena con el tiempo, sin pasar de la capacidad', () => {
  const clock = fakeClock()
  const bucket = createTokenBucket({ capacity: 5, refillPerSec: 2, now: clock.now })
  for (let i = 0; i < 5; i++) bucket.take()
  assert.equal(bucket.take(), false)

  clock.advance(1000) // +2 fichas
  assert.equal(bucket.take(), true)
  assert.equal(bucket.take(), true)
  assert.equal(bucket.take(), false)

  clock.advance(60_000) // mucho tiempo: no acumula más de la capacidad
  let n = 0
  while (bucket.take()) n++
  assert.equal(n, 5)
})

test('tokenBucket: el uso humano normal (varios por segundo) nunca se corta', () => {
  const clock = fakeClock()
  const bucket = createTokenBucket({ capacity: 200, refillPerSec: 30, now: clock.now })
  for (let i = 0; i < 600; i++) { // 10 mensajes por segundo durante un minuto
    clock.advance(100)
    assert.equal(bucket.take(), true)
  }
})

// ─── Guarda por IP ────────────────────────────────────────

const guardOpts = { maxConnections: 3, handshakesPerMinute: 5, strikesToBan: 3, strikeWindowMs: 60_000, banMs: 600_000 }

test('ipGuard: límite de conexiones abiertas por IP, que se libera al desconectar', () => {
  const clock = fakeClock()
  const g = createIpGuard({ ...guardOpts, handshakesPerMinute: 100, now: clock.now })
  for (let i = 0; i < 3; i++) { assert.equal(g.check('1.1.1.1').ok, true); g.connected('1.1.1.1') }
  assert.deepEqual(g.check('1.1.1.1'), { ok: false, reason: 'too-many-connections' })
  assert.equal(g.check('2.2.2.2').ok, true, 'otra IP no se ve afectada')

  g.disconnected('1.1.1.1')
  assert.equal(g.check('1.1.1.1').ok, true)
})

test('ipGuard: límite de conexiones nuevas por minuto, que se renueva con el tiempo', () => {
  const clock = fakeClock()
  const g = createIpGuard({ ...guardOpts, maxConnections: 100, now: clock.now })
  for (let i = 0; i < 5; i++) assert.equal(g.check('1.1.1.1').ok, true)
  assert.deepEqual(g.check('1.1.1.1'), { ok: false, reason: 'too-many-requests' })
  clock.advance(61_000)
  assert.equal(g.check('1.1.1.1').ok, true)
})

test('ipGuard: las faltas suficientes dentro de la ventana banean, una sola vez', () => {
  const clock = fakeClock()
  const g = createIpGuard({ ...guardOpts, now: clock.now })
  assert.equal(g.strike('9.9.9.9'), false)
  assert.equal(g.strike('9.9.9.9'), false)
  assert.equal(g.strike('9.9.9.9'), true, 'la tercera dispara el baneo')
  assert.equal(g.isBanned('9.9.9.9'), true)
  assert.deepEqual(g.check('9.9.9.9'), { ok: false, reason: 'banned' })
  assert.equal(g.strike('9.9.9.9'), false, 'ya baneada: no vuelve a avisar')
  assert.equal(g.isBanned('8.8.8.8'), false)
})

test('ipGuard: faltas espaciadas fuera de la ventana no suman; el baneo caduca', () => {
  const clock = fakeClock()
  const g = createIpGuard({ ...guardOpts, now: clock.now })
  g.strike('9.9.9.9'); clock.advance(61_000)
  g.strike('9.9.9.9'); clock.advance(61_000)
  assert.equal(g.strike('9.9.9.9'), false, 'solo cuenta la última dentro de la ventana')

  for (let i = 0; i < 3; i++) g.strike('7.7.7.7')
  assert.equal(g.isBanned('7.7.7.7'), true)
  clock.advance(601_000)
  assert.equal(g.isBanned('7.7.7.7'), false)
  assert.equal(g.check('7.7.7.7').ok, true)
})

test('ipGuard: sweep descarta lo caducado sin tocar lo vigente', () => {
  const clock = fakeClock()
  const g = createIpGuard({ ...guardOpts, now: clock.now })
  for (let i = 0; i < 3; i++) g.strike('1.1.1.1')
  g.check('2.2.2.2')
  clock.advance(120_000)
  assert.doesNotThrow(() => g.sweep())
  assert.equal(g.isBanned('1.1.1.1'), true, 'el baneo sigue vigente')
})

// ─── Limitador de concurrencia ────────────────────────────

const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }

test('concurrency: no corren más tareas a la vez que el límite y las demás esperan turno', async () => {
  const limiter = createConcurrencyLimiter({ concurrency: 2, maxQueue: 10 })
  let running = 0
  let peak = 0
  const gates = Array.from({ length: 5 }, deferred)
  const results = gates.map((g, i) => limiter.run(async () => {
    running++; peak = Math.max(peak, running)
    await g.promise
    running--
    return i
  }))
  await new Promise(r => setTimeout(r, 20))
  assert.equal(peak, 2)
  assert.deepEqual(limiter.stats(), { running: 2, queued: 3 })
  gates.forEach(g => g.resolve())
  assert.deepEqual(await Promise.all(results), [0, 1, 2, 3, 4])
  assert.equal(peak, 2)
})

test('concurrency: con la cola llena rechaza con BUSY en vez de acumular', async () => {
  const limiter = createConcurrencyLimiter({ concurrency: 1, maxQueue: 2 })
  const gate = deferred()
  const slow = () => gate.promise
  const accepted = [limiter.run(slow), limiter.run(slow), limiter.run(slow)] // 1 corriendo + 2 en cola
  await assert.rejects(limiter.run(slow), err => err.code === 'BUSY')
  gate.resolve()
  await Promise.all(accepted)
  // y se recupera
  assert.equal(await limiter.run(async () => 'ok'), 'ok')
})

test('concurrency: un error (incluso síncrono) rechaza esa tarea sin bloquear el turno', async () => {
  const limiter = createConcurrencyLimiter({ concurrency: 1, maxQueue: 5 })
  await assert.rejects(limiter.run(() => { throw new Error('boom') }), /boom/)
  await assert.rejects(limiter.run(async () => { throw new Error('boom2') }), /boom2/)
  assert.equal(await limiter.run(async () => 'sigue funcionando'), 'sigue funcionando')
})
