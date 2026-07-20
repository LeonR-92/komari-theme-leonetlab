<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'

const emit = defineEmits<{ skip: [] }>()
const regions = [
  { code: 'HK', className: 'n1' },
  { code: 'JP', className: 'n2' },
  { code: 'US', className: 'n3' },
  { code: 'SG', className: 'n4' },
  { code: 'UK', className: 'n5' },
  { code: 'FR', className: 'n6' },
  { code: 'DE', className: 'n7' },
  { code: 'ZA', className: 'n8' },
]

const phases = [
  'EDGE DISCOVERY',
  'ROUTE NEGOTIATION',
  'SESSION SYNCHRONIZED',
  'CONSOLE READY',
]
const phaseIndex = ref(0)
const timers: number[] = []
const viewportWidth = window.innerWidth
const viewportHeight = window.innerHeight
const landscapeCompact = viewportHeight < 560 && viewportWidth > viewportHeight
const mobile = viewportWidth < 680
const globeSize = landscapeCompact
  ? Math.min(viewportHeight * 0.66, 320)
  : mobile
    ? Math.min(viewportWidth * 0.72, viewportHeight * 0.43, 330)
    : Math.min(viewportWidth * 0.46, viewportHeight * 0.48, 480)
const titleSize = mobile
  ? Math.max(40, Math.min(viewportWidth * 0.13, 58))
  : Math.max(42, Math.min(viewportWidth * 0.07, viewportHeight * 0.085, 78))
const introStyle = computed(() => ({
  '--lnl-intro-globe': `${Math.max(190, globeSize)}px`,
  '--lnl-intro-title': `${titleSize}px`,
}))

onMounted(() => {
  ;[620, 1450, 2350].forEach((delay, index) => {
    timers.push(window.setTimeout(() => {
      phaseIndex.value = index + 1
    }, delay))
  })
})

onUnmounted(() => timers.forEach(timer => window.clearTimeout(timer)))
</script>

<template>
  <div class="lnl-intro" :style="introStyle" role="status" aria-live="polite" aria-label="正在连接监控数据">
    <div class="lnl-intro-grid" aria-hidden="true" />
    <div class="lnl-intro-ocean" aria-hidden="true" />
    <div class="lnl-intro-top" aria-hidden="true">
      <span>LNL / MONITOR SESSION</span><span>08 REGIONS · EDGE READY</span>
    </div>
    <div class="lnl-intro-scene">
      <div class="lnl-intro-globe" aria-hidden="true">
        <svg viewBox="0 0 600 600" focusable="false">
          <circle class="sphere" cx="300" cy="300" r="248" />
          <ellipse class="meridian" cx="300" cy="300" rx="118" ry="248" />
          <ellipse class="latitude" cx="300" cy="300" rx="248" ry="104" />
          <path class="route r1" pathLength="1" d="M300 54 Q202 151 300 300" />
          <path class="route r2" pathLength="1" d="M466 118 Q420 232 300 300" />
          <path class="route r3" pathLength="1" d="M548 288 Q430 268 300 300" />
          <path class="route r4" pathLength="1" d="M456 492 Q401 384 300 300" />
          <path class="route r5" pathLength="1" d="M300 546 Q326 409 300 300" />
          <path class="route r6" pathLength="1" d="M128 478 Q204 395 300 300" />
          <path class="route r7" pathLength="1" d="M52 292 Q179 265 300 300" />
          <path class="route r8" pathLength="1" d="M134 120 Q207 221 300 300" />
        </svg>
        <span v-for="region in regions" :key="region.code" class="lnl-intro-node" :class="region.className"><i />{{ region.code }}</span>
        <div class="lnl-intro-core">
          <span><img src="/images/logo/leonetlab.png" alt=""></span>
          <small>TELEMETRY READY</small>
        </div>
      </div>
      <div class="lnl-intro-copy">
        <span>PRIVATE OBSERVATORY / GLOBAL EDGE</span>
        <strong>LeoNetLab</strong>
        <p>
          <Transition name="phase" mode="out-in">
            <span :key="phases[phaseIndex]">{{ phases[phaseIndex] }}</span>
          </Transition>
        </p>
      </div>
    </div>
    <div class="lnl-intro-progress">
      <i />
    </div>
    <div class="lnl-intro-bottom" aria-hidden="true">
      <span>NEGOTIATING EDGE SESSION</span><span>HK · JP · US · SG · UK · FR · DE · ZA</span>
    </div>
    <button class="lnl-intro-skip" type="button" @click="emit('skip')">
      跳过
    </button>
  </div>
</template>

