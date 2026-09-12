import { test } from 'node:test'
import assert from 'node:assert/strict'
import { effectiveStart } from './reminders.js'

test('effectiveStart: evento de día completo dispara a las 09:00 de la zona de la sala', () => {
  const ev = { start: '2026-01-15' }
  assert.equal(effectiveStart(ev, 'Atlantic/Canary'), Date.UTC(2026, 0, 15, 9, 0))
})

test('effectiveStart: evento de día completo usa la zona de la sala, no la de otra', () => {
  const ev = { start: '2026-01-15' }
  const canary = effectiveStart(ev, 'Atlantic/Canary')   // 09:00 = 09:00 UTC en invierno
  const sydney = effectiveStart(ev, 'Australia/Sydney')  // 09:00 = 22:00 UTC del día anterior (verano austral)
  assert.notEqual(canary, sydney)
})

test('effectiveStart: evento con hora reinterpreta esos dígitos como hora de pared en la zona de la sala', () => {
  // El modelo (MEJORAS-2.md Fase 8.1) es "hora de pared, sin instante fijo":
  // el mismo string "20:00" dispara a las 20:00 de la zona configurada,
  // cambie la que cambie — por eso aquí se ignora la "Z" original.
  const ev = { start: '2026-01-15T20:00:00.000Z' }
  assert.equal(effectiveStart(ev, 'Atlantic/Canary'), Date.UTC(2026, 0, 15, 20, 0))
})

test('effectiveStart: cambiar la zona de la sala recalcula el instante para el mismo evento', () => {
  const ev = { start: '2026-01-15T20:00:00.000Z' }
  const madrid = effectiveStart(ev, 'Europe/Madrid')
  const sydney = effectiveStart(ev, 'Australia/Sydney')
  assert.notEqual(madrid, sydney)
})
