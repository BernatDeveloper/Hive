import { io } from 'socket.io-client'
import { getIdentity, getDeviceId } from '../features/identity/identity'

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001'

export const socket = io(SOCKET_URL, {
  timeout: 8000,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
})

const STORAGE_KEY = 'rememberedRoom'

interface RememberedRoom { name: string; password: string }

let currentRoom: RememberedRoom | null = null

// Guardada en localStorage (además de en memoria) para que una recarga de
// página no obligue a volver a escribir nombre + contraseña — ver
// `getStoredRoom()`, que App.tsx usa al arrancar para reentrar sola. Riesgo
// aceptado a propósito: el modelo de la app ya no promete más seguridad que
// "quien tenga la contraseña entra" (ver identidad ligera/spoofeable).
export function rememberRoom(name: string, password: string) {
  currentRoom = { name, password }
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(currentRoom)) } catch { /* localStorage no disponible */ }
}

export function forgetRoom() {
  currentRoom = null
  try { localStorage.removeItem(STORAGE_KEY) } catch { /* localStorage no disponible */ }
}

// Lee la sala guardada SIN tocar `currentRoom` (el re-join automático en
// 'connect', justo abajo, solo debe activarse tras un join explícito de esta
// sesión vía rememberRoom — ver App.tsx para el reingreso en la carga inicial).
export function getStoredRoom(): RememberedRoom | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (typeof parsed?.name === 'string' && typeof parsed?.password === 'string') return parsed
  } catch { /* localStorage no disponible o JSON corrupto */ }
  return null
}

// Payload de join-room: credenciales + identidad de dispositivo (nombre/color
// para la presencia y la atribución, device_id para recordarlo como miembro
// de la sala). La identidad se lee fresca en cada llamada — nunca se cachea,
// para no reemitir un nombre desactualizado si el usuario se renombró.
export function buildJoinPayload(name: string, password: string) {
  const identity = getIdentity(name)
  return { name, password, editor_name: identity.name, editor_color: identity.color, device_id: getDeviceId() }
}

// Al reconectar (reinicio del servidor, corte de red), el socket es nuevo
// para el servidor: sin autorización de escritura, sin pertenencia a la room
// y sin identidad de presencia. Re-emitir join-room recupera las tres de golpe.
socket.on('connect', () => {
  if (currentRoom) socket.emit('join-room', buildJoinPayload(currentRoom.name, currentRoom.password))
})
