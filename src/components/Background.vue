<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import DataOcean from '@/components/DataOcean.vue'
import { useAppStore } from '@/stores/app'

withDefaults(defineProps<{ paused?: boolean }>(), { paused: false })

const appStore = useAppStore()

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
        <div class="lnl-background-depth" />
        <DataOcean :paused="paused" />
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
  inset: 0 0 auto 0;
  height: 100vh;
  height: 100lvh;
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
  .lnl-background-depth,
  .lnl-background-ocean {
    animation: none;
  }
}
</style>
