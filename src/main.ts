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
    const hadController = Boolean(navigator.serviceWorker.controller)
    let reloadingForUpdate = false

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || reloadingForUpdate)
        return

      const reloadKey = `leonetlab:sw-reload:${__BUILD_VERSION__}`
      if (sessionStorage.getItem(reloadKey) === 'done')
        return

      // Do not interrupt the first-visit handoff with a second full page load.
      // The new worker already controls the next natural navigation/reload.
      if (document.querySelector('.lnl-intro')) {
        sessionStorage.setItem(reloadKey, 'done')
        return
      }

      reloadingForUpdate = true
      sessionStorage.setItem(reloadKey, 'done')
      location.reload()
    })

    navigator.serviceWorker.register('/sw.js', {
      scope: '/',
      updateViaCache: 'none',
    }).then(registration => registration.update()).catch(() => {
      // PWA support is progressive; monitoring remains usable if registration is blocked.
    })
  }, { once: true })
}
