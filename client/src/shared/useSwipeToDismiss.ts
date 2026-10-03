import { useRef, useState } from 'react'

const DISMISS_THRESHOLD_PX = 80

// Arrastrar hacia abajo desde el "handle" del modal (móvil) lo cierra — hasta
// ahora la única forma era tocar fuera. Limitado al handle (no a todo el
// modal) para no interferir con el scroll del contenido ni con sus inputs.
export function useSwipeToDismiss(onDismiss: () => void) {
  const [dragY, setDragY] = useState(0)
  const [dragging, setDragging] = useState(false)
  const startYRef = useRef(0)

  function onTouchStart(e: React.TouchEvent) {
    setDragging(true)
    startYRef.current = e.touches[0].clientY
  }

  function onTouchMove(e: React.TouchEvent) {
    const dy = e.touches[0].clientY - startYRef.current
    if (dy > 0) {
      e.preventDefault()
      setDragY(dy)
    }
  }

  function onTouchEnd() {
    setDragging(false)
    if (dragY > DISMISS_THRESHOLD_PX) onDismiss()
    setDragY(0)
  }

  return {
    style: {
      transform: `translateY(${dragY}px)`,
      transition: dragging ? 'none' : 'transform 0.2s ease',
    },
    handleProps: { onTouchStart, onTouchMove, onTouchEnd },
  }
}
