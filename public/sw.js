const CACHE_NAME = 'leonetlab-observatory-v1.2.6'
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
      .then(async (cache) => {
        await cache.add(OFFLINE_URL)
        await Promise.allSettled(CORE_ASSETS.slice(1).map(asset => cache.add(asset)))
      })
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

function isHashedThemeAsset(url) {
  return url.pathname.startsWith('/assets/')
    || url.pathname.startsWith('/images/')
    || url.pathname.startsWith('/icons/')
}

function isMutableThemeAsset(url) {
  return url.pathname === '/manifest.webmanifest'
    || url.pathname === '/favicon.ico'
}

function isCacheable(response) {
  return response.ok && response.type === 'basic'
}

async function cacheFirst(request) {
  const cached = await caches.match(request)
  if (cached)
    return cached
  const response = await fetch(request)
  if (isCacheable(response)) {
    const cache = await caches.open(CACHE_NAME)
    await cache.put(request, response.clone())
  }
  return response
}

async function networkFirst(request) {
  try {
    const response = await fetch(request)
    if (isCacheable(response)) {
      const cache = await caches.open(CACHE_NAME)
      await cache.put(request, response.clone())
    }
    return response
  }
  catch (error) {
    const cached = await caches.match(request)
    if (cached)
      return cached
    throw error
  }
}

globalThis.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET')
    return

  const url = new URL(request.url)
  if (url.origin !== globalThis.location.origin)
    return

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(async () => (await caches.match(OFFLINE_URL)) || Response.error()))
    return
  }

  if (isHashedThemeAsset(url)) {
    event.respondWith(cacheFirst(request))
    return
  }

  if (isMutableThemeAsset(url))
    event.respondWith(networkFirst(request))
})
