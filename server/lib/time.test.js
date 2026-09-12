import { test } from 'node:test'
import assert from 'node:assert/strict'
import { zonedWallTimeToInstant, isValidTimeZone, nextTimestamp } from './time.js'

test('zonedWallTimeToInstant: Europe/Madrid invierno (CET, UTC+1)', () => {
  assert.equal(zonedWallTimeToInstant('2026-01-15T12:00', 'Europe/Madrid'), Date.UTC(2026, 0, 15, 11, 0))
})

test('zonedWallTimeToInstant: Europe/Madrid verano (CEST, UTC+2)', () => {
  assert.equal(zonedWallTimeToInstant('2026-07-15T12:00', 'Europe/Madrid'), Date.UTC(2026, 6, 15, 10, 0))
})

test('zonedWallTimeToInstant: Atlantic/Canary invierno (WET, UTC+0)', () => {
  assert.equal(zonedWallTimeToInstant('2026-01-15T12:00', 'Atlantic/Canary'), Date.UTC(2026, 0, 15, 12, 0))
})

test('zonedWallTimeToInstant: Atlantic/Canary verano (WEST, UTC+1)', () => {
  assert.equal(zonedWallTimeToInstant('2026-07-15T12:00', 'Atlantic/Canary'), Date.UTC(2026, 6, 15, 11, 0))
})

test('zonedWallTimeToInstant: Australia/Sydney verano austral (AEDT, UTC+11)', () => {
  assert.equal(zonedWallTimeToInstant('2026-01-15T12:00', 'Australia/Sydney'), Date.UTC(2026, 0, 15, 1, 0))
})

test('zonedWallTimeToInstant: Australia/Sydney invierno austral (AEST, UTC+10)', () => {
  assert.equal(zonedWallTimeToInstant('2026-07-15T12:00', 'Australia/Sydney'), Date.UTC(2026, 6, 15, 2, 0))
})

test('zonedWallTimeToInstant: la misma hora de pared da un instante distinto según la zona', () => {
  const madrid = zonedWallTimeToInstant('2026-01-15T20:00', 'Europe/Madrid')
  const sydney = zonedWallTimeToInstant('2026-01-15T20:00', 'Australia/Sydney')
  assert.notEqual(madrid, sydney)
})

test('zonedWallTimeToInstant: sin parte de hora asume 00:00', () => {
  assert.equal(zonedWallTimeToInstant('2026-01-15', 'Atlantic/Canary'), Date.UTC(2026, 0, 15, 0, 0))
})

test('isValidTimeZone: acepta zonas IANA reales', () => {
  assert.equal(isValidTimeZone('Europe/Madrid'), true)
  assert.equal(isValidTimeZone('Australia/Sydney'), true)
  assert.equal(isValidTimeZone('UTC'), true)
})

test('isValidTimeZone: rechaza basura, vacío, no-string y strings larguísimos', () => {
  assert.equal(isValidTimeZone('no-existe/en-ningun-lado'), false)
  assert.equal(isValidTimeZone(''), false)
  assert.equal(isValidTimeZone(null), false)
  assert.equal(isValidTimeZone(undefined), false)
  assert.equal(isValidTimeZone(123), false)
  assert.equal(isValidTimeZone('x'.repeat(200)), false)
})

test('nextTimestamp: siempre estrictamente mayor que el anterior, incluso en el mismo instante', () => {
  const prev = new Date().toISOString()
  const next = nextTimestamp(prev)
  assert.ok(next > prev)
})

test('nextTimestamp: encadenado varias veces sigue siendo creciente', () => {
  let t = new Date().toISOString()
  for (let i = 0; i < 5; i++) {
    const next = nextTimestamp(t)
    assert.ok(next > t)
    t = next
  }
})
