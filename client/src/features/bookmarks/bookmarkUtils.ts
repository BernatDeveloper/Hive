// Lógica pura del módulo de marcadores (sin React ni red): normalizar URLs,
// filtrar/buscar, etiquetas y el tono de relleno de las tarjetas sin imagen.
import type { Bookmark } from '../../types'

const MAX_URL = 2048

// "ejemplo.com/x" → "https://ejemplo.com/x". Devuelve null si no es un enlace
// http(s) razonable. Debe coincidir con `normalizeUrl` de
// server/sockets/bookmarks.js (el servidor revalida de todos modos).
export function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed || trimmed.length > MAX_URL || /\s/.test(trimmed)) return null
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`
  let url: URL
  try { url = new URL(withScheme) } catch { return null }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  if (url.username || url.password) return null
  if (!url.hostname.includes('.') && !url.hostname.includes(':')) return null
  return url.href.length <= MAX_URL ? url.href : null
}

// Para detectar duplicados: ignora esquema, "www.", "/" final y el #fragmento.
export function urlKey(url: string): string {
  try {
    const u = new URL(url)
    const path = u.pathname.replace(/\/+$/, '')
    return `${u.hostname.replace(/^www\./, '')}${u.port ? `:${u.port}` : ''}${path}${u.search}`.toLowerCase()
  } catch {
    return url.toLowerCase()
  }
}

export function findDuplicate(bookmarks: Bookmark[], url: string): Bookmark | undefined {
  const key = urlKey(url)
  return bookmarks.find(b => urlKey(b.url) === key)
}

export function getDomain(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url }
}

export function faviconUrl(url: string): string | null {
  try { return `${new URL(url).origin}/favicon.ico` } catch { return null }
}

// Tono estable por dominio (0-359) para el degradado de las tarjetas sin imagen.
export function domainHue(domain: string): number {
  let h = 0
  for (let i = 0; i < domain.length; i++) h = (h * 31 + domain.charCodeAt(i)) >>> 0
  return h % 360
}

export type BookmarkFilter = 'all' | 'favorites' | 'pending'

export interface BookmarkQuery {
  query: string
  filter: BookmarkFilter
  tag: string | null
}

export function filterBookmarks(bookmarks: Bookmark[], { query, filter, tag }: BookmarkQuery): Bookmark[] {
  const q = query.trim().toLowerCase()
  return bookmarks.filter(b => {
    if (filter === 'favorites' && !b.favorite) return false
    if (filter === 'pending' && b.seen) return false
    if (tag && !b.tags.includes(tag)) return false
    if (!q) return true
    return b.title.toLowerCase().includes(q)
      || b.description.toLowerCase().includes(q)
      || b.url.toLowerCase().includes(q)
      || (b.site_name ?? '').toLowerCase().includes(q)
      || b.tags.some(t => t.includes(q))
  })
}

export function countFilters(bookmarks: Bookmark[]): Record<BookmarkFilter, number> {
  return {
    all: bookmarks.length,
    favorites: bookmarks.filter(b => b.favorite).length,
    pending: bookmarks.filter(b => !b.seen).length,
  }
}

// Etiquetas en uso con su recuento, de más a menos usadas (empate: alfabético).
export function collectTags(bookmarks: Bookmark[]): { tag: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const b of bookmarks) for (const t of b.tags) counts.set(t, (counts.get(t) ?? 0) + 1)
  return [...counts]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
}

// Mismo saneado que el servidor (db/bookmarks.js sanitizeTags): minúsculas, sin
// "#" inicial, espacios colapsados; máx. 10 etiquetas de 30 caracteres.
export const MAX_TAGS = 10
export const MAX_TAG_LENGTH = 30

export function cleanTag(raw: string): string {
  return raw.trim().replace(/^#+/, '').replace(/\s+/g, ' ').trim().toLowerCase().slice(0, MAX_TAG_LENGTH).trim()
}
