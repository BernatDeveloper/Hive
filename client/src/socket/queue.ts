import { socket } from './client'

// Cola de escrituras para cuando no hay conexión (o el socket reconectó pero
// aún no ha vuelto a hacer join-room). Al recibir `access-granted` se vacía en
// orden. Las lecturas / auth / undo NO pasan por aquí.
interface Pending { event: string; payload: unknown }

const queue: Pending[] = []
let authed = false
const listeners = new Set<() => void>()

function notify() { for (const fn of listeners) fn() }

export function onQueueChange(fn: () => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

export function pendingCount(): number { return queue.length }

function ready(): boolean { return socket.connected && authed }

// Escritura sin ack: se envía ya si hay conexión, o se encola.
export function emitWrite(event: string, payload: unknown): void {
  if (ready()) { socket.emit(event, payload); return }
  queue.push({ event, payload })
  notify()
}

// Escritura con ack: online → promesa real (timeout 5s); offline → encola sin
// ack y resuelve con `whenQueued` para no dejar la promesa colgada.
export function emitWriteAck<T>(event: string, payload: unknown, whenQueued: T): Promise<T> {
  if (ready()) {
    return new Promise<T>(resolve => {
      socket.timeout(5000).emit(event, payload, (_err: unknown, res: T) => resolve(res ?? whenQueued))
    })
  }
  queue.push({ event, payload })
  notify()
  return Promise.resolve(whenQueued)
}

function flush() {
  if (!ready() || queue.length === 0) return
  for (const item of queue.splice(0)) socket.emit(item.event, item.payload)
  notify()
}

socket.on('access-granted', () => { authed = true; flush() })
socket.on('disconnect', () => { authed = false })
