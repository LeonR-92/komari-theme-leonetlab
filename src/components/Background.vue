<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { useAppStore } from '@/stores/app'

const appStore = useAppStore()

const telemetryLanes = [
  '01001100  NODE:EDGE-01  RTT:143MS  LOSS:0.0%  LINK:UP  01100101',
  'LAT:35.6762  LON:139.6503  TOKYO  RX:518KB/S  TX:494KB/S',
  '10110110  MEM:31.9%  DISK:23.1%  LOAD:0.24  UPTIME:09D02H',
  'SG-SIN  HKG-EDGE  LAX-CORE  FRA-IX  TELEMETRY / NOMINAL',
  'PACKET 00110101 11001010  ROUTE 07  HOP 12  STATUS GREEN',
  'UUID:••••  WS:CONNECTED  SAMPLE:3S  CLOCK:SYNC  QUEUE:0002',
  'EDGE-IP:MASKED  TLS  HTTP/2  ASN  NETWORK OBSERVATORY',
  'CPU:LIVE  RAM:NOMINAL  IO:STREAM  PROC:ACTIVE  TCP:READY',
  '00101110 00110001 00110000 00101110 00110011  DATA STREAM',
  'JP-TYO → US-LAX → EU-FRA  142MS  0.2%  TRANSIT STABLE',
  'SENSOR:ACTIVE  PULSE:03  FRAME:8192  CHECKSUM:7F2A  VALID',
  'LEONETLAB / GLOBAL EDGE / LIVE OBSERVATION / SIGNAL LOCKED',
]

const isLoaded = ref(false)
const hasError = ref(false)

const showBackground = computed(() => appStore.backgroundEnabled)
const currentUrl = computed(() => showBackground.value ? appStore.currentBackgroundUrl : '')
const backgroundType = computed(() => appStore.backgroundType)
const hasCustomBackground = computed(() => showBackground.value && !!currentUrl.value)
const showBackgroundOverlay = computed(() => hasCustomBackground.value && appStore.backgroundOverlay > 0)

const backgroundStyle = computed(() => {
  const blur = appStore.backgroundBlur
  return {
    filter: blur > 0 ? `blur(${blur}px)` : 'none',
    opacity: appStore.backgroundType === 'video' && !isLoaded.value ? 0 : 1,
  }
})

const backgroundContainerStyle = computed(() => {
  if (!hasCustomBackground.value)
    return {}

  const overlay = appStore.backgroundOverlay
  if (overlay >= 0)
    return {}

  return { opacity: 1 - Math.abs(overlay) / 100 }
})

const overlayStyle = computed(() => {
  const overlay = appStore.backgroundOverlay
  if (overlay <= 0)
    return {}

  return { backgroundColor: `rgba(0, 0, 0, ${overlay / 100})` }
})

const showLoadedBackground = computed(() =>
  hasCustomBackground.value && isLoaded.value && !hasError.value,
)

const showMediaBackground = computed(() =>
  hasCustomBackground.value && !hasError.value && (backgroundType.value === 'video' || showLoadedBackground.value),
)

const showDefaultBackground = computed(() => !hasCustomBackground.value)

const showLoadingBackground = computed(() =>
  hasCustomBackground.value && !isLoaded.value && !hasError.value,
)

const showFallbackBackground = computed(() =>
  hasCustomBackground.value && hasError.value,
)

let imageLoader: HTMLImageElement | null = null

function clearImageLoader() {
  if (imageLoader) {
    imageLoader.onload = null
    imageLoader.onerror = null
    imageLoader = null
  }
}

function loadImage(url: string) {
  isLoaded.value = false
  hasError.value = false

  clearImageLoader()

  imageLoader = new Image()
  imageLoader.onload = () => {
    isLoaded.value = true
    hasError.value = false
  }
  imageLoader.onerror = () => {
    isLoaded.value = false
    hasError.value = true
  }
  imageLoader.src = url
}

const videoRef = ref<HTMLVideoElement | null>(null)

