<script lang="ts">
// Intro and dashboard globes are separate WebGL instances during the FLIP
// handoff. Share only the final orientation so the arriving globe does not
// jump back to its default angle when the dashboard is revealed.
// 共享朝向与回归探针位于独立模块 @/utils/globeIntroShared（模块级单例）；
// 切勿移回 <script setup> 顶层，否则每个实例各持一份，交接会瞬跳回默认角度。
</script>

<script setup lang="ts">
import type { COBEOptions, Globe, Marker } from 'cobe'
import type { ComponentPublicInstance } from 'vue'
import type { NodeData } from '@/stores/nodes'
import {
  useDocumentVisibility,
  useElementSize,
  useElementVisibility,
  useMediaQuery,
  useRafFn,
} from '@vueuse/core'
import createGlobe from 'cobe'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useAppStore } from '@/stores/app'
import { useNodesStore } from '@/stores/nodes'
import { getCoordByCode, getCountryCodeFromRegion } from '@/utils/geoHelper'
import { getGlobeProbe, sharedIntroOrientation } from '@/utils/globeIntroShared'
import { isMobileLike } from '@/utils/mobilePerf'

const props = defineProps<{
  nodes?: NodeData[]
  variant?: 'dashboard' | 'intro'
  interactive?: boolean
  showStatus?: boolean
  motion?: 'auto' | 'static'
}>()

// 无头浏览器回归探针：仅当页面预置 window.__lnlGlobeProbe 时记录朝向与
// 交接快照，生产环境不存在该全局变量，保持零开销。
const globeProbe = getGlobeProbe()

const appStore = useAppStore()
const nodesStore = useNodesStore()

const displayNodes = computed(() => props.nodes ?? nodesStore.earthNodes)

const containerRef = ref<HTMLDivElement>()
const canvasRef = ref<HTMLCanvasElement>()
const dragging = ref(false)
const { width: containerWidth, height: containerHeight } = useElementSize(containerRef)

const documentVisibility = useDocumentVisibility()
const elementVisible = useElementVisibility(containerRef)
const shouldRender = computed(() => documentVisibility.value === 'visible'
  && elementVisible.value
  && (props.variant === 'intro' || !appStore.introActive))
// Emerald exposes five layout modes. Only `earth` rotates automatically;
// `earth-stop` remains draggable but holds its orientation after release.
// 系统开启"减少动态效果"时地球仪不自动旋转，但保留用户拖拽。
const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
const shouldAutoRotate = computed(() => !prefersReducedMotion.value
  && (props.motion === 'auto'
    || (props.motion === undefined && appStore.earthViewMode === 'earth')))
const interactive = computed(() => props.interactive ?? props.variant !== 'intro')
const showStatus = computed(() => props.showStatus ?? props.variant !== 'intro')

let globe: Globe | null = null
const INITIAL_THETA = 0.22
const MIN_THETA = -0.65
const MAX_THETA = 0.65
const CHINA_COORD = getCoordByCode('CN') ?? [35.8617, 104.1954]
const DEFAULT_PHI = normalizePhi(-Math.PI / 2 - CHINA_COORD[1] * Math.PI / 180)
const GLOBE_RADIUS = 0.8
const GLOBE_SCALE = 1
const MARKER_ELEVATION = 0
const AUTO_ROTATION_RADIANS_PER_MS = 0.00015
let phi = DEFAULT_PHI
let targetPhi = phi
let theta = INITIAL_THETA
let targetTheta = INITIAL_THETA
let isPointerDown = false
let lastPointerX = 0
let lastPointerY = 0
let staticRedrawUntil = 0

function normalizePhi(value: number): number {
  const circle = Math.PI * 2
  let next = value % circle
  if (next <= -Math.PI)
    next += circle
  if (next > Math.PI)
    next -= circle
  return next
}

function clampTheta(value: number): number {
  return Math.min(Math.max(value, MIN_THETA), MAX_THETA)
}

function keepPhiPrecision() {
  const circle = Math.PI * 2
  if (Math.abs(targetPhi) < circle)
    return
  const offset = Math.trunc(targetPhi / circle) * circle
  targetPhi -= offset
  phi -= offset
}

