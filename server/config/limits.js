// Límites de protección frente a abuso, en un solo sitio. Son un objeto
// MUTABLE a propósito: los tests lo ajustan antes de arrancar el servidor para
// probar los cortes sin tener que enviar miles de mensajes.
//
// Principio: generosos para el uso humano normal (varias pestañas, un
// teléfono con mala cobertura reenviando su cola de escrituras…) y estrechos
// para un script. Nada de esto sustituye a las protecciones de la plataforma
// (DDoS volumétrico, TLS, WAF): es la defensa que sí puede aplicar la propia app.
export const LIMITS = {
  // ─── Conexiones (por IP) ───
  maxConnectionsPerIp: 40,        // sockets abiertos a la vez desde una misma IP
  handshakesPerMinutePerIp: 90,   // conexiones nuevas por minuto y por IP

  // ─── Mensajes (por socket) — cubos de fichas: ráfaga + ritmo sostenido ───
  // Todos los mensajes entrantes, incluidos los que ni existen.
  eventBucket: { capacity: 200, refillPerSec: 30 },
  // Escrituras (todo menos lecturas), más estrecho: cada una toca SQLite.
  writeBucket: { capacity: 300, refillPerSec: 10 },
  // Tamaño máximo de un mensaje. La nota más grande son 100.000 caracteres
  // (hasta ~400 KB en UTF-8 de 4 bytes); el defecto de socket.io es 1 MB.
  maxMessageBytes: 600_000,

  // ─── Sanciones por IP ───
  // Cada mensaje descartado por los cubos y cada intento de acceso rechazado
  // por el límite de auth suman una falta. Con `strikesToBan` faltas en
  // `strikeWindowMs` la IP queda baneada `banMs` (se cierran sus sockets y se
  // rechazan sus conexiones nuevas).
  strikesToBan: 40,
  strikeWindowMs: 60_000,
  banMs: 10 * 60_000,

  // ─── Acciones caras (por socket o por IP) ───
  createEventsPerMinute: 60,      // cada create-event puede generar una serie de hasta 365 filas
  subscribePushPerHour: 20,
  createRoomsPerHourPerIp: 5,
  // scrypt (hash de contraseña) usa el pool de hilos compartido con el DNS de
  // la vista previa de enlaces: se acota cuántos corren a la vez y cuántos
  // esperan; el resto recibe "servidor ocupado".
  passwordHashConcurrency: 2,
  passwordHashQueue: 50,

  // ─── Cuotas de datos ───
  // Una persona con la contraseña (o un script con ella) no debe poder llenar
  // el disco. Holgadas para uso real.
  maxRooms: 10_000,
  maxPerRoom: {
    event: 20_000,
    list: 300,
    list_item: 10_000,
    note: 1_000,
    bookmark: 5_000,
    push_subscription: 100,
  },

  // ─── HTTP ───
  httpRequestsPerMinutePerIp: 120,
}
