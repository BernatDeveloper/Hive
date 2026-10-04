// Se ejecuta antes del grafo de módulos de cada worker de `node --test`
// (vía `--import`). Da valores de entorno para que config/env.js no aborte y
// aísla la base de datos en un fichero temporal propio de cada proceso.
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { rmSync } from 'node:fs'

// Par de claves VAPID de mentira pero con el formato real (65/32 bytes
// decodificados) que exige `web-push.setVapidDetails` — cualquier valor con
// una forma inválida hace que config/webpush.js explote al importarse.
process.env.VAPID_PUBLIC_KEY ||= 'BFiyc-DY9k8K-c5L98qzyQd_f8X44zT2X8z-KS6MEKGw0qZzRAuEifBVkkSnfCDIQxcdz8ZgawZasndGxPSn_8I'
process.env.VAPID_PRIVATE_KEY ||= 'OChKaASx7P4IKKhKy1Rnk8BZor-gAyn7gACg-faetEM'
process.env.VAPID_SUBJECT ||= 'mailto:test@example.com'
process.env.TRUST_PROXY = 'true' // los tests falsean X-Forwarded-For para el rate limit
process.env.LOG_LEVEL = 'error'  // silencio en la salida de los tests

const dbPath = process.env.DB_PATH ||= join(tmpdir(), `hive-test-${process.pid}-${Date.now()}.db`)
const backupDir = process.env.BACKUP_DIR ||= join(tmpdir(), `hive-test-backups-${process.pid}-${Date.now()}`)

// Borra la DB temporal (y sus sidecars WAL) y la carpeta de backups al
// terminar el worker de test.
process.on('exit', () => {
  for (const suffix of ['', '-wal', '-shm', '-journal']) {
    try { rmSync(dbPath + suffix) } catch { /* no existía */ }
  }
  try { rmSync(backupDir, { recursive: true, force: true }) } catch { /* no existía */ }
})
