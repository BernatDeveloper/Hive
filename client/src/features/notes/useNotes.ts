import { useEffect, useState } from 'react'
import { socket } from '../../socket'
import type { Note } from '../../types'

// Estado del módulo de notas. Las notas nuevas se añaden al principio.
// Refresca la lista entera desde `access-granted` (reconexión).
export function useNotes(room: string, initial: Note[]) {
  const [notes, setNotes] = useState<Note[]>(initial)

  useEffect(() => {
    function onNoteCreated(note: Note) { setNotes(prev => [note, ...prev]) }
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
    createNote: () => socket.emit('create-note', { room, title: 'Sin título' }),
    updateNote: (id: string, title: string, body: string) =>
      socket.emit('update-note', { room, note: { id, title, body } }),
    deleteNote: (id: string) => socket.emit('delete-note', { room, id }),
  }
}
