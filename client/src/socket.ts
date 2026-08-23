import { io } from 'socket.io-client'

export const socket = io(import.meta.env.VITE_SOCKET_URL)

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
