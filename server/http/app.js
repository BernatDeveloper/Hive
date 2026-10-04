import express from 'express'
import cors from 'cors'
import { corsOrigin } from '../config/cors.js'
import { registerHealthRoutes } from './health.js'
import { securityHeaders, createHttpLimiter, notFoundHandler, errorHandler } from './security.js'

// `httpLimitPerMinute` solo se pasa en los tests (para no tener que enviar 120 peticiones).
export function createApp({ httpLimitPerMinute } = {}) {
  const app = express()
  app.disable('x-powered-by') // no anunciar "Express" a quien escanea
  app.use(securityHeaders)
  app.use(cors({ origin: corsOrigin }))
  app.use(createHttpLimiter(httpLimitPerMinute ? { max: httpLimitPerMinute } : {}))
  // 256kb: por encima de MAX.noteBody (100.000 caracteres), el payload más
  // grande que maneja la app; el límite por defecto de express (~100kb) se
  // quedaba corto para ese caso.
  app.use(express.json({ limit: '256kb' }))
  registerHealthRoutes(app)
  app.use(notFoundHandler)
  app.use(errorHandler)
  return app
}
