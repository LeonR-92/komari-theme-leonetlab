<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { computed, inject, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Button } from '@/components/ui/button'
import { DataTooltip } from '@/components/ui/data-tooltip'
import { useAppStore } from '@/stores/app'

const router = useRouter()
const appStore = useAppStore()
const isScrolled = inject<ReturnType<typeof ref<boolean>>>('isScrolled', ref(false))
const themeTransition = ref<{ target: 'light' | 'dark', phase: 'covering' | 'revealing' } | null>(null)
const leavingForAdmin = ref(false)
const transitionTimers: number[] = []
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
const logoVisible = ref(true)

const actionButtons = computed(() => {
  const buttons = [{
    title: appStore.themeMode === 'system' ? '自动（北京时间）' : appStore.themeMode === 'light' ? '浅色模式' : '深色模式',
    icon: appStore.themeMode === 'system' ? 'icon-park-outline:dark-mode' : appStore.themeMode === 'light' ? 'icon-park-outline:sun-one' : 'icon-park-outline:moon',
    action: 'toggleTheme',
  }]
  if (appStore.isLoggedIn || !appStore.hideAdminEntryWhenLoggedOut)
    buttons.push({ title: '管理后台', icon: 'icon-park-outline:setting', action: 'jumpToSetting' })
  return buttons
})

function toggleTheme() {
  if (themeTransition.value)
    return

  const nextMode = appStore.themeMode === 'system'
    ? 'light'
    : appStore.themeMode === 'light'
      ? 'dark'
      : 'system'
  const nextResolvedMode = appStore.resolveThemeMode(nextMode)

  if (nextResolvedMode === appStore.resolvedThemeMode) {
    appStore.updateThemeMode(nextMode)
    return
  }

  if (reducedMotion) {
    appStore.updateThemeMode(nextMode)
    return
  }

  themeTransition.value = { target: nextResolvedMode, phase: 'covering' }
  transitionTimers.push(window.setTimeout(() => {
    appStore.updateThemeMode(nextMode)
    requestAnimationFrame(() => {
      if (themeTransition.value)
        themeTransition.value.phase = 'revealing'
    })
  }, 390))
  transitionTimers.push(window.setTimeout(() => {
    themeTransition.value = null
  }, 820))
}

function jumpToSetting() {
  if (leavingForAdmin.value)
    return
  if (reducedMotion) {
    location.href = '/admin'
    return
  }
  leavingForAdmin.value = true
  transitionTimers.push(window.setTimeout(() => {
    location.href = '/admin'
  }, 860))
}

function handleButtonClick(action: string) {
  if (action === 'toggleTheme')
    toggleTheme()
  if (action === 'jumpToSetting')
    jumpToSetting()
}

onUnmounted(() => transitionTimers.forEach(timer => window.clearTimeout(timer)))

function handleLogoError(event: Event) {
  const image = event.currentTarget as HTMLImageElement
  if (image.dataset.fallback !== '1' && image.src !== new URL('/favicon.ico', location.href).href) {
    image.dataset.fallback = '1'
    image.src = '/favicon.ico'
    return
  }
  logoVisible.value = false
}
</script>

