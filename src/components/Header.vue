<script setup lang="ts">
import type { ThemeMode } from '@/stores/app'
import type { ThemeCacheRefreshPhase } from '@/utils/pwa'
import { Icon } from '@iconify/vue'
import { computed, inject, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Button } from '@/components/ui/button'
import { DataTooltip } from '@/components/ui/data-tooltip'
import { useMotionPreference } from '@/composables/useMotionPreference'
import { usePwaInstall } from '@/composables/usePwaInstall'
import { useAppStore } from '@/stores/app'
import { refreshThemeCache } from '@/utils/pwa'

const router = useRouter()
const appStore = useAppStore()
const { motionReduced } = useMotionPreference()
const { canPromptInstall, showIosInstructions, installAvailable, promptInstall } = usePwaInstall()
const isScrolled = inject<ReturnType<typeof ref<boolean>>>('isScrolled', ref(false))
interface ThemeOrigin {
  x: number
  y: number
  radius: number
}

const themeTransition = ref<{ target: 'light' | 'dark', phase: 'revealing' | 'settling' } | null>(null)
const themeTransitionActive = ref(false)
const leavingForAdmin = ref(false)
const transitionTimers = new Set<number>()
const THEME_REVEAL_DURATION_MS = 680
const FALLBACK_THEME_COMMIT_MS = 610
const THEME_TRANSITION_FALLBACK_MS = THEME_REVEAL_DURATION_MS + 220
let themeCommitTimer: number | null = null
let themeFallbackTimer: number | null = null
let pendingThemeMode: ThemeMode | null = null
let queuedThemeMode: ThemeMode | null = null
let queuedThemeOrigin: ThemeOrigin | null = null
let activeViewTransition: ViewTransition | null = null
let componentUnmounting = false
const logoVisible = ref(true)
const refreshingCache = ref(false)
type CachePanelPhase = 'idle' | 'update-ready' | ThemeCacheRefreshPhase | 'reloading' | 'error'
const cachePanelPhase = ref<CachePanelPhase>('idle')
let cacheReloadTimer: number | null = null
const pwaPanelOpen = ref(false)
const pwaInstallBusy = ref(false)
const pwaInstallResult = ref<'idle' | 'dismissed' | 'error'>('idle')

const cachePanelCopy = computed(() => {
  switch (cachePanelPhase.value) {
    case 'update-ready':
      return { step: 'NEW', title: '发现新的主题版本', detail: '确认后刷新缓存并载入新版本；当前页面不会自动重载。' }
    case 'checking':
      return { step: '01', title: '正在检查主题更新', detail: '正在与当前主题版本同步。' }
    case 'clearing':
      return { step: '02', title: '正在清理旧缓存', detail: '仅移除 Komari Observatory 的本地缓存。' }
    case 'reloading':
      return { step: '03', title: '缓存刷新完成', detail: '即将重新载入最新主题资源。' }
    case 'error':
      return { step: 'ERR', title: '缓存刷新失败', detail: '网络或浏览器缓存服务暂时不可用。' }
    default:
      return { step: '00', title: '', detail: '' }
  }
})

const actionButtons = computed(() => {
  const buttons = [{
    title: appStore.themeMode === 'system' ? '自动（北京时间）' : appStore.themeMode === 'light' ? '浅色模式' : '深色模式',
    icon: appStore.themeMode === 'system' ? 'icon-park-outline:dark-mode' : appStore.themeMode === 'light' ? 'icon-park-outline:sun-one' : 'icon-park-outline:moon',
    action: 'toggleTheme',
  }]
  buttons.push({
    title: refreshingCache.value ? '正在刷新主题缓存' : '刷新主题缓存',
    icon: 'tabler:refresh',
    action: 'refreshThemeCache',
  })
  if (installAvailable.value) {
    buttons.push({
      title: '安装为应用',
      icon: 'tabler:device-mobile-down',
      action: 'installPwa',
    })
  }
  if (appStore.isLoggedIn || !appStore.hideAdminEntryWhenLoggedOut)
    buttons.push({ title: '管理后台', icon: 'icon-park-outline:setting', action: 'jumpToSetting' })
  return buttons
})