<style scoped>
.lnl-intro {
  --lnl-intro-globe: clamp(210px, min(46vw, 48dvh), 480px);
  --lnl-intro-title: clamp(42px, min(7vw, 8.5dvh), 78px);
  position: fixed;
  inset: 0;
  z-index: 100;
  display: grid;
  place-items: center;
  overflow: hidden;
  contain: layout paint style;
  background: #030b09;
  color: #e5eee9;
  isolation: isolate;
}
.lnl-intro::before {
  content: '';
  position: absolute;
  inset: -20%;
  background:
    radial-gradient(circle at 50% 43%, rgba(116, 230, 178, 0.14), transparent 26rem),
    linear-gradient(112deg, transparent 25%, rgba(117, 201, 212, 0.065) 50%, transparent 72%);
  animation: lnl-sweep 2.8s cubic-bezier(0.22, 1, 0.36, 1) both;
}
.lnl-intro-grid {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(116, 230, 178, 0.035) 1px, transparent 1px),
    linear-gradient(90deg, rgba(116, 230, 178, 0.035) 1px, transparent 1px);
  background-size: 42px 42px;
  mask-image: radial-gradient(circle at 50% 46%, #000, transparent 74%);
  animation: lnl-grid 1.15s ease both;
}
.lnl-intro-ocean {
  position: absolute;
  z-index: 1;
  right: -18%;
  bottom: -40%;
  left: -18%;
  height: 92%;
  opacity: 0;
  background-image:
    radial-gradient(circle, rgba(116, 230, 178, 0.86) 0 1px, transparent 1.25px),
    radial-gradient(circle, rgba(117, 201, 212, 0.32) 0 0.7px, transparent 1px);
  background-position:
    0 0,
    12px 9px;
  background-size: 24px 18px;
  transform: perspective(540px) rotateX(63deg) translate3d(0, 13%, 0) scale(1.06);
  transform-origin: 50% 0;
  mask-image: linear-gradient(transparent 2%, #000 22%, #000 72%, transparent 96%);
  animation: lnl-intro-ocean 3.2s cubic-bezier(0.18, 0.68, 0.22, 1) both;
}
.lnl-intro-ocean::after {
  content: '';
  position: absolute;
  inset: 18% 8% 20%;
  border: 1px solid rgba(117, 201, 212, 0.13);
  border-width: 1px 0 0;
  border-radius: 50%;
  box-shadow: 0 -18px 44px rgba(116, 230, 178, 0.045);
  transform: rotate(-5deg);
  animation: lnl-intro-current 2.8s ease-in-out both;
}
.lnl-intro-top,
.lnl-intro-bottom {
  position: absolute;
  z-index: 5;
  right: max(24px, env(safe-area-inset-right));
  left: max(24px, env(safe-area-inset-left));
  display: flex;
  justify-content: space-between;
  color: #789087;
  font:
    10px/1.4 ui-monospace,
    SFMono-Regular,
    Consolas,
    monospace;
  letter-spacing: 0.16em;
}
.lnl-intro-top {
  top: max(22px, env(safe-area-inset-top));
}
.lnl-intro-bottom {
  bottom: max(18px, env(safe-area-inset-bottom));
  font-size: 8px;
}
.lnl-intro-scene {
  position: relative;
  z-index: 3;
  display: grid;
  justify-items: center;
  gap: clamp(12px, 2vh, 22px);
}
.lnl-intro-globe {
  position: relative;
  width: var(--lnl-intro-globe);
  aspect-ratio: 1;
  flex: none;
  opacity: 0;
  transform: translate3d(0, 10px, 0) scale(0.9) rotate(-4deg);
  animation: lnl-globe 1.05s 0.05s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}
.lnl-intro-globe::before {
  content: '';
  position: absolute;
  inset: 4%;
  border: 1px solid rgba(116, 230, 178, 0.09);
  border-radius: 50%;
  box-shadow:
    0 0 55px rgba(116, 230, 178, 0.05),
    inset 0 0 48px rgba(117, 201, 212, 0.04);
}
.lnl-intro-globe svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
}
.lnl-intro-globe :is(.sphere, .meridian, .latitude) {
  fill: none;
  stroke: rgba(117, 201, 212, 0.22);
  stroke-width: 1.2;
  vector-effect: non-scaling-stroke;
}
.lnl-intro-globe .sphere {
  stroke: rgba(116, 230, 178, 0.34);
}
.lnl-intro-globe .meridian {
  stroke-dasharray: 4 6;
}
.lnl-intro-globe .latitude {
  stroke-dasharray: 2 7;
}
.route {
  fill: none;
  stroke: #74e6b2;
  stroke-width: 1.35;
  stroke-linecap: round;
  stroke-dasharray: 1;
  stroke-dashoffset: 1;
  vector-effect: non-scaling-stroke;
  opacity: 0.72;
  animation: lnl-route 0.78s cubic-bezier(0.2, 0.72, 0.2, 1) forwards;
}
.r1 {
  animation-delay: 0.24s;
}
.r2 {
  animation-delay: 0.31s;
}
.r3 {
  animation-delay: 0.38s;
}
.r4 {
  animation-delay: 0.45s;
}
.r5 {
  animation-delay: 0.52s;
}
.r6 {
  animation-delay: 0.59s;
}
.r7 {
  animation-delay: 0.66s;
}
.r8 {
  animation-delay: 0.73s;
}
.lnl-intro-node {
  position: absolute;
  z-index: 3;
  display: flex;
  align-items: center;
  gap: 5px;
  color: #9eb4ab;
  font:
    8px ui-monospace,
    SFMono-Regular,
    Consolas,
    monospace;
  letter-spacing: 0.11em;
  opacity: 0;
  transform: translate(-50%, -50%) scale(0.7);
  animation: lnl-node 0.44s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}
