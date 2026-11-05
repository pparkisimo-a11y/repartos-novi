/**
 * Service worker de Repartos NOVI.
 * - Instalable como app (PWA) en iPhone y Android.
 * - Recursos estáticos: caché primero (carga instantánea).
 * - Navegación: red primero con respaldo offline (útil cuando Render está
 *   despertando de la pausa del plan free).
 * - API y socket.io: siempre red, nunca en caché.
 * - Notificaciones push (Web Push): en iOS solo funcionan si las muestra el
 *   service worker — nunca desde la página. Aquí es donde se ven los avisos
 *   con la app cerrada.
 *
 * Subir la versión en CACHE_NAME para invalidar la caché al desplegar cambios.
 */
const CACHE_NAME = 'novi-v2'

const PRECACHE = [
  '/',
  '/manifest.webmanifest',
  '/logo-novi.png',
  '/favicon-32.png',
  '/icons/apple-touch-icon.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  // Datos en tiempo real y API: siempre red
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/socket.io')) return

  // Recursos estáticos con hash / marca: caché primero
  const isStaticAsset =
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname.startsWith('/splash/') ||
    url.pathname === '/logo-novi.png' ||
    url.pathname === '/logo-rider.png' ||
    url.pathname === '/favicon-32.png' ||
    url.pathname === '/manifest.webmanifest'

  if (isStaticAsset) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            const copy = res.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy))
            return res
          }),
      ),
    )
    return
  }

  // Navegación y demás: red primero, caché como respaldo offline
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok) {
          const copy = res.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy))
        }
        return res
      })
      .catch(() =>
        caches.match(req).then((hit) => hit || caches.match('/')),
      ),
  )
})

// --- Notificaciones push (Web Push) ---
// En iPhone las notificaciones de una PWA SOLO se pueden mostrar desde aquí
// (service worker), y llegan incluso con la app cerrada del todo.
self.addEventListener('push', (event) => {
  let data = null
  try {
    data = event.data ? event.data.json() : null
  } catch (e) {
    data = null
  }

  const title = (data && data.title) || 'Repartos NOVI'
  const body = (data && data.body) || ''
  const tag = (data && data.tag) || 'novi'
  const url = (data && data.url) || '/'

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag,
      // Con el mismo tag, un aviso nuevo sustituye al anterior (sin pila)
      renotify: true,
      icon: '/icons/icon-192.png',
      badge: '/favicon-32.png',
      data: { url },
    }),
  )
})

// Al tocar la notificación: enfocar la app abierta (o abrirla)
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ('focus' in client) {
            return client.navigate(url).then(() => client.focus())
          }
        }
        return self.clients.openWindow(url)
      }),
  )
})