function resetStoppedView() {
  phi = DEFAULT_PHI
  targetPhi = DEFAULT_PHI
  theta = INITIAL_THETA
  targetTheta = INITIAL_THETA
}

function triggerStaticRedrawWindow(duration = 1500) {
  if (typeof performance === 'undefined') {
    staticRedrawUntil = Date.now() + duration
    return
  }
  staticRedrawUntil = performance.now() + duration
}

function shouldKeepStaticRedraw(): boolean {
  const now = typeof performance === 'undefined' ? Date.now() : performance.now()
  return now < staticRedrawUntil
}

// 减少高采样导致的性能问题；移动端 DPR 上限更激进以压低 WebGL 填充率
function getCappedDpr(): number {
  if (typeof window === 'undefined')
    return 1
  return Math.min(window.devicePixelRatio || 1, isMobileLike ? 1.5 : 2)
}

interface RegionCluster {
  code: string
  coord: [number, number]
  servers: number
  onlineServers: number
}

function clusterKey(c: RegionCluster) {
  return `${c.code}:${c.servers}:${c.onlineServers}`
}

// 节点按地区聚合
const regionClusters = computed<RegionCluster[]>(() => {
  const map = new Map<string, RegionCluster>()
  for (const node of displayNodes.value) {
    const code = getCountryCodeFromRegion(node.region)
    if (!code)
      continue
    const coord = getCoordByCode(code)
    if (!coord)
      continue

    let entry = map.get(code)
    if (!entry) {
      entry = { code, coord, servers: 0, onlineServers: 0 }
      map.set(code, entry)
    }
    entry.servers += 1
    if (node.online)
      entry.onlineServers += 1
  }
  return Array.from(map.values()).sort((a, b) => b.servers - a.servers)
})

const clusterOverlayEls = new Map<string, HTMLDivElement>()
const clusterOverlayRefBinders = new Map<string, (el: Element | ComponentPublicInstance | null) => void>()

function coordToGlobePoint([lat, lon]: [number, number]): [number, number, number] {
  const latRad = lat * Math.PI / 180
  const lonRad = lon * Math.PI / 180 - Math.PI
  const cosLat = Math.cos(latRad)
  return [
    -cosLat * Math.cos(lonRad),
    Math.sin(latRad),
    cosLat * Math.sin(lonRad),
  ]
}

function getRenderSize() {
  const width = containerWidth.value || canvasRef.value?.clientWidth || 320
  const height = containerHeight.value || canvasRef.value?.clientHeight || width
  return { width, height }
}

// iOS Safari 对 cobe 内部 marker anchor 的 DOM/style 行为不稳定，
// overlay 改为组件内自行投影定位，避免回落到容器左上角。
function syncClusterOverlayPosition(cluster: RegionCluster, el: HTMLDivElement) {
  const { width, height } = getRenderSize()
  if (width <= 0 || height <= 0) {
    el.style.opacity = '0'
    return
  }

  const aspect = width / height
  const cosTheta = Math.cos(theta)
  const sinTheta = Math.sin(theta)
  const cosPhi = Math.cos(phi)
  const sinPhi = Math.sin(phi)
  const markerRadius = GLOBE_RADIUS + MARKER_ELEVATION
  const [baseX, baseY, baseZ] = coordToGlobePoint(cluster.coord)
  const x = baseX * markerRadius
  const y = baseY * markerRadius
  const z = baseZ * markerRadius
  const screenX = cosPhi * x + sinPhi * z
  const screenY = sinPhi * sinTheta * x + cosTheta * y - cosPhi * sinTheta * z
  const cameraDepth = -sinPhi * cosTheta * x + sinTheta * y + cosPhi * cosTheta * z
  const visibility = Math.min(1, Math.max(0, (cameraDepth + 0.025) / 0.1))
  const xPx = ((screenX / aspect) * GLOBE_SCALE + 1) * width / 2
  const yPx = ((-screenY) * GLOBE_SCALE + 1) * height / 2

  el.style.transform = `translate3d(${xPx}px, ${yPx}px, 0)`
  el.style.opacity = `${visibility}`
}

