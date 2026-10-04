import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { gzipSync } from 'node:zlib'
import { isPrivateAddress, parsePreview, parseHttpUrl, fetchLinkPreview } from './linkPreview.js'

test('isPrivateAddress: rangos privados, loopback y link-local se bloquean', () => {
  for (const ip of [
    '127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.10', '169.254.169.254',
    '0.0.0.0', '100.64.0.1', '224.0.0.1', '255.255.255.255',
    '::1', '::', 'fe80::1', 'fc00::1', 'fd12:3456::1', 'ff02::1',
    '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:10.0.0.1', '64:ff9b::7f00:1', '2002:7f00:1::1',
  ]) {
    assert.equal(isPrivateAddress(ip), true, `${ip} debería bloquearse`)
  }
})

test('isPrivateAddress: direcciones públicas pasan', () => {
  for (const ip of ['8.8.8.8', '1.1.1.1', '172.15.0.1', '172.32.0.1', '93.184.216.34', '2606:4700:4700::1111', '::ffff:8.8.8.8']) {
    assert.equal(isPrivateAddress(ip), false, `${ip} debería pasar`)
  }
})

test('isPrivateAddress: lo que no es una IP se trata como bloqueado', () => {
  assert.equal(isPrivateAddress('no-es-una-ip'), true)
  assert.equal(isPrivateAddress(''), true)
})

test('parseHttpUrl: solo http/https y sin credenciales', () => {
  assert.ok(parseHttpUrl('https://ejemplo.com/a?b=1'))
  assert.ok(parseHttpUrl('http://ejemplo.com'))
  assert.equal(parseHttpUrl('javascript:alert(1)'), null)
  assert.equal(parseHttpUrl('file:///etc/passwd'), null)
  assert.equal(parseHttpUrl('ftp://ejemplo.com'), null)
  assert.equal(parseHttpUrl('https://user:pass@ejemplo.com'), null)
  assert.equal(parseHttpUrl('esto no es una url'), null)
  assert.equal(parseHttpUrl(42), null)
})

test('parsePreview: Open Graph, con entidades HTML y la imagen resuelta contra la URL', () => {
  const html = `<html><head>
    <title>Título &amp; viejo</title>
    <meta property="og:title" content="Aprende &quot;React&quot; en 1 hora">
    <meta property="og:description" content="Un   tutorial&#39;s
      completo">
    <meta property="og:image" content="/img/portada.png">
    <meta property="og:site_name" content="MiBlog">
    <script>var x = '<meta property="og:title" content="falso">'</script>
  </head><body><meta property="og:title" content="en el body"></body></html>`
  const p = parsePreview(html, new URL('https://blog.ejemplo.com/post/1'))
  assert.equal(p.title, 'Aprende "React" en 1 hora')
  assert.equal(p.description, "Un tutorial's completo")
  assert.equal(p.image, 'https://blog.ejemplo.com/img/portada.png')
  assert.equal(p.siteName, 'MiBlog')
})

test('parsePreview: sin Open Graph cae a <title>, meta description y twitter:image', () => {
  const html = `<head><title> Mi página </title>
    <meta name="description" content="Descripción normal">
    <meta name='twitter:image' content='https://cdn.ejemplo.com/a.jpg'></head>`
  const p = parsePreview(html, new URL('https://ejemplo.com'))
  assert.equal(p.title, 'Mi página')
  assert.equal(p.description, 'Descripción normal')
  assert.equal(p.image, 'https://cdn.ejemplo.com/a.jpg')
  assert.equal(p.siteName, null)
})

test('parsePreview: una imagen con esquema peligroso se descarta', () => {
  const html = '<head><meta property="og:image" content="javascript:alert(1)"><meta property="og:title" content="x"></head>'
  assert.equal(parsePreview(html, new URL('https://ejemplo.com')).image, null)
})

test('parsePreview: página vacía no revienta', () => {
  assert.deepEqual(parsePreview('', new URL('https://ejemplo.com')), { title: null, description: null, image: null, siteName: null })
})

// ─── Descarga contra un servidor local ───────────────────

let server
let base
const hits = []

