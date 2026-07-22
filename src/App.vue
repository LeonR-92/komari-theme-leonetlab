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
// Bump this key only when a release intentionally needs to present the intro
// again. The value still keeps the animation to once per browser session.
const INTRO_SESSION_KEY = 'leonetlab:intro:1.2.1'
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
appStore.introActive = introWillPlay
const showLaunch = ref(introWillPlay)
const introComplete = ref(!introWillPlay)
const appShellMounted = ref(!introWillPlay)
const ambientAnimationReady = ref(!introWillPlay)
const introRevealActive = ref(false)
const introFinishing = ref(false)
const loadingCoverRef = ref<InstanceType<typeof LoadingCover> | null>(null)
const launchStartedAt = performance.now()
const launchMinimumMs = introWillPlay ? 3200 : 0
let introFinalizeTimer: ReturnType<typeof window.setTimeout> | null = null
let introRevealTimer: ReturnType<typeof window.setTimeout> | null = null
let ambientStartTimer: ReturnType<typeof window.setTimeout> | null = null
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
    const preloadHomeVisuals = introWillPlay
      ? Promise.allSettled([
          import('@/views/HomeView.vue'),
          import('@/components/NodeCard.vue'),
          import('@/components/NodeGeneralCards.vue'),
        ])
      : Promise.resolve()
    await Promise.all([initApp(), preloadHomeVisuals])
    await nextTick()
    isReady.value = true
    // Mount the real dashboard underneath the intro once data is ready. This
    // lets the intro globe hand off to an already-rendered dashboard globe.
    if (introWillPlay)
      appShellMounted.value = true
  }
  catch (error) {
    console.error('[App] Initialization failed:', error)
    isReady.value = true
  }
  finally {
    await wait(Math.max(0, launchMinimumMs - (performance.now() - launchStartedAt)))
    if (introWillPlay)
      await finishIntro()
  }
})

async function finishIntro() {
  if (!introWillPlay || !showLaunch.value || introFinishing.value)
    return
  introFinishing.value = true
  appShellMounted.value = true
  await nextTick()
  loadingCoverRef.value?.prepareHandoff()
  await new Promise<void>(resolve => window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve())))
  showLaunch.value = false
  if (introFinalizeTimer !== null)
    window.clearTimeout(introFinalizeTimer)
  introFinalizeTimer = window.setTimeout(handleIntroAfterLeave, 980)
  try {
    sessionStorage.setItem(INTRO_SESSION_KEY, 'seen')
  }
  catch {
    // Storage can be unavailable in strict privacy modes.
  }
}

function handleIntroAfterLeave() {
  if (introComplete.value)
    return
  if (introFinalizeTimer !== null) {
    window.clearTimeout(introFinalizeTimer)
    introFinalizeTimer = null
  }
  introComplete.value = true
  appStore.introActive = false
  appShellMounted.value = true
  introRevealActive.value = true
  introFinishing.value = false
  introRevealTimer = window.setTimeout(() => {
    introRevealActive.value = false
  }, 1500)
  ambientStartTimer = window.setTimeout(() => {
    window.requestAnimationFrame(() => {
      ambientAnimationReady.value = true
    })
  }, 260)
}

onUnmounted(() => {
  appStore.introActive = false
  if (introFinalizeTimer !== null)
    window.clearTimeout(introFinalizeTimer)
  if (introRevealTimer !== null)
    window.clearTimeout(introRevealTimer)
  if (ambientStartTimer !== null)
    window.clearTimeout(ambientStartTimer)
  destroyInitManager()
})
</script>

<template>
  <Provider>
    <Background v-if="appShellMounted" :paused="!ambientAnimationReady" />
    <Transition name="lnl-intro-exit" @after-leave="handleIntroAfterLeave">
      <LoadingCover v-if="showLaunch" ref="loadingCoverRef" @skip="finishIntro" />
    </Transition>
    <Header v-if="appShellMounted" :class="{ 'lnl-reveal-header': introRevealActive, 'lnl-header-staged': showLaunch }" />
    <main v-if="appShellMounted && !appStore.loading" class="flex-1">
      <div class="lnl-shell max-w-[1680px] mx-auto" :class="{ 'lnl-intro-reveal': introRevealActive, 'lnl-intro-staged': showLaunch }">
        <RouterView v-slot="{ Component }">
          <Transition v-bind="pageTransitionProps">
            <KeepAlive :include="['HomeView']">
              <component :is="Component" />
            </KeepAlive>
          </Transition>
        </RouterView>
      </div>
    </main>
    <Footer v-if="appShellMounted && !appStore.loading" :intro-complete="introComplete" :present-visitor="introWillPlay" />
    <Toaster rich-colors close-button position="top-center" />
  </Provider>
</template>
