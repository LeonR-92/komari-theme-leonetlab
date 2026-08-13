<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import NodeEarthGlobe from '@/components/NodeEarthGlobe.vue'
import { Toaster } from '@/components/ui/sonner'
import { useMotionPreference } from '@/composables/useMotionPreference'
import { useAppStore } from '@/stores/app'
import { destroyInitManager, initApp } from '@/utils/init'
import Background from './components/Background.vue'
import Footer from './components/Footer.vue'
import Header from './components/Header.vue'
import LoadingCover from './components/LoadingCover.vue'
import Provider from './components/Provider.vue'

const appStore = useAppStore()
const route = useRoute()
const { motionReduced } = useMotionPreference()

// Bump this key only when a release intentionally needs to present the intro
// again. The value still keeps the animation to once per browser session.
// 1.2.8 重构为单 cobe 实例交接（Teleport 迁移同一 DOM，WebGL 上下文不重建），
// 让老用户重放重构后的 intro。
const INTRO_SESSION_KEY = `komari-observatory:intro:${__BUILD_VERSION__}`
// Public settings normally arrive immediately. A broken proxy or cold PWA must
// never leave #app empty for the API client's full timeout, so mount the safe
// default shell after a bounded decision window. Late settings still hydrate
// the dashboard, but cannot start an intro halfway through the user's session.
const INITIAL_SHELL_DECISION_TIMEOUT_MS = 450
// 飞行壳的 transform 过渡时长；交接收尾以 transitionend 为准，固定计时器只作
// 兜底：主线程长任务会推迟 CSS 过渡起点，按点击时刻计时会提前撤壳闪跳。
const INTRO_HANDOFF_DURATION_MS = 1080
const INTRO_HANDOFF_FALLBACK_MS = INTRO_HANDOFF_DURATION_MS + 900
// 无交接目标（非 earth 模式或槽位始终未挂载）时封面纯淡出的兜底时长。
const INTRO_FADE_FALLBACK_MS = 800
// 慢服务器上 dashboard 可能在数据就绪后才完成挂载：飞行前最多等目标槽位
// 1.5s，避免朝一个尚未挂载的目标交接（几何失准同样表现为闪跳）。
const INTRO_HANDOFF_TARGET_WAIT_MS = 1500
function shouldPlayIntro(): boolean {
  if (motionReduced.value)
    return false
  try {
    return sessionStorage.getItem(INTRO_SESSION_KEY) !== 'seen'
  }
  catch {
    return true
  }
}

const introSessionEligible = shouldPlayIntro()
appStore.introActive = false
type IntroPhase = 'idle' | 'cover' | 'finishing' | 'settled'
const introPhase = ref<IntroPhase>('idle')
const introWillPlay = computed(() => introPhase.value === 'cover' || introPhase.value === 'finishing')
const showLaunch = computed(() => introWillPlay.value)
const introComplete = computed(() => introPhase.value === 'settled')
const appShellMounted = ref(false)
const ambientAnimationReady = ref(false)
const introRevealActive = ref(false)
const introLeaving = computed(() => introPhase.value === 'finishing')
const introHandoffReady = ref(false)
let launchStartedAt = 0
const INTRO_VISUAL_DURATION_MS = 3150
let introFinalizeTimer: ReturnType<typeof window.setTimeout> | null = null
let introRevealTimer: ReturnType<typeof window.setTimeout> | null = null
let ambientStartTimer: ReturnType<typeof window.setTimeout> | null = null
let handoffResizeRaf = 0
let initialShellPromise: Promise<void> | null = null
let resolveInitialShellDecision: (() => void) | null = null
const initialShellDecision = new Promise<void>((resolve) => {
  resolveInitialShellDecision = resolve
})
const wait = (duration: number) => new Promise(resolve => window.setTimeout(resolve, duration))
const nextFrame = () => new Promise<void>(resolve => window.requestAnimationFrame(() => resolve()))

type DashboardPulseOrigin = 'landing' | 'route'
const dashboardPulseId = ref(0)
const dashboardPulseOrigin = ref<DashboardPulseOrigin>('landing')
let dashboardPulseScheduled = false
let dashboardPulseIssued = false

