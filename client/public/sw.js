// Actualización controlada: un SW nuevo se queda en "waiting" hasta que el
// cliente manda 'skip-waiting' (tras confirmar el usuario). Ver client/src/pwa.ts.
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))
self.addEventListener('fetch', () => { return }) // passthrough, no interfiere con Socket.io
self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting()
})

self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {}
  event.waitUntil(
    self.registration.showNotification(data.title || 'Recordatorio', {
      body: data.body || '',
      tag: data.eventId,
      data: { url: data.url || '/' }
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      const open = wins.find((w) => 'focus' in w)
      return open ? open.focus() : clients.openWindow(url)
    })
  )
})
