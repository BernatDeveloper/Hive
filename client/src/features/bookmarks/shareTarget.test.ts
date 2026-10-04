import { describe, test, expect } from 'vitest'
import { extractUrl, parseShareParams } from './shareTarget'

const qs = (o: Record<string, string>) => '?' + new URLSearchParams(o).toString()

describe('extractUrl', () => {
  test('saca el enlace de un texto con más palabras', () => {
    expect(extractUrl('Mira esto https://react.dev/learn qué tal')).toBe('https://react.dev/learn')
  })

  test('quita la puntuación que pega la frase, no la de la URL', () => {
    expect(extractUrl('Lee https://ejemplo.com/post.')).toBe('https://ejemplo.com/post')
    expect(extractUrl('¿Has visto https://ejemplo.com/post?')).toBe('https://ejemplo.com/post')
    expect(extractUrl('(https://ejemplo.com/post)')).toBe('https://ejemplo.com/post')
    expect(extractUrl('https://ejemplo.com/a?b=1&c=2,')).toBe('https://ejemplo.com/a?b=1&c=2')
  })

  test('conserva los paréntesis que SÍ son de la URL', () => {
    expect(extractUrl('https://es.wikipedia.org/wiki/Foo_(bar)')).toBe('https://es.wikipedia.org/wiki/Foo_(bar)')
    expect(extractUrl('mira (https://es.wikipedia.org/wiki/Foo_(bar))')).toBe('https://es.wikipedia.org/wiki/Foo_(bar)')
  })

  test('si hay varios, el primero; sin enlace o con esquema peligroso, null', () => {
    expect(extractUrl('a https://uno.com y https://dos.com')).toBe('https://uno.com/')
    expect(extractUrl('sin enlaces por aquí')).toBeNull()
    expect(extractUrl('javascript:alert(1)')).toBeNull()
    expect(extractUrl('ftp://ejemplo.com/x')).toBeNull()
  })
})

describe('parseShareParams', () => {
  test('url directa', () => {
    expect(parseShareParams(qs({ url: 'https://react.dev/', title: 'React' }))).toEqual({ url: 'https://react.dev/', title: 'React' })
  })

  test('caso típico de Android: el enlace va en text y url viene vacío', () => {
    expect(parseShareParams(qs({ title: 'Aprende React', text: 'https://react.dev/learn', url: '' })))
      .toEqual({ url: 'https://react.dev/learn', title: 'Aprende React' })
  })

  test('el enlace dentro de un texto largo (apps que añaden su propio mensaje)', () => {
    expect(parseShareParams(qs({ text: 'Echa un vistazo a esto: https://ejemplo.com/post — gracias!' })))
      .toEqual({ url: 'https://ejemplo.com/post', title: null })
  })

  test('url sin esquema se normaliza', () => {
    expect(parseShareParams(qs({ url: 'ejemplo.com/x' }))?.url).toBe('https://ejemplo.com/x')
  })

  test('si url no sirve, cae a text y luego a title', () => {
    expect(parseShareParams(qs({ url: 'esto no es un enlace', text: 'https://ejemplo.com/a' }))?.url).toBe('https://ejemplo.com/a')
    expect(parseShareParams(qs({ text: 'hola', title: 'https://ejemplo.com/b' }))?.url).toBe('https://ejemplo.com/b')
  })

  test('un título que es el propio enlace no se usa como título', () => {
    expect(parseShareParams(qs({ url: 'https://ejemplo.com/', title: 'https://ejemplo.com/' }))?.title).toBeNull()
    expect(parseShareParams(qs({ text: 'https://ejemplo.com/', title: 'https://ejemplo.com/' }))?.title).toBeNull()
  })

  test('título largo recortado', () => {
    expect(parseShareParams(qs({ url: 'https://ejemplo.com/', title: 'x'.repeat(500) }))?.title).toHaveLength(200)
  })

  test('sin parámetros de compartir, o sin enlace aprovechable, o peligroso → null (carga normal de la app)', () => {
    expect(parseShareParams('')).toBeNull()
    expect(parseShareParams('?room=abc')).toBeNull()
    expect(parseShareParams(qs({ text: 'solo texto', title: 'Un título' }))).toBeNull()
    expect(parseShareParams(qs({ url: 'javascript:alert(1)' }))).toBeNull()
    expect(parseShareParams(qs({ url: 'file:///etc/passwd' }))).toBeNull()
    expect(parseShareParams(qs({ url: 'https://u:p@ejemplo.com/' }))).toBeNull()
  })
})
