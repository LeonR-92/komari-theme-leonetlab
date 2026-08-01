<script lang="ts">
// v1.2.8 起全程只有一个 cobe 实例：本组件的 DOM（含 canvas 与 WebGL 上下文）
// 由 App.vue 的 Teleport 在 intro 槽位、飞行壳与 dashboard 槽位之间迁移，
// 交接无需再共享朝向。回归探针位于 @/utils/globeIntroShared（模块级）。
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
import { getGlobeProbe } from '@/utils/globeIntroShared'
import { formatBytesPerSecondWithConfig } from '@/utils/helper'
import { isMobileLike } from '@/utils/mobilePerf'
import { getRegionDisplayName } from '@/utils/regionHelper'

const props = defineProps<{
  nodes?: NodeData[]
  variant?: 'dashboard' | 'intro'
  interactive?: boolean
  showMarkers?: boolean
  showStatus?: boolean
  motion?: 'auto' | 'static'
  introReleasing?: boolean
  handoffActive?: boolean
  dashboardPulseId?: number
  dashboardPulseOrigin?: 'landing' | 'route'
}>()

// 无头浏览器回归探针：仅当页面预置 window.__lnlGlobeProbe 时记录朝向与
// 交接快照，生产环境不存在该全局变量，保持零开销。
const globeProbe = getGlobeProbe()

const appStore = useAppStore()
const nodesStore = useNodesStore()
const buildVersion = __BUILD_VERSION__

const displayNodes = computed(() => props.nodes ?? nodesStore.earthNodes)
const liveNodes = computed(() => props.nodes ?? nodesStore.nodes)

const containerRef = ref<HTMLDivElement>()
const canvasRef = ref<HTMLCanvasElement>()
const dragging = ref(false)
const themeTransitioning = ref(false)
const { width: containerWidth, height: containerHeight } = useElementSize(containerRef)

const documentVisibility = useDocumentVisibility()
const elementVisible = useElementVisibility(containerRef)
// 单一实例全程渲染：可见性只受文档与元素自身可见性门控（后台/屏外暂停）。
const shouldRender = computed(() => documentVisibility.value === 'visible'
  && (props.handoffActive || elementVisible.value)
  && !themeTransitioning.value)
// Emerald exposes five layout modes. Only `earth` rotates automatically;
// `earth-stop` remains draggable but holds its orientation after release.
// 系统开启"减少动态效果"时地球仪不自动旋转，但保留用户拖拽。
const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
const hasFineHoverPointer = useMediaQuery('(hover: hover) and (pointer: fine)')
const shouldAutoRotate = computed(() => !prefersReducedMotion.value
  && (props.motion === 'auto'
    || (props.motion === undefined && appStore.earthViewMode === 'earth')))
const interactive = computed(() => props.interactive ?? props.variant !== 'intro')
const showMarkers = computed(() => props.showMarkers ?? props.variant !== 'intro')
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
let interactionRotationScale = 1
let targetInteractionRotationScale = 1

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
  displayName: string
  servers: number
  onlineServers: number
  cpuAverage: number
  memoryPercent: number
  throughput: number
}

function clusterKey(c: RegionCluster) {
  return `${c.code}:${c.servers}:${c.onlineServers}`
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value))
    return 0
  return Math.min(100, Math.max(0, value))
}

// 节点按地区聚合。位置来自低频地球快照，负载和流量始终使用实时节点状态。
const regionClusters = computed<RegionCluster[]>(() => {
  const locationMap = new Map(displayNodes.value.map(node => [node.uuid, node]))
  const map = new Map<string, RegionCluster & {
    cpuTotal: number
    memoryUsed: number
    memoryTotal: number
  }>()
  for (const node of liveNodes.value) {
    const locationNode = locationMap.get(node.uuid) ?? node
    const code = getCountryCodeFromRegion(locationNode.region)
    if (!code)
      continue
    const coord = getCoordByCode(code)
    if (!coord)
      continue

    let entry = map.get(code)
    if (!entry) {
      entry = {
        code,
        coord,
        displayName: getRegionDisplayName(locationNode.region),
        servers: 0,
        onlineServers: 0,
        cpuAverage: 0,
        cpuTotal: 0,
        memoryPercent: 0,
        memoryUsed: 0,
        memoryTotal: 0,
        throughput: 0,
      }
      map.set(code, entry)
    }
    entry.servers += 1
    if (node.online) {
      entry.onlineServers += 1
      entry.cpuTotal += node.cpu
      entry.memoryUsed += node.ram
      entry.memoryTotal += node.mem_total
      entry.throughput += node.net_in + node.net_out
    }
  }

  return Array.from(map.values()).map((entry) => {
    entry.cpuAverage = entry.onlineServers > 0
      ? clampPercent(entry.cpuTotal / entry.onlineServers)
      : 0
    entry.memoryPercent = entry.memoryTotal > 0
      ? clampPercent(entry.memoryUsed / entry.memoryTotal * 100)
      : 0
    return entry
  }).sort((a, b) => b.servers - a.servers)
})

