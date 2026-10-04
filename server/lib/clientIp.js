// IP del cliente para el rate limiting de auth.
//
// Detrás de un proxy inverso, `socket.handshake.address` es la IP del PROXY
// (todos los usuarios compartirían la misma y se bloquearían entre sí), así
// que se lee de `X-Forwarded-For`. Pero ese encabezado se construye por
// ANEXIÓN: cada proxy añade al final la IP que vio, y lo que ya venía de
// antes lo puede haber escrito el propio cliente. Por eso NO vale la primera
// entrada (el cliente la controla: bastaría variarla en cada intento para
// saltarse el límite y probar contraseñas de sala sin freno), sino la que
// añadió NUESTRO proxy: la última si hay un proxy de confianza, la
// antepenúltima si hay dos (p. ej. CDN + balanceador), etc.
//
//   X-Forwarded-For: <lo que ponga el cliente>, <IP real vista por el proxy>
//
// `hops` = nº de proxies de confianza delante de la app (TRUST_PROXY_HOPS).
export function resolveClientIp({ forwardedFor, address, trustProxy, hops = 1 }) {
  if (!trustProxy || typeof forwardedFor !== 'string') return address
  const parts = forwardedFor.split(',').map(p => p.trim()).filter(Boolean)
  if (parts.length === 0) return address
  return parts[Math.max(0, parts.length - hops)]
}
