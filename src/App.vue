<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import NodeEarthGlobe from '@/components/NodeEarthGlobe.vue'
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
// 1.2.8 重构为单 cobe 实例交接（Teleport 迁移同一 DOM，WebGL 上下文不重建），
// 让老用户重放重构后的 intro。
const INTRO_SESSION_KEY = 'leonetlab:intro:1.2.8'
// 飞行壳的 transform 过渡时长；交接收尾以 transitionend 为准，固定计时器只作
// 兜底：主线程长任务会推迟 CSS 过渡起点，按点击时刻计时会提前撤壳闪跳。
const INTRO_HANDOFF_DURATION_MS = 1080
const INTRO_HANDOFF_FALLBACK_MS = INTRO_HANDOFF_DURATION_MS + 900
// 无交接目标（非 earth 模式或槽位始终未挂载）时封面纯淡出的兜底时长。
const INTRO_FADE_FALLBACK_MS = 800
// 慢服务器上 dashboard 可能在数据就绪后才完成挂载：飞行前最多等目标槽位
// 1.5s，避免朝一个尚未挂载的目标交接（几何失准同样表现为闪跳）。
const INTRO_HANDOFF_TARGET_WAIT_MS = 1500
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
const launchStartedAt = performance.now()
const launchMinimumMs = introWillPlay ? 4200 : 0
let introFinalizeTimer: ReturnType<typeof window.setTimeout> | null = null
let introRevealTimer: ReturnType<typeof window.setTimeout> | null = null
let ambientStartTimer: ReturnType<typeof window.setTimeout> | null = null
let handoffResizeRaf = 0
const wait = (duration: number) => new Promise(resolve => window.setTimeout(resolve, duration))
const nextFrame = () => new Promise<void>(resolve => window.requestAnimationFrame(() => resolve()))

// ---------------------------------------------------------------------------
// v1.2.8 单实例地球交接
// 全程只有一个 cobe 引擎（NodeEarthGlobe）。它的 DOM 由下方 Teleport 在三个
// 宿主之间迁移：intro 槽位（封面内）→ 飞行壳（fixed，transform 过渡）→
// dashboard 槽位（NodeGeneralCards 内）。Teleport 目标变化时 Vue 移动同一个
// DOM 子树，canvas 与 WebGL 上下文原样保留，相位、拖拽状态全程连续。
// ---------------------------------------------------------------------------
type GlobePhase = 'intro-slot' | 'flight' | 'slot' | 'none'
const globePhase = ref<GlobePhase>(introWillPlay ? 'intro-slot' : 'none')
const globeTeleportTarget = computed(() => {
  switch (globePhase.value) {
    case 'intro-slot':
      return '.lnl-intro-globe'
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
  flightShellVisible.value = true
  await nextTick()
  globePhase.value = 'flight'
  await nextTick()
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
  // 手动切换 leave 类而不是 v-if + <Transition>：Vue 的 Transition 会在
  // leave 开始时立即销毁组件实例（仅延迟移除 DOM），cobe 地球随之冻结。
  // 保持组件存活可让地球在飞行期间继续旋转，交接全程相位连续。
  introLeaving.value = true
  if (rects) {
    await startGlobeFlight(rects.source, rects.target)
    window.addEventListener('resize', handleHandoffResize)
    window.addEventListener('transitionend', handleHandoffTransitionEnd)
    if (introFinalizeTimer !== null)
      window.clearTimeout(introFinalizeTimer)
    introFinalizeTimer = window.setTimeout(handleIntroAfterLeave, INTRO_HANDOFF_FALLBACK_MS)
  }
  else {
    introFinalizeTimer = window.setTimeout(handleIntroAfterLeave, INTRO_FADE_FALLBACK_MS)
  }
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
  window.removeEventListener('transitionend', handleHandoffTransitionEnd)
  if (introFinalizeTimer !== null) {
    window.clearTimeout(introFinalizeTimer)
    introFinalizeTimer = null
  }
  if (globePhase.value === 'flight') {
    // 引擎迁入 dashboard 槽位（槽位自挂载起即在 DOM 中），迁移完成后撤壳。
    globePhase.value = 'slot'
    void nextTick(() => {
      flightShellVisible.value = false
      flightSourceRect = null
      flightTargetRect = null
    })
  }
  else if (globePhase.value === 'intro-slot') {
    // 回退路径：无交接目标，引擎随封面淡出后销毁。
    globePhase.value = 'none'
  }
  introComplete.value = true
  appStore.introActive = false
  appShellMounted.value = true
  introRevealActive.value = true
  introFinishing.value = false
  // 交接飞行结束后再卸载封面，地球引擎在此之前一直保持旋转。
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

// 非首访 / 减少动态 / intro 回退后的路由返回：无飞行过程，地球引擎直接在
// dashboard 槽位挂载。槽位随 HomeView 渲染，慢服务器上按 rAF 轮询等待。
watch([appShellMounted, () => appStore.loading, globePhase], async ([shell, loading, phase]) => {
  if (phase !== 'none' || !shell || loading || !isEarthMode())
    return
  await nextTick()
  const deadline = performance.now() + 2000
  while (globePhase.value === 'none' && performance.now() < deadline) {
    if (document.querySelector('#lnl-globe-dashboard-slot')) {
      globePhase.value = 'slot'
      return
    }
    await nextFrame()
  }
}, { immediate: true, flush: 'post' })

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
      @skip="finishIntro"
    />
    <!-- 唯一的 cobe 引擎：Teleport 目标随 globePhase 在 intro 槽位、飞行壳与
         dashboard 槽位之间迁移，同一 DOM（含 WebGL 上下文）全程保留。
         v-if 挂在 Teleport 自身：'none' → 'slot' 时重新挂载 Teleport 实例，
         保证目标解析发生在槽位已存在之后（Teleport 只在挂载或 to 变化时
         解析一次目标，解析失败不会自动重试）。 -->
    <Teleport v-if="globePhase !== 'none'" :to="globeTeleportTarget">
      <NodeEarthGlobe
        :variant="globeVariant"
        :interactive="globePhase === 'slot'"
        :show-status="globePhase === 'slot'"
        :motion="globePhase === 'slot' ? undefined : 'auto'"
      />
    </Teleport>
    <div
      v-if="flightShellVisible"
      id="lnl-globe-flight-shell"
      :style="flightShellStyle"
      aria-hidden="true"
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

<style>
/* 飞行壳：交接期间承载地球引擎的 fixed 容器，transform 过渡即飞行本体。
   源/终点矩形由 App.vue 测量后以内联样式写入。 */
#lnl-globe-flight-shell {
  position: fixed;
  z-index: 110;
  pointer-events: none;
  transform-origin: top left;
  transition: transform 1080ms cubic-bezier(0.2, 0.78, 0.2, 1);
  will-change: transform;
}

#lnl-globe-flight-shell > .node-earth-globe {
  width: 100%;
  max-width: none;
}
</style>