function resetBackgroundState() {
  clearImageLoader()

  if (videoRef.value) {
    videoRef.value.pause()
    videoRef.value.removeAttribute('src')
    videoRef.value.load()
  }

  isLoaded.value = false
  hasError.value = false
}

function handleVideoLoaded() {
  isLoaded.value = true
  hasError.value = false
}
function handleVideoError() {
  isLoaded.value = false
  hasError.value = true
}

watch([showBackground, currentUrl, backgroundType], ([enabled, url, type]) => {
  if (!enabled || !url) {
    resetBackgroundState()
    return
  }

  if (url && type === 'image') {
    loadImage(url)
  }
  else if (url && type === 'video') {
    clearImageLoader()
    isLoaded.value = false
    hasError.value = false
  }
}, { immediate: true })

onUnmounted(() => {
  resetBackgroundState()
})
</script>

<template>
  <div class="background-container" :style="backgroundContainerStyle">
    <Transition name="fade">
      <div v-if="showDefaultBackground" class="lnl-background" aria-hidden="true">
        <div class="lnl-background-grid" />
        <div class="lnl-background-signal s1" />
        <div class="lnl-background-signal s2" />
        <div class="lnl-background-depth" />
        <div class="lnl-background-data-ocean">
          <div
            v-for="(lane, index) in telemetryLanes"
            :key="lane"
            class="lnl-data-lane"
            :style="{ '--lane-index': index, '--lane-duration': `${24 + index * 1.7}s` }"
          >
            <span>{{ lane }} / {{ lane }} / {{ lane }}</span>
          </div>
        </div>
        <div class="lnl-background-ocean" />
      </div>
    </Transition>
    <Transition name="fade">
      <div v-if="showLoadingBackground" class="background-loading" />
    </Transition>
    <Transition name="fade">
      <div v-if="showFallbackBackground" class="background-loading" />
    </Transition>
    <Transition name="fade">
      <div v-if="showMediaBackground" class="background-media" :style="backgroundStyle">
        <div
          v-if="backgroundType === 'image'"
          class="background-image"
          :style="{ backgroundImage: `url(${currentUrl})` }"
        />
        <video
          v-else-if="backgroundType === 'video'"
          ref="videoRef"
          class="background-video"
          :src="currentUrl ?? undefined"
          autoplay
          loop
          muted
          preload="auto"
          playsinline
          @loadeddata="handleVideoLoaded"
          @canplay="handleVideoLoaded"
          @error="handleVideoError"
        />
      </div>
    </Transition>
    <div v-if="showBackgroundOverlay" class="background-overlay" :style="overlayStyle" />
  </div>
</template>

<style scoped>
.background-container {
  position: fixed;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  pointer-events: none;
}

.lnl-background {
  position: absolute;
  inset: 0;
  overflow: hidden;
  background:
    radial-gradient(circle at 72% 8%, rgba(116, 230, 178, 0.075), transparent 28rem),
    radial-gradient(circle at 12% 36%, rgba(117, 201, 212, 0.04), transparent 24rem), var(--background);
}

.lnl-background-grid {
  position: absolute;
  inset: 0;
  opacity: 0.64;
  background-image:
    linear-gradient(rgba(116, 230, 178, 0.028) 1px, transparent 1px),
    linear-gradient(90deg, rgba(116, 230, 178, 0.028) 1px, transparent 1px);
  background-size: 48px 48px;
  mask-image: linear-gradient(to bottom, #000, transparent 88%);
}

.lnl-background-signal {
  position: absolute;
  width: 52vw;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(116, 230, 178, 0.18), transparent);
  transform-origin: center;
  animation: signal-drift 18s linear infinite;
}

.lnl-background-signal.s1 {
  top: 23%;
  left: -10%;
  transform: rotate(-7deg);
}
.lnl-background-signal.s2 {
  top: 65%;
  right: -14%;
  animation-delay: -8s;
  transform: rotate(9deg);
}

