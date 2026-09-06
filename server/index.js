import './config/env.js'      // primero: carga el .env antes que nada
import './config/webpush.js'   // configura VAPID antes de arrancar el scheduler
import { createServer } from 'node:http'
import { config } from './config/env.js'
import { initDb } from './db/index.js'
import { createApp } from './http/app.js'
import { createIo } from './http/io.js'
import { registerSocketHandlers } from './sockets/index.js'
import { startCleanupScheduler } from './services/cleanup.js'
import { startReminderScheduler } from './services/reminders.js'

process.on('uncaughtException', (err) => console.error('[uncaughtException]', err))
process.on('unhandledRejection', (err) => console.error('[unhandledRejection]', err))

initDb()

const app = createApp()
const httpServer = createServer(app)
const io = createIo(httpServer)

registerSocketHandlers(io)

startCleanupScheduler()
startReminderScheduler()

httpServer.listen(config.port, '0.0.0.0', () => {
  console.log(`Server running on port ${config.port}`)
})
