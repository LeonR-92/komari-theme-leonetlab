const CACHE_NAME = 'leonetlab-observatory-v1.4.2'
const OFFLINE_URL = '/offline.html'
const PRECACHE_ASSETS = /* __LNL_PRECACHE_ASSETS__ */ []
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
      }),
  )
})

globalThis.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      globalThis.registration.navigationPreload?.enable(),
      globalThis.clients.claim(),
    ]),
  )
})

globalThis.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    event.waitUntil(globalThis.skipWaiting())
    return
  }

  if (event.data?.type === 'WARM_THEME_ASSETS') {
    event.waitUntil(
      caches.open(CACHE_NAME)
        .then(cache => Promise.allSettled(PRECACHE_ASSETS.map(asset => cache.add(asset)))),
    )
    return
  }

  if (event.data?.type !== 'CLEAR_THEME_CACHE')
    return

  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys
        .filter(key => key.startsWith('leonetlab-observatory-'))
        .map(key => caches.delete(key))))
      .then(async () => {
        const cache = await caches.open(CACHE_NAME)
        await cache.add(OFFLINE_URL)
        await Promise.allSettled(CORE_ASSETS.slice(1).map(asset => cache.add(asset)))
        event.ports[0]?.postMessage({ ok: true })
      }),
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
  const response = await fetchWithTimeout(request, 10000)
  if (isCacheable(response)) {
    const cache = await caches.open(CACHE_NAME)
    await cache.put(request, response.clone())
  }
  return response
}

async function networkFirst(request) {
  try {
    const response = await fetchWithTimeout(request, 8000)
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

function fetchWithTimeout(request, timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  return fetch(request, { signal: controller.signal })
    .finally(() => clearTimeout(timer))
}

function promiseWithTimeout(promise, timeoutMs) {
  let timer
  const result = Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('Request timed out')), timeoutMs)
    }),
  ])
  return result.finally(() => clearTimeout(timer))
}

globalThis.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET')
    return

  const url = new URL(request.url)
  if (url.origin !== globalThis.location.origin)
    return

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const preloaded = await promiseWithTimeout(event.preloadResponse, 3500)
        return preloaded || await fetchWithTimeout(request, 8000)
      }
      catch {
        try {
          return await fetchWithTimeout(request, 4500)
        }
        catch {
          return (await caches.match(OFFLINE_URL)) || Response.error()
        }
      }
    })())
    return
  }

  if (isHashedThemeAsset(url)) {
    event.respondWith(cacheFirst(request))
    return
  }

  if (isMutableThemeAsset(url))
    event.respondWith(networkFirst(request))
})
