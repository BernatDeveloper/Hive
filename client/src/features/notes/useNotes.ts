import { useEffect, useState } from 'react'
import { socket, emitWrite, emitWriteAck } from '../../socket'
import type { Note, UndoOffer } from '../../types'
import { getIdentity } from '../identity/identity'

export interface UpdateNoteResult {
  status: 'ok' | 'conflict' | 'not-found' | 'invalid' | 'timeout'
  note?: Note
}

// Estado del módulo de notas. Las notas nuevas se añaden al principio.
// Refresca la lista entera desde `access-granted` (reconexión).
export function useNotes(room: string, initial: Note[]) {
  const [notes, setNotes] = useState<Note[]>(initial)

  useEffect(() => {
    function onNoteCreated(note: Note) { setNotes(prev => prev.some(n => n.id === note.id) ? prev : [note, ...prev]) }
    function onNoteUpdated(note: Note) { setNotes(prev => prev.map(n => n.id === note.id ? note : n)) }
    function onNoteDeleted(id: string) { setNotes(prev => prev.filter(n => n.id !== id)) }
    function onGranted(payload: { notes: Note[] }) { setNotes(payload.notes) }

    socket.on('note-created', onNoteCreated)
    socket.on('note-updated', onNoteUpdated)
    socket.on('note-deleted', onNoteDeleted)
    socket.on('access-granted', onGranted)
    return () => {
      socket.off('note-created', onNoteCreated)
      socket.off('note-updated', onNoteUpdated)
      socket.off('note-deleted', onNoteDeleted)
      socket.off('access-granted', onGranted)
    }
  }, [])

  return {
    notes,
    createNote: () => {
      const identity = getIdentity(room)
      emitWrite('create-note', { room, title: 'Sin título', editor_name: identity.name, editor_color: identity.color })
    },
    // Guarda con control de versión optimista: el servidor responde por ack
    // si la versión base (`updatedAt`) sigue vigente o hay conflicto. Sin
    // conexión se encola y resuelve `timeout` (el guardado sincroniza al volver).
    updateNote: (id: string, title: string, body: string, updatedAt: string): Promise<UpdateNoteResult> => {
      const identity = getIdentity(room)
      return emitWriteAck<UpdateNoteResult>('update-note', {
        room, note: { id, title, body, updated_at: updatedAt, editor_name: identity.name, editor_color: identity.color },
      }, { status: 'timeout' })
    },
    deleteNote: (id: string): Promise<UndoOffer> => emitWriteAck<UndoOffer>('delete-note', { room, id }, {}),
    togglePin: (id: string, pinned: boolean) => emitWrite('toggle-note-pin', { room, id, pinned }),
  }
}
