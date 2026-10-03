import { describe, test, expect } from 'vitest'
import { parseChecklistLine, toggleChecklistLine, hasChecklistLine } from './checklist'

describe('parseChecklistLine', () => {
  test('línea pendiente', () => {
    expect(parseChecklistLine('- [ ] comprar pan')).toEqual({ indent: '', checked: false, text: 'comprar pan' })
  })

  test('línea marcada, mayúscula o minúscula', () => {
    expect(parseChecklistLine('- [x] hecho')).toEqual({ indent: '', checked: true, text: 'hecho' })
    expect(parseChecklistLine('- [X] hecho')).toEqual({ indent: '', checked: true, text: 'hecho' })
  })

  test('admite "*" como viñeta y conserva la indentación', () => {
    expect(parseChecklistLine('  * [ ] anidado')).toEqual({ indent: '  ', checked: false, text: 'anidado' })
  })

  test('texto plano no es checklist', () => {
    expect(parseChecklistLine('nota normal')).toBeNull()
    expect(parseChecklistLine('- sin corchetes')).toBeNull()
  })
})

describe('toggleChecklistLine', () => {
  test('pendiente → marcada y viceversa', () => {
    expect(toggleChecklistLine('- [ ] pan')).toBe('- [x] pan')
    expect(toggleChecklistLine('- [x] pan')).toBe('- [ ] pan')
  })

  test('línea que no es checklist se devuelve igual', () => {
    expect(toggleChecklistLine('texto normal')).toBe('texto normal')
  })
})

describe('hasChecklistLine', () => {
  test('detecta al menos una línea checklist en un cuerpo con varias líneas', () => {
    expect(hasChecklistLine('primera línea\n- [ ] ítem\nmás texto')).toBe(true)
  })

  test('false si no hay ninguna', () => {
    expect(hasChecklistLine('solo texto\nmás texto')).toBe(false)
  })
})
