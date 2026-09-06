import { createServer } from 'node:http'
import { io as ioClient } from 'socket.io-client'
import { initDb } from '../db/index.js'
import { createApp } from '../http/app.js'
import { createIo } from '../http/io.js'
import { registerSocketHandlers } from '../sockets/index.js'

let dbReady = false

// Levanta app + io + handlers en un puerto efímero, SIN pasar por index.js
// (así los tests no tocan webpush ni los schedulers). DB = fichero temporal
// propio del proceso (test/setup.js).
export async function startTestServer() {
  if (!dbReady) { initDb(); dbReady = true }
  const app = createApp()
  const httpServer = createServer(app)
  const io = createIo(httpServer)
  registerSocketHandlers(io)
  await new Promise(resolve => httpServer.listen(0, '127.0.0.1', resolve))
  const { port } = httpServer.address()
  return {
    url: `http://127.0.0.1:${port}`,
    async close() {
      io.close()
      await new Promise(resolve => httpServer.close(resolve))
    },
  }
}

// Cliente socket.io. `ip` va como X-Forwarded-For (el server de test corre con
// TRUST_PROXY=true) para aislar el rate limiter entre tests.
export function connect(url, ip = '10.0.0.1') {
  return ioClient(url, {
    transports: ['websocket'],
    forceNew: true,
    extraHeaders: { 'x-forwarded-for': ip },
  })
}

export function once(socket, event, ms = 3000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout esperando "${event}"`)), ms)
    socket.once(event, data => { clearTimeout(t); resolve(data) })
  })
}

// Espera al primero de varios eventos: devuelve { event, data }.
export function onceAny(socket, events, ms = 3000) {
  return Promise.race(events.map(ev => once(socket, ev, ms).then(data => ({ event: ev, data }))))
}
