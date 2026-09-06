import Database from 'better-sqlite3'
import { config } from '../config/env.js'

export const db = new Database(config.dbPath)
// WAL: mejores lecturas concurrentes (los lectores no bloquean al escritor).
// Crea ficheros -wal y -shm junto a la DB.
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')
