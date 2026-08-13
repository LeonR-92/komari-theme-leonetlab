const CACHE_NAME = 'komari-observatory-v1.4.3'
const THEME_CACHE_PREFIXES = ['komari-observatory-', 'leonetlab-observatory-']
const SCRIPT_ASSET_PATTERN = /\.m?js$/
const STYLE_ASSET_PATTERN = /\.css$/
const SCRIPT_CONTENT_TYPE_PATTERN = /javascript|ecmascript/
const OFFLINE_URL = '/offline.html'
const PRECACHE_ASSETS = /* __LNL_PRECACHE_ASSETS__ */ []
const CORE_ASSETS = [
  OFFLINE_URL,
  '/manifest.webmanifest',
  '/icons/pwa-44.png',
  '/icons/pwa-55.png',
  '/icons/pwa-66.png',
  '/icons/pwa-88.png',
  '/icons/pwa-176.png',
  '/icons/pwa-192.png',
  '/icons/pwa-256.png',
  '/icons/pwa-512.png',
  '/icons/pwa-maskable-192.png',
  '/icons/pwa-maskable-512.png',
  '/favicon.ico',
]

globalThis.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(async (cache) => {
        await cache.add(OFFLINE_URL)
        await Promise.allSettled(CORE_ASSETS.slice(1).map(asset => cacheThemeAsset(cache, asset)))
      }),
  )
})

globalThis.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys
        .filter(key => THEME_CACHE_PREFIXES.some(prefix => key.startsWith(prefix)) && key !== CACHE_NAME)
        .map(key => caches.delete(key))))
      .then(() => Promise.all([
        globalThis.registration.navigationPreload?.enable(),
        globalThis.clients.claim(),
      ])),
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
        .then(cache => Promise.allSettled(PRECACHE_ASSETS.map(asset => cacheThemeAsset(cache, asset)))),
    )
    return
  }

  if (event.data?.type !== 'CLEAR_THEME_CACHE')
    return

  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys
        .filter(key => THEME_CACHE_PREFIXES.some(prefix => key.startsWith(prefix)))
        .map(key => caches.delete(key))))
      .then(async () => {
        const cache = await caches.open(CACHE_NAME)
        await cache.add(OFFLINE_URL)
        await Promise.allSettled(CORE_ASSETS.slice(1).map(asset => cacheThemeAsset(cache, asset)))
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

function hasExpectedContentType(request, response) {
  const contentType = (response.headers.get('content-type') || '').toLowerCase()
  const pathname = new URL(request.url, globalThis.location.origin).pathname
  const isScript = request.destination === 'script' || SCRIPT_ASSET_PATTERN.test(pathname)
  const isStyle = request.destination === 'style' || STYLE_ASSET_PATTERN.test(pathname)
  if (isScript)
    return SCRIPT_CONTENT_TYPE_PATTERN.test(contentType)
  if (isStyle)
    return contentType.includes('text/css')
  return true
}

function isCacheable(request, response) {
  return response.ok && response.type === 'basic' && hasExpectedContentType(request, response)
}

async function cacheThemeAsset(cache, asset) {
  const request = new Request(asset, { cache: 'no-store' })
  const response = await fetchWithTimeout(request, 10000, { cache: 'no-store' })
  if (!isCacheable(request, response))
    throw new Error(`Unexpected theme asset response: ${new URL(request.url).pathname}`)
  await cache.put(request, response)
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME)
  const cached = await cache.match(request)
  if (cached && hasExpectedContentType(request, cached))
    return cached
  if (cached)
    await cache.delete(request)
  const response = await fetchWithTimeout(request, 10000, { cache: 'no-store' })
  if (!hasExpectedContentType(request, response))
    throw new Error(`Unexpected theme asset response: ${new URL(request.url).pathname}`)
  if (isCacheable(request, response))
    await cache.put(request, response.clone())
  return response
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME)
  try {
    const response = await fetchWithTimeout(request, 8000, { cache: 'no-store' })
    if (isCacheable(request, response))
      await cache.put(request, response.clone())
    return response
  }
  catch (error) {
    const cached = await cache.match(request)
    if (cached)
      return cached
    throw error
  }
}

function fetchWithTimeout(request, timeoutMs, init = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  return fetch(request, { ...init, signal: controller.signal })
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
        return preloaded || await fetchWithTimeout(request, 8000, { cache: 'no-store' })
      }
      catch {
        try {
          return await fetchWithTimeout(request, 4500, { cache: 'no-store' })
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