function syncClusterOverlayPositions() {
  for (const cluster of regionClusters.value) {
    const el = clusterOverlayEls.get(cluster.code)
    if (!el)
      continue
    syncClusterOverlayPosition(cluster, el)
  }
}

function setClusterOverlayEl(code: string, el: Element | ComponentPublicInstance | null) {
  if (el instanceof HTMLDivElement) {
    el.style.willChange = 'transform, opacity'
    clusterOverlayEls.set(code, el)

    const cluster = regionClusters.value.find(item => item.code === code)
    if (cluster) {
      syncClusterOverlayPosition(cluster, el)
    }
    else {
      el.style.opacity = '0'
    }
    return
  }

  clusterOverlayEls.delete(code)
}

function bindClusterOverlayRef(code: string): (el: Element | ComponentPublicInstance | null) => void {
  const existingBinder = clusterOverlayRefBinders.get(code)
  if (existingBinder)
    return existingBinder

  const binder = (el: Element | ComponentPublicInstance | null) => setClusterOverlayEl(code, el)
  clusterOverlayRefBinders.set(code, binder)
  return binder
}

const markers = computed<Marker[]>(() => {
  return regionClusters.value.map(cluster => ({
    location: cluster.coord,
    size: 0, // 不渲染圆点
  }))
})

const themeColors = computed(() => {
  if (appStore.isDark) {
    return {
      dark: 1,
      mapBrightness: 4,
      baseColor: [0.32, 0.33, 0.4] as [number, number, number],
      markerColor: [0.4, 0.7, 1.0] as [number, number, number],
      glowColor: [0.2, 0.25, 0.45] as [number, number, number],
    }
  }
  return {
    dark: 0,
    mapBrightness: 6,
    baseColor: [1, 1, 1] as [number, number, number],
    markerColor: [0.21, 0.51, 0.93] as [number, number, number],
    glowColor: [1, 1, 1] as [number, number, number],
  }
})

function buildInitialOptions(): COBEOptions {
  const colors = themeColors.value
  const { width, height } = getRenderSize()
  return {
    devicePixelRatio: getCappedDpr(),
    width,
    height,
    phi,
    theta,
    dark: colors.dark,
    diffuse: 1.2,
    // 移动端降低 cobe 点阵采样数，削减每帧 WebGL 绘制成本
    mapSamples: props.variant === 'intro' ? (isMobileLike ? 5600 : 7200) : (isMobileLike ? 6000 : 10000),
    mapBrightness: colors.mapBrightness,
    baseColor: colors.baseColor,
    markerColor: colors.markerColor,
    glowColor: colors.glowColor,
    markers: markers.value,
    markerElevation: MARKER_ELEVATION,
  }
}

function updateGlobeFrame() {
  if (!globe)
    return
  if (props.variant === 'intro') {
    sharedIntroOrientation.phi = phi
    sharedIntroOrientation.theta = theta
    sharedIntroOrientation.valid = true
  }
  if (globeProbe) {
    globeProbe[props.variant === 'intro' ? 'intro' : 'dashboard'] = {
      phi,
      theta,
      t: performance.now(),
      autoRotate: shouldAutoRotate.value,
      shouldRender: shouldRender.value,
    }
  }
  const { width, height } = getRenderSize()
  globe.update({ phi, theta, width, height })
  syncClusterOverlayPositions()
}

// phi 收敛/静止时整帧跳过 globe.update，WebGL + overlay 位置更新双双归零
const ORIENTATION_IDLE_EPSILON = 1e-5
const { pause: pauseRaf, resume: resumeRaf } = useRafFn(
  ({ delta }) => {
    try {
      if (globeProbe) {
        const key = props.variant === 'intro' ? 'introLoopFrames' : 'dashLoopFrames'
        ;(globeProbe as Record<string, unknown>)[key] = ((globeProbe as Record<string, number>)[key] ?? 0) + 1
      }
      if (!globe)
        return
      const prevPhi = phi
      const prevTheta = theta
      if (!isPointerDown && shouldAutoRotate.value) {
        targetPhi += AUTO_ROTATION_RADIANS_PER_MS * Math.min(delta, 34)
        keepPhiPrecision()
      }
      phi += (targetPhi - phi) * 1
      theta += (targetTheta - theta) * 1
      if (
        Math.abs(phi - prevPhi) < ORIENTATION_IDLE_EPSILON
        && Math.abs(theta - prevTheta) < ORIENTATION_IDLE_EPSILON
      ) {
        if (!shouldAutoRotate.value && shouldKeepStaticRedraw())
          updateGlobeFrame()
        return
      }
      updateGlobeFrame()
    }
    catch (error) {
      if (globeProbe)
        (globeProbe as Record<string, unknown>).loopError = String((error as Error)?.stack || error)
      throw error
    }
  },
  { immediate: false, fpsLimit: isMobileLike ? 30 : null }, // 移动端帧率上限 30fps，降低常驻渲染负载
)

