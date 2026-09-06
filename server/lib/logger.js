// Logger mínimo con niveles. Umbral por `LOG_LEVEL` (error|warn|info|debug),
// por defecto `info`. Cada línea lleva timestamp ISO y nivel.
const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 }
const threshold = LEVELS[process.env.LOG_LEVEL] ?? LEVELS.info

function emit(level, args) {
  if (LEVELS[level] > threshold) return
  const prefix = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)}`
  const sink = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log
  sink(prefix, ...args)
}

export const logger = {
  error: (...args) => emit('error', args),
  warn: (...args) => emit('warn', args),
  info: (...args) => emit('info', args),
  debug: (...args) => emit('debug', args),
}
