const CACHE_NAME = 'leonetlab-observatory-v1.2.1'
const OFFLINE_URL = '/offline.html'
const CORE_ASSETS = [
  OFFLINE_URL,
  '/manifest.webmanifest',
  '/icons/pwa-192.png',
  '/icons/pwa-512.png',
  '/favicon.ico',
]

globalThis.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(CORE_ASSETS))
      .then(() => globalThis.skipWaiting()),
  )
})

globalThis.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys
        .filter(key => key.startsWith('leonetlab-observatory-') && key !== CACHE_NAME)
        .map(key => caches.delete(key))))
      .then(() => globalThis.clients.claim()),
  )
})

function isThemeAsset(url) {
  return url.pathname.startsWith('/assets/')
    || url.pathname.startsWith('/images/')
    || url.pathname.startsWith('/icons/')
    || url.pathname === '/manifest.webmanifest'
    || url.pathname === '/favicon.ico'
}

globalThis.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET')
    return

  const url = new URL(request.url)
  if (url.origin !== globalThis.location.origin)
    return

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)))
    return
  }

  if (!isThemeAsset(url))
    return

  event.respondWith(
    caches.match(request).then((cached) => {
      const refreshed = fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone()
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy))
        }
        return response
      }).catch(() => cached)
      return cached || refreshed
    }),
  )
})