function syncRafState() {
  if (!globe)
    return

  if ((documentVisibility.value === 'visible' && isPointerDown) || (shouldRender.value && shouldAutoRotate.value)) {
    resumeRaf()
    return
  }

  pauseRaf()
  if (globeProbe) {
    globeProbe.lastPause = {
      variant: props.variant ?? 'dashboard',
      t: performance.now(),
      shouldRender: shouldRender.value,
      autoRotate: shouldAutoRotate.value,
      documentVisibility: documentVisibility.value,
      elementVisible: elementVisible.value,
    }
  }
  if (shouldRender.value)
    updateGlobeFrame()
}

// dashboard 实例接管 intro 的最终朝向，并记录交接快照供探针断言相位连续。
function adoptSharedIntroOrientation() {
  if (!sharedIntroOrientation.valid)
    return
  phi = sharedIntroOrientation.phi
  targetPhi = phi
  theta = sharedIntroOrientation.theta
  targetTheta = theta
  if (globeProbe) {
    globeProbe.handoff = {
      phi: sharedIntroOrientation.phi,
      theta: sharedIntroOrientation.theta,
      t: performance.now(),
    }
  }
}

function startGlobe() {
  if (!canvasRef.value)
    return
  if (props.variant !== 'intro' && appStore.introActive) {
    adoptSharedIntroOrientation()
  }
  if (appStore.earthViewMode === 'earth-stop') {
    resetStoppedView()
    triggerStaticRedrawWindow()
  }
  globe = createGlobe(canvasRef.value, buildInitialOptions())
  syncClusterOverlayPositions()
  // 静止地球没有自转帧，首帧需要在实际尺寸稳定后主动重绘一次。
  requestAnimationFrame(() => {
    updateGlobeFrame()
  })
  // documentVisibility 同步可读；useElementVisibility 需等 IntersectionObserver 首回调
  // 先按"前台"启动，若实际不可见，shouldRender 的 watch 会在下一帧 pause
  syncRafState()
}

// cobe 不会清理自己创建的 wrapper，这里手动收尾。
function stopGlobe() {
  pauseRaf()
  if (globeProbe) {
    (globeProbe as Record<string, unknown>)[props.variant === 'intro' ? 'introStoppedAt' : 'dashStoppedAt'] = {
      t: performance.now(),
      stack: new Error('stopGlobe').stack?.split('\n').slice(1, 5).join('|'),
    }
  }
  globe?.destroy()
  globe = null
  if (canvasRef.value && containerRef.value) {
    const cobeWrapper = canvasRef.value.parentElement
    if (cobeWrapper && cobeWrapper !== containerRef.value) {
      containerRef.value.appendChild(canvasRef.value)
      cobeWrapper.remove()
    }
  }
}

onMounted(() => {
  startGlobe()
})

onBeforeUnmount(() => {
  stopGlobe()
})

// Theme changes must update the existing WebGL instance in place. Recreating
// cobe briefly detaches its canvas wrapper and desynchronizes the DOM flags.
watch(() => appStore.isDark, () => {
  if (!globe)
    return
  const colors = themeColors.value
  globe.update({
    dark: colors.dark,
    mapBrightness: colors.mapBrightness,
    baseColor: colors.baseColor,
    markerColor: colors.markerColor,
    glowColor: colors.glowColor,
  })
  triggerStaticRedrawWindow(900)
  updateGlobeFrame()
  syncRafState()
})