<template>
  <header class="lnl-header" :class="{ 'is-scrolled': isScrolled }">
    <div class="lnl-header-inner max-w-[1680px] mx-auto">
      <button class="lnl-identity" type="button" title="返回监控总览" @click="router.push('/')">
        <span class="lnl-identity-mark">
          <img v-if="logoVisible" :src="appStore.brandLogoUrl" alt="" @error="handleLogoError">
          <span v-else aria-hidden="true">{{ appStore.brandShortName.slice(0, 1).toUpperCase() }}</span>
        </span>
        <span class="lnl-identity-copy">
          <b>{{ appStore.brandName }}</b>
          <small>{{ appStore.brandShortName.toUpperCase() }} / {{ appStore.brandHeaderSubtitle }}</small>
        </span>
      </button>
      <div class="lnl-header-state" aria-hidden="true">
        <i /> {{ appStore.brandStatusLabel }}
      </div>
      <nav class="lnl-header-actions" aria-label="页面操作">
        <DataTooltip v-for="button in actionButtons" :key="button.action" :content="button.title" placement="left" content-class="whitespace-nowrap text-[11px] px-2">
          <Button variant="ghost" size="icon-sm" :aria-label="button.title" @click="handleButtonClick(button.action)">
            <Icon :icon="button.icon" :width="18" :height="18" />
          </Button>
        </DataTooltip>
      </nav>
    </div>
  </header>
  <Teleport to="body">
    <div
      v-if="themeTransition"
      class="lnl-theme-wipe"
      :class="[`to-${themeTransition.target}`, `is-${themeTransition.phase}`]"
      aria-hidden="true"
    />
    <div
      v-if="leavingForAdmin"
      class="lnl-route-cover"
      :class="appStore.isDark ? 'is-dark' : 'is-light'"
      role="status"
      aria-live="polite"
    >
      <div class="lnl-route-grid" aria-hidden="true" />
      <div class="lnl-route-core" aria-hidden="true">
        <i /><span><img v-if="logoVisible" :src="appStore.brandLogoUrl" alt="" @error="handleLogoError"></span><i />
      </div>
      <div class="lnl-route-copy">
        <span>SECURE HANDOFF / LOCAL CONSOLE</span>
        <strong>进入管理控制台</strong>
        <p>正在交接当前会话</p>
      </div>
      <div class="lnl-route-track">
        <i />
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.lnl-theme-wipe {
  position: fixed;
  z-index: 90;
  inset: 0;
  pointer-events: none;
  clip-path: circle(0 at calc(100% - 48px) 36px);
  will-change: clip-path, opacity;
}
.lnl-theme-wipe.is-covering {
  animation: lnl-theme-cover 0.4s cubic-bezier(0.65, 0, 0.35, 1) both;
}
.lnl-theme-wipe.is-revealing {
  clip-path: circle(150vmax at calc(100% - 48px) 36px);
  animation: lnl-theme-reveal 0.42s cubic-bezier(0.22, 1, 0.36, 1) both;
}
.lnl-theme-wipe.to-dark {
  background: #06100d;
}
.lnl-theme-wipe.to-light {
  background: #edf7f1;
}
.lnl-route-cover {
  --route-bg: #030b09;
  --route-ink: #e5eee9;
  --route-muted: #91a79e;
  --route-accent: #74e6b2;
  --route-cyan: #75c9d4;
  --route-surface: #071310;
  position: fixed;
  z-index: 120;
  inset: 0;
  display: grid;
  place-items: center;
  overflow: hidden;
  background: var(--route-bg);
  color: var(--route-ink);
  animation: lnl-route-cover-in 0.86s cubic-bezier(0.16, 1, 0.3, 1) both;
}
.lnl-route-cover.is-light {
  --route-bg: #edf6f1;
  --route-ink: #10251d;
  --route-muted: #506c61;
  --route-accent: #167a56;
  --route-cyan: #227f89;
  --route-surface: #f7fbf8;
}
.lnl-route-cover::before {
  content: '';
  position: absolute;
  z-index: 6;
  right: 0;
  bottom: 0;
  left: 0;
  height: 2px;
  background: linear-gradient(90deg, transparent, var(--route-accent), var(--route-cyan), transparent);
  box-shadow: 0 -12px 42px color-mix(in srgb, var(--route-accent) 24%, transparent);
  animation: lnl-route-leading-edge 0.86s cubic-bezier(0.16, 1, 0.3, 1) both;
}
.lnl-route-grid {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(color-mix(in srgb, var(--route-accent) 5%, transparent) 1px, transparent 1px),
    linear-gradient(90deg, color-mix(in srgb, var(--route-accent) 5%, transparent) 1px, transparent 1px);
  background-size: 42px 42px;
  mask-image: radial-gradient(circle, #000, transparent 72%);
}
.lnl-route-core {
  position: absolute;
  top: calc(50% - 92px);
  left: 50%;
  width: 154px;
  aspect-ratio: 1;
  border: 1px solid color-mix(in srgb, var(--route-accent) 24%, transparent);
  border-radius: 50%;
  transform: translate(-50%, -50%);
  animation: lnl-route-orbit 3s linear infinite;
}
.lnl-route-core > span {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 68px;
  height: 68px;
  padding: 7px;
  border: 1px solid color-mix(in srgb, var(--route-accent) 45%, transparent);
  background: var(--route-surface);
  transform: translate(-50%, -50%);
}
.lnl-route-core img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
  animation: lnl-route-counter 3s linear infinite;
}
.lnl-route-core i {
  position: absolute;
  top: 50%;
  left: -3px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--route-accent);
  box-shadow: 0 0 14px color-mix(in srgb, var(--route-accent) 70%, transparent);
}
.lnl-route-core i:last-child {
  right: -3px;
  left: auto;
}
.lnl-route-copy {
  display: grid;
  justify-items: center;
  gap: 7px;
  margin-top: 146px;
  text-align: center;
}
.lnl-route-copy span,
.lnl-route-copy p {
  font: 9px/1.5 var(--font-mono);
  letter-spacing: 0.14em;
}
.lnl-route-copy span {
  color: var(--route-accent);
}
.lnl-route-copy strong {
  font: 400 clamp(26px, 4vw, 42px)/1.1 var(--font-display);
}
.lnl-route-copy p {
  margin: 0;
  color: var(--route-muted);
}
.lnl-route-track {
  position: absolute;
  right: 8vw;
  bottom: 8vh;
  left: 8vw;
  height: 1px;
  background: color-mix(in srgb, var(--route-accent) 14%, transparent);
}
.lnl-route-track i {
  display: block;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, var(--route-accent), var(--route-cyan));
  transform-origin: left;
  animation: lnl-route-track 0.76s 0.1s cubic-bezier(0.2, 0.72, 0.2, 1) both;
}
@keyframes lnl-theme-cover {
  to {
    clip-path: circle(150vmax at calc(100% - 48px) 36px);
  }
}
@keyframes lnl-theme-reveal {
  from {
    opacity: 1;
  }
  to {
    opacity: 0;
  }
}
@keyframes lnl-route-cover-in {
  from {
    opacity: 0;
    clip-path: inset(100% 0 0 0);
    transform: translateY(22px);
  }
  to {
    opacity: 1;
    clip-path: inset(0);
    transform: none;
  }
}
@keyframes lnl-route-leading-edge {
  from {
    transform: translateY(100vh);
    opacity: 0;
  }
  18% {
    opacity: 1;
  }
  to {
    transform: none;
    opacity: 0;
  }
}
@keyframes lnl-route-orbit {
  to {
    transform: translate(-50%, -50%) rotate(1turn);
  }
}
@keyframes lnl-route-counter {
  to {
    transform: rotate(-1turn);
  }
}
@keyframes lnl-route-track {
  from {
    transform: scaleX(0.02);
  }
  to {
    transform: scaleX(1);
  }
}
@media (prefers-reduced-motion: reduce) {
  .lnl-theme-wipe,
  .lnl-route-cover,
  .lnl-route-core,
  .lnl-route-core img,
  .lnl-route-track i {
    animation: none;
  }
}
</style>
