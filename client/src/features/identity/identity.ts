// Identidad ligera por dispositivo (Fase 9): nombre + color guardados en
// localStorage, sin registro. Es puramente informativa — cualquiera en la
// sala puede ponerse el nombre que quiera — así que nunca debe usarse para
// construir permisos ni un "admin" real.

export interface Identity {
  name: string
  color: string
}

// Paleta de colores de identidad — vivos y saturados (misma tónica que
// antes, ahora con más variedad: 16 en vez de 8). Ordenada por matiz
// (rueda de color) para que el selector se vea como una progresión de
// colores, no una lista suelta.
export const IDENTITY_COLORS = [
  '#ff453a', '#ff6b4a', '#ff9f0a', '#ffd60a', '#a0d911', '#52c41a',
  '#30d158', '#00c7be', '#64d2ff', '#0071e3', '#5e5ce6', '#7c4dff',
  '#bf5af2', '#d6249f', '#eb2f96', '#ff375f',
]

// Nombres para el selector tipo "pop up" (un nombre hace más legible la
// lista que un hex suelto) — solo de presentación, no se guarda en ningún
// sitio ni se usa como identificador.
export const IDENTITY_COLOR_NAMES: Record<string, string> = {
  '#ff453a': 'Tomate',
  '#ff6b4a': 'Coral',
  '#ff9f0a': 'Mandarina',
  '#ffd60a': 'Plátano',
  '#a0d911': 'Lima',
  '#52c41a': 'Hierba',
  '#30d158': 'Eucalipto',
  '#00c7be': 'Menta',
  '#64d2ff': 'Pavo real',
  '#0071e3': 'Cobalto',
  '#5e5ce6': 'Índigo',
  '#7c4dff': 'Violeta',
  '#bf5af2': 'Lavanda',
  '#d6249f': 'Magenta',
  '#eb2f96': 'Fucsia',
  '#ff375f': 'Flamenco',
}

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

// Id aleatorio y estable de este dispositivo: el servidor lo usa para
// recordarlo como miembro de la sala (aunque se desconecte o se renombre) y
// para contar varias pestañas como una sola persona. No es un secreto ni una
// credencial — la identidad sigue siendo informativa y spoofeable.
const DEVICE_KEY = 'deviceId'
const DEVICE_ID = /^[A-Za-z0-9_-]{8,64}$/   // mismo formato que valida el servidor
let memoryDeviceId: string | null = null    // si localStorage no está disponible

function newDeviceId(): string {
  // getRandomValues (no randomUUID): funciona también fuera de un contexto
  // seguro, p. ej. probando desde el móvil por http://<ip-local>.
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return [...bytes].map(b => b.toString(16).padStart(2, '0')).join('')
}

export function getDeviceId(): string {
  try {
    const stored = localStorage.getItem(DEVICE_KEY)
    if (stored && DEVICE_ID.test(stored)) return stored
    const id = newDeviceId()
    localStorage.setItem(DEVICE_KEY, id)
    return id
  } catch {
    memoryDeviceId ??= newDeviceId()
    return memoryDeviceId
  }
}
