import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveClientIp } from './clientIp.js'

const base = { address: '10.0.0.1', trustProxy: true }

test('sin TRUST_PROXY se usa la IP del socket, aunque venga X-Forwarded-For', () => {
  assert.equal(resolveClientIp({ ...base, trustProxy: false, forwardedFor: '8.8.8.8' }), '10.0.0.1')
})

test('con un proxy de confianza: la IP que añadió el proxy (la última)', () => {
  assert.equal(resolveClientIp({ ...base, forwardedFor: '203.0.113.7' }), '203.0.113.7')
  assert.equal(resolveClientIp({ ...base, forwardedFor: '203.0.113.7, 198.51.100.2' }), '198.51.100.2')
})

test('lo que escriba el cliente por delante NO cuenta: variar la primera entrada no cambia la clave', () => {
  const a = resolveClientIp({ ...base, forwardedFor: '1.1.1.1, 203.0.113.7' })
  const b = resolveClientIp({ ...base, forwardedFor: '2.2.2.2, 3.3.3.3, 203.0.113.7' })
  assert.equal(a, '203.0.113.7')
  assert.equal(b, '203.0.113.7')
})

test('con dos proxies de confianza (hops=2): la IP que vio el primero', () => {
  // cliente (falsea "1.1.1.1") → CDN (añade la IP real del cliente) → balanceador (añade la del CDN)
  const header = '1.1.1.1, 203.0.113.7, 198.51.100.2'
  assert.equal(resolveClientIp({ ...base, forwardedFor: header, hops: 2 }), '203.0.113.7')
  assert.equal(resolveClientIp({ ...base, forwardedFor: header, hops: 1 }), '198.51.100.2')
})

test('hops mayor que las entradas presentes: la primera', () => {
  assert.equal(resolveClientIp({ ...base, forwardedFor: '203.0.113.7', hops: 3 }), '203.0.113.7')
})

test('espacios y comas sobrantes se ignoran', () => {
  assert.equal(resolveClientIp({ ...base, forwardedFor: ' 1.1.1.1 ,, 203.0.113.7 ,' }), '203.0.113.7')
})

test('encabezado ausente, vacío o que no es un string → IP del socket', () => {
  for (const forwardedFor of [undefined, '', '   ', ',,', ['1.1.1.1', '2.2.2.2'], 42]) {
    assert.equal(resolveClientIp({ ...base, forwardedFor }), '10.0.0.1')
  }
})
