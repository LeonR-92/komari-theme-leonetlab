const THEME_CACHE_PREFIX = 'leonetlab-observatory-'

export type ThemeCacheRefreshPhase = 'checking' | 'clearing'

async function deleteThemeCaches(): Promise<void> {
  if (!('caches' in window))
    return
  const keys = await caches.keys()
  await Promise.all(keys
    .filter(key => key.startsWith(THEME_CACHE_PREFIX))
    .map(key => caches.delete(key)))
}

async function requestWorkerCacheClear(worker: ServiceWorker | null): Promise<void> {
  if (!worker)
    return

  await new Promise<void>((resolve) => {
    const channel = new MessageChannel()
    const timeout = window.setTimeout(resolve, 800)
    channel.port1.onmessage = () => {
      window.clearTimeout(timeout)
      resolve()
    }
    worker.postMessage({ type: 'CLEAR_THEME_CACHE' }, [channel.port2])
  })
}

export async function refreshThemeCache(onPhase?: (phase: ThemeCacheRefreshPhase) => void): Promise<void> {
  onPhase?.('checking')
  if (!('serviceWorker' in navigator)) {
    onPhase?.('clearing')
    await deleteThemeCaches()
    return
  }

  // Prevent main.ts from racing this explicit refresh with its own automatic
  // controllerchange reload. The next build uses a different versioned key.
  try {
    sessionStorage.setItem(`leonetlab:sw-reload:${__BUILD_VERSION__}`, 'done')
  }
  catch {
    // Session storage can be unavailable in strict privacy modes.
  }

  const registration = await navigator.serviceWorker.getRegistration()
  await registration?.update()
  const worker = registration?.waiting
    ?? registration?.active
    ?? navigator.serviceWorker.controller
  onPhase?.('clearing')
  await requestWorkerCacheClear(worker)
  await deleteThemeCaches()
}
