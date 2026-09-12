import { mkdirSync, readdirSync, unlinkSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { db } from '../db/connection.js'
import { config } from '../config/env.js'
import { logger } from '../lib/logger.js'

const RETAIN = 14
const NAME_RE = /^calendario-\d{4}-\d{2}-\d{2}\.db$/

// Copia de seguridad con VACUUM INTO: compacta y escribe una DB consistente
// en un solo fichero, sin bloquear las escrituras normales.
// VACUUM INTO no admite parámetros bind — la ruta se interpola directamente —
// pero la generamos nosotros (fecha del servidor, sin entrada de usuario), así
// que no hay inyección posible.
export function runBackup() {
  mkdirSync(config.backupDir, { recursive: true })
  const file = join(config.backupDir, `calendario-${new Date().toISOString().slice(0, 10)}.db`)
  // VACUUM INTO falla si el fichero destino ya existe (p. ej. dos arranques
  // el mismo día): lo sustituimos.
  if (existsSync(file)) unlinkSync(file)
  db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`)
  logger.info(`Backup creado: ${file}`)
  pruneOldBackups()
}

function pruneOldBackups() {
  const files = readdirSync(config.backupDir).filter(f => NAME_RE.test(f)).sort()
  const excess = files.length - RETAIN
  for (const f of files.slice(0, Math.max(0, excess))) {
    unlinkSync(join(config.backupDir, f))
    logger.info(`Backup antiguo eliminado: ${f}`)
  }
}

export function startBackupScheduler() {
  runBackup() // primera copia al arrancar
  setInterval(runBackup, 24 * 60 * 60 * 1000)
}
