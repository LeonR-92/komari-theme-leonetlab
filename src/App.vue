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
// 1.2.6 重做了首访交接的朝向连续性，老用户应看到新 intro。
const INTRO_SESSION_KEY = 'leonetlab:intro:1.2.6'
const INTRO_HANDOFF_DURATION_MS = 1080
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
const introLeaving = ref(false)
const loadingCoverRef = ref<InstanceType<typeof LoadingCover> | null>(null)
const launchStartedAt = performance.now()
const launchMinimumMs = introWillPlay ? 4200 : 0
let introFinalizeTimer: ReturnType<typeof window.setTimeout> | null = null
let introRevealTimer: ReturnType<typeof window.setTimeout> | null = null
let ambientStartTimer: ReturnType<typeof window.setTimeout> | null = null
let handoffResizeRaf = 0
const wait = (duration: number) => new Promise(resolve => window.setTimeout(resolve, duration))

// 交接飞行期间窗口尺寸变化时按 rAF 节流重新测量目标位置，
// 让 FLIP 终点跟随最新布局而不是失准到旧矩形。
function handleHandoffResize() {
  if (handoffResizeRaf)
    return
  handoffResizeRaf = window.requestAnimationFrame(() => {
    handoffResizeRaf = 0
    loadingCoverRef.value?.remeasureHandoff()
  })
}

function stopHandoffResizeWatch() {
  window.removeEventListener('resize', handleHandoffResize)
  if (handoffResizeRaf) {
    window.cancelAnimationFrame(handoffResizeRaf)
    handoffResizeRaf = 0
  }
}
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
  // 手动切换 leave 类而不是 v-if + <Transition>：Vue 的 Transition 会在
  // leave 开始时立即销毁组件实例（仅延迟移除 DOM），cobe 地球随之冻结。
  // 保持组件存活可让地球在飞行期间继续旋转，交接全程相位连续。
  introLeaving.value = true
  window.addEventListener('resize', handleHandoffResize)
  if (introFinalizeTimer !== null)
    window.clearTimeout(introFinalizeTimer)
  introFinalizeTimer = window.setTimeout(handleIntroAfterLeave, INTRO_HANDOFF_DURATION_MS + 120)
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
  stopHandoffResizeWatch()
  if (introFinalizeTimer !== null) {
    window.clearTimeout(introFinalizeTimer)
    introFinalizeTimer = null
  }
  introComplete.value = true
  appStore.introActive = false
  appShellMounted.value = true
  introRevealActive.value = true
  introFinishing.value = false
  // 交接飞行结束后再卸载封面，intro 地球仪实例在此之前一直保持旋转。
  showLaunch.value = false
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
  stopHandoffResizeWatch()
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
    <LoadingCover
      v-if="showLaunch" ref="loadingCoverRef"
      :class="introLeaving ? 'lnl-intro-exit-leave-active lnl-intro-exit-leave-to' : ''"
      @skip="finishIntro"
    />
    <Header v-if="appShellMounted" :class="{ 'lnl-reveal-header': introRevealActive, 'lnl-header-staged': !introComplete }" />
    <main v-if="appShellMounted && !appStore.loading" class="flex-1">
      <div class="lnl-shell max-w-[1680px] mx-auto" :class="{ 'lnl-intro-reveal': introRevealActive, 'lnl-intro-staged': !introComplete }">
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
