import { describe, test, expect } from 'vitest'
import { listActivityText, NO_ACTIVITY_TEXT } from './listActivity'

const NOW = Date.parse('2026-10-04T12:00:00Z')

describe('listActivityText', () => {
  test('con editor: quién y hace cuánto', () => {
    expect(listActivityText({ last_editor_name: 'Ana', edited_at: '2026-10-04T11:58:00Z' }, NOW)).toBe('Modificada por Ana · hace 2 min')
  })

  test('sin nombre de editor: solo cuándo', () => {
    expect(listActivityText({ last_editor_name: null, edited_at: '2026-10-04T11:00:00Z' }, NOW)).toBe('Modificada · hace 1 hora')
  })

  test('acabada de modificar', () => {
    expect(listActivityText({ last_editor_name: 'Beto', edited_at: '2026-10-04T11:59:40Z' }, NOW)).toBe('Modificada por Beto · justo ahora')
  })

  test('lista sin registro de modificación (anterior a esta función): aviso explícito, no vacío', () => {
    expect(listActivityText({ last_editor_name: null, edited_at: null }, NOW)).toBe(NO_ACTIVITY_TEXT)
    expect(NO_ACTIVITY_TEXT).not.toBe('')
  })
})