function scheduleTransitionTask(callback: () => void, delay: number): number {
  const timer = window.setTimeout(() => {
    transitionTimers.delete(timer)
    callback()
  }, delay)
  transitionTimers.add(timer)
  return timer
}

function cycleThemeMode(mode: ThemeMode): ThemeMode {
  if (mode === 'system')
    return 'light'
  return mode === 'light' ? 'dark' : 'system'
}

function resolveThemeOrigin(element?: Element | null): ThemeOrigin {
  const rect = element?.getBoundingClientRect()
  const x = Math.min(window.innerWidth, Math.max(0, rect ? rect.left + rect.width / 2 : window.innerWidth))
  const y = Math.min(window.innerHeight, Math.max(0, rect ? rect.top + rect.height / 2 : 0))
  return {
    x,
    y,
    radius: Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y)),
  }
}

function writeThemeOrigin(origin: ThemeOrigin) {
  const root = document.documentElement
  root.style.setProperty('--theme-x', `${origin.x}px`)
  root.style.setProperty('--theme-y', `${origin.y}px`)
  root.style.setProperty('--theme-radius', `${Math.ceil(origin.radius)}px`)
}

function commitPendingTheme() {
  if (!pendingThemeMode)
    return
  const mode = pendingThemeMode
  pendingThemeMode = null
  appStore.updateThemeMode(mode)
}

function finishThemeTransition() {
  if (!themeTransitionActive.value)
    return
  for (const timer of [themeCommitTimer, themeFallbackTimer]) {
    if (timer !== null) {
      window.clearTimeout(timer)
      transitionTimers.delete(timer)
    }
  }
  themeCommitTimer = null
  themeFallbackTimer = null
  activeViewTransition = null
  themeTransitionActive.value = false
  themeTransition.value = null
  const root = document.documentElement
  root.classList.remove('lnl-theme-transitioning')
  root.style.removeProperty('--theme-x')
  root.style.removeProperty('--theme-y')
  root.style.removeProperty('--theme-radius')
  window.dispatchEvent(new CustomEvent('leonetlab:theme-transition-end'))

  const queuedMode = queuedThemeMode
  const queuedOrigin = queuedThemeOrigin
  queuedThemeMode = null
  queuedThemeOrigin = null
  if (!componentUnmounting && queuedMode) {
    queueMicrotask(() => startThemeTransition(queuedMode, queuedOrigin ?? resolveThemeOrigin()))
  }
}

function handleThemeWipeAnimationEnd(event: AnimationEvent) {
  if (event.animationName === 'lnl-theme-fallback-reveal') {
    if (themeCommitTimer !== null) {
      window.clearTimeout(themeCommitTimer)
      transitionTimers.delete(themeCommitTimer)
      themeCommitTimer = null
    }
    commitPendingTheme()
    if (themeTransition.value)
      themeTransition.value = { ...themeTransition.value, phase: 'settling' }
    return
  }
  if (event.animationName === 'lnl-theme-fallback-settle')
    finishThemeTransition()
}

function settleThemeTransitionImmediately() {
  commitPendingTheme()
  activeViewTransition?.skipTransition()
  finishThemeTransition()
}

function beginThemeTransition(origin: ThemeOrigin) {
  writeThemeOrigin(origin)
  themeTransitionActive.value = true
  document.documentElement.classList.add('lnl-theme-transitioning')
  window.dispatchEvent(new CustomEvent('leonetlab:theme-transition-start'))
}

function startFallbackThemeTransition(nextMode: ThemeMode, target: 'light' | 'dark') {
  pendingThemeMode = nextMode
  themeTransition.value = { target, phase: 'revealing' }
  themeCommitTimer = scheduleTransitionTask(() => {
    themeCommitTimer = null
    commitPendingTheme()
    if (themeTransition.value)
      themeTransition.value = { ...themeTransition.value, phase: 'settling' }
  }, FALLBACK_THEME_COMMIT_MS)
  themeFallbackTimer = scheduleTransitionTask(() => {
    themeFallbackTimer = null
    settleThemeTransitionImmediately()
  }, THEME_TRANSITION_FALLBACK_MS)
}

