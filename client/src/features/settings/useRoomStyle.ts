import { useEffect, useRef, useState } from 'react'
import { socket } from '../../socket'
import { hexToRgb, isColorDark, readableTextColor } from '../../shared/color'
import type { Room } from '../../types'

const DEFAULTS = {
  primary: '#3B82F6',
  bg: '#F5F5F7',
  text: '#1D1D1F',
  surface: '#FFFFFF',
}

interface RoomColors {
  primary_color: string | null
  background_color: string | null
  text_color: string | null
  sidebar_color: string | null
}

function pickColors(room: Room): RoomColors {
  return {
    primary_color: room.primary_color,
    background_color: room.background_color,
    text_color: room.text_color,
    sidebar_color: room.sidebar_color,
  }
}

// Estado de estilo de la sala: sincroniza `style-updated` y refresca desde
// `access-granted` (reconexión). Deriva las CSS custom properties del Dashboard.
export function useRoomStyle(room: Room, onUpdateRoom: (room: Room) => void) {
  const [colors, setColors] = useState<RoomColors>(pickColors(room))
  // `style-updated`/`room-timezone-updated` solo traen un subconjunto de
  // campos (no toda la sala); un ref con el valor más reciente evita tener
  // que re-suscribir el efecto en cada cambio de `room` y permite fusionar
  // en vez de sustituir (perder `created_at`/`timezone` al pisar con un
  // objeto parcial sería un bug real, no solo un tipo impreciso).
  const roomRef = useRef(room)
  useEffect(() => { roomRef.current = room })

  useEffect(() => {
    function onStyleUpdated(updated: Omit<Room, 'timezone' | 'created_at'>) {
      const merged = { ...roomRef.current, ...updated }
      setColors(pickColors(merged))
      onUpdateRoom(merged)
    }
    function onTimezoneUpdated(updated: { name: string; timezone: string }) {
      onUpdateRoom({ ...roomRef.current, timezone: updated.timezone })
    }
    function onGranted(payload: { room: Room }) {
      setColors(pickColors(payload.room))
      onUpdateRoom(payload.room)
    }

    socket.on('style-updated', onStyleUpdated)
    socket.on('room-timezone-updated', onTimezoneUpdated)
    socket.on('access-granted', onGranted)
    return () => {
      socket.off('style-updated', onStyleUpdated)
      socket.off('room-timezone-updated', onTimezoneUpdated)
      socket.off('access-granted', onGranted)
    }
  }, [onUpdateRoom])

  const dark = isColorDark(colors.background_color)
  const primary = colors.primary_color ?? DEFAULTS.primary
  const cssVars = {
    '--primary': primary,
    '--primary-rgb': hexToRgb(primary),
    // Texto legible sobre un relleno sólido del primario — p. ej. la vista
    // previa ("mirror") que pinta FullCalendar mientras arrastras para crear
    // un evento en la vista día: no corresponde a ningún evento real, así
    // que no hay un backgroundColor/textColor calculado (como sí tiene
    // fcEvents) del que tirar; esta es la única forma de que un primario
    // claro (p. ej. un lima) no quede con texto blanco ilegible encima.
    '--primary-text': readableTextColor(primary),
    '--bg': colors.background_color ?? DEFAULTS.bg,
    '--text': colors.text_color ?? DEFAULTS.text,
    '--surface': colors.sidebar_color ?? DEFAULTS.surface,
    '--border': dark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)',
    '--surface-2': dark ? 'rgba(255,255,255,0.06)' : '#F2F2F7',
    '--muted': dark ? '#98989D' : '#6E6E73',
  } as React.CSSProperties

  const roomWithColors: Room = { ...room, ...colors }

  return { colors, cssVars, roomWithColors }
}
