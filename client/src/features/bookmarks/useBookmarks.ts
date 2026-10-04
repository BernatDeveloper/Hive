import { useEffect, useState } from 'react'
import { socket, emitWrite, emitWriteAck } from '../../socket'
import type { Bookmark, UndoOffer } from '../../types'
import { getIdentity } from '../identity/identity'

// Campos editables de un marcador (todos opcionales: se manda solo lo que cambia).
export interface BookmarkPatch {
  title?: string
  description?: string
  tags?: string[]
  favorite?: boolean
  seen?: boolean
}

// Estado del módulo de marcadores. Las tarjetas nuevas van al principio. El
// servidor difunde la tarjeta al guardar (con `preview_status: 'pending'`) y
// otra vez, ya completa, cuando termina de leer la página.
export function useBookmarks(room: string, initial: Bookmark[]) {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>(initial)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Dedupe en el alta: `undo-delete` re-emite bookmark-created para restaurar.
    function onCreated(b: Bookmark) { setBookmarks(prev => prev.some(x => x.id === b.id) ? prev : [b, ...prev]) }
    function onUpdated(b: Bookmark) { setBookmarks(prev => prev.map(x => x.id === b.id ? b : x)) }
    function onDeleted(id: string) { setBookmarks(prev => prev.filter(x => x.id !== id)) }
    // Varios a la vez (renombrar/borrar una etiqueta, o deshacer ese borrado).
    function onBatchUpdated(payload: { bookmarks: Bookmark[] }) {
      const byId = new Map(payload.bookmarks.map(b => [b.id, b]))
      setBookmarks(prev => prev.map(x => byId.get(x.id) ?? x))
    }
    function onGranted(payload: { bookmarks: Bookmark[] }) { setBookmarks(payload.bookmarks) }
    function onError(payload: { message?: string }) { setError(payload?.message ?? 'No se pudo completar la acción') }

    socket.on('bookmark-created', onCreated)
    socket.on('bookmark-updated', onUpdated)
    socket.on('bookmark-deleted', onDeleted)
    socket.on('bookmarks-updated', onBatchUpdated)
    socket.on('bookmark-error', onError)
    socket.on('access-granted', onGranted)
    return () => {
      socket.off('bookmark-created', onCreated)
      socket.off('bookmark-updated', onUpdated)
      socket.off('bookmark-deleted', onDeleted)
      socket.off('bookmarks-updated', onBatchUpdated)
      socket.off('bookmark-error', onError)
      socket.off('access-granted', onGranted)
    }
  }, [])

  return {
    bookmarks,
    error,
    clearError: () => setError(null),
    createBookmark: (url: string) => {
      const identity = getIdentity(room)
      emitWrite('create-bookmark', { room, url, editor_name: identity.name, editor_color: identity.color })
    },
    // La identidad (nombre/color de dispositivo) viaja con cada edición para la
    // atribución "Editado por…". Informativa y spoofeable, como el resto.
    updateBookmark: (id: string, patch: BookmarkPatch) => {
      const identity = getIdentity(room)
      emitWrite('update-bookmark', { room, id, ...patch, editor_name: identity.name, editor_color: identity.color })
    },
    // Etiquetas de toda la sala. Renombrar a una existente las une; borrar
    // devuelve la oferta de deshacer (un token restaura todos los afectados).
    renameTag: (from: string, to: string) => {
      const identity = getIdentity(room)
      emitWrite('rename-bookmark-tag', { room, from, to, editor_name: identity.name, editor_color: identity.color })
    },
    deleteTag: (tag: string): Promise<UndoOffer> => {
      const identity = getIdentity(room)
      return emitWriteAck<UndoOffer>('delete-bookmark-tag', { room, tag, editor_name: identity.name, editor_color: identity.color }, {})
    },
    refreshPreview: (id: string) => emitWrite('refresh-bookmark', { room, id }),
    deleteBookmark: (id: string): Promise<UndoOffer> => emitWriteAck<UndoOffer>('delete-bookmark', { room, id }, {}),
  }
}
