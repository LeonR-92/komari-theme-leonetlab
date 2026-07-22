<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import NodeEarthGlobe from '@/components/NodeEarthGlobe.vue'
import { useAppStore } from '@/stores/app'
import { useNodesStore } from '@/stores/nodes'

const emit = defineEmits<{ skip: [] }>()
const appStore = useAppStore()
const nodesStore = useNodesStore()
const phaseIndex = ref(0)
const logoVisible = ref(true)
const timers: number[] = []
const phases = computed(() => [
  appStore.brandIntroSubtitle,
  '正在建立实时数据链路',
  '正在校准全球节点坐标',
  '观测界面已就绪',
])
const totalNodes = computed(() => nodesStore.nodes.length)
const onlineNodes = computed(() => nodesStore.nodes.filter(node => node.online).length)
const offlineNodes = computed(() => Math.max(0, totalNodes.value - onlineNodes.value))
const rootRef = ref<HTMLElement>()
const globeSceneRef = ref<HTMLElement>()

function prepareHandoff(): boolean {
  const root = rootRef.value
  const source = globeSceneRef.value
  const target = document.querySelector<HTMLElement>('.lnl-summary .node-earth-globe:not(.is-intro)')
  if (!root || !source || !target)
    return false

  const sourceRect = source.getBoundingClientRect()
  const targetRect = target.getBoundingClientRect()
  if (sourceRect.width <= 0 || targetRect.width <= 0)
    return false

  root.style.setProperty('--intro-handoff-x', `${targetRect.left - sourceRect.left}px`)
  root.style.setProperty('--intro-handoff-y', `${targetRect.top - sourceRect.top}px`)
  root.style.setProperty('--intro-handoff-scale', `${targetRect.width / sourceRect.width}`)
  root.classList.add('is-handoff-ready')
  return true
}

defineExpose({ prepareHandoff })

function handleLogoError(event: Event) {
  const image = event.currentTarget as HTMLImageElement
  if (image.dataset.fallback !== '1' && image.src !== new URL('/favicon.ico', location.href).href) {
    image.dataset.fallback = '1'
    image.src = '/favicon.ico'
    return
  }
  logoVisible.value = false
}

onMounted(() => {
  ;[620, 1420, 2260].forEach((delay, index) => {
    timers.push(window.setTimeout(() => {
      phaseIndex.value = index + 1
    }, delay))
  })
})

onUnmounted(() => timers.forEach(timer => window.clearTimeout(timer)))
</script>

<template>
  <div
    ref="rootRef"
    class="lnl-intro"
    :class="appStore.isDark ? 'lnl-intro-dark' : 'lnl-intro-light'"
    role="status"
    aria-live="polite"
    aria-label="正在连接监控数据"
  >
    <div class="lnl-intro-grid" aria-hidden="true" />
    <div class="lnl-intro-ocean" aria-hidden="true" />

    <div class="lnl-intro-top" aria-hidden="true">
      <span>{{ appStore.brandShortName.toUpperCase() }} / MONITOR SESSION</span>
      <span>{{ onlineNodes }} ONLINE · {{ totalNodes }} NODES</span>
    </div>

    <div class="lnl-intro-scene">
      <div ref="globeSceneRef" class="lnl-intro-globe">
        <NodeEarthGlobe
          :nodes="nodesStore.earthNodes"
          variant="intro"
          :interactive="false"
          :show-status="false"
          :auto-rotate="false"
        />
        <div class="lnl-intro-globe-hud" aria-hidden="true">
          <span class="lnl-intro-logo">
            <img v-if="logoVisible" :src="appStore.brandLogoUrl" alt="" @error="handleLogoError">
            <b v-else>{{ appStore.brandShortName.slice(0, 1).toUpperCase() }}</b>
          </span>
          <span><i /> LIVE NODE MAP</span>
        </div>
      </div>

      <div class="lnl-intro-copy">
        <span>{{ appStore.brandIntroEyebrow }}</span>
        <strong>{{ appStore.brandName }}</strong>
        <p>
          <Transition name="phase" mode="out-in">
            <span :key="phases[phaseIndex]">{{ phases[phaseIndex] }}</span>
          </Transition>
        </p>
      </div>

      <dl class="lnl-intro-telemetry">
        <div><dt>ONLINE</dt><dd>{{ onlineNodes }}<small>/{{ totalNodes }}</small></dd></div>
        <div><dt>OFFLINE</dt><dd>{{ offlineNodes }}</dd></div>
        <div>
          <dt>TRANSPORT</dt><dd class="is-text">
            {{ appStore.rpcTransportMode.toUpperCase() }}
          </dd>
        </div>
      </dl>
    </div>

    <div class="lnl-intro-progress">
      <i />
    </div>
    <div class="lnl-intro-bottom" aria-hidden="true">
      <span>LIVE TOPOLOGY SYNCHRONIZATION</span><span>THEME / {{ appStore.resolvedThemeMode.toUpperCase() }}</span>
    </div>
    <button class="lnl-intro-skip" type="button" @click="emit('skip')">
      跳过
    </button>
  </div>
