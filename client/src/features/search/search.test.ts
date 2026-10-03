import { describe, test, expect } from 'vitest'
import { searchAll } from './search'
import type { Event, List, ListItem, Note } from '../../types'

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

const data = { events: [event], notes: [note], lists: [list], listItems: [item] }

describe('searchAll', () => {
  test('query vacía no devuelve nada', () => {
    expect(searchAll('', data)).toEqual({ events: [], notes: [], listItems: [] })
    expect(searchAll('   ', data)).toEqual({ events: [], notes: [], listItems: [] })
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

  test('respeta perGroupLimit por sección', () => {
    const manyNotes: Note[] = Array.from({ length: 10 }, (_, i) => ({ ...note, id: `n${i}`, title: `Idea ${i}` }))
    const res = searchAll('idea', { ...data, notes: manyNotes }, 3)
    expect(res.notes).toHaveLength(3)
  })
})