.lnl-intro-node i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #74e6b2;
  box-shadow: 0 0 12px rgba(116, 230, 178, 0.55);
}
.n1 {
  left: 50%;
  top: 9%;
  animation-delay: 0.31s;
}
.n2 {
  left: 79%;
  top: 20%;
  animation-delay: 0.38s;
}
.n3 {
  left: 91%;
  top: 49%;
  animation-delay: 0.45s;
}
.n4 {
  left: 78%;
  top: 82%;
  animation-delay: 0.52s;
}
.n5 {
  left: 50%;
  top: 92%;
  animation-delay: 0.59s;
}
.n6 {
  left: 22%;
  top: 81%;
  animation-delay: 0.66s;
}
.n7 {
  left: 9%;
  top: 49%;
  animation-delay: 0.73s;
}
.n8 {
  left: 22%;
  top: 20%;
  animation-delay: 0.8s;
}
.n2,
.n3,
.n4 {
  flex-direction: row-reverse;
}
.lnl-intro-core {
  position: absolute;
  z-index: 5;
  left: 50%;
  top: 50%;
  display: grid;
  justify-items: center;
  gap: 8px;
  transform: translate(-50%, -50%);
  color: #9eb4ab;
  font:
    8px ui-monospace,
    SFMono-Regular,
    Consolas,
    monospace;
  letter-spacing: 0.12em;
  white-space: nowrap;
}
.lnl-intro-core > span {
  width: 76px;
  height: 76px;
  box-sizing: border-box;
  overflow: hidden;
  aspect-ratio: 1;
  padding: 7px;
  border: 1px solid rgba(116, 230, 178, 0.4);
  border-radius: 19px;
  background: #071310;
  box-shadow:
    0 0 0 8px rgba(3, 11, 9, 0.76),
    0 0 34px rgba(116, 230, 178, 0.1);
}
.lnl-intro-core img {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: 12px;
  object-fit: contain;
}
.lnl-intro-copy {
  display: grid;
  justify-items: center;
  text-align: center;
}
.lnl-intro-copy > span,
.lnl-intro-copy > p {
  font:
    9px ui-monospace,
    SFMono-Regular,
    Consolas,
    monospace;
  letter-spacing: 0.15em;
}
.lnl-intro-copy > span {
  color: #74e6b2;
}
.lnl-intro-copy > strong {
  font:
    400 var(--lnl-intro-title)/0.98 Georgia,
    'Noto Serif SC',
    serif;
  letter-spacing: -0.055em;
}
.lnl-intro-copy > p {
  margin: 8px 0 0;
  color: #91a79e;
}
.lnl-intro-copy > * {
  opacity: 0;
  transform: translateY(8px);
  animation: lnl-copy 0.54s cubic-bezier(0.22, 1, 0.36, 1) forwards;
}
.lnl-intro-copy > span {
  animation-delay: 0.74s;
}
.lnl-intro-copy > strong {
  animation-delay: 0.84s;
}
.lnl-intro-copy > p {
  animation-delay: 1.02s;
}
.lnl-intro-progress {
  position: absolute;
  z-index: 5;
  right: max(24px, 7vw);
  bottom: max(42px, calc(env(safe-area-inset-bottom) + 26px));
  left: max(24px, 7vw);
  height: 1px;
  background: rgba(154, 175, 166, 0.17);
}
.lnl-intro-progress i {
  display: block;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, #74e6b2, #75c9d4);
  transform: scaleX(0);
  transform-origin: left;
  animation: lnl-track 3.1s cubic-bezier(0.2, 0.72, 0.2, 1) forwards;
}
.lnl-intro-skip {
  position: absolute;
  z-index: 8;
  right: max(24px, env(safe-area-inset-right));
  bottom: max(44px, calc(env(safe-area-inset-bottom) + 28px));
  padding: 7px 10px;
  border: 1px solid rgba(116, 230, 178, 0.2);
  border-radius: 0;
  background: rgba(3, 11, 9, 0.58);
  color: #91a79e;
  font:
    9px/1 ui-monospace,
    SFMono-Regular,
    Consolas,
    monospace;
  letter-spacing: 0.12em;
  cursor: pointer;
  transition:
    border-color 0.2s ease,
    color 0.2s ease;
}
.lnl-intro-skip:hover,
.lnl-intro-skip:focus-visible {
  border-color: rgba(116, 230, 178, 0.58);
  color: #74e6b2;
}
.phase-enter-active,
.phase-leave-active {
  transition:
    opacity 0.22s ease,
    transform 0.3s cubic-bezier(0.22, 1, 0.36, 1);
}
.lnl-intro-copy > p span {
  display: inline-block;
}
.phase-enter-from {
  opacity: 0;
  transform: translateY(5px);
}
.phase-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
@keyframes lnl-sweep {
  from {
    opacity: 0;
    transform: translate3d(-14%, 0, 0);
  }
  35% {
    opacity: 1;
  }
  to {
    opacity: 0.3;
    transform: translate3d(14%, 0, 0);
  }
}
@keyframes lnl-grid {
  from {
    opacity: 0;
    transform: scale(1.025);
  }
  to {
    opacity: 0.85;
    transform: scale(1);
  }
}
@keyframes lnl-globe {
  to {
    opacity: 1;
    transform: none;
  }
}
@keyframes lnl-route {
  to {
    stroke-dashoffset: 0;
  }
}
@keyframes lnl-node {
  to {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
  }
}
@keyframes lnl-copy {
  to {
    opacity: 1;
    transform: none;
  }
}
@keyframes lnl-track {
  0% {
    transform: scaleX(0.015);
  }
  70% {
    transform: scaleX(0.8);
  }
  to {
    transform: scaleX(1);
  }
}
@keyframes lnl-intro-ocean {
  from {
    opacity: 0;
    background-position:
      0 0,
      12px 9px;
    transform: perspective(540px) rotateX(63deg) translate3d(0, 13%, 0) scale(1.06);
  }
  24% {
    opacity: 0.5;
  }
  to {
    opacity: 0.22;
    background-position:
      12px -54px,
      24px -45px;
    transform: perspective(540px) rotateX(63deg) translate3d(0, -8%, 0) scale(0.96);
  }
}
@keyframes lnl-intro-current {
  from {
    opacity: 0;
    transform: translate3d(-8%, 18%, 0) rotate(-7deg) scaleX(0.72);
  }
  36% {
    opacity: 0.7;
  }
  to {
    opacity: 0.12;
    transform: translate3d(7%, -14%, 0) rotate(-3deg) scaleX(1.08);
  }
}
@media (max-width: 680px) {
  .lnl-intro {
    --lnl-intro-globe: clamp(190px, min(72vw, 43dvh), 330px);
    --lnl-intro-title: clamp(40px, 13vw, 58px);
  }
  .lnl-intro-top span:last-child,
  .lnl-intro-bottom span:last-child {
    display: none;
  }
  .lnl-intro-top,
  .lnl-intro-bottom {
    font-size: 8px;
  }
  .lnl-intro-copy > span,
  .lnl-intro-copy > p {
    max-width: 290px;
    font-size: 7px;
    line-height: 1.6;
  }
  .lnl-intro-core > span {
    width: 62px;
    height: 62px;
    padding: 6px;
    border-radius: 16px;
  }
  .lnl-intro-core img {
    border-radius: 10px;
  }
  .lnl-intro-node {
    font-size: 7px;
  }
  .lnl-intro-progress {
    right: 18px;
    left: 18px;
  }
  .lnl-intro-skip {
    right: 18px;
  }
}
@media (orientation: landscape) and (max-height: 560px) {
  .lnl-intro-scene {
    grid-template-columns: auto minmax(220px, 1fr);
    align-items: center;
    gap: 32px;
  }
  .lnl-intro-copy {
    justify-items: start;
    text-align: left;
  }
  .lnl-intro-copy > span,
  .lnl-intro-copy > p {
    max-width: 300px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .lnl-intro::before,
  .lnl-intro-grid,
  .lnl-intro-globe,
  .route,
  .lnl-intro-node,
  .lnl-intro-copy > *,
  .lnl-intro-progress i {
    animation: none !important;
    opacity: 1;
    transform: none;
  }
  .lnl-intro-ocean,
  .phase-enter-active,
  .phase-leave-active {
    animation: none !important;
    transition: none !important;
  }
  .lnl-intro-node {
    transform: translate(-50%, -50%);
  }
}
</style>
