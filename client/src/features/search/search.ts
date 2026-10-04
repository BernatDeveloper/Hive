// Búsqueda global: coincide por texto en eventos, notas e ítems de lista ya
// cargados en el cliente (sin red — los tres módulos ya tienen todo en
// memoria vía sus hooks). Puro — sin dependencias de React.
import type { Bookmark, Event, List, ListItem, Note } from '../../types'

export type SearchResultType = 'event' | 'note' | 'list-item' | 'bookmark'

export interface SearchResult {
  type: SearchResultType
  id: string
  title: string
  subtitle?: string
  eventRef?: Event
  noteId?: string
  listId?: string
  bookmarkId?: string
}

export interface SearchData {
  events: Event[]
  notes: Note[]
  lists: List[]
  listItems: ListItem[]
  // Opcional: quien no tenga marcadores no tiene por qué pasarlo.
  bookmarks?: Bookmark[]
}

export interface SearchResults {
  events: SearchResult[]
  notes: SearchResult[]
  listItems: SearchResult[]
  bookmarks: SearchResult[]
}

export function searchAll(query: string, data: SearchData, perGroupLimit = 6): SearchResults {
  const q = query.trim().toLowerCase()
  if (!q) return { events: [], notes: [], listItems: [], bookmarks: [] }

  const events = data.events
    .filter(e => e.title.toLowerCase().includes(q) || e.description.toLowerCase().includes(q))
    .slice(0, perGroupLimit)
    .map(e => ({ type: 'event' as const, id: e.id, title: e.title, subtitle: e.start.slice(0, 10), eventRef: e }))

  const notes = data.notes
    .filter(n => n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q))
    .slice(0, perGroupLimit)
    .map(n => ({
      type: 'note' as const,
      id: n.id,
      title: n.title || 'Sin título',
      subtitle: n.body.slice(0, 60).replace(/\n/g, ' '),
      noteId: n.id,
    }))

  const listById = new Map(data.lists.map(l => [l.id, l]))
  const listItems = data.listItems
    .filter(it => it.text.toLowerCase().includes(q))
    .slice(0, perGroupLimit)
    .map(it => ({
      type: 'list-item' as const,
      id: it.id,
      title: it.text,
      subtitle: listById.get(it.list_id)?.title ?? '',
      listId: it.list_id,
    }))

  const bookmarks = (data.bookmarks ?? [])
    .filter(b =>
      b.title.toLowerCase().includes(q)
      || b.description.toLowerCase().includes(q)
      || b.url.toLowerCase().includes(q)
      || b.tags.some(t => t.includes(q)))
    .slice(0, perGroupLimit)
    .map(b => ({
      type: 'bookmark' as const,
      id: b.id,
      title: b.title,
      subtitle: b.url.replace(/^https?:\/\/(www\.)?/, ''),
      bookmarkId: b.id,
    }))

  return { events, notes, listItems, bookmarks }
}
