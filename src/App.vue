<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { Toaster } from '@/components/ui/sonner'
import { useAppStore } from '@/stores/app'
import { destroyInitManager, initApp } from '@/utils/init'
import Background from './components/Background.vue'
import Footer from './components/Footer.vue'
import Header from './components/Header.vue'
import LoadingCover from './components/LoadingCover.vue'
import Provider from './components/Provider.vue'

const appStore = useAppStore()

const isReady = ref(false)
const INTRO_SESSION_KEY = 'leonetlab:intro:1.1.3'
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
function shouldPlayIntro(): boolean {
  if (reducedMotion)
    return false
  try {
    return sessionStorage.getItem(INTRO_SESSION_KEY) !== 'seen'
  }
  catch {
    return true
  }
}

const introWillPlay = shouldPlayIntro()
const showLaunch = ref(introWillPlay)
const introComplete = ref(!introWillPlay)
const launchStartedAt = performance.now()
const launchMinimumMs = introWillPlay ? 3100 : 0
const wait = (duration: number) => new Promise(resolve => window.setTimeout(resolve, duration))
const pageTransitionProps = computed(() => appStore.disablePageAnimation
  ? { css: false as const }
  : {
      enterActiveClass: 'lnl-page-enter-active',
      enterFromClass: 'lnl-page-enter-from',
      enterToClass: 'lnl-page-enter-to',
      leaveActiveClass: 'lnl-page-leave-active',
      leaveFromClass: 'lnl-page-leave-from',
      leaveToClass: 'lnl-page-leave-to',
      mode: 'out-in' as const,
    })

onMounted(async () => {
  try {
    await initApp()
    await nextTick()
    isReady.value = true
  }
  catch (error) {
    console.error('[App] Initialization failed:', error)
    isReady.value = true
  }
  finally {
    await wait(Math.max(0, launchMinimumMs - (performance.now() - launchStartedAt)))
    finishIntro()
  }
})

function finishIntro() {
  showLaunch.value = false
  introComplete.value = true
  try {
    sessionStorage.setItem(INTRO_SESSION_KEY, 'seen')
  }
  catch {
    // Storage can be unavailable in strict privacy modes.
  }
}

onUnmounted(() => {
  destroyInitManager()
})
</script>

<template>
  <Provider>
    <Background :paused="showLaunch" />
    <Transition name="lnl-intro-exit">
      <LoadingCover v-if="showLaunch" @skip="finishIntro" />
    </Transition>
    <Header />
    <main v-if="!appStore.loading" class="flex-1">
      <div class="lnl-shell max-w-[1680px] mx-auto">
        <RouterView v-slot="{ Component }">
          <Transition v-bind="pageTransitionProps">
            <KeepAlive :include="['HomeView']">
              <component :is="Component" />
            </KeepAlive>
          </Transition>
        </RouterView>
      </div>
    </main>
    <Footer v-if="!appStore.loading" :intro-complete="introComplete" :present-visitor="introWillPlay" />
    <Toaster rich-colors close-button position="top-center" />
  </Provider>
</template>
