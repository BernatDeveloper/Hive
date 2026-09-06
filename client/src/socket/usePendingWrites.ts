import { useEffect, useState } from 'react'
import { onQueueChange, pendingCount } from './queue'

// Nº de escrituras encoladas a la espera de conexión.
export function usePendingWrites() {
  const [count, setCount] = useState(pendingCount())
  useEffect(() => onQueueChange(() => setCount(pendingCount())), [])
  return count
}
