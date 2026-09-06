// Carga el .env (si existe) y expone la configuración ya resuelta.
// Debe importarse ANTES que cualquier módulo que lea `config` (p. ej. db/connection).
try {
  process.loadEnvFile()
} catch {
  // no hay .env (p. ej. producción con variables inyectadas por la plataforma)
}

export const config = {
  port: process.env.PORT || 3001,
  clientOrigin: process.env.CLIENT_ORIGIN || null, // dominio de producción
  dbPath: process.env.DB_PATH || './calendario.db',
  vapid: {
    subject: process.env.VAPID_SUBJECT,
    publicKey: process.env.VAPID_PUBLIC_KEY,
    privateKey: process.env.VAPID_PRIVATE_KEY,
  },
}
