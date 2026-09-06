import { createNote, updateNote, deleteNote } from '../db/index.js'
import { isNonEmptyString, isAuthedFor, broadcast } from './helpers.js'

export function registerNoteHandlers(io, socket) {
  socket.on('create-note', ({ room, title } = {}) => {
    try {
      if (!isNonEmptyString(room)) return
      if (!isAuthedFor(socket, room)) return
      const safeTitle = typeof title === 'string' && title.trim() ? title.trim() : 'Sin título'
      const note = createNote(room, safeTitle)
      broadcast(io, room, 'note-created', note)
    } catch (e) {
      console.error('[create-note]', e)
      socket.emit('note-error', { message: 'No se pudo crear la nota' })
    }
  })

  socket.on('update-note', ({ room, note } = {}) => {
    try {
      if (!isNonEmptyString(room)) return
      if (!isAuthedFor(socket, room)) return
      if (typeof note !== 'object' || note === null || !isNonEmptyString(note.id)) return
      const safeNote = {
        id: note.id,
        title: typeof note.title === 'string' ? note.title : '',
        body: typeof note.body === 'string' ? note.body : '',
      }
      const updated = updateNote(safeNote)
      broadcast(io, room, 'note-updated', updated)
    } catch (e) {
      console.error('[update-note]', e)
      socket.emit('note-error', { message: 'No se pudo actualizar la nota' })
    }
  })

  socket.on('delete-note', ({ room, id } = {}) => {
    try {
      if (!isNonEmptyString(room) || !isNonEmptyString(id)) return
      if (!isAuthedFor(socket, room)) return
      deleteNote(id)
      broadcast(io, room, 'note-deleted', id)
    } catch (e) {
      console.error('[delete-note]', e)
      socket.emit('note-error', { message: 'No se pudo eliminar la nota' })
    }
  })
}