function startThemeTransition(nextMode: ThemeMode, origin: ThemeOrigin) {
  if (themeTransitionActive.value) {
    queuedThemeMode = nextMode
    queuedThemeOrigin = origin
    return
  }

  const target = appStore.resolveThemeMode(nextMode)
  if (target === appStore.resolvedThemeMode) {
    appStore.updateThemeMode(nextMode)
    return
  }

  if (motionReduced.value) {
    appStore.updateThemeMode(nextMode)
    return
  }

  beginThemeTransition(origin)
  const transitionDocument = document as Document & {
    startViewTransition?: Document['startViewTransition']
  }
  if (typeof transitionDocument.startViewTransition === 'function') {
    pendingThemeMode = nextMode
    try {
      const transition = transitionDocument.startViewTransition(async () => {
        commitPendingTheme()
        await nextTick()
      })
      activeViewTransition = transition
      themeFallbackTimer = scheduleTransitionTask(() => {
        themeFallbackTimer = null
        settleThemeTransitionImmediately()
      }, THEME_TRANSITION_FALLBACK_MS)
      void transition.finished.then(finishThemeTransition, settleThemeTransitionImmediately)
      return
    }
    catch {
      activeViewTransition = null
    }
  }

  startFallbackThemeTransition(nextMode, target)
}

function toggleTheme(originElement?: Element | null) {
  const baseMode = queuedThemeMode ?? pendingThemeMode ?? appStore.themeMode
  const nextMode = cycleThemeMode(baseMode)
  const origin = resolveThemeOrigin(originElement)
  if (themeTransitionActive.value) {
    // Preserve only the most recent request; it runs after the active reveal.
    queuedThemeMode = nextMode
    queuedThemeOrigin = origin
    return
  }
  startThemeTransition(nextMode, origin)
}

function handleVisibilityChange() {
  if (document.visibilityState === 'hidden' && themeTransitionActive.value)
    settleThemeTransitionImmediately()
}

async function handleThemeCacheRefresh() {
  if (refreshingCache.value)
    return
  refreshingCache.value = true
  cachePanelPhase.value = 'checking'
  try {
    await refreshThemeCache((phase) => {
      cachePanelPhase.value = phase
    })
    cachePanelPhase.value = 'reloading'
    cacheReloadTimer = window.setTimeout(() => location.reload(), motionReduced.value ? 120 : 560)
  }
  catch (error) {
    console.error('[Header] Theme cache refresh failed:', error)
    refreshingCache.value = false
    cachePanelPhase.value = 'error'
  }
}

function dismissCachePanel() {
  if (refreshingCache.value)
    return
  cachePanelPhase.value = 'idle'
}

function handlePwaUpdateReady() {
  if (!refreshingCache.value)
    cachePanelPhase.value = 'update-ready'
}

onMounted(() => {
  window.addEventListener('leonetlab:pwa-update-ready', handlePwaUpdateReady)
  document.addEventListener('visibilitychange', handleVisibilityChange)
})

watch(motionReduced, reduced => reduced && settleThemeTransitionImmediately())

async function handlePwaInstall() {
  if (showIosInstructions.value) {
    pwaPanelOpen.value = true
    return
  }
  if (!canPromptInstall.value || pwaInstallBusy.value)
    return
  pwaInstallBusy.value = true
  pwaInstallResult.value = 'idle'
  try {
    const outcome = await promptInstall()
    if (outcome === 'dismissed') {
      pwaInstallResult.value = 'dismissed'
      pwaPanelOpen.value = true
    }
    else {
      pwaPanelOpen.value = false
    }
  }
  catch {
    pwaInstallResult.value = 'error'
    pwaPanelOpen.value = true
  }
  finally {
    pwaInstallBusy.value = false
  }
}

