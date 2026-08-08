<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { useAppStore } from '@/stores/app'

const appStore = useAppStore()
const ringRef = ref<HTMLElement | null>(null)
const dotRef = ref<HTMLElement | null>(null)
const enabled = ref(false)
const visible = ref(false)
const interactive = ref(false)
const pressed = ref(false)
const grabbing = ref(false)

let finePointerQuery: MediaQueryList | null = null
let reducedMotionQuery: MediaQueryList | null = null
let frame = 0
let lastFrameAt = 0
let initialized = false
let targetX = -100
let targetY = -100
let ringX = -100
let ringY = -100
let dotX = -100
let dotY = -100

const POSITION_EPSILON = 0.5
const RING_RETENTION = 0.8
const DOT_RETENTION = 0.2
const TEXT_TARGET_SELECTOR = 'input, textarea, select, [contenteditable="true"], [data-native-cursor]'
const INTERACTIVE_TARGET_SELECTOR = 'a, button, [role="button"], [role="link"], [tabindex]:not([tabindex="-1"]), .node-card, [data-custom-cursor="interactive"]'

function stopFrame() {
  if (frame)
    window.cancelAnimationFrame(frame)
  frame = 0
  lastFrameAt = 0
}

function writePosition(element: HTMLElement | null, x: number, y: number) {
  if (element)
    element.style.translate = `${x}px ${y}px 0`
}

function animateCursor(timestamp: number) {
  frame = 0
  const elapsedFrames = lastFrameAt > 0
    ? Math.min(4, Math.max(0.25, (timestamp - lastFrameAt) / (1000 / 60)))
    : 1
  lastFrameAt = timestamp

  const ringProgress = 1 - RING_RETENTION ** elapsedFrames
  const dotProgress = 1 - DOT_RETENTION ** elapsedFrames
  ringX += (targetX - ringX) * ringProgress
  ringY += (targetY - ringY) * ringProgress
  dotX += (targetX - dotX) * dotProgress
  dotY += (targetY - dotY) * dotProgress
  writePosition(ringRef.value, ringX, ringY)
  writePosition(dotRef.value, dotX, dotY)

  const unsettled = Math.abs(targetX - ringX) >= POSITION_EPSILON
    || Math.abs(targetY - ringY) >= POSITION_EPSILON
    || Math.abs(targetX - dotX) >= POSITION_EPSILON
    || Math.abs(targetY - dotY) >= POSITION_EPSILON
  if (unsettled)
    frame = window.requestAnimationFrame(animateCursor)
  else
    lastFrameAt = 0
}

function scheduleFrame() {
  if (!frame)
    frame = window.requestAnimationFrame(animateCursor)
}

function resetCursorState() {
  visible.value = false
  pressed.value = false
  grabbing.value = false
  interactive.value = false
  initialized = false
  stopFrame()
  document.documentElement.classList.remove('lnl-text-selecting')
}

function syncAvailability() {
  enabled.value = Boolean(
    finePointerQuery?.matches
    && !reducedMotionQuery?.matches
    && !appStore.disablePageAnimation,
  )
  document.documentElement.classList.toggle('lnl-custom-cursor-active', enabled.value)
  if (!enabled.value)
    resetCursorState()
}

function handlePointerMove(event: PointerEvent) {
  if (!enabled.value || event.pointerType !== 'mouse') {
    resetCursorState()
    return
  }

  const target = event.target instanceof Element ? event.target : null
  if (target?.closest(TEXT_TARGET_SELECTOR)) {
    visible.value = false
    document.documentElement.classList.add('lnl-text-selecting')
    return
  }

  document.documentElement.classList.remove('lnl-text-selecting')
  targetX = event.clientX
  targetY = event.clientY
  interactive.value = Boolean(target?.closest(INTERACTIVE_TARGET_SELECTOR))
  if (!initialized) {
    initialized = true
    ringX = dotX = targetX
    ringY = dotY = targetY
    writePosition(ringRef.value, ringX, ringY)
    writePosition(dotRef.value, dotX, dotY)
  }
  visible.value = true
  scheduleFrame()
}

function handlePointerDown(event: PointerEvent) {
  if (event.pointerType !== 'mouse' || !enabled.value)
    return
  pressed.value = true
  const target = event.target instanceof Element ? event.target : null
  grabbing.value = Boolean(target?.closest('.node-earth-globe'))
}

function handlePointerUp() {
  pressed.value = false
  grabbing.value = false
  document.documentElement.classList.remove('lnl-text-selecting')
}

function handleSelectStart() {
  if (!enabled.value)
    return
  visible.value = false
  document.documentElement.classList.add('lnl-text-selecting')
}

function bindMediaQuery(query: MediaQueryList, listener: () => void) {
  query.addEventListener?.('change', listener)
}

function unbindMediaQuery(query: MediaQueryList | null, listener: () => void) {
  query?.removeEventListener?.('change', listener)
}

