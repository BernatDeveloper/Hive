import express from 'express'
import cors from 'cors'
import { corsOrigin } from '../config/cors.js'
import { registerHealthRoutes } from './health.js'

export function createApp() {
  const app = express()
  app.use(cors({ origin: corsOrigin }))
  app.use(express.json())
  registerHealthRoutes(app)
  return app
}
