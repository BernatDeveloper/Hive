import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseOrigins, createOriginChecker, isLocalDevHost, corsOrigin } from './cors.js'

test('parseOrigins: normaliza (sin barra final ni ruta), admite varios y descarta basura', () => {
  assert.deepEqual(parseOrigins('https://app.com/'), ['https://app.com'])
  assert.deepEqual(parseOrigins('https://app.com/ruta/larga?x=1'), ['https://app.com'])
  assert.deepEqual(parseOrigins(' https://a.com , https://b.com:8443/ ,, no-es-url '), ['https://a.com', 'https://b.com:8443'])
  assert.deepEqual(parseOrigins('file:///x, ftp://a.com, javascript:alert(1), https://ok.com'), ['https://ok.com'])
  assert.deepEqual(parseOrigins(''), [])
  assert.deepEqual(parseOrigins(undefined), [])
})

test('producción (sin localhost): solo los orígenes configurados', () => {
  const ok = createOriginChecker({ allowedOrigins: parseOrigins('https://app.com/'), allowLocalhost: false })
  assert.equal(ok('https://app.com'), true)
  assert.equal(ok('https://otra.com'), false)
  assert.equal(ok('http://app.com'), false, 'otro esquema = otro origen')
  assert.equal(ok('https://app.com:8443'), false, 'otro puerto = otro origen')
  assert.equal(ok('https://evil.app.com'), false)
  assert.equal(ok('https://app.com.evil.com'), false)
})

test('ya no se acepta cualquier *.vercel.app (ni subdominios de plataformas) sin configurarlo', () => {
  const ok = createOriginChecker({ allowedOrigins: parseOrigins('https://mi-app.vercel.app'), allowLocalhost: false })
  assert.equal(ok('https://mi-app.vercel.app'), true)
  assert.equal(ok('https://cualquier-otra.vercel.app'), false)
  assert.equal(ok('https://mi-app.vercel.app.evil.com'), false)
})

test('varios orígenes configurados', () => {
  const ok = createOriginChecker({ allowedOrigins: parseOrigins('https://app.com,https://pruebas.app.com'), allowLocalhost: false })
  assert.equal(ok('https://app.com'), true)
  assert.equal(ok('https://pruebas.app.com'), true)
  assert.equal(ok('https://otra.com'), false)
})

test('localhost solo en desarrollo, en cualquier puerto', () => {
  const dev = createOriginChecker({ allowedOrigins: [], allowLocalhost: true })
  assert.equal(dev('http://localhost:5173'), true)
  assert.equal(dev('http://localhost:5199'), true)
  assert.equal(dev('http://127.0.0.1:3000'), true)
  assert.equal(dev('http://localhost.evil.com'), false)

  const prod = createOriginChecker({ allowedOrigins: [], allowLocalhost: false })
  assert.equal(prod('http://localhost:5173'), false)
})

test('en desarrollo también valen las IPs de red local (probar desde el móvil), y solo ahí', () => {
  for (const host of ['localhost', '127.0.0.1', '192.168.1.40', '10.0.0.7', '172.16.5.5', '172.31.255.1']) {
    assert.equal(isLocalDevHost(host), true, host)
  }
  for (const host of ['172.32.0.1', '172.15.0.1', '8.8.8.8', '192.169.0.1', '11.0.0.1', 'example.com', '192.168.1.40.evil.com', '']) {
    assert.equal(isLocalDevHost(host), false, host)
  }
  const dev = createOriginChecker({ allowedOrigins: [], allowLocalhost: true })
  assert.equal(dev('http://192.168.1.40:5173'), true)
  const prod = createOriginChecker({ allowedOrigins: [], allowLocalhost: false })
  assert.equal(prod('http://192.168.1.40:5173'), false)
})

test('corsOrigin: sin Origin pasa; uno no permitido no recibe cabeceras CORS (sin error)', () => {
  const answer = origin => { let out; corsOrigin(origin, (err, allow) => { out = { err, allow } }); return out }
  assert.deepEqual(answer(undefined), { err: null, allow: true })
  assert.deepEqual(answer('https://evil.example'), { err: null, allow: false })
})

test('orígenes inválidos o "null" se rechazan', () => {
  const ok = createOriginChecker({ allowedOrigins: ['https://app.com'], allowLocalhost: true })
  for (const origin of ['null', '', 'no-es-url', 'javascript:alert(1)', 'file:///etc/passwd']) {
    assert.equal(ok(origin), false, origin)
  }
})
