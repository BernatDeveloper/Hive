import { config } from './env.js'

const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:4173',
  config.clientOrigin,
].filter(Boolean)

export function isOriginAllowed(origin) {
  try {
    const host = new URL(origin).hostname
    // Dev local: cualquier puerto de localhost/127.0.0.1 (Vite salta de puerto
    // si el 5173 está ocupado). En producción solo cuenta ALLOWED_ORIGINS y Vercel.
    if (host === 'localhost' || host === '127.0.0.1') return true
    return ALLOWED_ORIGINS.includes(origin) || /\.vercel\.app$/.test(host)
  } catch {
    return false
  }
}

// Firma que esperan tanto `cors` (Express) como Socket.io: (origin, callback).
export function corsOrigin(origin, cb) {
  if (!origin) return cb(null, true) // health checks, curl
  if (isOriginAllowed(origin)) return cb(null, true)
  cb(new Error('Not allowed by CORS'))
}
