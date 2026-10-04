import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { db } from '../db/connection.js'
import { initDb } from '../db/index.js'
import { config } from '../config/env.js'
import { runBackup } from './backup.js'

before(() => initDb())
after(() => db.close())

function resetBackupDir() {
  rmSync(config.backupDir, { recursive: true, force: true })
  mkdirSync(config.backupDir, { recursive: true })
}

test('runBackup crea un fichero .db válido y abrible con las tablas de la app', () => {
  resetBackupDir()
  runBackup()

  const files = readdirSync(config.backupDir).filter(f => f.endsWith('.db'))
  assert.equal(files.length, 1)

  const copy = new Database(join(config.backupDir, files[0]), { readonly: true })
  const tables = copy.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name)
  assert.ok(tables.includes('room'))
  assert.ok(tables.includes('event'))
  copy.close()
})

test('con 15 backups presentes, tras un tick (que añade el de hoy) quedan 14', () => {
  resetBackupDir()
  for (let i = 1; i <= 15; i++) {
    writeFileSync(join(config.backupDir, `hive-2020-01-${String(i).padStart(2, '0')}.db`), '')
  }

  runBackup() // añade el backup "de hoy" (16 en total) y poda al límite

  const files = readdirSync(config.backupDir).filter(f => f.endsWith('.db'))
  assert.equal(files.length, 14)
  // Se conserva el más reciente de los ficheros antiguos y el de hoy; se
  // borran los más viejos primero (orden lexicográfico de la fecha en el nombre).
  assert.ok(!files.includes('hive-2020-01-01.db'), 'el backup más antiguo debería haberse borrado')
  assert.ok(files.includes('hive-2020-01-15.db'))
})

test('ignora ficheros del directorio que no siguen el patrón de nombre', () => {
  resetBackupDir()
  writeFileSync(join(config.backupDir, 'notas.txt'), 'x')
  runBackup()
  const files = readdirSync(config.backupDir)
  assert.ok(files.includes('notas.txt'), 'un fichero ajeno no debería tocarse')
})
