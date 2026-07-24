<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
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
const canvasRef = ref<HTMLCanvasElement | null>(null)
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
const saveData = (navigator as NavigatorWithConnection).connection?.saveData === true
const currents = [
  [0.03, 0.76, 0.34, 0.22, 0.96, 0.58, 0.05],
  [0.12, 0.49, 0.51, 0.1, 1.03, 0.35, 0.42],
  [-0.06, 0.31, 0.28, 0.06, 0.78, 0.19, 0.73],
  [0.29, 0.92, 0.69, 0.48, 1.08, 0.8, 0.91],
] as const

let context: CanvasRenderingContext2D | null = null
let points: OceanPoint[] = []
let columns = 0
let rows = 0
let width = 0
let height = 0
let dpr = 1
let animationFrame = 0
let resizeFrame = 0
let lastPaint = 0

function configureCanvas() {
  const canvas = canvasRef.value
  if (!canvas)
    return

  width = Math.max(320, window.innerWidth)
  height = Math.max(480, window.innerHeight)
  const mobile = width < 760
  dpr = Math.min(window.devicePixelRatio || 1, mobile ? 1.15 : 1.3)
  canvas.width = Math.round(width * dpr)
  canvas.height = Math.round(height * dpr)
  canvas.style.width = `${width}px`
  canvas.style.height = `${height}px`
  context = canvas.getContext('2d', { alpha: true })
  context?.setTransform(dpr, 0, 0, dpr, 0, 0)

  columns = mobile ? 18 : width > 1500 ? 30 : 25
  rows = mobile ? 17 : 21
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

function pointAt(row: number, column: number) {
  return points[row * columns + column]
}

function quadraticPoint(current: readonly number[], progress: number) {
  const [sx = 0, sy = 0, cx = 0, cy = 0, ex = 0, ey = 0] = current
  const inverse = 1 - progress
  return {
    x: (inverse * inverse * sx + 2 * inverse * progress * cx + progress * progress * ex) * width,
    y: (inverse * inverse * sy + 2 * inverse * progress * cy + progress * progress * ey) * height,
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

  ctx.lineWidth = 0.7
  for (let row = 2; row < rows; row += 3) {
    ctx.beginPath()
    for (let column = 0; column < columns; column++) {
      const point = pointAt(row, column)
      if (!point)
        continue
      if (column === 0)
        ctx.moveTo(point.x, point.y)
      else
        ctx.lineTo(point.x, point.y)
    }
    ctx.strokeStyle = `rgba(${row % 2 ? cyan : green}, ${dark ? 0.065 : 0.085})`
    ctx.stroke()
  }

  for (let column = 1; column < columns; column += 4) {
    ctx.beginPath()
    for (let row = 0; row < rows; row++) {
      const point = pointAt(row, column)
      if (!point)
        continue
      if (row === 0)
        ctx.moveTo(point.x, point.y)
      else
        ctx.lineTo(point.x, point.y)
    }
    ctx.strokeStyle = `rgba(${cyan}, ${dark ? 0.045 : 0.065})`
    ctx.stroke()
  }

  for (const point of points) {
    if (point.y < -8 || point.y > height + 8)
      continue
    const alpha = (dark ? 0.09 : 0.12) + point.depth * (dark ? 0.34 : 0.28)
    ctx.beginPath()
    ctx.arc(point.x, point.y, 0.55 + point.depth * 1.15, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(${point.column % 5 === 0 ? cyan : green}, ${alpha})`
    ctx.fill()
  }

  currents.forEach((current, index) => {
    const [sx, sy, cx, cy, ex, ey, phase] = current
    const gradient = ctx.createLinearGradient(sx * width, sy * height, ex * width, ey * height)
    gradient.addColorStop(0, `rgba(${green}, 0)`)
    gradient.addColorStop(0.42, `rgba(${index % 2 ? cyan : green}, ${dark ? 0.18 : 0.16})`)
    gradient.addColorStop(1, `rgba(${cyan}, 0)`)
    ctx.beginPath()
    ctx.moveTo(sx * width, sy * height)
    ctx.quadraticCurveTo(cx * width, cy * height, ex * width, ey * height)
    ctx.strokeStyle = gradient
    ctx.lineWidth = index === 0 ? 1.25 : 0.8
    ctx.stroke()

    const progress = (time * (0.000035 + index * 0.000004) + phase) % 1
    const packet = quadraticPoint(current, progress)
    const glow = ctx.createRadialGradient(packet.x, packet.y, 0, packet.x, packet.y, 12)
    glow.addColorStop(0, `rgba(${index % 2 ? cyan : green}, 0.85)`)
    glow.addColorStop(0.18, `rgba(${index % 2 ? cyan : green}, 0.34)`)
    glow.addColorStop(1, `rgba(${green}, 0)`)
    ctx.fillStyle = glow
    ctx.fillRect(packet.x - 12, packet.y - 12, 24, 24)
  })
}

function animate(time: number) {
  animationFrame = window.requestAnimationFrame(animate)
  if (props.paused || document.hidden || time - lastPaint < 1000 / 50)
    return
  lastPaint = time
  paint(time)
}

function handleResize() {
  window.cancelAnimationFrame(resizeFrame)
  resizeFrame = window.requestAnimationFrame(configureCanvas)
}

function handleVisibilityChange() {
  if (!document.hidden)
    lastPaint = 0
}

watch(() => appStore.isDark, () => paint(performance.now()))
watch(() => props.paused, paused => !paused && paint(performance.now()))

onMounted(() => {
  configureCanvas()
  window.addEventListener('resize', handleResize, { passive: true })
  document.addEventListener('visibilitychange', handleVisibilityChange)
  // 移动端（触屏/小视口）只绘制静态帧：全屏 50fps Canvas 是发热与掉帧的
  // 主要来源之一；resize/主题变化仍会通过既有 watcher 重绘单帧。
  if (!reducedMotion && !saveData && !isMobileLike)
    animationFrame = window.requestAnimationFrame(animate)
})

onUnmounted(() => {
  window.cancelAnimationFrame(animationFrame)
  window.cancelAnimationFrame(resizeFrame)
  window.removeEventListener('resize', handleResize)
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
