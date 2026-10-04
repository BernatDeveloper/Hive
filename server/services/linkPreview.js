import http from 'node:http'
import https from 'node:https'
import dns from 'node:dns'
import net from 'node:net'
import zlib from 'node:zlib'

// Vista previa de un enlace (título, descripción, imagen) leyendo las
// etiquetas Open Graph de la propia página.
//
// Ojo: esto hace que EL SERVIDOR pida una URL que eligió un usuario, y eso es
// el patrón clásico de SSRF (apuntar a 127.0.0.1, a la red interna o al
// servicio de metadatos de la nube). Defensas:
//  - solo http/https, sin credenciales en la URL;
//  - cada conexión resuelve el DNS con un `lookup` propio que rechaza
//    cualquier dirección privada/loopback/link-local — se comprueba en el
//    momento de conectar (no antes), así que un DNS que cambie entre la
//    comprobación y la conexión (rebinding) no la esquiva; las IPs literales
//    (que saltan el lookup) se comprueban aparte;
//  - los redirects se siguen a mano (máx. 4) y cada salto pasa por lo mismo;
//  - plazo total, tamaño máximo leído y solo se acepta HTML (o una imagen).

const USER_AGENT = 'Mozilla/5.0 (compatible; Hive-LinkPreview/1.0)'
const MAX_REDIRECTS = 4
const DEFAULT_TIMEOUT_MS = 6000
// YouTube y similares llevan ~700 KB de script inline antes de los meta tags.
const DEFAULT_MAX_BYTES = 2_000_000

// ─── Direcciones privadas ────────────────────────────────

function ipv4Octets(ip) {
  const p = ip.split('.').map(Number)
  return p.length === 4 && p.every(n => Number.isInteger(n) && n >= 0 && n <= 255) ? p : null
}

function isPrivateIPv4(ip) {
  const o = ipv4Octets(ip)
  if (!o) return true // no es una IPv4 válida → no arriesgar
  const [a, b, c] = o
  return a === 0 || a === 10 || a === 127
    || (a === 100 && b >= 64 && b <= 127)          // CGNAT
    || (a === 169 && b === 254)                    // link-local (incluye metadatos cloud)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 0 && c === 0)
    || (a === 192 && b === 0 && c === 2)
    || (a === 192 && b === 168)
    || (a === 198 && (b === 18 || b === 19))
    || (a === 198 && b === 51 && c === 100)
    || (a === 203 && b === 0 && c === 113)
    || a >= 224                                    // multicast + reservado + broadcast
}

// Expande una IPv6 a sus 8 grupos de 16 bits (soporta "::" y un sufijo IPv4).
function expandIPv6(ip) {
  let s = ip.split('%')[0].toLowerCase()
  const v4 = s.match(/(\d+\.\d+\.\d+\.\d+)$/)
  if (v4) {
    const o = ipv4Octets(v4[1])
    if (!o) return null
    s = s.slice(0, -v4[1].length) + ((o[0] << 8) | o[1]).toString(16) + ':' + ((o[2] << 8) | o[3]).toString(16)
  }
  const halves = s.split('::')
  if (halves.length > 2) return null
  const head = halves[0] ? halves[0].split(':') : []
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : []
  const missing = 8 - head.length - tail.length
  if (halves.length === 1 ? head.length !== 8 : missing < 0) return null
  const groups = [...head, ...Array(halves.length === 2 ? missing : 0).fill('0'), ...tail].map(g => parseInt(g, 16))
  return groups.length === 8 && groups.every(n => Number.isInteger(n) && n >= 0 && n <= 0xffff) ? groups : null
}

function isPrivateIPv6(ip) {
  const g = expandIPv6(ip)
  if (!g) return true
  const embedded = (hi, lo) => `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`
  if (g.every(n => n === 0)) return true                              // ::
  if (g.slice(0, 7).every(n => n === 0) && g[7] === 1) return true   // ::1
  if ((g[0] & 0xfe00) === 0xfc00) return true                         // fc00::/7 (ULA)
  if ((g[0] & 0xffc0) === 0xfe80) return true                         // fe80::/10 (link-local)
  if ((g[0] & 0xff00) === 0xff00) return true                         // multicast
  if (g[0] === 0x2001 && g[1] === 0x0db8) return true                 // documentación
  // IPv4 mapeada (::ffff:a.b.c.d), compatible (::a.b.c.d) y NAT64 (64:ff9b::/96):
  // mandan la decisión a la IPv4 que llevan dentro.
  if (g.slice(0, 5).every(n => n === 0) && (g[5] === 0xffff || g[5] === 0)) return isPrivateIPv4(embedded(g[6], g[7]))
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every(n => n === 0)) return isPrivateIPv4(embedded(g[6], g[7]))
  if (g[0] === 0x2002) return isPrivateIPv4(embedded(g[1], g[2]))     // 6to4
  return false
}

