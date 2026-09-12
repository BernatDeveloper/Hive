import { describe, test, expect } from 'vitest'
import { passwordStrength, MIN_PASSWORD } from './password-strength'

describe('passwordStrength', () => {
  test('MIN_PASSWORD es 8', () => {
    expect(MIN_PASSWORD).toBe(8)
  })

  test('corta y simple → débil', () => {
    expect(passwordStrength('abc').level).toBe('débil')
  })

  test('8 minúsculas → todavía débil (solo suma 1 punto de longitud)', () => {
    expect(passwordStrength('aaaaaaaa').level).toBe('débil')
  })

  test('longitud + mayúsculas y minúsculas + dígito → media', () => {
    const { level, score } = passwordStrength('Abcdefg1')
    expect(level).toBe('media')
    expect(score).toBe(3)
  })

  test('larga, variada y con símbolo → fuerte', () => {
    expect(passwordStrength('Abcdefgh1234!').level).toBe('fuerte')
  })

  test('score máximo es 5 (todas las señales)', () => {
    const { score } = passwordStrength('Abcdefghijkl1!')
    expect(score).toBe(5)
  })

  test('cadena vacía → débil, score 0', () => {
    const { level, score } = passwordStrength('')
    expect(level).toBe('débil')
    expect(score).toBe(0)
  })
})
