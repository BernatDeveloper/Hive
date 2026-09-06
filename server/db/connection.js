import Database from 'better-sqlite3'
import { config } from '../config/env.js'

export const db = new Database(config.dbPath)
db.pragma('foreign_keys = ON')
