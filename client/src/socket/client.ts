import { io } from 'socket.io-client'
import { getIdentity } from '../features/identity/identity'

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001'

export const socket = io(SOCKET_URL, {
  timeout: 8000,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
})

let currentRoom: { name: string; password: string } | null = null

export function rememberRoom(name: string, password: string) {
  currentRoom = { name, password }
}

export function forgetRoom() {
  currentRoom = null
}

// Al reconectar (reinicio del servidor, corte de red), el socket es nuevo
// para el servidor: sin autorización de escritura, sin pertenencia a la room
// y sin identidad de presencia. Re-emitir join-room recupera las tres de
// golpe. La identidad se lee fresca (no se cachea junto a currentRoom) para
// no reemitir un nombre desactualizado si el usuario se renombró mientras
// tanto en Ajustes.
socket.on('connect', () => {
  if (currentRoom) {
    const identity = getIdentity(currentRoom.name)
    socket.emit('join-room', { ...currentRoom, editor_name: identity.name, editor_color: identity.color })
  }
})
