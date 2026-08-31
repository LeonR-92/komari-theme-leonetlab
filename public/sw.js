// Migration-only worker for installations that were previously controlled by
// a Komari Observatory service worker. New theme pages no longer register a
// worker: the manifest keeps the app installable without competing for Komari's
// root scope. Existing clients stay on one controller until they close; only
// then does this worker activate, remove theme-owned legacy caches and retire.
const LEGACY_THEME_CACHE_PREFIXES = ['komari-observatory-', 'leonetlab-observatory-']

globalThis.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys
        .filter(key => LEGACY_THEME_CACHE_PREFIXES.some(prefix => key.startsWith(prefix)))
        .map(key => caches.delete(key))))
      .then(() => globalThis.registration.unregister()),
  )
})
