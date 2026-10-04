import { describe, test, expect } from 'vitest'
import { searchAll } from './search'
import type { Bookmark, Event, List, ListItem, Note } from '../../types'

const event: Event = {
  id: 'e1', room: 'r', title: 'Cena con Ana', start: '2026-08-01', end: '2026-08-01',
  description: 'reservar mesa', color: null, recurrence_rule: null, recurrence_id: null,
  reminder_offset: null, reminder_sent: 0, updated_at: 't', last_editor_name: null, last_editor_color: null,
}
const note: Note = {
  id: 'n1', room: 'r', title: 'Ideas viaje', body: 'llevar pasaporte', pinned: false,
  created_at: 't', updated_at: 't', last_editor_name: null, last_editor_color: null,
}
const list: List = { id: 'l1', room: 'r', title: 'Compra', created_at: 't' }
const item: ListItem = { id: 'i1', list_id: 'l1', room: 'r', text: 'pasta de dientes', checked: false }

const bookmark: Bookmark = {
  id: 'b1', room: 'r', url: 'https://www.tienda.com/zapatillas', title: 'Zapatillas de running', description: 'las mejores del año',
  image: null, site_name: null, tags: ['deporte'], favorite: false, seen: false, preview_status: 'done',
  added_by_name: null, added_by_color: null, created_at: 't', updated_at: 't',
}

const data = { events: [event], notes: [note], lists: [list], listItems: [item], bookmarks: [bookmark] }

describe('searchAll', () => {
  test('query vacía no devuelve nada', () => {
    expect(searchAll('', data)).toEqual({ events: [], notes: [], listItems: [], bookmarks: [] })
    expect(searchAll('   ', data)).toEqual({ events: [], notes: [], listItems: [], bookmarks: [] })
  })

  test('encuentra eventos por título o descripción, insensible a mayúsculas', () => {
    expect(searchAll('cena', data).events).toHaveLength(1)
    expect(searchAll('RESERVAR', data).events).toHaveLength(1)
    expect(searchAll('nada', data).events).toHaveLength(0)
  })

  test('encuentra notas por título o cuerpo', () => {
    expect(searchAll('viaje', data).notes).toHaveLength(1)
    expect(searchAll('pasaporte', data).notes).toHaveLength(1)
  })

  test('encuentra ítems de lista y adjunta el título de su lista como subtítulo', () => {
    const res = searchAll('dientes', data).listItems
    expect(res).toHaveLength(1)
    expect(res[0].subtitle).toBe('Compra')
    expect(res[0].listId).toBe('l1')
  })

  test('encuentra marcadores por título, nota, url o etiqueta y muestra la URL sin esquema', () => {
    expect(searchAll('running', data).bookmarks).toHaveLength(1)
    expect(searchAll('del año', data).bookmarks).toHaveLength(1)
    expect(searchAll('tienda.com', data).bookmarks).toHaveLength(1)
    expect(searchAll('deporte', data).bookmarks).toHaveLength(1)
    const res = searchAll('running', data).bookmarks[0]
    expect(res.bookmarkId).toBe('b1')
    expect(res.subtitle).toBe('tienda.com/zapatillas')
    expect(searchAll('nada', data).bookmarks).toHaveLength(0)
  })

  test('sin marcadores en los datos, el grupo sale vacío', () => {
    const { bookmarks: _omit, ...withoutBookmarks } = data
    void _omit
    expect(searchAll('running', withoutBookmarks).bookmarks).toEqual([])
  })

  test('respeta perGroupLimit por sección', () => {
    const manyNotes: Note[] = Array.from({ length: 10 }, (_, i) => ({ ...note, id: `n${i}`, title: `Idea ${i}` }))
    const res = searchAll('idea', { ...data, notes: manyNotes }, 3)
    expect(res.notes).toHaveLength(3)
  })
})
