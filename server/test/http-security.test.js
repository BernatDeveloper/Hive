import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { db } from '../db/connection.js'
import { createApp } from '../http/app.js'

// App Express aislada con un límite HTTP pequeño (5/minuto) para poder
// probar el corte sin enviar 120 peticiones.
let httpServer
let base
before(async () => {
  httpServer = createServer(createApp({ httpLimitPerMinute: 5 }))
  await new Promise(resolve => httpServer.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${httpServer.address().port}`
})
after(async () => {
  await new Promise(resolve => httpServer.close(resolve))
  db.close()
})

// Cada test usa su propia "IP" (TRUST_PROXY=true en los tests: se lee de X-Forwarded-For).
const get = (path, ip, init = {}) => fetch(base + path, { ...init, headers: { 'x-forwarded-for': ip, ...(init.headers ?? {}) } })

test('cabeceras de seguridad y sin "X-Powered-By: Express"', async () => {
  const res = await get('/health', '10.93.0.1')
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { ok: true })
  assert.equal(res.headers.get('x-powered-by'), null)
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff')
  assert.equal(res.headers.get('x-frame-options'), 'DENY')
  assert.equal(res.headers.get('referrer-policy'), 'no-referrer')
  assert.equal(res.headers.get('content-security-policy'), "default-src 'none'; frame-ancestors 'none'")
})

test('ruta desconocida: 404 en JSON (no el HTML "Cannot GET") y con las mismas cabeceras', async () => {
  const res = await get('/admin/.env', '10.93.0.2')
  assert.equal(res.status, 404)
  assert.deepEqual(await res.json(), { error: 'not-found' })
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff')
})

test('errores de parseo: respuesta genérica en JSON, sin traza ni detalles internos', async () => {
  const bad = await get('/health', '10.93.0.3', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{ esto no es json' })
  assert.equal(bad.status, 400)
  const body = await bad.text()
  assert.deepEqual(JSON.parse(body), { error: 'bad-request' })
  assert.ok(!/at .*\.js|SyntaxError|node_modules/.test(body), 'no filtra la traza')

  const big = await get('/health', '10.93.0.4', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ x: 'a'.repeat(300_000) }) })
  assert.equal(big.status, 413)
  assert.deepEqual(await big.json(), { error: 'payload-too-large' })
})

test('límite de peticiones por IP: 429 con Retry-After, y otra IP no se ve afectada', async () => {
  const ip = '10.93.0.5'
  for (let i = 0; i < 5; i++) assert.equal((await get('/health', ip)).status, 200)
  const limited = await get('/health', ip)
  assert.equal(limited.status, 429)
  assert.deepEqual(await limited.json(), { error: 'too-many-requests' })
  assert.ok(Number(limited.headers.get('retry-after')) >= 1)

  assert.equal((await get('/health', '10.93.0.6')).status, 200)
})

test('un origen ajeno no recibe cabeceras CORS (y la petición no acaba en error 500)', async () => {
  const res = await get('/health', '10.93.0.7', { headers: { Origin: 'https://evil.example' } })
  assert.equal(res.status, 200)
  assert.equal(res.headers.get('access-control-allow-origin'), null)

  const ok = await get('/health', '10.93.0.8', { headers: { Origin: 'http://localhost:5173' } })
  assert.equal(ok.headers.get('access-control-allow-origin'), 'http://localhost:5173')
})