.lnl-background-ocean {
  position: absolute;
  right: -8%;
  bottom: -27%;
  left: -8%;
  height: 58%;
  opacity: 0.27;
  background-image:
    radial-gradient(circle, rgba(116, 230, 178, 0.78) 0 1px, transparent 1.25px),
    radial-gradient(circle, rgba(117, 201, 212, 0.35) 0 0.8px, transparent 1px);
  background-position:
    0 0,
    14px 11px;
  background-size: 28px 22px;
  transform: perspective(680px) rotateX(64deg);
  transform-origin: 50% 0;
  mask-image: linear-gradient(transparent, #000 20%, transparent 93%);
  animation: ocean-drift 16s ease-in-out infinite alternate;
}

.lnl-background-depth {
  position: absolute;
  inset: 14% -12% auto;
  height: 42%;
  opacity: 0.2;
  background-image: radial-gradient(circle, rgba(117, 201, 212, 0.52) 0 0.8px, transparent 1px);
  background-size: 36px 30px;
  mask-image: radial-gradient(ellipse at 70% 40%, #000 0 8%, transparent 70%);
  transform: perspective(760px) rotateX(68deg) rotateZ(-2deg);
  animation: depth-drift 22s linear infinite;
}

.lnl-background-data-ocean {
  position: absolute;
  z-index: 1;
  right: -14%;
  bottom: -22%;
  left: -14%;
  display: grid;
  height: 60%;
  grid-template-rows: repeat(12, 1fr);
  gap: 4px;
  overflow: hidden;
  opacity: 0.24;
  color: var(--lnl-green);
  transform: perspective(720px) rotateX(61deg);
  transform-origin: 50% 0;
  mask-image: linear-gradient(transparent 0 28%, #000 52%, #000 78%, transparent 100%);
}

.lnl-data-lane {
  min-width: max-content;
  white-space: nowrap;
  font: 8px/1 var(--font-mono);
  letter-spacing: 0.17em;
  text-shadow: 0 0 10px color-mix(in srgb, var(--lnl-green) 45%, transparent);
  translate: calc((var(--lane-index) % 3) * -9%) 0;
  animation: data-tide var(--lane-duration) linear infinite;
  animation-delay: calc(var(--lane-index) * -1.9s);
}

.lnl-data-lane:nth-child(even) {
  color: var(--lnl-cyan);
  animation-direction: reverse;
}

.lnl-background-ocean::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent 35%, rgba(116, 230, 178, 0.13), transparent 65%);
  animation: ocean-scan 9s ease-in-out infinite;
}

@keyframes signal-drift {
  to {
    translate: 36vw 0;
  }
}
@keyframes ocean-drift {
  to {
    transform: perspective(680px) rotateX(64deg) translate3d(1.5%, -2.5%, 0);
  }
}
@keyframes depth-drift {
  to {
    background-position: 36px 30px;
  }
}
@keyframes ocean-scan {
  0%,
  100% {
    translate: -42% 0;
    opacity: 0;
  }
  45%,
  60% {
    opacity: 1;
  }
  70% {
    translate: 42% 0;
  }
}
@keyframes data-tide {
  to {
    translate: calc(-34% + (var(--lane-index) % 3) * -9%) 0;
  }
}

.background-loading {
  position: absolute;
  inset: 0;
  background-color: var(--background);
}

.background-media {
  position: absolute;
  inset: 0;
  transform: scale(1.1);
  transition: opacity 0.8s ease;
}

.background-image {
  width: 100%;
  height: 100%;
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
}

.background-video {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.background-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.8s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .lnl-background-signal,
  .lnl-background-depth,
  .lnl-data-lane,
  .lnl-background-ocean::before,
  .lnl-background-ocean {
    animation: none;
  }
}

@media (max-width: 760px) {
  .lnl-background-data-ocean {
    right: -60%;
    bottom: -8%;
    left: -60%;
    height: 54%;
    opacity: 0.27;
  }

  .lnl-data-lane:nth-child(n + 9) {
    display: none;
  }
}
</style>