export function isPrivateAddress(ip) {
  const kind = net.isIP(ip)
  if (kind === 4) return isPrivateIPv4(ip)
  if (kind === 6) return isPrivateIPv6(ip)
  return true
}

// `lookup` para http(s).request: resuelve y rechaza si ALGUNA de las
// direcciones es privada (si el nombre mezcla públicas y privadas, no nos
// fiamos). Node 22 lo llama con `all: true` (autoSelectFamily).
function guardedLookup(hostname, options, callback) {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err)
    if (addresses.some(a => isPrivateAddress(a.address))) {
      const blocked = new Error('Dirección no permitida')
      blocked.code = 'EBLOCKED'
      return callback(blocked)
    }
    if (options.all) return callback(null, addresses)
    callback(null, addresses[0].address, addresses[0].family)
  })
}

// ─── URL ─────────────────────────────────────────────────

// Devuelve un URL http(s) sin credenciales, o null.
export function parseHttpUrl(raw) {
  if (typeof raw !== 'string') return null
  let u
  try { u = new URL(raw) } catch { return null }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
  if (u.username || u.password) return null
  return u
}

// ─── Parseo del HTML ─────────────────────────────────────

const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  hellip: '…', ndash: '–', mdash: '—', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
  laquo: '«', raquo: '»', copy: '©', reg: '®', trade: '™', euro: '€', middot: '·', bull: '•',
}

function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      try { return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : m } catch { return m }
    }
    return NAMED_ENTITIES[e.toLowerCase()] ?? m
  })
}

const clean = (s, max) => {
  if (typeof s !== 'string') return null
  const t = decodeEntities(s).replace(/\s+/g, ' ').trim()
  return t ? t.slice(0, max) : null
}

function parseAttributes(tag) {
  const attrs = {}
  const re = /([a-zA-Z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g
  let m
  while ((m = re.exec(tag))) attrs[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? ''
  return attrs
}

function resolveImage(value, base) {
  if (!value) return null
  try {
    const u = new URL(decodeEntities(value.trim()), base)
    return (u.protocol === 'http:' || u.protocol === 'https:') && u.href.length <= 2048 ? u.href : null
  } catch {
    return null
  }
}

// Extrae { title, description, image, siteName } del HTML de una página.
// Regex en vez de un parser completo: solo hace falta el <head>, y el HTML
// llega recortado y no fiable de todos modos.
export function parsePreview(html, baseUrl) {
  const headEnd = html.search(/<\/head\s*>/i)
  const head = (headEnd >= 0 ? html.slice(0, headEnd) : html)
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|noscript)\b[\s\S]*?<\/\1\s*>/gi, '')

  const meta = {}
  for (const m of head.matchAll(/<meta\b([^>]*)>/gi)) {
    const a = parseAttributes(m[1])
    const key = (a.property || a.name || a.itemprop || '').toLowerCase()
    if (key && a.content !== undefined && meta[key] === undefined) meta[key] = a.content
  }
  const titleTag = head.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i)?.[1]

  return {
    title: clean(meta['og:title'] ?? meta['twitter:title'] ?? titleTag, 200),
    description: clean(meta['og:description'] ?? meta['twitter:description'] ?? meta.description, 500),
    image: resolveImage(
      meta['og:image'] ?? meta['og:image:secure_url'] ?? meta['og:image:url'] ?? meta['twitter:image'] ?? meta['twitter:image:src'],
      baseUrl,
    ),
    siteName: clean(meta['og:site_name'], 100),
  }
}

// ─── Descarga ────────────────────────────────────────────

