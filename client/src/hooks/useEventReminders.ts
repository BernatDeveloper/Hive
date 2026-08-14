import { useEffect } from 'react'
import type { Event } from '../types'

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

function tomorrowStr(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}

export function useEventReminders(events: Event[], roomName: string) {
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }, [])

  useEffect(() => {
    function check() {
      if (!('Notification' in window) || Notification.permission !== 'granted') return

      const today = todayStr()
      const tomorrow = tomorrowStr()

      for (const event of events) {
        const eventDate = event.start.slice(0, 10)

        if (eventDate === today) {
          const key = `reminder:${today}:${roomName}:${event.id}:today`
          if (!localStorage.getItem(key)) {
            new Notification(`Evento hoy: ${event.title}`, {
              body: event.description || undefined,
            })
            localStorage.setItem(key, '1')
          }
        }

        if (eventDate === tomorrow) {
          const key = `reminder:${tomorrow}:${roomName}:${event.id}:tomorrow`
          if (!localStorage.getItem(key)) {
            new Notification(`Evento mañana: ${event.title}`, {
              body: event.description || undefined,
            })
            localStorage.setItem(key, '1')
          }
        }
      }

      // Limpiar entradas antiguas
      const validPrefixes = [`reminder:${today}:`, `reminder:${tomorrow}:`]
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i)
        if (k?.startsWith('reminder:') && !validPrefixes.some(p => k.startsWith(p))) {
          localStorage.removeItem(k)
        }
      }
    }

    check()
    const interval = setInterval(check, 60 * 60 * 1000)
    return () => clearInterval(interval)
  }, [events, roomName])
}
