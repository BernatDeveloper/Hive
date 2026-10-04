import { createNote, updateNote, setNotePinned, deleteNote } from '../db/index.js'
import { stash } from '../services/undo.js'
import { broadcast } from './helpers.js'
import { safeAuthedOn } from './handler.js'
import { MAX, str, isObject } from './validate.js'
import { withinQuota } from './quota.js'

export function registerNoteHandlers(io, socket) {
  safeAuthedOn(socket, 'create-note', 'note-error', { message: 'No se pudo crear la nota' }, ({ room, title, editor_name, editor_color }) => {
    const trimmed = typeof title === 'string' ? title.trim() : ''
    const safeTitle = trimmed && trimmed.length <= MAX.noteTitle ? trimmed : 'Sin título'
    if (!withinQuota(socket, 'note-error', 'note', room)) return
    const note = createNote(room, safeTitle, editor_name, editor_color)
    broadcast(io, room, 'note-created', note)
  })

  // Devuelve el resultado por acknowledgement (el que guarda necesita saber si
  // hubo conflicto de versión). En 'ok' además difunde note-updated a la sala.
  safeAuthedOn(socket, 'update-note', 'note-error', { message: 'No se pudo actualizar la nota' }, ({ room, note }, ack) => {
    if (!isObject(note) || !str(note.id, MAX.id)) return ack?.({ status: 'invalid' })
    const safeNote = {
      id: note.id,
      title: typeof note.title === 'string' ? note.title.slice(0, MAX.noteTitle) : '',
      body: typeof note.body === 'string' ? note.body.slice(0, MAX.noteBody) : '',
      expected_updated_at: typeof note.updated_at === 'string' ? note.updated_at : null,
      editor_name: note.editor_name,
      editor_color: note.editor_color,
    }
    const result = updateNote(safeNote)
    if (result.status === 'ok') {
      broadcast(io, room, 'note-updated', result.note)
      ack?.({ status: 'ok', note: result.note })
    } else if (result.status === 'conflict') {
      ack?.({ status: 'conflict', note: result.current })
    } else {
      ack?.({ status: 'not-found' })
    }
  })

  // Fijar/desfijar arriba del todo — no toca updated_at ni pasa por el
  // control de concurrencia optimista (ver setNotePinned).
  safeAuthedOn(socket, 'toggle-note-pin', 'note-error', { message: 'No se pudo fijar la nota' }, ({ room, id, pinned }) => {
    if (!str(id, MAX.id)) return
    const note = setNotePinned(id, Boolean(pinned))
    if (!note) return
    broadcast(io, room, 'note-updated', note)
  })

  safeAuthedOn(socket, 'delete-note', 'note-error', { message: 'No se pudo eliminar la nota' }, ({ room, id }, ack) => {
    if (!str(id, MAX.id)) return
    const note = deleteNote(id)
    if (!note) return
    broadcast(io, room, 'note-deleted', id)
    ack?.({ undoToken: stash(room, { kind: 'note', note }), label: `Nota «${note.title || 'Sin título'}»` })
  })
}