function jumpToSetting() {
  if (leavingForAdmin.value)
    return
  if (motionReduced.value) {
    location.href = '/admin'
    return
  }
  leavingForAdmin.value = true
  scheduleTransitionTask(() => {
    location.href = '/admin'
  }, 860)
}

function handleButtonClick(action: string, event: MouseEvent) {
  if (action === 'toggleTheme')
    toggleTheme(event.currentTarget instanceof Element ? event.currentTarget : null)
  if (action === 'refreshThemeCache')
    void handleThemeCacheRefresh()
  if (action === 'installPwa')
    void handlePwaInstall()
  if (action === 'jumpToSetting')
    jumpToSetting()
}

onUnmounted(() => {
  componentUnmounting = true
  queuedThemeMode = null
  queuedThemeOrigin = null
  window.removeEventListener('leonetlab:pwa-update-ready', handlePwaUpdateReady)
  document.removeEventListener('visibilitychange', handleVisibilityChange)
  transitionTimers.forEach(timer => window.clearTimeout(timer))
  transitionTimers.clear()
  if (cacheReloadTimer !== null)
    window.clearTimeout(cacheReloadTimer)
  settleThemeTransitionImmediately()
})

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
      <DataTooltip content="返回监控总览" placement="bottom" content-class="whitespace-nowrap px-2 py-1 text-[11px]">
        <button class="lnl-identity" type="button" @click="router.push('/')">
          <span class="lnl-identity-mark">
            <img v-if="logoVisible" :src="appStore.brandLogoUrl" alt="" @error="handleLogoError">
            <span v-else aria-hidden="true">{{ appStore.brandShortName.slice(0, 1).toUpperCase() }}</span>
          </span>
          <span class="lnl-identity-copy">
            <b>{{ appStore.brandName }}</b>
            <small>{{ appStore.brandShortName.toUpperCase() }} / {{ appStore.brandHeaderSubtitle }}</small>
          </span>
        </button>
      </DataTooltip>
      <div class="lnl-header-state" aria-hidden="true">
        <i /> {{ appStore.brandStatusLabel }}
      </div>
      <nav class="lnl-header-actions" aria-label="页面操作">
        <DataTooltip v-for="button in actionButtons" :key="button.action" :content="button.title" placement="left" content-class="whitespace-nowrap text-[11px] px-2">
          <Button
            variant="ghost"
            size="icon-sm"
            class="lnl-header-action"
            :data-action="button.action"
            :class="{ 'is-busy': button.action === 'refreshThemeCache' && refreshingCache }"
            :aria-label="button.title"
            :disabled="button.action === 'refreshThemeCache' && refreshingCache"
            @click="handleButtonClick(button.action, $event)"
          >
            <Transition name="lnl-action-icon" mode="out-in">
              <Icon
                :key="button.icon"
                :icon="button.icon"
                :width="18"
                :height="18"
                :class="{ 'animate-spin': button.action === 'refreshThemeCache' && refreshingCache }"
              />
            </Transition>
          </Button>
        </DataTooltip>
      </nav>
    </div>
  </header>
  <Teleport to="body">
    <Transition name="lnl-cache-panel">
      <section
        v-if="cachePanelPhase !== 'idle'"
        class="lnl-cache-panel"
        :class="{ 'is-error': cachePanelPhase === 'error' }"
        :data-cache-phase="cachePanelPhase"
        role="status"
        aria-live="polite"
      >
        <div class="lnl-cache-panel-head">
          <span>CACHE CONTROL / {{ cachePanelCopy.step }}</span>
          <button
            v-if="cachePanelPhase === 'error' || cachePanelPhase === 'update-ready'"
            type="button"
            aria-label="关闭缓存提示"
            @click="dismissCachePanel"
          >
            <Icon icon="tabler:x" :width="15" :height="15" />
          </button>
        </div>
        <div class="lnl-cache-panel-body">
          <span class="lnl-cache-panel-icon" aria-hidden="true">
            <Icon
              :icon="cachePanelPhase === 'error' ? 'tabler:alert-triangle' : cachePanelPhase === 'update-ready' ? 'tabler:sparkles' : 'tabler:refresh'"
              :width="19"
              :height="19"
            />
          </span>
          <div>
            <strong>{{ cachePanelCopy.title }}</strong>
            <p>{{ cachePanelCopy.detail }}</p>
          </div>
        </div>
        <div class="lnl-cache-progress" aria-hidden="true">
          <i :class="{ active: cachePanelPhase !== 'error' }" />
          <i :class="{ active: cachePanelPhase === 'clearing' || cachePanelPhase === 'reloading' }" />
          <i :class="{ active: cachePanelPhase === 'reloading' }" />
        </div>
        <button
          v-if="cachePanelPhase === 'error' || cachePanelPhase === 'update-ready'"
          class="lnl-cache-retry"
          type="button"
          @click="handleThemeCacheRefresh"
        >
          {{ cachePanelPhase === 'update-ready' ? '载入新版本' : '重新尝试' }}
        </button>
      </section>
    </Transition>
    <Transition name="lnl-cache-panel">
      <section
        v-if="pwaPanelOpen"
        class="lnl-pwa-panel"
        role="dialog"
        aria-labelledby="lnl-pwa-title"
      >
        <div class="lnl-pwa-panel-head">
          <span class="lnl-pwa-panel-icon"><Icon icon="tabler:device-mobile-down" :width="19" :height="19" /></span>
          <div>
            <strong id="lnl-pwa-title">安装为应用</strong>
            <p v-if="showIosInstructions">
              在 Safari 中点按“分享”，再选择“添加到主屏幕”。
            </p>
            <p v-else-if="pwaInstallResult === 'error'">
              安装提示暂时不可用，请稍后重试。
            </p>
            <p v-else>
              安装已取消；监控页面仍可正常使用。
            </p>
          </div>
          <button type="button" aria-label="关闭安装提示" @click="pwaPanelOpen = false">
            <Icon icon="tabler:x" :width="16" :height="16" />
          </button>
        </div>
        <button
          v-if="canPromptInstall"
          class="lnl-pwa-install-button"
          type="button"
          :disabled="pwaInstallBusy"
          @click="handlePwaInstall"
        >
          {{ pwaInstallBusy ? '正在打开安装提示…' : '再次安装' }}
        </button>
      </section>
    </Transition>
    <div
      v-if="themeTransition"
      class="lnl-theme-wipe"
      :class="[`to-${themeTransition.target}`, `is-${themeTransition.phase}`]"
      aria-hidden="true"
      @animationend="handleThemeWipeAnimationEnd"
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
.lnl-header-action {
  transition:
    color var(--lnl-motion-fast) ease,
    background-color var(--lnl-motion-fast) ease,
    transform var(--lnl-motion-fast) var(--lnl-ease-out);
}

