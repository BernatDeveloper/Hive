// Identidad ligera por dispositivo (Fase 9): nombre + color guardados en
// localStorage, sin registro. Es puramente informativa — cualquiera en la
// sala puede ponerse el nombre que quiera — así que nunca debe usarse para
// construir permisos ni un "admin" real.

export interface Identity {
  name: string
  color: string
}

// Paleta corta de colores de identidad — vivos y distinguibles entre sí.
export const IDENTITY_COLORS = ['#0071e3', '#30d158', '#ff9f0a', '#bf5af2', '#ff375f', '#ff453a', '#64d2ff', '#ffd60a']

const GLOBAL_KEY = 'identity'
const roomKey = (room: string) => `identity:${room}`

export function randomIdentityColor(): string {
  return IDENTITY_COLORS[Math.floor(Math.random() * IDENTITY_COLORS.length)]
}

function isIdentity(v: unknown): v is Identity {
  return typeof v === 'object' && v !== null
    && typeof (v as Identity).name === 'string'
    && typeof (v as Identity).color === 'string'
}

function readIdentity(key: string): Identity | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    return isIdentity(parsed) ? parsed : null
  } catch {
    // localStorage puede fallar (modo privado, cuota, JSON corrupto) — la
    // identidad es solo informativa, así que fallar en silencio es mejor
    // que romper la app.
    return null
  }
}

function writeIdentity(key: string, identity: Identity): void {
  try {
    localStorage.setItem(key, JSON.stringify(identity))
  } catch {
    // ver readIdentity
  }
}

export function getGlobalIdentity(): Identity | null {
  return readIdentity(GLOBAL_KEY)
}

export function setGlobalIdentity(identity: Identity): void {
  writeIdentity(GLOBAL_KEY, identity)
}

export function getRoomOverride(room: string): Identity | null {
  return readIdentity(roomKey(room))
}

export function setRoomOverride(room: string, identity: Identity): void {
  writeIdentity(roomKey(room), identity)
}

export function clearRoomOverride(room: string): void {
  try {
    localStorage.removeItem(roomKey(room))
  } catch {
    // ver readIdentity
  }
}

export function hasIdentity(): boolean {
  return getGlobalIdentity() !== null
}

// Identidad efectiva para una sala: su override si existe, si no la global,
// si no un valor de emergencia (no debería hacer falta si se pasó por el
// alta de identidad — cubre un localStorage vaciado a mitad de sesión).
export function getIdentity(room?: string): Identity {
  const override = room ? getRoomOverride(room) : null
  return override ?? getGlobalIdentity() ?? { name: 'Invitado', color: randomIdentityColor() }
}