watch(
  [containerWidth, containerHeight],
  ([width, height]) => {
    if (!globe || width <= 0 || height <= 0)
      return
    updateGlobeFrame()
  },
)

watch(
  () => appStore.earthViewMode,
  (mode) => {
    if (mode === 'earth-stop')
      resetStoppedView()
    triggerStaticRedrawWindow()
    syncRafState()
  },
)

// 系统"减少动态效果"偏好在运行时切换时同步 rAF：停止或恢复自动旋转。
watch(shouldAutoRotate, () => {
  if (globe)
    syncRafState()
})

// 仅地区集合或在线状态变化时才推送 markers；速率推送不触发
watch(
  () => regionClusters.value.map(clusterKey).join(','),
  async () => {
    if (!globe)
      return
    globe.update({ markers: markers.value })
    await nextTick()
    syncClusterOverlayPositions()
    if (!shouldAutoRotate.value)
      triggerStaticRedrawWindow(600)
  },
)

watch(shouldRender, () => {
  if (!globe)
    return
  syncRafState()
})

// The dashboard globe is mounted behind the intro. IntersectionObserver may
// have reported its state before the cover leaves, so explicitly re-sample the
// RAF state once the handoff releases the dashboard.
watch(
  () => appStore.introActive,
  async (active) => {
    if (active || props.variant === 'intro' || !globe)
      return
    await nextTick()
    requestAnimationFrame(() => {
      adoptSharedIntroOrientation()
      updateGlobeFrame()
      syncRafState()
    })
  },
)

function onPointerDown(e: PointerEvent) {
  if (!interactive.value)
    return
  isPointerDown = true
  dragging.value = true
  lastPointerX = e.clientX
  lastPointerY = e.clientY
  const target = e.currentTarget as HTMLElement
  try {
    target.setPointerCapture(e.pointerId)
  }
  catch {
    // Synthetic events and older WebViews may not expose an active pointer to capture.
  }
  syncRafState()
}
function onPointerMove(e: PointerEvent) {
  if (!interactive.value || !isPointerDown)
    return
  const deltaX = e.clientX - lastPointerX
  const deltaY = e.clientY - lastPointerY
  lastPointerX = e.clientX
  lastPointerY = e.clientY
  targetPhi += deltaX / 200
  targetTheta = clampTheta(targetTheta + deltaY / 300)
  // Pointer input should remain responsive even when IntersectionObserver has
  // not yet marked the globe visible. The RAF loop continues auto-rotation.
  phi = targetPhi
  theta = targetTheta
  updateGlobeFrame()
}
function onPointerUp(e: PointerEvent) {
  if (!interactive.value)
    return
  isPointerDown = false
  dragging.value = false
  const target = e.currentTarget as HTMLElement
  if (target.hasPointerCapture(e.pointerId))
    target.releasePointerCapture(e.pointerId)
  syncRafState()
}

function handleFlagError(event: Event) {
  const image = event.currentTarget as HTMLImageElement
  image.style.display = 'none'
}

const totalServers = computed(() => displayNodes.value.length)
const onlineServers = computed(() => displayNodes.value.filter(node => node.online).length)
const offlineServers = computed(() => totalServers.value - onlineServers.value)
</script>