.lnl-header-action:hover {
  transform: translate3d(0, -1px, 0);
}

.lnl-header-action:active {
  transform: scale(0.9);
}

.lnl-header-action > :deep(svg) {
  transition:
    color var(--lnl-motion-fast) ease,
    transform var(--lnl-motion-standard) var(--lnl-ease-emphasis);
}

.lnl-header-action[data-action='toggleTheme']:hover > :deep(svg) {
  transform: rotate(16deg) scale(1.08);
}

.lnl-header-action[data-action='jumpToSetting']:hover > :deep(svg) {
  transform: rotate(32deg);
}

.lnl-header-action.is-busy {
  color: var(--lnl-green);
}

.lnl-action-icon-enter-active,
.lnl-action-icon-leave-active {
  transition:
    opacity 140ms ease,
    transform 220ms var(--lnl-ease-emphasis);
}

.lnl-action-icon-enter-from {
  opacity: 0;
  transform: rotate(-24deg) scale(0.72);
}

.lnl-action-icon-leave-to {
  opacity: 0;
  transform: rotate(24deg) scale(0.72);
}

.lnl-cache-panel {
  position: fixed;
  z-index: 130;
  top: calc(env(safe-area-inset-top, 0px) + 76px);
  right: max(18px, env(safe-area-inset-right, 0px));
  width: min(360px, calc(100vw - 32px));
  padding: 14px;
  border: 1px solid color-mix(in srgb, var(--lnl-green) 44%, var(--border));
  border-radius: var(--lnl-radius-card);
  background: color-mix(in srgb, var(--background) 96%, var(--lnl-green) 4%);
  box-shadow: 0 18px 50px color-mix(in srgb, #000 22%, transparent);
  color: var(--foreground);
  contain: layout paint;
  overflow: hidden;
}

.lnl-pwa-panel {
  position: fixed;
  z-index: 130;
  top: calc(env(safe-area-inset-top, 0px) + 76px);
  right: max(18px, env(safe-area-inset-right, 0px));
  width: min(380px, calc(100vw - 32px));
  padding: 14px;
  border: 1px solid color-mix(in srgb, var(--lnl-green) 32%, var(--border));
  border-radius: var(--lnl-radius-card);
  background: color-mix(in srgb, var(--background) 97%, var(--lnl-green) 3%);
  box-shadow: var(--lnl-shadow-card-hover);
  color: var(--foreground);
}

.lnl-pwa-panel-head {
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr) 28px;
  gap: 11px;
  align-items: start;
}

