// Komari serves whichever theme is active from the origin root. A theme-owned
// offline shell would therefore outlive theme switches and compete with the
// official default theme's root-scoped PWA worker. Keep this worker deliberately
// network-only: it preserves installability while retiring legacy theme caches.
const LEGACY_THEME_CACHE_PREFIXES = ['komari-observatory-', 'leonetlab-observatory-']

globalThis.addEventListener('install', (event) => {
  event.waitUntil(globalThis.skipWaiting())
})

globalThis.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys
        .filter(key => LEGACY_THEME_CACHE_PREFIXES.some(prefix => key.startsWith(prefix)))
        .map(key => caches.delete(key))))
      .then(() => globalThis.clients.claim()),
  )
})

globalThis.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET' || request.mode !== 'navigate')
    return
  const url = new URL(request.url)
  if (url.origin !== globalThis.location.origin)
    return
  event.respondWith(fetch(request))
})