</template>

<style scoped>
.lnl-intro {
  --intro-bg: #030b09;
  --intro-ink: #e5eee9;
  --intro-muted: #91a79e;
  --intro-accent: #74e6b2;
  --intro-cyan: #75c9d4;
  position: fixed;
  z-index: 100;
  inset: 0;
  display: grid;
  place-items: center;
  overflow: hidden;
  contain: layout paint style;
  isolation: isolate;
  background: var(--intro-bg);
  color: var(--intro-ink);
}

.lnl-intro-light {
  --intro-bg: #edf6f1;
  --intro-ink: #10251d;
  --intro-muted: #506c61;
  --intro-accent: #167a56;
  --intro-cyan: #227f89;
}

.lnl-intro-grid,
.lnl-intro-ocean {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.lnl-intro-grid {
  background-image:
    linear-gradient(color-mix(in srgb, var(--intro-accent) 5%, transparent) 1px, transparent 1px),
    linear-gradient(90deg, color-mix(in srgb, var(--intro-accent) 5%, transparent) 1px, transparent 1px);
  background-size: 44px 44px;
  mask-image: radial-gradient(circle at 50% 44%, #000, transparent 76%);
  animation: intro-grid-in 1s ease both;
}

.lnl-intro-ocean {
  inset: auto -14% -47%;
  height: 84%;
  opacity: 0.22;
  background-image: radial-gradient(
    circle,
    color-mix(in srgb, var(--intro-accent) 72%, transparent) 0 1px,
    transparent 1.25px
  );
  background-size: 22px 17px;
  mask-image: linear-gradient(transparent, #000 25%, transparent 92%);
  transform: perspective(560px) rotateX(65deg) translate3d(0, 8%, 0);
  transform-origin: top;
  animation: intro-ocean 3.2s cubic-bezier(0.2, 0.72, 0.2, 1) both;
}

.lnl-intro-top,
.lnl-intro-bottom {
  position: absolute;
  z-index: 5;
  right: max(22px, env(safe-area-inset-right));
  left: max(22px, env(safe-area-inset-left));
  display: flex;
  justify-content: space-between;
  color: var(--intro-muted);
  font: 9px/1.4 var(--font-mono);
  letter-spacing: 0.14em;
}

.lnl-intro-top {
  top: max(20px, env(safe-area-inset-top));
}
.lnl-intro-bottom {
  bottom: max(17px, env(safe-area-inset-bottom));
  font-size: 8px;
}

.lnl-intro-scene {
  position: relative;
  z-index: 3;
  display: grid;
  width: min(92vw, 980px);
  grid-template-columns: minmax(300px, 1.08fr) minmax(280px, 0.92fr);
  grid-template-rows: auto auto;
  align-items: center;
  gap: 12px clamp(26px, 5vw, 70px);
}

.lnl-intro-globe {
  position: relative;
  grid-row: 1 / 3;
  width: min(48vw, 52dvh, 510px);
  aspect-ratio: 1;
  justify-self: end;
  opacity: 0;
  transform: translate3d(-12px, 10px, 0) scale(0.92);
  animation: intro-globe-in 1.05s 0.04s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  will-change: opacity, transform;
}

.lnl-intro-globe-hud {
  position: absolute;
  right: 7%;
  bottom: 10%;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 5px 7px;
  border: 1px solid color-mix(in srgb, var(--intro-accent) 24%, transparent);
  background: color-mix(in srgb, var(--intro-bg) 82%, transparent);
  color: var(--intro-muted);
  font: 7px/1 var(--font-mono);
  letter-spacing: 0.11em;
}

.lnl-intro-globe-hud > span:last-child {
  display: flex;
  align-items: center;
  gap: 5px;
}
.lnl-intro-globe-hud i {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--intro-accent);
  box-shadow: 0 0 10px var(--intro-accent);
}
.lnl-intro-logo {
  display: grid;
  width: 28px;
  aspect-ratio: 1;
  place-items: center;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--intro-accent) 32%, transparent);
}
.lnl-intro-logo img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.lnl-intro-logo b {
  font: 600 13px/1 var(--font-display);
}