const clusterOverlayEls = new Map<string, HTMLElement>()
const clusterOverlayRefBinders = new Map<string, (el: Element | ComponentPublicInstance | null) => void>()
const activeRegionCode = ref<string | null>(null)
const pinnedRegionCode = ref<string | null>(null)
const hoveredRegionCode = ref<string | null>(null)
let regionOpenTimer: ReturnType<typeof window.setTimeout> | null = null
let regionCloseTimer: ReturnType<typeof window.setTimeout> | null = null
const REGION_HOVER_OPEN_MS = 120
const REGION_HOVER_CLOSE_MS = 220

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
function syncClusterOverlayPosition(
  cluster: RegionCluster,
  el: HTMLElement,
  rootStyle = getComputedStyle(document.documentElement),
) {
  const { width, height } = getRenderSize()
  if (width <= 0 || height <= 0) {
    el.dataset.front = 'false'
    el.style.pointerEvents = 'none'
    el.tabIndex = -1
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
  const isFrontFacing = cameraDepth > 0.04
  const officialVisibilityValue = rootStyle.getPropertyValue(`--cobe-visible-${cluster.code}`).trim()
  const officialVisibility = Number.parseFloat(officialVisibilityValue)
  // COBE 2 exposes its own visibility signal. Some bundled/minified builds emit
  // a non-numeric token, so retain the mathematically equivalent projection as
  // a compatibility fallback instead of leaving every flag fully transparent.
  const markerVisibility = Number.isFinite(officialVisibility)
    ? Math.max(0, Math.min(1, officialVisibility))
    : (isFrontFacing ? 1 : 0)
  const xPx = ((screenX / aspect) * GLOBE_SCALE + 1) * width / 2
  const yPx = ((-screenY) * GLOBE_SCALE + 1) * height / 2
  const containerRect = containerRef.value?.getBoundingClientRect()
  const readout = el.querySelector<HTMLElement>('.lnl-earth-readout')
  const readoutWidth = Math.min(260, Math.max(220, window.innerWidth - 42))
  const readoutHeight = readout?.offsetHeight || 188
  const previousSide = el.dataset.side
  // Keep a generous hysteresis band so a marker near the centre does not make
  // the readout flip sides every few frames while the globe is slowing down.
  const openToLeft = previousSide === 'left'
    ? xPx > width * 0.54
    : xPx > width * 0.64
  const side = openToLeft ? 'left' : 'right'
  const baseLeft = (containerRect?.left || 0) + xPx + (side === 'left' ? -25 - readoutWidth : 25)
  const clampedLeft = Math.min(
    Math.max(12, baseLeft),
    Math.max(12, window.innerWidth - readoutWidth - 12),
  )
  const baseTop = (containerRect?.top || 0) + yPx - 44
  const clampedTop = Math.min(
    Math.max(12, baseTop),
    Math.max(12, window.innerHeight - readoutHeight - 12),
  )

  el.style.transform = `translate3d(${xPx}px, ${yPx}px, 0)`
  el.style.setProperty('--lnl-cobe-visible', String(markerVisibility))
  el.dataset.visibilitySource = Number.isFinite(officialVisibility) ? 'cobe' : 'projection-fallback'
  el.dataset.front = isFrontFacing ? 'true' : 'false'
  el.style.pointerEvents = interactive.value && isFrontFacing ? 'auto' : 'none'
  el.tabIndex = interactive.value && isFrontFacing ? 0 : -1
  el.setAttribute('aria-hidden', isFrontFacing ? 'false' : 'true')
  el.dataset.side = side
  el.style.setProperty('--lnl-readout-shift-x', `${clampedLeft - baseLeft}px`)
  el.style.setProperty('--lnl-readout-shift-y', `${clampedTop - baseTop}px`)
  if (!isFrontFacing && activeRegionCode.value === cluster.code)
    resetRegionInteraction()
}

function syncClusterOverlayPositions() {
  const rootStyle = getComputedStyle(document.documentElement)
  for (const cluster of regionClusters.value) {
    const el = clusterOverlayEls.get(cluster.code)
    if (!el)
      continue
    syncClusterOverlayPosition(cluster, el, rootStyle)
  }
}

function setClusterOverlayEl(code: string, el: Element | ComponentPublicInstance | null) {
  if (el instanceof HTMLElement) {
    el.style.willChange = 'transform, opacity'
    el.style.setProperty('--lnl-cobe-visible', '0')
    clusterOverlayEls.set(code, el)

    const cluster = regionClusters.value.find(item => item.code === code)
    if (cluster) {
      syncClusterOverlayPosition(cluster, el)
    }
    else {
      el.dataset.front = 'false'
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
    id: cluster.code,
    location: cluster.coord,
    size: showMarkers.value ? 0.018 : 0,
  }))
})