<template>
  <div
    ref="containerRef" class="node-earth-globe relative aspect-square w-full mx-auto"
    :class="[
      { 'is-dragging': dragging, 'is-intro': variant === 'intro' },
      variant === 'intro' ? '' : '-translate-y-6 md:-translate-y-12',
      interactive ? 'touch-none cursor-grab active:cursor-grabbing' : '',
    ]"
    :role="interactive ? 'img' : undefined"
    :aria-label="interactive ? '可拖动旋转的全球节点地球' : undefined"
    @pointerdown="onPointerDown" @pointermove="onPointerMove" @pointerup="onPointerUp" @pointercancel="onPointerUp"
  >
    <canvas
      ref="canvasRef"
      class="earth-globe-canvas pointer-events-none absolute inset-0 w-full h-full select-none"
    />

    <template v-for="(cluster, clusterIndex) in regionClusters" :key="cluster.code">
      <div
        :ref="bindClusterOverlayRef(cluster.code)"
        class="lnl-earth-overlay absolute -top-3.5 left-0 pointer-events-none"
        :style="{ '--lnl-marker-index': clusterIndex }"
      >
        <span class="lnl-earth-flag absolute -bottom-2 -left-2 z-3" aria-hidden="true">
          <span>{{ cluster.code }}</span>
          <img
            :src="`/images/flags/${cluster.code}.svg`" :alt="cluster.code"
            @error="handleFlagError"
          >
        </span>
        <div class="relative z-2 bg-background/60 rounded py-0.5 px-2 text-xs zoom-80 items-start justify-center text-nowrap">
          <div v-if="cluster.onlineServers > 0" class="flex items-center gap-1">
            <span class="inline-block size-1.5 rounded-full bg-green-600" />
            <span class="text-green-600">{{ cluster.onlineServers }}</span>
          </div>
          <div v-if="(cluster.servers - cluster.onlineServers) > 0" class="flex items-center gap-1">
            <span class="inline-block size-1.5 rounded-full bg-yellow-600" />
            <span class="text-yellow-600">{{ cluster.servers - cluster.onlineServers }}</span>
          </div>
        </div>
      </div>
    </template>

    <div
      v-if="showStatus && totalServers > 0"
      class="absolute top-6 md:top-12 left-0 text-[10px] text-muted-foreground pointer-events-none flex gap-2 items-center backdrop-blur-lg bg-background/60 rounded px-2 py-0.5"
    >
      <div v-if="onlineServers > 0" class="flex items-center gap-1">
        <span class="inline-block size-1.5 rounded-full bg-green-600 animate-pulse motion-reduce:animate-none" />
        <span class="text-green-600">{{ onlineServers }}</span>
      </div>
      <div v-if="offlineServers > 0" class="flex items-center gap-1">
        <span class="inline-block size-1.5 rounded-full bg-yellow-600 animate-pulse motion-reduce:animate-none" />
        <span class="text-yellow-600">{{ offlineServers }}</span>
      </div>
      <!-- <div v-if="totalServers > 0" class="flex items-center gap-1">
        <span class="inline-block size-1.5 rounded-full bg-blue-600 animate-pulse motion-reduce:animate-none" />
        <span class="text-blue-600">{{ totalServers }}</span>
      </div> -->
    </div>
  </div>
</template>

<style scoped>
.earth-globe-canvas {
  contain: layout paint;
}

.node-earth-globe {
  width: min(100%, clamp(360px, 32vw, 500px));
  max-width: 500px;
}

.node-earth-globe.is-intro {
  width: 100%;
  max-width: none;
}

@media (max-width: 760px) {
  .node-earth-globe {
    width: calc(100vw - 32px);
    max-width: calc(100vw - 32px);
  }
}

.lnl-earth-flag {
  display: grid;
  width: 20px;
  height: 20px;
  place-items: center;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--lnl-line) 75%, transparent);
  background: var(--background);
  color: var(--muted-foreground);
  font: 7px/1 var(--font-mono);
  box-shadow: 0 2px 8px rgb(0 0 0 / 24%);
}

.lnl-earth-flag > * {
  grid-area: 1 / 1;
}

.lnl-earth-flag img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  transform: translateZ(0);
}

.lnl-earth-overlay {
  backface-visibility: hidden;
  transition: opacity 70ms linear;
  will-change: transform, opacity;
}

.node-earth-globe.is-dragging .lnl-earth-overlay {
  transition: none;
}

.node-earth-globe.is-intro .lnl-earth-overlay > * {
  animation: intro-marker-focus 820ms calc(420ms + var(--lnl-marker-index, 0) * 52ms) cubic-bezier(0.16, 1, 0.3, 1) both;
  will-change: opacity, filter;
}

@keyframes intro-marker-focus {
  from {
    opacity: 0;
    filter: blur(5px);
  }
  to {
    opacity: 1;
    filter: blur(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .node-earth-globe.is-intro .lnl-earth-overlay > * {
    animation: none;
    opacity: 1;
    filter: none;
  }
}
</style>
