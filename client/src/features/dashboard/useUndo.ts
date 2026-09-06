import { useEffect, useRef, useState } from 'react'
import { socket } from '../../socket'
import type { UndoOffer } from '../../types'

const VISIBLE_MS = 10_000

// Gestiona el toast de "deshacer" tras un borrado. `offer(res)` se llama con el
// ack de un `delete-*`; si trae `undoToken`, muestra el toast durante 10s.
export function useUndo(room: string) {
  const [toast, setToast] = useState<{ token: string; label: string } | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])

  function clear() {
    if (timerRef.current) clearTimeout(timerRef.current)
    setToast(null)
  }

  function offer(res: UndoOffer | null | undefined) {
    if (!res?.undoToken) return
    if (timerRef.current) clearTimeout(timerRef.current)
    setToast({ token: res.undoToken, label: res.label ?? 'Elemento eliminado' })
    timerRef.current = setTimeout(() => setToast(null), VISIBLE_MS)
  }

  function undo() {
    if (!toast) return
    socket.emit('undo-delete', { room, token: toast.token })
    clear()
  }

  return { toast, offer, undo, dismiss: clear }
}
