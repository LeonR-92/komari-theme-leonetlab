import { computed, readonly, ref } from 'vue'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed', platform: string }>
}

const deferredPrompt = ref<BeforeInstallPromptEvent | null>(null)
const installed = ref(false)
const initialized = ref(false)
const IOS_DEVICE_PATTERN = /iPad|iPhone|iPod/i

function detectStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches
    || ('standalone' in navigator && (navigator as Navigator & { standalone?: boolean }).standalone === true)
}

function detectIos(): boolean {
  const platform = navigator.userAgent || navigator.platform
  return IOS_DEVICE_PATTERN.test(platform)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

function initializePwaInstall() {
  if (initialized.value)
    return
  initialized.value = true
  installed.value = detectStandalone()

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    deferredPrompt.value = event as BeforeInstallPromptEvent
  })
  window.addEventListener('appinstalled', () => {
    installed.value = true
    deferredPrompt.value = null
  })
}

initializePwaInstall()

export function usePwaInstall() {
  const isIos = computed(detectIos)
  const canPromptInstall = computed(() => !installed.value && deferredPrompt.value !== null)
  const showIosInstructions = computed(() => !installed.value && isIos.value && deferredPrompt.value === null)
  const installAvailable = computed(() => canPromptInstall.value || showIosInstructions.value)

  async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
    const promptEvent = deferredPrompt.value
    if (!promptEvent)
      return 'unavailable'
    await promptEvent.prompt()
    const choice = await promptEvent.userChoice
    if (choice.outcome === 'accepted') {
      deferredPrompt.value = null
      installed.value = true
    }
    return choice.outcome
  }

  return {
    installed: readonly(installed),
    canPromptInstall,
    showIosInstructions,
    installAvailable,
    promptInstall,
  }
}
