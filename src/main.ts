import { createPinia } from 'pinia'
import { createApp } from 'vue'
import { setupIconify } from '@/utils/iconify'
import { message } from '@/utils/message'
import App from './App.vue'
import router from './router'

import './styles/main.css'

window.$message = message

try {
  setupIconify()
}
catch (err) {
  console.warn('[main] iconify init failed', err)
}

const pinia = createPinia()
const app = createApp(App)

app.use(pinia)
app.use(router)

app.mount('#app')
void router.isReady()
  .catch(() => {
    // The fallback has already been replaced; keep cache recovery state bounded.
  })
  .then(() => window.dispatchEvent(new CustomEvent('komari-observatory:app-mounted')))

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', {
      scope: '/',
      updateViaCache: 'none',
    }).catch(() => {
      // PWA support is progressive; monitoring remains usable if registration is blocked.
    })
  }, { once: true })
}
