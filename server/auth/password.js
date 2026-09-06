import { scrypt, randomBytes, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scryptAsync = promisify(scrypt)

// Formato de `password_hash`: "<salt hex>:<hash hex>" (scrypt, 64 bytes).
// Igual que la versión síncrona anterior — no invalida contraseñas existentes.
export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex')
  const hash = (await scryptAsync(password, salt, 64)).toString('hex')
  return `${salt}:${hash}`
}

export async function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':')
  const hashBuffer = Buffer.from(hash, 'hex')
  const newHash = await scryptAsync(password, salt, 64)
  return newHash.length === hashBuffer.length && timingSafeEqual(newHash, hashBuffer)
}
