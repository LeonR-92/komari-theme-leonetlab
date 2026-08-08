import { createPinia } from 'pinia'
import { createApp } from 'vue'
import { setupIconify } from '@/utils/iconify'
import { message } from '@/utils/message'
import App from './App.vue'
import router from './router'

import './styles/main.css'

window.$message = message

setupIconify().catch((err) => {
  console.warn('[main] iconify init failed', err)
})

const pinia = createPinia()
const app = createApp(App)

app.use(pinia)
app.use(router)

app.mount('#app')

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', {
      scope: '/',
      updateViaCache: 'none',
    }).then((registration) => {
      const announceReadyWorker = () => {
        const worker = registration.installing
        if (!worker)
          return
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller)
            window.dispatchEvent(new CustomEvent('leonetlab:pwa-update-ready'))
        })
      }
      registration.addEventListener('updatefound', announceReadyWorker)
      if (registration.waiting && navigator.serviceWorker.controller)
        window.dispatchEvent(new CustomEvent('leonetlab:pwa-update-ready'))

      const idle = window.requestIdleCallback
        ? (callback: () => void) => window.requestIdleCallback(callback, { timeout: 8000 })
        : (callback: () => void) => window.setTimeout(callback, 4000)
      idle(() => {
        registration.active?.postMessage({ type: 'WARM_THEME_ASSETS' })
        const key = 'leonetlab:pwa:last-update-check'
        const lastCheck = Number(localStorage.getItem(key) || 0)
        if (Date.now() - lastCheck < 6 * 60 * 60 * 1000)
          return
        localStorage.setItem(key, String(Date.now()))
        void registration.update()
      })
    }).catch(() => {
      // PWA support is progressive; monitoring remains usable if registration is blocked.
    })
  }, { once: true })
}