const themeColors = computed(() => {
  if (appStore.isDark) {
    return {
      dark: 1,
      mapBrightness: 4,
      mapBaseBrightness: 0.055,
      baseColor: [0.32, 0.33, 0.4] as [number, number, number],
      markerColor: [0.45, 0.95, 0.72] as [number, number, number],
      glowColor: [0.09, 0.22, 0.16] as [number, number, number],
    }
  }
  return {
    dark: 0,
    // Light mode stays neutral: soften the original gray land dots without
    // tinting the entire sphere green. Theme color remains on markers/glow.
    mapBrightness: 5,
    mapBaseBrightness: 0.07,
    baseColor: [1, 1, 1] as [number, number, number],
    markerColor: [0.08, 0.48, 0.31] as [number, number, number],
    glowColor: [0.88, 0.96, 0.91] as [number, number, number],
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
    mapBaseBrightness: colors.mapBaseBrightness,
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
const INTERACTION_ROTATION_EPSILON = 0.002

function interactionRotationSettling(): boolean {
  return Math.abs(targetInteractionRotationScale - interactionRotationScale) > INTERACTION_ROTATION_EPSILON
}

function updateInteractionRotationScale(delta: number) {
  if (!interactionRotationSettling()) {
    interactionRotationScale = targetInteractionRotationScale
    return
  }
  const duration = targetInteractionRotationScale < interactionRotationScale ? 180 : 260
  const progress = 1 - Math.exp(-Math.min(delta, 34) * 5 / duration)
  interactionRotationScale += (targetInteractionRotationScale - interactionRotationScale) * progress
  if (!interactionRotationSettling())
    interactionRotationScale = targetInteractionRotationScale
}

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
      updateInteractionRotationScale(delta)
      if (!isPointerDown && shouldAutoRotate.value) {
        targetPhi += AUTO_ROTATION_RADIANS_PER_MS * Math.min(delta, 34) * interactionRotationScale
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

  const shouldAnimateRotation = shouldAutoRotate.value
    && (interactionRotationScale > INTERACTION_ROTATION_EPSILON || interactionRotationSettling())
  if ((documentVisibility.value === 'visible' && isPointerDown) || (shouldRender.value && shouldAnimateRotation)) {
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

function startGlobe() {
  if (!canvasRef.value)
    return
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
  window.addEventListener('leonetlab:theme-transition-start', handleThemeTransitionStart)
  window.addEventListener('leonetlab:theme-transition-end', handleThemeTransitionEnd)
  document.addEventListener('pointerdown', handleDocumentPointerDown)
  document.addEventListener('keydown', handleDocumentKeydown)
  startGlobe()
})

onBeforeUnmount(() => {
  window.removeEventListener('leonetlab:theme-transition-start', handleThemeTransitionStart)
  window.removeEventListener('leonetlab:theme-transition-end', handleThemeTransitionEnd)
  document.removeEventListener('pointerdown', handleDocumentPointerDown)
  document.removeEventListener('keydown', handleDocumentKeydown)
  clearRegionTimers()
  stopGlobe()
})

function handleThemeTransitionStart() {
  themeTransitioning.value = true
  syncRafState()
}

function handleThemeTransitionEnd() {
  themeTransitioning.value = false
  triggerStaticRedrawWindow(900)
  updateGlobeFrame()
  syncRafState()
}

// Theme changes must update the existing WebGL instance in place. Recreating
// cobe briefly detaches its canvas wrapper and desynchronizes the DOM flags.
watch(() => appStore.isDark, () => {
  if (!globe)
    return
  const colors = themeColors.value
  globe.update({
    dark: colors.dark,
    mapBrightness: colors.mapBrightness,
    mapBaseBrightness: colors.mapBaseBrightness,
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

watch(() => appStore.regionalTelemetryEnabled, (enabled) => {
  if (!enabled)
    resetRegionInteraction()
})

watch(() => regionClusters.value.map(cluster => cluster.code).join(','), () => {
  const activeCode = activeRegionCode.value
  if (activeCode && !regionClusters.value.some(cluster => cluster.code === activeCode))
    resetRegionInteraction()
})

// 仅地区集合或在线状态变化时才推送 markers；速率推送不触发
watch(
  () => `${showMarkers.value}:${regionClusters.value.map(clusterKey).join(',')}`,
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

// 槽位迁移（Teleport 移动 DOM）后容器尺寸变化由 useElementSize 的 watch
// 触发 updateGlobeFrame；元素可见性变化由 shouldRender 的 watch 恢复/暂停，
// 无需额外的交接期朝向接管逻辑。

function onPointerDown(e: PointerEvent) {
  if (!interactive.value)
    return
  resetRegionInteraction()
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
  if (image.dataset.retry !== '1') {
    image.dataset.retry = '1'
    const retryUrl = new URL(image.src)
    retryUrl.searchParams.set('retry', '1')
    image.src = retryUrl.href
    return
  }
  image.hidden = true
}

function handleFlagLoad(event: Event) {
  const image = event.currentTarget as HTMLImageElement
  image.hidden = false
}

function clearRegionTimers() {
  if (regionOpenTimer !== null) {
    window.clearTimeout(regionOpenTimer)
    regionOpenTimer = null
  }
  if (regionCloseTimer !== null) {
    window.clearTimeout(regionCloseTimer)
    regionCloseTimer = null
  }
}

function syncRegionRotationState() {
  targetInteractionRotationScale = activeRegionCode.value ? 0 : 1
  syncRafState()
}

function activateRegion(code: string) {
  if (!appStore.regionalTelemetryEnabled)
    return
  activeRegionCode.value = code
  syncRegionRotationState()
  void nextTick(syncClusterOverlayPositions)
}

function resetRegionInteraction() {
  clearRegionTimers()
  hoveredRegionCode.value = null
  pinnedRegionCode.value = null
  activeRegionCode.value = null
  syncRegionRotationState()
}

function scheduleRegionClose(code: string, delay = REGION_HOVER_CLOSE_MS) {
  if (pinnedRegionCode.value === code)
    return
  if (regionCloseTimer !== null)
    window.clearTimeout(regionCloseTimer)
  regionCloseTimer = window.setTimeout(() => {
    regionCloseTimer = null
    if (pinnedRegionCode.value || hoveredRegionCode.value === code)
      return
    if (activeRegionCode.value === code) {
      activeRegionCode.value = null
      syncRegionRotationState()
    }
  }, delay)
}

function handleRegionPointerEnter(event: PointerEvent, code: string) {
  if (event.pointerType === 'touch')
    return
  if (regionCloseTimer !== null) {
    window.clearTimeout(regionCloseTimer)
    regionCloseTimer = null
  }
  hoveredRegionCode.value = code
  if (pinnedRegionCode.value)
    return
  if (regionOpenTimer !== null)
    window.clearTimeout(regionOpenTimer)
  regionOpenTimer = window.setTimeout(() => {
    regionOpenTimer = null
    if (hoveredRegionCode.value === code && !pinnedRegionCode.value)
      activateRegion(code)
  }, REGION_HOVER_OPEN_MS)
}

function handleRegionPointerLeave(event: PointerEvent, code: string) {
  if (event.pointerType === 'touch')
    return
  if (hoveredRegionCode.value === code)
    hoveredRegionCode.value = null
  if (regionOpenTimer !== null) {
    window.clearTimeout(regionOpenTimer)
    regionOpenTimer = null
  }
  scheduleRegionClose(code)
}

function handleRegionClick(code: string) {
  if (!appStore.regionalTelemetryEnabled)
    return

  if (pinnedRegionCode.value === code) {
    pinnedRegionCode.value = null
    if (hasFineHoverPointer.value && hoveredRegionCode.value === code)
      activateRegion(code)
    else
      resetRegionInteraction()
    return
  }

  clearRegionTimers()
  pinnedRegionCode.value = code
  activateRegion(code)
}

function handleRegionFocus(code: string) {
  if (!pinnedRegionCode.value)
    activateRegion(code)
}

function handleRegionBlur(event: FocusEvent, code: string) {
  const root = event.currentTarget as HTMLElement | null
  if (root?.contains(event.relatedTarget as Node | null))
    return
  hoveredRegionCode.value = null
  scheduleRegionClose(code, 100)
}

function handleDocumentPointerDown(event: PointerEvent) {
  const root = containerRef.value
  if (!root || root.contains(event.target as Node))
    return
  resetRegionInteraction()
}

function handleDocumentKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && activeRegionCode.value) {
    event.preventDefault()
    resetRegionInteraction()
  }
}

function formatThroughput(value: number): string {
  return formatBytesPerSecondWithConfig(value, appStore.byteDecimals)
}

const totalServers = computed(() => displayNodes.value.length)
const onlineServers = computed(() => displayNodes.value.filter(node => node.online).length)
const offlineServers = computed(() => totalServers.value - onlineServers.value)
</script>

<template>
  <div
    ref="containerRef" class="node-earth-globe relative aspect-square w-full mx-auto"
    :class="[
      {
        'is-dragging': dragging,
        'is-intro': variant === 'intro',
        'has-region-readout': activeRegionCode !== null,
      },
      variant === 'intro' ? '' : '-translate-y-6 md:-translate-y-12',
      interactive ? 'touch-none cursor-grab active:cursor-grabbing' : '',
    ]"
    :role="interactive ? 'region' : undefined"
    :aria-label="interactive ? '可拖动旋转的全球节点地球' : undefined"
    @pointerdown="onPointerDown" @pointermove="onPointerMove" @pointerup="onPointerUp" @pointercancel="onPointerUp"
  >
    <canvas
      ref="canvasRef"
      class="earth-globe-canvas pointer-events-none absolute inset-0 w-full h-full select-none"
    />

    <div
      v-if="variant === 'dashboard' && dashboardPulseId && !appStore.disablePageAnimation && !prefersReducedMotion"
      :key="dashboardPulseId"
      class="lnl-dashboard-halo"
      :class="`is-${dashboardPulseOrigin || 'landing'}`"
      aria-hidden="true"
    >
      <span class="lnl-dashboard-halo-aura" />
      <span class="lnl-dashboard-halo-ring is-one" />
      <span class="lnl-dashboard-halo-ring is-two" />
    </div>

    <div
      v-if="variant === 'intro'"
      class="lnl-intro-halo"
      :class="{ 'is-releasing': introReleasing }"
      aria-hidden="true"
    >
      <span class="lnl-intro-halo-ring is-one" />
      <span class="lnl-intro-halo-ring is-two" />
      <span class="lnl-intro-halo-ring is-three" />
      <span class="lnl-intro-halo-wave" />
    </div>

    <template v-for="(cluster, clusterIndex) in showMarkers ? regionClusters : []" :key="cluster.code">
      <button
        :ref="bindClusterOverlayRef(cluster.code)"
        type="button"
        class="lnl-earth-overlay absolute -top-3.5 left-0"
        :class="{ 'is-active': activeRegionCode === cluster.code }"
        :style="{ '--lnl-marker-index': clusterIndex }"
        :aria-label="`${cluster.displayName}：${cluster.onlineServers}/${cluster.servers} 台在线，查看地区负载`"
        :aria-expanded="activeRegionCode === cluster.code"
        @pointerdown.stop
        @pointerenter="handleRegionPointerEnter($event, cluster.code)"
        @pointerleave="handleRegionPointerLeave($event, cluster.code)"
        @focus="handleRegionFocus(cluster.code)"
        @blur="handleRegionBlur($event, cluster.code)"
        @click.stop="handleRegionClick(cluster.code)"
      >
        <span class="lnl-earth-flag absolute -bottom-2 -left-2 z-3" aria-hidden="true">
          <span>{{ cluster.code }}</span>
          <img
            :src="`/images/flags/${cluster.code}.svg?v=${buildVersion}`" alt=""
            @load="handleFlagLoad"
            @error="handleFlagError"
          >
        </span>
        <div class="lnl-earth-count relative z-2 items-start justify-center text-nowrap">
          <div v-if="cluster.onlineServers > 0" class="flex items-center gap-1">
            <span class="inline-block size-1.5 rounded-full bg-green-600" />
            <span class="text-green-600">{{ cluster.onlineServers }}</span>
          </div>
          <div v-if="(cluster.servers - cluster.onlineServers) > 0" class="flex items-center gap-1">
            <span class="inline-block size-1.5 rounded-full bg-yellow-600" />
            <span class="text-yellow-600">{{ cluster.servers - cluster.onlineServers }}</span>
          </div>
        </div>
        <Transition name="region-readout">
          <div v-if="appStore.regionalTelemetryEnabled && activeRegionCode === cluster.code" class="lnl-earth-readout" role="status">
            <div class="lnl-earth-readout-head">
              <span>{{ cluster.code }} / REGION TELEMETRY</span>
              <strong>{{ cluster.displayName }}</strong>
              <small>{{ cluster.onlineServers }} / {{ cluster.servers }} ONLINE</small>
            </div>
            <dl>
              <div>
                <dt><span>CPU 总体负载</span><b>{{ cluster.cpuAverage.toFixed(1) }}%</b></dt>
                <dd><i :style="{ width: `${cluster.cpuAverage}%` }" /></dd>
              </div>
              <div>
                <dt><span>内存占用</span><b>{{ cluster.memoryPercent.toFixed(1) }}%</b></dt>
                <dd><i :style="{ width: `${cluster.memoryPercent}%` }" /></dd>
              </div>
            </dl>
            <div class="lnl-earth-readout-rate">
              <span>LIVE THROUGHPUT</span><b>{{ formatThroughput(cluster.throughput) }}</b>
            </div>
          </div>
        </Transition>
      </button>
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
  z-index: 1;
}

.node-earth-globe {
  width: min(100%, clamp(360px, 32vw, 500px));
  max-width: 500px;
  isolation: isolate;
}

.node-earth-globe.is-intro {
  width: 100%;
  max-width: none;
}

.lnl-dashboard-halo,
.lnl-dashboard-halo > span {
  position: absolute;
  pointer-events: none;
}

.lnl-dashboard-halo {
  z-index: 0;
  inset: 5%;
  border-radius: 50%;
}

.lnl-dashboard-halo > span {
  inset: 0;
  border-radius: 50%;
  opacity: 0;
  will-change: transform, opacity;
}

.lnl-dashboard-halo-aura {
  background: radial-gradient(
    circle,
    transparent 56%,
    color-mix(in srgb, var(--lnl-green) 11%, transparent) 72%,
    color-mix(in srgb, var(--lnl-cyan) 18%, transparent) 88%,
    transparent 100%
  );
  animation: dashboard-halo-aura 1.2s cubic-bezier(0.16, 1, 0.3, 1) both;
}

.lnl-dashboard-halo-ring {
  border: 1px solid color-mix(in srgb, var(--lnl-green) 54%, transparent);
  box-shadow: 0 0 20px color-mix(in srgb, var(--lnl-green) 12%, transparent);
  animation: dashboard-halo-ripple 1.2s cubic-bezier(0.16, 1, 0.3, 1) both;
}

.lnl-dashboard-halo-ring.is-two {
  border-color: color-mix(in srgb, var(--lnl-cyan) 38%, transparent);
  animation-delay: 110ms;
}

.lnl-dashboard-halo.is-route .lnl-dashboard-halo-aura,
.lnl-dashboard-halo.is-route .lnl-dashboard-halo-ring {
  animation-duration: 900ms;
}

.lnl-dashboard-halo.is-route .lnl-dashboard-halo-ring.is-two {
  animation-delay: 80ms;
}

.lnl-intro-halo,
.lnl-intro-halo-ring,
.lnl-intro-halo-wave {
  position: absolute;
  pointer-events: none;
}

.lnl-intro-halo {
  z-index: 1;
  inset: 3%;
  border-radius: 50%;
  contain: layout paint;
}

.lnl-intro-halo-ring,
.lnl-intro-halo-wave {
  inset: 0;
  border-radius: 50%;
  border: 1px solid color-mix(in srgb, var(--lnl-green) 42%, transparent);
  box-shadow:
    inset 0 0 28px color-mix(in srgb, var(--lnl-green) 6%, transparent),
    0 0 28px color-mix(in srgb, var(--lnl-green) 10%, transparent);
  opacity: 0;
  will-change: transform, opacity;
}

.lnl-intro-halo-ring.is-one {
  animation: intro-halo-breathe 2.8s 0.18s ease-in-out infinite;
}

.lnl-intro-halo-ring.is-two {
  inset: 5%;
  border-color: color-mix(in srgb, var(--lnl-cyan) 30%, transparent);
  animation: intro-halo-breathe 2.8s 0.82s ease-in-out infinite;
}

.lnl-intro-halo-ring.is-three {
  inset: -4%;
  border-style: dashed;
  border-color: color-mix(in srgb, var(--lnl-green) 20%, transparent);
  animation: intro-halo-breathe 3.3s 1.35s ease-in-out infinite;
}

.lnl-intro-halo.is-releasing .lnl-intro-halo-ring {
  animation: intro-halo-release 440ms cubic-bezier(0.2, 0.72, 0.2, 1) both;
}

.lnl-intro-halo.is-releasing .lnl-intro-halo-ring.is-two {
  animation-delay: 45ms;
}

.lnl-intro-halo.is-releasing .lnl-intro-halo-ring.is-three {
  animation-delay: 90ms;
}

.lnl-intro-halo.is-releasing .lnl-intro-halo-wave {
  border-color: color-mix(in srgb, var(--lnl-green) 58%, transparent);
  animation: intro-halo-wave 480ms cubic-bezier(0.16, 1, 0.3, 1) both;
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
  background: color-mix(in srgb, var(--background) 94%, var(--lnl-surface));
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
  z-index: 5;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  opacity: var(--lnl-cobe-visible, 0);
  backface-visibility: hidden;
  transition:
    opacity var(--lnl-motion-fast, 180ms) ease,
    visibility 0s linear var(--lnl-motion-fast, 180ms);
  will-change: transform, opacity;
}

.lnl-earth-overlay::before {
  content: '';
  position: absolute;
  z-index: 0;
  inset: -13px -11px;
  background: transparent;
}

.lnl-earth-overlay[data-front='false'] {
  visibility: hidden;
  opacity: 0 !important;
  pointer-events: none !important;
}

.lnl-earth-overlay[data-front='true'] {
  visibility: visible;
  transition-delay: 0s;
}

.lnl-earth-overlay.is-active {
  z-index: 30;
}

.node-earth-globe.has-region-readout .lnl-earth-overlay:not(.is-active) {
  opacity: 0.34 !important;
}

.lnl-earth-overlay:focus-visible {
  outline: none;
}

.lnl-earth-overlay:focus-visible .lnl-earth-flag {
  outline: 1px solid var(--lnl-green);
  outline-offset: 3px;
}

.lnl-earth-count {
  display: flex;
  min-width: 24px;
  min-height: 17px;
  flex-direction: column;
  margin-left: 15px;
  padding: 2px 7px;
  border: 1px solid color-mix(in srgb, var(--lnl-line) 72%, transparent);
  background: color-mix(in srgb, var(--background) 82%, transparent);
  box-shadow: 0 6px 20px rgb(0 0 0 / 12%);
  font: 8px/1.25 var(--font-mono);
  backdrop-filter: blur(7px);
  transform: translate3d(0, 0, 0);
  transition:
    opacity 160ms ease,
    transform 240ms cubic-bezier(0.22, 1, 0.36, 1),
    border-color 180ms ease,
    background-color 180ms ease;
}

.lnl-earth-flag {
  transition:
    opacity 160ms ease,
    transform 240ms cubic-bezier(0.22, 1, 0.36, 1);
}

.lnl-earth-overlay.is-active > :is(.lnl-earth-flag, .lnl-earth-count) {
  animation: none !important;
  opacity: 0;
  transform: translate3d(-5px, 3px, 0) scale(0.78);
}

.lnl-earth-overlay:hover .lnl-earth-count,
.lnl-earth-overlay:focus-visible .lnl-earth-count {
  border-color: color-mix(in srgb, var(--lnl-green) 54%, var(--lnl-line));
  background: color-mix(in srgb, var(--background) 94%, transparent);
}

.node-earth-globe.is-dragging .lnl-earth-overlay {
  transition: none;
}

.node-earth-globe:not(.is-intro) .lnl-earth-overlay > :not(.lnl-earth-readout) {
  animation: dashboard-marker-in 520ms calc(90ms + var(--lnl-marker-index, 0) * 45ms) cubic-bezier(0.16, 1, 0.3, 1) both;
  will-change: opacity, transform;
}

.lnl-earth-readout {
  position: absolute;
  z-index: 8;
  top: calc(-30px + var(--lnl-readout-shift-y, 0px));
  left: calc(25px + var(--lnl-readout-shift-x, 0px));
  width: min(260px, calc(100vw - 42px));
  padding: 14px;
  border: 1px solid color-mix(in srgb, var(--lnl-green) 42%, var(--lnl-line));
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--lnl-green) 7%, transparent), transparent 52%), var(--background);
  box-shadow: 0 18px 48px rgb(0 0 0 / 22%);
  text-align: left;
  transform-origin: top left;
}

.lnl-earth-overlay[data-side='left'] .lnl-earth-readout {
  right: calc(25px - var(--lnl-readout-shift-x, 0px));
  left: auto;
  transform-origin: top right;
}

.lnl-earth-readout-head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 3px 10px;
  padding-bottom: 9px;
  border-bottom: 1px solid var(--lnl-line);
}

.lnl-earth-readout-head > span {
  grid-column: 1 / -1;
  color: var(--lnl-green);
  font: 9px/1.3 var(--font-mono);
  letter-spacing: 0.12em;
}

.lnl-earth-readout-head strong {
  overflow: hidden;
  font: 650 15px/1.3 var(--font-sans);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lnl-earth-readout-head small {
  align-self: center;
  color: var(--muted-foreground);
  font: 9px/1 var(--font-mono);
}

.lnl-earth-readout dl {
  display: grid;
  gap: 11px;
  margin: 12px 0 0;
}

.lnl-earth-readout dt {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  color: var(--muted-foreground);
  font: 11px/1.35 var(--font-mono);
}

.lnl-earth-readout dt b {
  overflow: hidden;
  max-width: 154px;
  color: var(--foreground);
  font-size: 12px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lnl-earth-readout dd {
  height: 4px;
  margin: 5px 0 0;
  overflow: hidden;
  background: color-mix(in srgb, var(--lnl-line) 72%, transparent);
}

.lnl-earth-readout dd i {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, var(--lnl-green), var(--lnl-cyan));
  box-shadow: 0 0 10px color-mix(in srgb, var(--lnl-green) 36%, transparent);
  transition: width 420ms cubic-bezier(0.22, 1, 0.36, 1);
}

.lnl-earth-readout-rate {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid var(--lnl-line);
  font: 10px/1.25 var(--font-mono);
}

.lnl-earth-readout-rate span {
  color: var(--muted-foreground);
  letter-spacing: 0.1em;
}

.lnl-earth-readout-rate b {
  color: var(--lnl-green);
  font-weight: 500;
}

.region-readout-enter-active,
.region-readout-leave-active {
  transition:
    opacity 220ms ease,
    clip-path 340ms cubic-bezier(0.16, 1, 0.3, 1),
    transform 360ms cubic-bezier(0.16, 1, 0.3, 1);
}

.region-readout-enter-from,
.region-readout-leave-to {
  opacity: 0;
  clip-path: inset(0 100% 0 0);
  transform: translate3d(-9px, 5px, 0) scale(0.965);
}

.lnl-earth-overlay[data-side='left'] .region-readout-enter-from,
.lnl-earth-overlay[data-side='left'] .region-readout-leave-to {
  clip-path: inset(0 0 0 100%);
  transform: translate3d(9px, 5px, 0) scale(0.965);
}

@keyframes dashboard-halo-aura {
  0% {
    opacity: 0;
    transform: scale(0.94);
  }
  24% {
    opacity: 0.72;
  }
  100% {
    opacity: 0;
    transform: scale(1.18);
  }
}

@keyframes dashboard-halo-ripple {
  0% {
    opacity: 0;
    transform: scale(0.93);
  }
  18% {
    opacity: 0.78;
  }
  100% {
    opacity: 0;
    transform: scale(1.3);
  }
}

@keyframes intro-halo-breathe {
  0%,
  100% {
    opacity: 0.18;
    transform: scale(0.965);
  }
  50% {
    opacity: 0.68;
    transform: scale(1.025);
  }
}

@keyframes intro-halo-release {
  from {
    opacity: 0.62;
    transform: scale(1);
  }
  to {
    opacity: 0;
    transform: scale(1.24);
  }
}

@keyframes intro-halo-wave {
  from {
    opacity: 0.78;
    transform: scale(0.92);
  }
  to {
    opacity: 0;
    transform: scale(1.48);
  }
}

@keyframes dashboard-marker-in {
  from {
    opacity: 0;
    transform: translateY(5px) scale(0.86);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .node-earth-globe:not(.is-intro) .lnl-earth-overlay > :not(.lnl-earth-readout) {
    animation: none;
    opacity: 1;
    transform: none;
  }

  .region-readout-enter-active,
  .region-readout-leave-active,
  .lnl-earth-readout dd i,
  .lnl-dashboard-halo-aura,
  .lnl-dashboard-halo-ring,
  .lnl-intro-halo-ring,
  .lnl-intro-halo-wave {
    transition: none;
    animation: none;
  }
}
</style>
