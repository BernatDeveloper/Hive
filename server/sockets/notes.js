import { createNote, updateNote, deleteNote } from '../db/index.js'
import { broadcast } from './helpers.js'
import { safeAuthedOn } from './handler.js'
import { MAX, str, isObject } from './validate.js'

export function registerNoteHandlers(io, socket) {
  safeAuthedOn(socket, 'create-note', 'note-error', { message: 'No se pudo crear la nota' }, ({ room, title }) => {
    const trimmed = typeof title === 'string' ? title.trim() : ''
    const safeTitle = trimmed && trimmed.length <= MAX.noteTitle ? trimmed : 'Sin título'
    const note = createNote(room, safeTitle)
    broadcast(io, room, 'note-created', note)
  })

  safeAuthedOn(socket, 'update-note', 'note-error', { message: 'No se pudo actualizar la nota' }, ({ room, note }) => {
    if (!isObject(note) || !str(note.id, MAX.id)) return
    const safeNote = {
      id: note.id,
      title: typeof note.title === 'string' ? note.title.slice(0, MAX.noteTitle) : '',
      body: typeof note.body === 'string' ? note.body.slice(0, MAX.noteBody) : '',
    }
    const updated = updateNote(safeNote)
    if (!updated) return // id inexistente: nada que difundir
    broadcast(io, room, 'note-updated', updated)
  })

  safeAuthedOn(socket, 'delete-note', 'note-error', { message: 'No se pudo eliminar la nota' }, ({ room, id }) => {
    if (!str(id, MAX.id)) return
    deleteNote(id)
    broadcast(io, room, 'note-deleted', id)
  })
}
