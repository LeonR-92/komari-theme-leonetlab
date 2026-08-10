<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { useMotionPreference } from '@/composables/useMotionPreference'
import { useAppStore } from '@/stores/app'
import { isMobileLike } from '@/utils/mobilePerf'

const props = withDefaults(defineProps<{ paused?: boolean }>(), { paused: false })

interface OceanPoint {
  column: number
  row: number
  phase: number
  x: number
  y: number
  depth: number
}

interface NavigatorWithConnection extends Navigator {
  connection?: { saveData?: boolean }
}

const appStore = useAppStore()
const { motionReduced } = useMotionPreference()
const canvasRef = ref<HTMLCanvasElement | null>(null)
const themeTransitioning = ref(false)
const saveData = (navigator as NavigatorWithConnection).connection?.saveData === true

let context: CanvasRenderingContext2D | null = null
let points: OceanPoint[] = []
let columns = 0
let rows = 0
let width = 0
let height = 0
let dpr = 1
let animationFrame = 0
let resizeTimer = 0
let lastPaint = 0

function canAnimate(): boolean {
  return !motionReduced.value
    && !saveData
    && !props.paused
    && !themeTransitioning.value
    && !document.hidden
}

function measureHost() {
  const rect = canvasRef.value?.parentElement?.getBoundingClientRect()
  return {
    width: Math.max(320, Math.round(rect?.width || window.innerWidth)),
    height: Math.max(480, Math.round(rect?.height || window.innerHeight)),
  }
}

function configureCanvas() {
  const canvas = canvasRef.value
  if (!canvas)
    return

  const size = measureHost()
  width = size.width
  height = size.height
  const mobile = width < 760
  dpr = Math.min(window.devicePixelRatio || 1, mobile ? 1 : 1.3)
  canvas.width = Math.round(width * dpr)
  canvas.height = Math.round(height * dpr)
  context = canvas.getContext('2d', { alpha: true })
  context?.setTransform(dpr, 0, 0, dpr, 0, 0)

  columns = mobile ? 14 : width > 1500 ? 30 : 25
  rows = mobile ? 15 : 21
  points = []
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      points.push({ column, row, phase: Math.sin(column * 1.91 + row * 2.37) * 2.4, x: 0, y: 0, depth: 0 })
    }
  }
  paint(performance.now())
}

function updatePoints(time: number) {
  const horizon = height * (width < 760 ? 0.18 : 0.12)
  const oceanHeight = height * 0.98
  const centerX = width * 0.5

  for (const point of points) {
    const u = columns <= 1 ? 0 : point.column / (columns - 1)
    const v = rows <= 1 ? 0 : point.row / (rows - 1)
    const perspective = v * v
    const spread = 0.34 + v * 0.82
    const wave = Math.sin(time * 0.00052 + point.column * 0.56 + point.row * 0.18 + point.phase)
    const crossWave = Math.cos(time * 0.00034 + point.column * 0.23 - point.row * 0.39)
    point.x = centerX + (u - 0.5) * width * spread + wave * (5 + v * 18)
    point.y = horizon + perspective * oceanHeight + crossWave * (2 + v * 10) - wave * v * 7
    point.depth = v
  }
}

function paint(time: number) {
  const ctx = context
  if (!ctx)
    return

  ctx.clearRect(0, 0, width, height)
  updatePoints(time)
  const dark = appStore.isDark
  const green = dark ? '116, 230, 178' : '35, 126, 91'
  const cyan = dark ? '117, 201, 212' : '45, 129, 143'

  for (const point of points) {
    if (point.y < -8 || point.y > height + 8)
      continue
    const alpha = (dark ? 0.09 : 0.12) + point.depth * (dark ? 0.34 : 0.28)
    ctx.beginPath()
    ctx.arc(point.x, point.y, 0.55 + point.depth * 1.15, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(${point.column % 5 === 0 ? cyan : green}, ${alpha})`
    ctx.fill()
  }
}

function animate(time: number) {
  animationFrame = 0
  if (!canAnimate())
    return
  const targetFps = isMobileLike ? 24 : 40
  if (time - lastPaint >= 1000 / targetFps) {
    lastPaint = time
    paint(time)
  }
  animationFrame = window.requestAnimationFrame(animate)
}

function syncAnimation() {
  if (animationFrame) {
    window.cancelAnimationFrame(animationFrame)
    animationFrame = 0
  }
  if (!canAnimate()) {
    if (motionReduced.value || saveData)
      paint(performance.now())
    return
  }
  animationFrame = window.requestAnimationFrame(animate)
}

function handleResize() {
  window.clearTimeout(resizeTimer)
  resizeTimer = window.setTimeout(() => {
    // 移动端地址栏收起/展开只改高度（通常 <150px）。此时父容器已按 100lvh
    // 固定，跳过 canvas 重建，避免滚动中背景重绘抖动；宽度变化（旋转/分屏）
    // 或大幅高度变化仍正常重建。
    const next = measureHost()
    if (next.width === width && Math.abs(next.height - height) < 150)
      return
    configureCanvas()
  }, 160)
}

function handleVisibilityChange() {
  if (!document.hidden)
    lastPaint = 0
  syncAnimation()
}

function handleThemeTransitionStart() {
  themeTransitioning.value = true
  syncAnimation()
}

function handleThemeTransitionEnd() {
  themeTransitioning.value = false
  lastPaint = 0
  paint(performance.now())
  syncAnimation()
}

watch(() => appStore.isDark, () => paint(performance.now()))
watch(() => props.paused, syncAnimation)
watch(motionReduced, syncAnimation)

onMounted(() => {
  configureCanvas()
  window.addEventListener('resize', handleResize, { passive: true })
  window.addEventListener('leonetlab:theme-transition-start', handleThemeTransitionStart)
  window.addEventListener('leonetlab:theme-transition-end', handleThemeTransitionEnd)
  document.addEventListener('visibilitychange', handleVisibilityChange)
  // 只保留动态点阵海洋。移动端以 24fps、1x DPR 和稀疏网格运行；
  // 减少动态效果或省流量模式仍只绘制静态帧。
  syncAnimation()
})

onUnmounted(() => {
  window.cancelAnimationFrame(animationFrame)
  window.clearTimeout(resizeTimer)
  window.removeEventListener('resize', handleResize)
  window.removeEventListener('leonetlab:theme-transition-start', handleThemeTransitionStart)
  window.removeEventListener('leonetlab:theme-transition-end', handleThemeTransitionEnd)
  document.removeEventListener('visibilitychange', handleVisibilityChange)
})
</script>

<template>
  <canvas ref="canvasRef" class="lnl-data-ocean" aria-hidden="true" />
</template>

<style scoped>
.lnl-data-ocean {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0.92;
  mask-image: linear-gradient(to bottom, transparent 0, #000 11%, #000 91%, transparent 100%);
}

@media (prefers-reduced-motion: reduce) {
  .lnl-data-ocean {
    opacity: 0.7;
  }
}
</style>
