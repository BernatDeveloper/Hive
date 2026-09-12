import express from 'express'
import cors from 'cors'
import { corsOrigin } from '../config/cors.js'
import { registerHealthRoutes } from './health.js'

export function createApp() {
  const app = express()
  app.use(cors({ origin: corsOrigin }))
  // 256kb: por encima de MAX.noteBody (100.000 caracteres), el payload más
  // grande que maneja la app; el límite por defecto de express (~100kb) se
  // quedaba corto para ese caso.
  app.use(express.json({ limit: '256kb' }))
  registerHealthRoutes(app)
  return app
}
