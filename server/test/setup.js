// Se ejecuta antes del grafo de módulos de cada worker de `node --test`
// (vía `--import`). Da valores de entorno para que config/env.js no aborte y
// aísla la base de datos en un fichero temporal propio de cada proceso.
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { rmSync } from 'node:fs'

process.env.VAPID_PUBLIC_KEY ||= 'test-public-key'
process.env.VAPID_PRIVATE_KEY ||= 'test-private-key'
process.env.VAPID_SUBJECT ||= 'mailto:test@example.com'
process.env.TRUST_PROXY = 'true' // los tests falsean X-Forwarded-For para el rate limit
process.env.LOG_LEVEL = 'error'  // silencio en la salida de los tests

const dbPath = process.env.DB_PATH ||= join(tmpdir(), `sc-test-${process.pid}-${Date.now()}.db`)

// Borra la DB temporal (y sus sidecars WAL) al terminar el worker de test.
process.on('exit', () => {
  for (const suffix of ['', '-wal', '-shm', '-journal']) {
    try { rmSync(dbPath + suffix) } catch { /* no existía */ }
  }
})
