import { describe, test, expect } from 'vitest'
import { resolveRoute } from './routes'

describe('resolveRoute', () => {
  test('la app vive en la raíz (con o sin index.html)', () => {
    expect(resolveRoute('/')).toBe('app')
    expect(resolveRoute('')).toBe('app')
    expect(resolveRoute('/index.html')).toBe('app')
  })

  test('política de privacidad, con o sin barra final', () => {
    expect(resolveRoute('/privacidad')).toBe('privacy')
    expect(resolveRoute('/privacidad/')).toBe('privacy')
    expect(resolveRoute('/privacidad///')).toBe('privacy')
  })

  test('cualquier otra ruta es un 404 (también las parecidas)', () => {
    for (const path of ['/nada', '/privacidad/extra', '/privacidades', '/Privacidad', '/app', '/index.htm', '/%2e%2e/etc/passwd', '/a/b/c']) {
      expect(resolveRoute(path), path).toBe('not-found')
    }
  })
})
