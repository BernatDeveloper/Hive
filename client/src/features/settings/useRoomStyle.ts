import { useEffect, useState } from 'react'
import { socket } from '../../socket'
import type { Room } from '../../types'

const DEFAULTS = {
  primary: '#0071E3',
  bg: '#F5F5F7',
  text: '#1D1D1F',
  surface: '#FFFFFF',
}

function isColorDark(hex: string | null): boolean {
  if (!hex || hex.length < 7) return false
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return (r * 299 + g * 587 + b * 114) / 1000 < 128
}

interface RoomColors {
  primary_color: string | null
  background_color: string | null
  text_color: string | null
  sidebar_color: string | null
}

function pickColors(room: RoomColors): RoomColors {
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

  useEffect(() => {
    function apply(updated: Room) {
      setColors(pickColors(updated))
      onUpdateRoom(updated)
    }
    function onStyleUpdated(updated: Room) { apply(updated) }
    function onGranted(payload: { room: Room }) { apply(payload.room) }

    socket.on('style-updated', onStyleUpdated)
    socket.on('access-granted', onGranted)
    return () => {
      socket.off('style-updated', onStyleUpdated)
      socket.off('access-granted', onGranted)
    }
  }, [onUpdateRoom])

  const dark = isColorDark(colors.background_color)
  const cssVars = {
    '--primary': colors.primary_color ?? DEFAULTS.primary,
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