async function requestDashboardPulse(preferredOrigin: DashboardPulseOrigin) {
  if (dashboardPulseScheduled || motionReduced.value || !isEarthMode())
    return

  dashboardPulseScheduled = true
  const origin: DashboardPulseOrigin = dashboardPulseIssued ? preferredOrigin : 'landing'
  const deadline = performance.now() + 1600
  try {
    while (performance.now() < deadline) {
      await nextTick()
      const slot = document.querySelector<HTMLElement>('#lnl-globe-dashboard-slot')
      const canvas = slot?.querySelector<HTMLCanvasElement>('canvas')
      if (slot && canvas && slot.getBoundingClientRect().width > 0) {
        // Let COBE paint once at the dashboard geometry before the compositor-only
        // halo begins. This keeps the ripple visually attached to the landed globe.
        await nextFrame()
        dashboardPulseOrigin.value = origin
        dashboardPulseId.value += 1
        dashboardPulseIssued = true
        return
      }
      await nextFrame()
    }
  }
  finally {
    dashboardPulseScheduled = false
  }
}

// ---------------------------------------------------------------------------
// v1.2.8 单实例地球交接
// 全程只有一个 cobe 引擎（NodeEarthGlobe）。它的 DOM 由下方 Teleport 在三个
// 宿主之间迁移：intro 槽位（封面内）→ 飞行壳（fixed，transform 过渡）→
// dashboard 槽位（NodeGeneralCards 内）。Teleport 目标变化时 Vue 移动同一个
// DOM 子树，canvas 与 WebGL 上下文原样保留，相位、拖拽状态全程连续。
// ---------------------------------------------------------------------------
type GlobePhase = 'intro-stage' | 'flight' | 'slot' | 'none'
const globePhase = ref<GlobePhase>('none')
const globeTeleportTarget = computed(() => {
  switch (globePhase.value) {
    case 'intro-stage':
    case 'flight':
      return '#lnl-globe-flight-shell'
    default:
      return '#lnl-globe-dashboard-slot'
  }
})
const globeVariant = computed(() => globePhase.value === 'slot' ? 'dashboard' : 'intro')

interface FlightRect {
  top: number
  left: number
  width: number
  height: number
}
const flightShellVisible = ref(false)
const flightShellStyle = ref<Record<string, string>>({})
let flightSourceRect: FlightRect | null = null
let flightTargetRect: FlightRect | null = null

function isEarthMode(): boolean {
  return appStore.earthViewMode === 'earth' || appStore.earthViewMode === 'earth-stop'
}

