import './config/env.js'      // primero: carga el .env antes que nada
import './config/webpush.js'   // configura VAPID antes de arrancar el scheduler
import { createServer } from 'node:http'
import { config } from './config/env.js'
import { initDb, closeDb } from './db/index.js'
import { createApp } from './http/app.js'
import { createIo } from './http/io.js'
import { registerSocketHandlers } from './sockets/index.js'
import { startCleanupScheduler } from './services/cleanup.js'
import { startReminderScheduler } from './services/reminders.js'
import { startBackupScheduler } from './services/backup.js'
import { logger } from './lib/logger.js'

process.on('uncaughtException', (err) => logger.error('uncaughtException', err))
process.on('unhandledRejection', (err) => logger.error('unhandledRejection', err))

initDb()

const app = createApp()
const httpServer = createServer(app)
const io = createIo(httpServer)

registerSocketHandlers(io)

startCleanupScheduler()
startReminderScheduler()
startBackupScheduler()

httpServer.listen(config.port, '0.0.0.0', () => {
  logger.info(`Server running on port ${config.port}`)
})

// Apagado ordenado: deja de aceptar tráfico, cierra sockets/HTTP y solo
// entonces la DB (checkpoint del WAL + close). Un timeout de guardia fuerza
// la salida si algo se queda colgado (p. ej. un socket que no cierra).
let shuttingDown = false
function shutdown(signal) {
  if (shuttingDown) return
  shuttingDown = true
  logger.info(`${signal} recibido, cerrando…`)

  const forceExit = setTimeout(() => {
    logger.error('Apagado forzado: el cierre ordenado tardó demasiado')
    process.exit(1)
  }, 5000)
  forceExit.unref()

  io.close(() => {
    closeDb()
    clearTimeout(forceExit)
    process.exit(0)
  })
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
