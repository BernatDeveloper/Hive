import { io } from 'socket.io-client'

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
// para el servidor: sin autorización de escritura ni pertenencia a la room.
// Re-emitir join-room recupera ambas cosas de golpe.
socket.on('connect', () => {
  if (currentRoom) {
    socket.emit('join-room', currentRoom)
  }
})