.lnl-pwa-panel-icon {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: var(--lnl-radius-control);
  background: color-mix(in srgb, var(--lnl-green) 10%, transparent);
  color: var(--lnl-green);
}

.lnl-pwa-panel strong {
  display: block;
  font: 650 14px/1.35 var(--font-sans);
}

.lnl-pwa-panel p {
  margin: 4px 0 0;
  color: var(--muted-foreground);
  font: 12px/1.55 var(--font-sans);
}

.lnl-pwa-panel-head > button {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--muted-foreground);
}

.lnl-pwa-install-button {
  width: 100%;
  margin-top: 13px;
  padding: 9px 12px;
  border: 1px solid color-mix(in srgb, var(--lnl-green) 42%, var(--border));
  border-radius: var(--lnl-radius-control);
  background: color-mix(in srgb, var(--lnl-green) 10%, transparent);
  color: var(--foreground);
  font: 650 13px/1.2 var(--font-sans);
}

.lnl-cache-panel::before {
  content: none;
}

.lnl-cache-panel.is-error {
  border-color: color-mix(in srgb, #ef6b6b 52%, var(--border));
}

.lnl-cache-panel.is-error::before {
  background: #ef6b6b;
}

.lnl-cache-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--muted-foreground);
  font: 600 9px/1.2 var(--font-mono);
  letter-spacing: 0.12em;
}

.lnl-cache-panel-head button,
.lnl-cache-retry {
  border: 0;
  background: transparent;
  color: inherit;
}

.lnl-cache-panel-head button {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  margin: -6px -6px -6px 0;
}

.lnl-cache-panel-body {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr);
  gap: 11px;
  align-items: center;
  margin-top: 12px;
}

.lnl-cache-panel-icon {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border: 1px solid color-mix(in srgb, var(--lnl-green) 30%, var(--border));
  border-radius: var(--lnl-radius-control);
  color: var(--lnl-green);
}

.lnl-cache-panel[data-cache-phase='checking'] .lnl-cache-panel-icon svg,
.lnl-cache-panel[data-cache-phase='clearing'] .lnl-cache-panel-icon svg,
.lnl-cache-panel[data-cache-phase='reloading'] .lnl-cache-panel-icon svg {
  animation: lnl-cache-orbit 1.25s linear infinite;
}

.lnl-cache-panel.is-error .lnl-cache-panel-icon {
  color: #ef6b6b;
}

.lnl-cache-panel-body strong {
  display: block;
  font: 600 14px/1.35 var(--font-sans);
}

.lnl-cache-panel-body p {
  margin: 3px 0 0;
  color: var(--muted-foreground);
  font: 10px/1.55 var(--font-mono);
}

.lnl-cache-progress {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
  margin-top: 13px;
}