function toFlightRect(rect: DOMRect): FlightRect {
  return { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
}

function measureGlobeRects(): { source: FlightRect, target: FlightRect } | null {
  const sourceEl = document.querySelector('.lnl-intro-globe')
  const targetEl = document.querySelector('#lnl-globe-dashboard-slot')
  if (!sourceEl || !targetEl)
    return null
  const source = sourceEl.getBoundingClientRect()
  const target = targetEl.getBoundingClientRect()
  if (source.width <= 0 || target.width <= 0)
    return null
  return { source: toFlightRect(source), target: toFlightRect(target) }
}

async function mountIntroGlobeStage(): Promise<boolean> {
  const deadline = performance.now() + 800
  let source: DOMRect | null = null
  while (!source && performance.now() < deadline) {
    const sourceEl = document.querySelector('.lnl-intro-globe')
    const candidate = sourceEl?.getBoundingClientRect()
    if (candidate && candidate.width > 0 && candidate.height > 0) {
      source = candidate
      break
    }
    await nextFrame()
  }
  if (!source)
    return false

  flightSourceRect = toFlightRect(source)
  flightShellStyle.value = {
    top: `${source.top}px`,
    left: `${source.left}px`,
    width: `${source.width}px`,
    height: `${source.height}px`,
    transform: 'none',
  }
  flightShellVisible.value = true
  await nextTick()
  globePhase.value = 'intro-stage'
  await nextTick()
  window.addEventListener('resize', handleHandoffResize)
  return true
}

function flightTransform(source: FlightRect, target: FlightRect): string {
  const dx = target.left - source.left
  const dy = target.top - source.top
  const scale = target.width / source.width
  return `translate3d(${dx}px, ${dy}px, 0) scale(${scale})`
}

// 引擎 DOM 已随 Teleport 进入飞行壳后，两帧再写入终点 transform，
// 保证过渡从源矩形干净起步。
async function startGlobeFlight(source: FlightRect, target: FlightRect) {
  flightSourceRect = source
  flightTargetRect = target
  flightShellStyle.value = {
    top: `${source.top}px`,
    left: `${source.left}px`,
    width: `${source.width}px`,
    height: `${source.height}px`,
    transform: 'none',
  }
  globePhase.value = 'flight'
  await nextTick()
  // The first callback runs before paint, so wait for a second frame before
  // writing the destination. This guarantees that the source geometry reaches
  // the compositor without restoring the old synchronous layout flush.
  await nextFrame()
  await nextFrame()
  if (globePhase.value !== 'flight' || !flightSourceRect || !flightTargetRect)
    return
  flightShellStyle.value = {
    ...flightShellStyle.value,
    transform: flightTransform(flightSourceRect, flightTargetRect),
  }
}

// 飞行期间窗口尺寸变化时按 rAF 节流重测目标槽位（源矩形冻结），
// 让过渡终点跟随最新布局而不是失准到旧矩形。
function handleHandoffResize() {
  if (handoffResizeRaf)
    return
  handoffResizeRaf = window.requestAnimationFrame(() => {
    handoffResizeRaf = 0
    if (globePhase.value === 'intro-stage') {
      const sourceEl = document.querySelector('.lnl-intro-globe')
      if (!sourceEl)
        return
      const sourceRect = sourceEl.getBoundingClientRect()
      if (sourceRect.width <= 0)
        return
      flightSourceRect = toFlightRect(sourceRect)
      flightShellStyle.value = {
        top: `${sourceRect.top}px`,
        left: `${sourceRect.left}px`,
        width: `${sourceRect.width}px`,
        height: `${sourceRect.height}px`,
        transform: 'none',
      }
      return
    }
    if (globePhase.value !== 'flight' || !flightSourceRect)
      return
    const targetEl = document.querySelector('#lnl-globe-dashboard-slot')
    if (!targetEl)
      return
    const rect = targetEl.getBoundingClientRect()
    if (rect.width <= 0)
      return
    flightTargetRect = toFlightRect(rect)
    flightShellStyle.value = {
      ...flightShellStyle.value,
      transform: flightTransform(flightSourceRect, flightTargetRect),
    }
  })
}

function stopHandoffResizeWatch() {
  window.removeEventListener('resize', handleHandoffResize)
  if (handoffResizeRaf) {
    window.cancelAnimationFrame(handoffResizeRaf)
    handoffResizeRaf = 0
  }
}

// 飞行壳 transform 过渡真实结束时收尾；只响应飞行壳自身的过渡。
function handleHandoffTransitionEnd(event: TransitionEvent) {
  const target = event.target as HTMLElement | null
  if (event.propertyName !== 'transform' || target?.id !== 'lnl-globe-flight-shell')
    return
  handleIntroAfterLeave()
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

async function prepareInitialShell() {
  if (appShellMounted.value)
    return

  const playIntro = introSessionEligible && appStore.introAnimationEnabled && !motionReduced.value
  appShellMounted.value = true
  resolveInitialShellDecision?.()
  resolveInitialShellDecision = null

  if (!playIntro)
    return

  introPhase.value = 'cover'
  appStore.introActive = true
  launchStartedAt = performance.now()
  await nextTick()
  const stageMounted = await mountIntroGlobeStage()
  if (!stageMounted)
    globePhase.value = 'none'
}

function ensureInitialShell() {
  initialShellPromise ??= prepareInitialShell()
  return initialShellPromise
}

onMounted(async () => {
  try {
    // 首页视觉块只做后台预取，不再阻塞首访封面出现。
    void Promise.allSettled([
      import('@/views/HomeView.vue'),
      import('@/components/NodeCard.vue'),
      import('@/components/NodeGeneralCards.vue'),
    ])
    const initialization = initApp(ensureInitialShell).catch(async (error) => {
      console.error('[App] Initialization failed:', error)
      await ensureInitialShell()
    })
    await Promise.race([
      initialShellDecision,
      wait(INITIAL_SHELL_DECISION_TIMEOUT_MS).then(() => ensureInitialShell()),
    ])

    if (introWillPlay.value) {
      // Intro follows its own visual timeline. Node/status data may arrive at any
      // point and updates the telemetry in place; it never extends the cover.
      await wait(Math.max(0, INTRO_VISUAL_DURATION_MS - (performance.now() - launchStartedAt)))
      await finishIntro()
      void initialization
      return
    }

    await revealDashboardWithoutIntro()
    void initialization
  }
  catch (error) {
    console.error('[App] Initialization failed:', error)
    await revealDashboardWithoutIntro()
  }
})

async function finishIntro() {
  if (introPhase.value !== 'cover')
    return
  introPhase.value = 'finishing'
  try {
    sessionStorage.setItem(INTRO_SESSION_KEY, 'seen')
  }
  catch {
    // Storage can be unavailable in strict privacy modes.
  }
  appShellMounted.value = true
  await nextTick()
  if (motionReduced.value) {
    handleIntroAfterLeave()
    return
  }
  // 只有 earth/earth-stop 模式存在交接目标槽位；其余模式封面纯淡出。
  let rects: { source: FlightRect, target: FlightRect } | null = null
  if (isEarthMode()) {
    const waitDeadline = performance.now() + INTRO_HANDOFF_TARGET_WAIT_MS
    while (!rects && performance.now() < waitDeadline) {
      rects = measureGlobeRects()
      if (!rects)
        await nextFrame()
    }
  }
  if (introPhase.value !== 'finishing')
    return
  // Keep the cover and globe instance alive until the persistent stage lands.
  // The ripple and the FLIP transform start together with no empty wait.
  introHandoffReady.value = Boolean(rects)
  if (rects) {
    await nextTick()
    await startGlobeFlight(rects.source, rects.target)
    window.addEventListener('transitionend', handleHandoffTransitionEnd)
    if (introFinalizeTimer !== null)
      window.clearTimeout(introFinalizeTimer)
    introFinalizeTimer = window.setTimeout(handleIntroAfterLeave, INTRO_HANDOFF_FALLBACK_MS)
  }
  else {
    introFinalizeTimer = window.setTimeout(handleIntroAfterLeave, INTRO_FADE_FALLBACK_MS)
  }
}

function scheduleDashboardReveal() {
  introRevealActive.value = true
  if (introRevealTimer !== null)
    window.clearTimeout(introRevealTimer)
  introRevealTimer = window.setTimeout(() => {
    introRevealActive.value = false
  }, 1000)

  if (ambientStartTimer !== null)
    window.clearTimeout(ambientStartTimer)
  ambientStartTimer = window.setTimeout(() => {
    window.requestAnimationFrame(() => {
      ambientAnimationReady.value = true
    })
  }, 260)
}

async function revealDashboardWithoutIntro() {
  introPhase.value = 'settled'
  introHandoffReady.value = false
  appStore.introActive = false
  globePhase.value = 'none'
  flightShellVisible.value = false
  appShellMounted.value = true
  await nextTick()
  scheduleDashboardReveal()
}

function handleIntroAfterLeave() {
  if (introPhase.value !== 'finishing')
    return
  stopHandoffResizeWatch()
  window.removeEventListener('transitionend', handleHandoffTransitionEnd)
  if (introFinalizeTimer !== null) {
    window.clearTimeout(introFinalizeTimer)
    introFinalizeTimer = null
  }
  if (globePhase.value === 'flight') {
    // 引擎迁入 dashboard 槽位（槽位自挂载起即在 DOM 中），迁移完成后撤壳。
    globePhase.value = 'slot'
    void requestDashboardPulse('landing')
    void nextTick(() => {
      flightShellVisible.value = false
      flightSourceRect = null
      flightTargetRect = null
    })
  }
  else if (globePhase.value === 'intro-stage') {
    // 回退路径：无交接目标，引擎随封面淡出后销毁。
    globePhase.value = 'none'
    flightShellVisible.value = false
  }
  introPhase.value = 'settled'
  introHandoffReady.value = false
  appStore.introActive = false
  appShellMounted.value = true
  // 交接飞行结束后再卸载封面，地球引擎在此之前一直保持旋转。
  scheduleDashboardReveal()
}

// 非首访 / 减少动态 / intro 回退后的路由返回：无飞行过程，地球引擎直接在
// dashboard 槽位挂载。槽位随 HomeView 渲染，慢服务器上按 rAF 轮询等待。
watch([appShellMounted, globePhase], async ([shell, phase]) => {
  if (phase !== 'none' || !shell || introWillPlay.value || showLaunch.value || !isEarthMode())
    return
  await nextTick()
  const deadline = performance.now() + 2000
  while (globePhase.value === 'none' && performance.now() < deadline) {
    if (document.querySelector('#lnl-globe-dashboard-slot')) {
      globePhase.value = 'slot'
      void requestDashboardPulse('landing')
      return
    }
    await nextFrame()
  }
}, { immediate: true, flush: 'post' })

watch(() => route.name, (nextRoute, previousRoute) => {
  if (nextRoute === 'home' && previousRoute && previousRoute !== 'home')
    void requestDashboardPulse('route')
})

watch(motionReduced, (reduced) => {
  if (!reduced)
    return
  if (introPhase.value === 'cover')
    void finishIntro()
  else if (introPhase.value === 'finishing')
    handleIntroAfterLeave()
})

onUnmounted(() => {
  appStore.introActive = false
  stopHandoffResizeWatch()
  window.removeEventListener('transitionend', handleHandoffTransitionEnd)
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
      v-if="showLaunch"
      :class="introLeaving ? 'lnl-intro-exit-leave-active lnl-intro-exit-leave-to' : ''"
      :handoff-ready="introHandoffReady"
      @skip="finishIntro"
    />
    <!-- The one COBE engine stays in a persistent fixed stage from the
         intro's first frame through landing. Teleport moves the identical
         canvas into the dashboard only after both rectangles match. -->
    <Teleport v-if="globePhase !== 'none'" :to="globeTeleportTarget">
      <NodeEarthGlobe
        :variant="globeVariant"
        :interactive="globePhase === 'slot'"
        :show-markers="globePhase === 'slot'"
        :show-status="globePhase === 'slot'"
        :motion="globePhase === 'slot' ? undefined : 'auto'"
        :intro-releasing="introLeaving && globePhase !== 'slot'"
        :handoff-active="globePhase === 'intro-stage' || globePhase === 'flight'"
        :dashboard-pulse-id="dashboardPulseId"
        :dashboard-pulse-origin="dashboardPulseOrigin"
      />
    </Teleport>
    <div
      v-if="flightShellVisible"
      id="lnl-globe-flight-shell"
      :class="{
        'is-intro-stage': globePhase === 'intro-stage',
        'is-flight': globePhase === 'flight',
      }"
      :style="flightShellStyle"
      aria-hidden="true"
    />
    <Header v-if="appShellMounted" :class="{ 'lnl-reveal-header': introRevealActive, 'lnl-header-staged': !introComplete }" />
    <main v-if="appShellMounted" class="flex-1">
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
    <Footer v-if="appShellMounted" :intro-complete="introComplete" :present-visitor="true" />
    <Toaster rich-colors close-button position="top-center" />
  </Provider>
</template>

<style>
/* Persistent intro/flight stage. The canvas is never removed between the
   cover and dashboard; only this compositor layer changes geometry. */
#lnl-globe-flight-shell {
  position: fixed;
  z-index: 110;
  pointer-events: none;
  transform-origin: top left;
  will-change: transform;
}

#lnl-globe-flight-shell.is-intro-stage {
  animation: lnl-globe-stage-in 900ms cubic-bezier(0.16, 1, 0.3, 1) both;
}

#lnl-globe-flight-shell.is-flight {
  animation: none;
  opacity: 1;
  filter: none;
  transition: transform 1080ms cubic-bezier(0.2, 0.78, 0.2, 1);
}

#lnl-globe-flight-shell > .node-earth-globe {
  width: 100%;
  max-width: none;
}

@keyframes lnl-globe-stage-in {
  from {
    opacity: 0;
    filter: blur(14px);
    transform: translate3d(-10px, 8px, 0) scale(0.94);
  }
  to {
    opacity: 1;
    filter: blur(0);
    transform: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  #lnl-globe-flight-shell {
    animation: none;
    transition: none;
  }
}
</style>