onMounted(() => {
  finePointerQuery = window.matchMedia('(hover: hover) and (pointer: fine)')
  reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
  bindMediaQuery(finePointerQuery, syncAvailability)
  bindMediaQuery(reducedMotionQuery, syncAvailability)
  window.addEventListener('pointermove', handlePointerMove, { passive: true })
  window.addEventListener('pointerdown', handlePointerDown, { passive: true })
  window.addEventListener('pointerup', handlePointerUp, { passive: true })
  window.addEventListener('pointercancel', resetCursorState, { passive: true })
  window.addEventListener('blur', resetCursorState)
  document.addEventListener('mouseleave', resetCursorState)
  document.addEventListener('visibilitychange', resetCursorState)
  document.addEventListener('selectstart', handleSelectStart)
  syncAvailability()
})

watch(() => appStore.disablePageAnimation, syncAvailability)

onUnmounted(() => {
  stopFrame()
  unbindMediaQuery(finePointerQuery, syncAvailability)
  unbindMediaQuery(reducedMotionQuery, syncAvailability)
  window.removeEventListener('pointermove', handlePointerMove)
  window.removeEventListener('pointerdown', handlePointerDown)
  window.removeEventListener('pointerup', handlePointerUp)
  window.removeEventListener('pointercancel', resetCursorState)
  window.removeEventListener('blur', resetCursorState)
  document.removeEventListener('mouseleave', resetCursorState)
  document.removeEventListener('visibilitychange', resetCursorState)
  document.removeEventListener('selectstart', handleSelectStart)
  document.documentElement.classList.remove('lnl-custom-cursor-active', 'lnl-text-selecting')
})
</script>

<template>
  <template v-if="enabled">
    <i
      ref="ringRef"
      class="lnl-custom-cursor-ring"
      :class="{
        'is-visible': visible,
        'is-interactive': interactive,
        'is-pressed': pressed,
        'is-grabbing': grabbing,
      }"
      aria-hidden="true"
    />
    <i
      ref="dotRef"
      class="lnl-custom-cursor-dot"
      :class="{ 'is-visible': visible, 'is-pressed': pressed }"
      aria-hidden="true"
    />
  </template>
</template>

<style scoped>
.lnl-custom-cursor-ring,
.lnl-custom-cursor-dot {
  position: fixed;
  z-index: 2147483000;
  top: 0;
  left: 0;
  pointer-events: none;
  border-radius: 50%;
  opacity: 0;
  will-change: translate, opacity;
}

.lnl-custom-cursor-ring {
  width: 36px;
  height: 36px;
  margin: -18px 0 0 -18px;
  border: 1.5px solid color-mix(in srgb, var(--lnl-green) 64%, var(--foreground));
  background: color-mix(in srgb, var(--lnl-green) 3%, transparent);
  box-shadow: 0 0 22px color-mix(in srgb, var(--lnl-green) 7%, transparent);
  scale: 1;
  transition:
    scale 350ms var(--lnl-ease-emphasis),
    border-color 350ms ease,
    background-color 350ms ease,
    box-shadow 350ms ease,
    opacity 180ms ease;
}

.lnl-custom-cursor-dot {
  width: 5px;
  height: 5px;
  margin: -2.5px 0 0 -2.5px;
  background: var(--lnl-green);
  box-shadow: 0 0 10px color-mix(in srgb, var(--lnl-green) 48%, transparent);
  scale: 1;
  transition:
    scale 180ms var(--lnl-ease-out),
    opacity 160ms ease;
}

.lnl-custom-cursor-ring.is-visible,
.lnl-custom-cursor-dot.is-visible {
  opacity: 1;
}

.lnl-custom-cursor-ring.is-interactive {
  border-color: color-mix(in srgb, var(--lnl-green) 88%, var(--foreground));
  background: color-mix(in srgb, var(--lnl-green) 9%, transparent);
  box-shadow: 0 0 30px color-mix(in srgb, var(--lnl-green) 13%, transparent);
  scale: calc(56 / 36);
}

.lnl-custom-cursor-ring.is-pressed {
  scale: 0.78;
}

.lnl-custom-cursor-ring.is-grabbing {
  border-color: color-mix(in srgb, var(--lnl-cyan) 72%, var(--foreground));
  background: color-mix(in srgb, var(--lnl-cyan) 10%, transparent);
}

.lnl-custom-cursor-dot.is-pressed {
  scale: 1.45;
}

:global(html.lnl-custom-cursor-active body),
:global(html.lnl-custom-cursor-active a),
:global(html.lnl-custom-cursor-active button),
:global(html.lnl-custom-cursor-active [role='button']),
:global(html.lnl-custom-cursor-active [role='link']),
:global(html.lnl-custom-cursor-active .node-card),
:global(html.lnl-custom-cursor-active .node-earth-globe) {
  cursor: none !important;
}

:global(html.lnl-custom-cursor-active input),
:global(html.lnl-custom-cursor-active textarea),
:global(html.lnl-custom-cursor-active select),
:global(html.lnl-custom-cursor-active [contenteditable='true']),
:global(html.lnl-custom-cursor-active [data-native-cursor]) {
  cursor: auto !important;
}

:global(html.lnl-custom-cursor-active.lnl-text-selecting),
:global(html.lnl-custom-cursor-active.lnl-text-selecting *) {
  cursor: text !important;
}
</style>