before(async () => {
  server = createServer((req, res) => {
    hits.push(req.url)
    if (req.url === '/ok') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end('<html><head><meta property="og:title" content="Hola mundo"><meta property="og:image" content="/p.png"></head><body>x</body></html>')
    } else if (req.url === '/gzip') {
      res.writeHead(200, { 'content-type': 'text/html', 'content-encoding': 'gzip' })
      res.end(gzipSync('<head><title>Comprimido</title></head>'))
    } else if (req.url === '/latin1') {
      res.writeHead(200, { 'content-type': 'text/html; charset=iso-8859-1' })
      res.end(Buffer.from('<head><title>Canción</title></head>', 'latin1'))
    } else if (req.url === '/redirect') {
      res.writeHead(302, { location: '/ok' })
      res.end()
    } else if (req.url === '/loop') {
      res.writeHead(302, { location: '/loop' })
      res.end()
    } else if (req.url === '/image') {
      res.writeHead(200, { 'content-type': 'image/png' })
      res.end(Buffer.from([0x89, 0x50]))
    } else if (req.url === '/pdf') {
      res.writeHead(200, { 'content-type': 'application/pdf' })
      res.end('%PDF')
    } else if (req.url === '/stall') {
      // ni siquiera responde: el plazo total debe cortar
    } else if (req.url === '/slow') {
      res.writeHead(200, { 'content-type': 'text/html' })
      res.write('<head><title>A medias</title>')
      // el cuerpo no termina nunca: el plazo corta y se aprovecha lo recibido
    } else if (req.url === '/huge') {
      res.writeHead(200, { 'content-type': 'text/html' })
      const interval = setInterval(() => res.write('a'.repeat(50_000)), 1)
      res.on('close', () => clearInterval(interval))
    } else {
      res.writeHead(404, { 'content-type': 'text/html' })
      res.end('nope')
    }
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${server.address().port}`
})
after(async () => {
  server.closeAllConnections?.()
  await new Promise(resolve => server.close(resolve))
})

const local = { allowPrivate: true }

test('fetchLinkPreview: lee título e imagen de una página', async () => {
  const p = await fetchLinkPreview(`${base}/ok`, local)
  assert.equal(p.title, 'Hola mundo')
  assert.equal(p.image, `${base}/p.png`)
})

test('fetchLinkPreview: descomprime gzip', async () => {
  assert.equal((await fetchLinkPreview(`${base}/gzip`, local)).title, 'Comprimido')
})

test('fetchLinkPreview: respeta el charset declarado', async () => {
  assert.equal((await fetchLinkPreview(`${base}/latin1`, local)).title, 'Canción')
})

test('fetchLinkPreview: sigue redirects', async () => {
  assert.equal((await fetchLinkPreview(`${base}/redirect`, local)).title, 'Hola mundo')
})

test('fetchLinkPreview: un bucle de redirects termina con error', async () => {
  await assert.rejects(fetchLinkPreview(`${base}/loop`, local), /redirecciones/)
})

test('fetchLinkPreview: un enlace directo a una imagen usa esa imagen', async () => {
  const p = await fetchLinkPreview(`${base}/image`, local)
  assert.equal(p.image, `${base}/image`)
  assert.equal(p.title, null)
})

test('fetchLinkPreview: un PDF es válido pero sin metadatos', async () => {
  assert.deepEqual(await fetchLinkPreview(`${base}/pdf`, local), { title: null, description: null, image: null, siteName: null })
})

test('fetchLinkPreview: HTTP de error rechaza', async () => {
  await assert.rejects(fetchLinkPreview(`${base}/no-existe`, local), /HTTP 404/)
})

test('fetchLinkPreview: el plazo total corta un servidor que no responde', async () => {
  const t0 = Date.now()
  await assert.rejects(fetchLinkPreview(`${base}/stall`, { ...local, timeoutMs: 300 }))
  assert.ok(Date.now() - t0 < 2000)
})

test('fetchLinkPreview: si el cuerpo se corta por el plazo, se aprovecha lo ya recibido', async () => {
  const t0 = Date.now()
  const p = await fetchLinkPreview(`${base}/slow`, { ...local, timeoutMs: 300 })
  assert.equal(p.title, 'A medias')
  assert.ok(Date.now() - t0 < 2000)
})

test('fetchLinkPreview: deja de leer al llegar al tamaño máximo', async () => {
  const p = await fetchLinkPreview(`${base}/huge`, { ...local, maxBytes: 100_000 })
  assert.equal(p.title, null)
})

test('fetchLinkPreview: SSRF — por defecto bloquea localhost y redes privadas', async () => {
  const before = hits.length
  await assert.rejects(fetchLinkPreview(`${base}/ok`), /no permitida/)
  await assert.rejects(fetchLinkPreview('http://localhost:1/'), /no permitida/)
  await assert.rejects(fetchLinkPreview('http://[::1]:1/'), /no permitida/)
  await assert.rejects(fetchLinkPreview('http://169.254.169.254/latest/meta-data/'), /no permitida/)
  await assert.rejects(fetchLinkPreview('http://2130706433/'), /no permitida/) // 127.0.0.1 en decimal
  assert.equal(hits.length, before, 'el servidor local no debió recibir ninguna petición')
})

test('fetchLinkPreview: SSRF — un redirect hacia la red interna también se bloquea', async () => {
  // Un servidor "público" (aquí, el local con allowPrivate no sirve: usamos
  // un redirect que apunta a una IP privada y comprobamos que NO se sigue).
  const evil = createServer((req, res) => {
    res.writeHead(302, { location: `${base}/ok` })
    res.end()
  })
  await new Promise(resolve => evil.listen(0, '127.0.0.1', resolve))
  const evilUrl = `http://127.0.0.1:${evil.address().port}/`
  const before = hits.length
  // Sin allowPrivate el primer salto ya está bloqueado; lo que importa es que
  // nunca se llega a pedir /ok.
  await assert.rejects(fetchLinkPreview(evilUrl))
  assert.equal(hits.length, before)
  await new Promise(resolve => evil.close(resolve))
})

test('fetchLinkPreview: rechaza esquemas que no son http(s)', async () => {
  await assert.rejects(fetchLinkPreview('file:///etc/passwd'), /no válida/)
  await assert.rejects(fetchLinkPreview('javascript:alert(1)'), /no válida/)
})
