import { describe, test, expect } from 'vitest'
import {
  normalizeUrl, urlKey, findDuplicate, getDomain, faviconUrl, domainHue,
  filterBookmarks, countFilters, collectTags, cleanTag,
} from './bookmarkUtils'
import type { Bookmark } from '../../types'

function bm(over: Partial<Bookmark>): Bookmark {
  return {
    id: 'b', room: 'r', url: 'https://ejemplo.com/a', title: 'Título', description: '', image: null, site_name: null,
    tags: [], favorite: false, seen: false, preview_status: 'done', added_by_name: null, added_by_color: null,
    created_at: 't', updated_at: 't', ...over,
  }
}

describe('normalizeUrl', () => {
  test('añade https cuando no hay esquema', () => {
    expect(normalizeUrl('ejemplo.com/x')).toBe('https://ejemplo.com/x')
    expect(normalizeUrl('  www.ejemplo.com  ')).toBe('https://www.ejemplo.com/')
  })

  test('respeta http y https', () => {
    expect(normalizeUrl('http://ejemplo.com')).toBe('http://ejemplo.com/')
    expect(normalizeUrl('https://ejemplo.com/a?b=1#c')).toBe('https://ejemplo.com/a?b=1#c')
  })

  test('rechaza lo que no es un enlace', () => {
    for (const bad of ['', '   ', 'hola', 'dos palabras.com', 'javascript:alert(1)', 'file:///etc/passwd', 'ftp://ejemplo.com', 'https://u:p@ejemplo.com', 'localhost']) {
      expect(normalizeUrl(bad), bad).toBeNull()
    }
  })

  test('rechaza URLs demasiado largas', () => {
    expect(normalizeUrl('https://ejemplo.com/' + 'a'.repeat(2100))).toBeNull()
  })
})

describe('duplicados', () => {
  test('urlKey ignora esquema, www, barra final y fragmento', () => {
    const k = urlKey('https://www.Ejemplo.com/post/')
    expect(urlKey('http://ejemplo.com/post')).toBe(k)
    expect(urlKey('https://ejemplo.com/post#comentarios')).toBe(k)
    expect(urlKey('https://ejemplo.com/otro')).not.toBe(k)
    expect(urlKey('https://ejemplo.com/post?p=2')).not.toBe(k)
  })

  test('findDuplicate', () => {
    const list = [bm({ id: '1', url: 'https://ejemplo.com/post' })]
    expect(findDuplicate(list, 'http://www.ejemplo.com/post/')?.id).toBe('1')
    expect(findDuplicate(list, 'https://ejemplo.com/otra')).toBeUndefined()
  })
})

describe('helpers de URL', () => {
  test('getDomain y faviconUrl', () => {
    expect(getDomain('https://www.youtube.com/watch?v=1')).toBe('youtube.com')
    expect(faviconUrl('https://blog.ejemplo.com/a/b')).toBe('https://blog.ejemplo.com/favicon.ico')
    expect(faviconUrl('nada')).toBeNull()
  })

  test('domainHue es estable y está en 0-359', () => {
    expect(domainHue('ejemplo.com')).toBe(domainHue('ejemplo.com'))
    for (const d of ['a.com', 'youtube.com', 'github.com', '']) {
      const h = domainHue(d)
      expect(h).toBeGreaterThanOrEqual(0)
      expect(h).toBeLessThan(360)
    }
    expect(domainHue('a.com')).not.toBe(domainHue('b.com'))
  })
})

describe('filterBookmarks', () => {
  const list = [
    bm({ id: '1', title: 'Curso de React', tags: ['react', 'curso'], favorite: true, seen: true }),
    bm({ id: '2', title: 'Zapatillas', description: 'para correr', url: 'https://tienda.com/z', tags: ['compras'] }),
    bm({ id: '3', title: 'Receta', site_name: 'Cocina Fácil', tags: ['cocina'], seen: true }),
  ]
  const base = { query: '', filter: 'all' as const, tag: null }

  test('sin filtros devuelve todo', () => {
    expect(filterBookmarks(list, base)).toHaveLength(3)
  })

  test('busca en título, descripción, url, sitio y etiquetas, sin distinguir mayúsculas', () => {
    expect(filterBookmarks(list, { ...base, query: 'REACT' }).map(b => b.id)).toEqual(['1'])
    expect(filterBookmarks(list, { ...base, query: 'correr' }).map(b => b.id)).toEqual(['2'])
    expect(filterBookmarks(list, { ...base, query: 'tienda.com' }).map(b => b.id)).toEqual(['2'])
    expect(filterBookmarks(list, { ...base, query: 'fácil' }).map(b => b.id)).toEqual(['3'])
    expect(filterBookmarks(list, { ...base, query: 'cocin' }).map(b => b.id)).toEqual(['3'])
    expect(filterBookmarks(list, { ...base, query: 'nada' })).toEqual([])
  })

  test('filtros de favoritos y pendientes', () => {
    expect(filterBookmarks(list, { ...base, filter: 'favorites' }).map(b => b.id)).toEqual(['1'])
    expect(filterBookmarks(list, { ...base, filter: 'pending' }).map(b => b.id)).toEqual(['2'])
  })

  test('filtro por etiqueta y combinación con el resto', () => {
    expect(filterBookmarks(list, { ...base, tag: 'react' }).map(b => b.id)).toEqual(['1'])
    expect(filterBookmarks(list, { query: 'curso', filter: 'favorites', tag: 'react' }).map(b => b.id)).toEqual(['1'])
    expect(filterBookmarks(list, { query: 'curso', filter: 'pending', tag: 'react' })).toEqual([])
  })

  test('countFilters', () => {
    expect(countFilters(list)).toEqual({ all: 3, favorites: 1, pending: 1 })
  })
})

describe('etiquetas', () => {
  test('collectTags: por uso y luego alfabético', () => {
    const list = [bm({ tags: ['b', 'a'] }), bm({ tags: ['b'] }), bm({ tags: ['c', 'a'] })]
    expect(collectTags(list)).toEqual([{ tag: 'a', count: 2 }, { tag: 'b', count: 2 }, { tag: 'c', count: 1 }])
  })

  test('cleanTag', () => {
    expect(cleanTag('  #React  Native ')).toBe('react native')
    expect(cleanTag('x'.repeat(50))).toHaveLength(30)
    expect(cleanTag('###')).toBe('')
  })
})