.lnl-intro-copy {
  align-self: end;
  min-width: 0;
}
.lnl-intro-copy > span,
.lnl-intro-copy > p {
  font: 9px/1.6 var(--font-mono);
  letter-spacing: 0.13em;
}
.lnl-intro-copy > span {
  color: var(--intro-accent);
}
.lnl-intro-copy > strong {
  display: block;
  max-width: 100%;
  margin-top: 8px;
  overflow-wrap: anywhere;
  font: 400 clamp(40px, 5.8vw, 74px)/0.98 var(--font-display);
  letter-spacing: -0.045em;
}
.lnl-intro-copy > p {
  min-height: 1.6em;
  margin: 12px 0 0;
  color: var(--intro-muted);
}
.lnl-intro-copy > * {
  opacity: 0;
  transform: translateY(9px);
  animation: intro-copy-in 0.56s cubic-bezier(0.22, 1, 0.36, 1) forwards;
}
.lnl-intro-copy > span {
  animation-delay: 0.58s;
}
.lnl-intro-copy > strong {
  animation-delay: 0.7s;
}
.lnl-intro-copy > p {
  animation-delay: 0.84s;
}

.lnl-intro-telemetry {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  align-self: start;
  margin: 10px 0 0;
  border-block: 1px solid color-mix(in srgb, var(--intro-accent) 18%, transparent);
  opacity: 0;
  animation: intro-copy-in 0.6s 0.98s cubic-bezier(0.22, 1, 0.36, 1) forwards;
}

.lnl-intro-telemetry div {
  min-width: 0;
  padding: 12px 10px;
  border-right: 1px solid color-mix(in srgb, var(--intro-accent) 15%, transparent);
}
.lnl-intro-telemetry div:last-child {
  border-right: 0;
}
.lnl-intro-telemetry dt {
  color: var(--intro-muted);
  font: 7px var(--font-mono);
  letter-spacing: 0.12em;
}
.lnl-intro-telemetry dd {
  margin: 5px 0 0;
  color: var(--intro-accent);
  font: 600 20px/1 var(--font-mono);
}
.lnl-intro-telemetry dd.is-text {
  font-size: 10px;
  line-height: 20px;
}
.lnl-intro-telemetry small {
  margin-left: 3px;
  color: var(--intro-muted);
  font-size: 9px;
}

.lnl-intro-progress {
  position: absolute;
  z-index: 5;
  right: max(24px, 7vw);
  bottom: max(40px, calc(env(safe-area-inset-bottom) + 25px));
  left: max(24px, 7vw);
  height: 1px;
  background: color-mix(in srgb, var(--intro-muted) 17%, transparent);
}
.lnl-intro-progress i {
  display: block;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, var(--intro-accent), var(--intro-cyan));
  transform: scaleX(0);
  transform-origin: left;
  animation: intro-track 3.1s cubic-bezier(0.2, 0.72, 0.2, 1) forwards;
}
.lnl-intro-skip {
  position: absolute;
  z-index: 8;
  right: max(24px, env(safe-area-inset-right));
  bottom: max(42px, calc(env(safe-area-inset-bottom) + 27px));
  padding: 7px 10px;
  border: 1px solid color-mix(in srgb, var(--intro-accent) 24%, transparent);
  border-radius: 0;
  background: color-mix(in srgb, var(--intro-bg) 78%, transparent);
  color: var(--intro-muted);
  font: 9px/1 var(--font-mono);
  letter-spacing: 0.12em;
  cursor: pointer;
}
.lnl-intro-skip:hover,
.lnl-intro-skip:focus-visible {
  border-color: var(--intro-accent);
  color: var(--intro-accent);
}

.phase-enter-active,
.phase-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.26s cubic-bezier(0.22, 1, 0.36, 1);
}
.phase-enter-from {
  opacity: 0;
  transform: translateY(4px);
}
.phase-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
.lnl-intro-copy > p span {
  display: inline-block;
}