.lnl-cache-progress i {
  height: 2px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--muted-foreground) 18%, transparent);
  transform: scaleX(0.22);
  transform-origin: left;
  transition:
    background-color var(--lnl-motion-standard) ease,
    transform var(--lnl-motion-standard) var(--lnl-ease-out);
}

.lnl-cache-progress i.active {
  background: var(--lnl-green);
  transform: scaleX(1);
}

.lnl-cache-retry {
  margin-top: 12px;
  padding: 6px 9px;
  border: 1px solid color-mix(in srgb, #ef6b6b 38%, var(--border));
  border-radius: var(--lnl-radius-control);
  color: var(--foreground);
  font: 600 10px/1 var(--font-mono);
}

.lnl-cache-panel-enter-active,
.lnl-cache-panel-leave-active {
  transition:
    opacity 180ms ease,
    transform 260ms var(--lnl-ease-emphasis);
}

.lnl-cache-panel-enter-from,
.lnl-cache-panel-leave-to {
  opacity: 0;
  transform: translate3d(0, -10px, 0) scale(0.985);
}

@keyframes lnl-cache-orbit {
  to {
    transform: rotate(1turn);
  }
}

.lnl-theme-wipe {
  position: fixed;
  z-index: 90;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  contain: strict;
  clip-path: circle(0 at var(--theme-x, 100%) var(--theme-y, 0%));
  will-change: clip-path, opacity;
}
.lnl-theme-wipe::after {
  position: absolute;
  inset: 0;
  content: '';
  background-image:
    linear-gradient(rgb(116 230 178 / 3%) 1px, transparent 1px),
    linear-gradient(90deg, rgb(117 201 212 / 3%) 1px, transparent 1px);
  background-size: 42px 42px;
  mask-image: radial-gradient(circle at var(--theme-x, 100%) var(--theme-y, 0%), #000, transparent 78%);
}
.lnl-theme-wipe.to-dark {
  background-color: #06100d;
}
.lnl-theme-wipe.to-light {
  background-color: #edf7f1;
}
.lnl-theme-wipe.is-revealing {
  animation: lnl-theme-fallback-reveal 680ms cubic-bezier(0.22, 1, 0.36, 1) both;
}
.lnl-theme-wipe.is-settling {
  clip-path: circle(var(--theme-radius, 150vmax) at var(--theme-x, 100%) var(--theme-y, 0%));
  animation: lnl-theme-fallback-settle 90ms ease-out both;
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
  border-radius: var(--lnl-radius-inner);
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
@keyframes lnl-theme-fallback-reveal {
  from {
    clip-path: circle(0 at var(--theme-x, 100%) var(--theme-y, 0%));
  }
  to {
    clip-path: circle(var(--theme-radius, 150vmax) at var(--theme-x, 100%) var(--theme-y, 0%));
  }
}
@keyframes lnl-theme-fallback-settle {
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
  .lnl-header-action,
  .lnl-header-action > :deep(svg),
  .lnl-action-icon-enter-active,
  .lnl-action-icon-leave-active {
    transition: none;
  }

  .lnl-header-action:hover,
  .lnl-header-action:active {
    transform: none;
  }

  .lnl-cache-panel-enter-active,
  .lnl-cache-panel-leave-active,
  .lnl-cache-progress i {
    transition: none;
  }

  .lnl-cache-panel-icon svg {
    animation: none !important;
  }

  .lnl-theme-wipe,
  .lnl-route-cover,
  .lnl-route-core,
  .lnl-route-core img,
  .lnl-route-track i {
    animation: none;
  }
}

@media (max-width: 640px) {
  .lnl-cache-panel {
    top: calc(env(safe-area-inset-top, 0px) + 66px);
    right: max(10px, env(safe-area-inset-right, 0px));
    left: max(10px, env(safe-area-inset-left, 0px));
    width: auto;
  }

  .lnl-pwa-panel {
    top: calc(env(safe-area-inset-top, 0px) + 66px);
    right: max(10px, env(safe-area-inset-right, 0px));
    left: max(10px, env(safe-area-inset-left, 0px));
    width: auto;
  }
}
</style>
