// Carga el .env (si existe) y expone la configuración ya resuelta.
// Debe importarse ANTES que cualquier módulo que lea `config` (p. ej. db/connection).
try {
  process.loadEnvFile()
} catch {
  // no hay .env (p. ej. producción con variables inyectadas por la plataforma)
}

// Variables sin las que el servidor no puede funcionar (Web Push). Fallar rápido
// y con un mensaje claro es mejor que un error críptico más adelante.
const REQUIRED = ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT']
const missing = REQUIRED.filter(key => !process.env[key])
if (missing.length > 0) {
  console.error(
    `\n[config] Faltan variables de entorno requeridas: ${missing.join(', ')}\n` +
    `Copia server/.env.example a server/.env y rellénalas.\n` +
    `Genera las claves VAPID con:  npx web-push generate-vapid-keys\n`
  )
  process.exit(1)
}

export const config = {
  port: process.env.PORT || 3001,
  clientOrigin: process.env.CLIENT_ORIGIN || null, // dominio de producción
  dbPath: process.env.DB_PATH || './calendario.db',
  backupDir: process.env.BACKUP_DIR || './backups',
  // Confiar en X-Forwarded-For para la IP del cliente (rate limiting). Poner a
  // 'true' SOLO detrás de un proxy inverso propio que reescriba esa cabecera.
  trustProxy: process.env.TRUST_PROXY === 'true',
  vapid: {
    subject: process.env.VAPID_SUBJECT,
    publicKey: process.env.VAPID_PUBLIC_KEY,
    privateKey: process.env.VAPID_PRIVATE_KEY,
  },
}
