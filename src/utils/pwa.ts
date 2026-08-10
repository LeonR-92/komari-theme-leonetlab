const THEME_CACHE_PREFIXES = ['komari-observatory-', 'leonetlab-observatory-'] as const

export type ThemeCacheRefreshPhase = 'checking' | 'clearing'

async function deleteThemeCaches(): Promise<void> {
  if (!('caches' in window))
    return
  const keys = await caches.keys()
  await Promise.all(keys
    .filter(key => THEME_CACHE_PREFIXES.some(prefix => key.startsWith(prefix)))
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

async function activateWaitingWorker(registration: ServiceWorkerRegistration): Promise<void> {
  const waiting = registration.waiting
  if (!waiting)
    return

  await new Promise<void>((resolve) => {
    const timeout = window.setTimeout(resolve, 2400)
    const handleControllerChange = () => {
      window.clearTimeout(timeout)
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange)
      resolve()
    }
    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange)
    waiting.postMessage({ type: 'SKIP_WAITING' })
  })
}

export async function refreshThemeCache(onPhase?: (phase: ThemeCacheRefreshPhase) => void): Promise<void> {
  onPhase?.('checking')
  if (!('serviceWorker' in navigator)) {
    onPhase?.('clearing')
    await deleteThemeCaches()
    return
  }

  const registration = await navigator.serviceWorker.getRegistration()
  await registration?.update()
  if (registration)
    await activateWaitingWorker(registration)
  const worker = registration?.active
    ?? navigator.serviceWorker.controller
  onPhase?.('clearing')
  await requestWorkerCacheClear(worker)
  await deleteThemeCaches()
}
