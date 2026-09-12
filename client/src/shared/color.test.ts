import { describe, test, expect } from 'vitest'
import { isColorDark, readableTextColor } from './color'

describe('isColorDark', () => {
  test('negro es oscuro', () => {
    expect(isColorDark('#000000')).toBe(true)
  })

  test('blanco no es oscuro', () => {
    expect(isColorDark('#FFFFFF')).toBe(false)
  })

  test('azul primario de la app (#0071E3) es oscuro (texto blanco encima)', () => {
    expect(isColorDark('#0071E3')).toBe(true)
  })

  test('amarillo es claro', () => {
    expect(isColorDark('#FFFF00')).toBe(false)
  })

  test('null/undefined/string corta → false (nunca "oscuro" por datos incompletos)', () => {
    expect(isColorDark(null)).toBe(false)
    expect(isColorDark(undefined)).toBe(false)
    expect(isColorDark('#fff')).toBe(false)
  })
})

describe('readableTextColor', () => {
  test('fondo oscuro → texto blanco', () => {
    expect(readableTextColor('#000000')).toBe('#FFFFFF')
  })

  test('fondo claro → texto oscuro', () => {
    expect(readableTextColor('#FFFFFF')).toBe('#1D1D1F')
  })
})