function decoderFor(res) {
  switch ((res.headers['content-encoding'] || '').toLowerCase()) {
    case 'gzip': case 'x-gzip': return zlib.createGunzip()
    case 'deflate': return zlib.createInflate()
    case 'br': return zlib.createBrotliDecompress()
    default: return null
  }
}

function decodeBody(buffer, contentType) {
  let label = contentType.match(/charset=["']?([\w-]+)/i)?.[1]
  if (!label) label = buffer.subarray(0, 4096).toString('latin1').match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1]
  try {
    return new TextDecoder(label || 'utf-8').decode(buffer)
  } catch {
    return new TextDecoder('utf-8').decode(buffer)
  }
}

// Lee el cuerpo hasta `maxBytes` o hasta el cierre del <head> (lo único que
// hace falta), descomprimiendo al vuelo. Si el flujo se corta a medias pero ya
// hay datos, se aprovechan.
async function readHead(res, maxBytes) {
  const decoder = decoderFor(res)
  // `pipe` no propaga los errores de `res` al descompresor: sin esto, un corte
  // de conexión dejaría la lectura colgada (y el 'error' sin escuchar).
  res.on('error', err => decoder?.destroy(err))
  const stream = decoder ? res.pipe(decoder) : res
  const chunks = []
  let total = 0
  let tail = ''
  try {
    for await (const chunk of stream) {
      chunks.push(chunk)
      total += chunk.length
      const text = tail + chunk.toString('latin1')
      if (/<\/head\s*>/i.test(text) || total >= maxBytes) break
      tail = text.slice(-10)
    }
  } catch (err) {
    if (total === 0) throw err
  } finally {
    res.destroy()
    decoder?.destroy()
  }
  return Buffer.concat(chunks)
}

function get(url, { signal, allowPrivate }) {
  return new Promise((resolve, reject) => {
    const host = url.hostname.replace(/^\[|\]$/g, '')
    // Las IPs literales no pasan por `lookup`: se comprueban aquí.
    if (!allowPrivate && net.isIP(host) && isPrivateAddress(host)) {
      const blocked = new Error('Dirección no permitida')
      blocked.code = 'EBLOCKED'
      return reject(blocked)
    }
    const lib = url.protocol === 'https:' ? https : http
    const req = lib.get(url, {
      signal,
      agent: false,
      lookup: allowPrivate ? undefined : guardedLookup,
      headers: {
        'user-agent': USER_AGENT,
        accept: 'text/html,application/xhtml+xml;q=0.9,image/*;q=0.5,*/*;q=0.1',
        'accept-language': 'es,en;q=0.8',
        'accept-encoding': 'gzip, deflate, br',
      },
    }, resolve)
    req.on('error', reject)
  })
}

// Devuelve { title, description, image, siteName } (campos null si la página
// no los da). Lanza si no se pudo obtener nada (bloqueado, timeout, HTTP de
// error, demasiados redirects…) — el llamador lo trata como "sin vista previa".
// `allowPrivate` existe solo para los tests (servidor local).
export async function fetchLinkPreview(rawUrl, { timeoutMs = DEFAULT_TIMEOUT_MS, maxBytes = DEFAULT_MAX_BYTES, allowPrivate = false } = {}) {
  let current = parseHttpUrl(rawUrl)
  if (!current) throw new Error('URL no válida')

  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(), timeoutMs)
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const res = await get(current, { signal: abort.signal, allowPrivate })
      const status = res.statusCode ?? 0

      if (status >= 300 && status < 400 && res.headers.location) {
        res.resume()
        const next = parseHttpUrl(new URL(res.headers.location, current).href)
        if (!next) throw new Error('Redirección no válida')
        current = next
        continue
      }
      if (status < 200 || status >= 300) {
        res.resume()
        throw new Error(`HTTP ${status}`)
      }

      const type = String(res.headers['content-type'] || '').toLowerCase()
      if (type.startsWith('image/')) {
        res.destroy()
        return { title: null, description: null, image: current.href, siteName: null }
      }
      if (!/html|xml/.test(type)) {
        // PDF, vídeo, etc.: es un enlace válido, simplemente sin metadatos.
        res.destroy()
        return { title: null, description: null, image: null, siteName: null }
      }
      const body = await readHead(res, maxBytes)
      return parsePreview(decodeBody(body, type), current)
    }
    throw new Error('Demasiadas redirecciones')
  } finally {
    clearTimeout(timer)
  }
}