:global(.lnl-intro-exit-leave-active) .lnl-intro-globe {
  animation: none;
  transition:
    opacity 0.14s 0.7s ease,
    transform 0.84s cubic-bezier(0.2, 0.78, 0.2, 1);
  transform-origin: top left;
}
:global(.lnl-intro-exit-leave-to) .lnl-intro-globe {
  opacity: 0;
  transform: translate3d(var(--intro-handoff-x, 29vw), var(--intro-handoff-y, 16vh), 0)
    scale(var(--intro-handoff-scale, 0.78));
}
:global(.lnl-intro-exit-leave-active)
  :is(.lnl-intro-copy, .lnl-intro-telemetry, .lnl-intro-top, .lnl-intro-bottom, .lnl-intro-progress, .lnl-intro-skip) {
  transition:
    opacity 0.28s ease,
    transform 0.38s ease;
}
:global(.lnl-intro-exit-leave-to)
  :is(.lnl-intro-copy, .lnl-intro-telemetry, .lnl-intro-top, .lnl-intro-bottom, .lnl-intro-progress, .lnl-intro-skip) {
  opacity: 0;
  transform: translateY(-8px);
}

@keyframes intro-grid-in {
  from {
    opacity: 0;
    transform: scale(1.02);
  }
  to {
    opacity: 0.9;
    transform: none;
  }
}
@keyframes intro-ocean {
  from {
    opacity: 0;
    transform: perspective(560px) rotateX(65deg) translate3d(0, 14%, 0);
  }
  to {
    opacity: 0.22;
    transform: perspective(560px) rotateX(65deg) translate3d(0, -7%, 0);
  }
}
@keyframes intro-globe-in {
  to {
    opacity: 1;
    transform: none;
  }
}
@keyframes intro-copy-in {
  to {
    opacity: 1;
    transform: none;
  }
}
@keyframes intro-track {
  0% {
    transform: scaleX(0.015);
  }
  72% {
    transform: scaleX(0.82);
  }
  to {
    transform: scaleX(1);
  }
}

@media (max-width: 680px) {
  .lnl-intro-scene {
    width: min(92vw, 430px);
    grid-template-columns: 1fr;
    grid-template-rows: auto auto auto;
    justify-items: center;
    gap: 6px;
  }
  .lnl-intro-globe {
    grid-row: auto;
    width: min(86vw, 44dvh, 380px);
    justify-self: center;
  }
  .lnl-intro-copy {
    width: 100%;
    text-align: center;
  }
  .lnl-intro-copy > strong {
    max-inline-size: 100%;
    font-size: clamp(28px, 8.4vw, 40px);
    line-height: 1.02;
    overflow-wrap: anywhere;
    text-wrap: balance;
    word-break: normal;
  }
  .lnl-intro-copy > span,
  .lnl-intro-copy > p {
    font-size: 7px;
  }
  .lnl-intro-telemetry {
    width: min(100%, 360px);
    margin-top: 7px;
  }
  .lnl-intro-globe-hud {
    right: 2%;
  }
  .lnl-intro-globe-hud > span:last-child {
    display: none;
  }
  .lnl-intro-telemetry div {
    padding: 9px 7px;
  }
  .lnl-intro-top span:last-child,
  .lnl-intro-bottom span:last-child {
    display: none;
  }
  :global(.lnl-intro-exit-leave-to) .lnl-intro-globe {
    opacity: 0;
    transform: translate3d(var(--intro-handoff-x, 0), var(--intro-handoff-y, -24vh), 0)
      scale(var(--intro-handoff-scale, 1.04));
  }
}

@media (orientation: landscape) and (max-height: 560px) {
  .lnl-intro-scene {
    width: min(90vw, 820px);
    grid-template-columns: minmax(250px, 0.9fr) minmax(250px, 1.1fr);
    grid-template-rows: auto auto;
  }
  .lnl-intro-globe {
    grid-row: 1 / 3;
    width: min(45vw, 72dvh, 330px);
  }
  .lnl-intro-copy {
    text-align: left;
  }
}

@media (prefers-reduced-motion: reduce) {
  .lnl-intro-grid,
  .lnl-intro-ocean,
  .lnl-intro-globe,
  .lnl-intro-copy > *,
  .lnl-intro-telemetry,
  .lnl-intro-progress i {
    animation: none !important;
    opacity: 1;
    transform: none;
  }
  .phase-enter-active,
  .phase-leave-active {
    transition: none;
  }
}
</style>
