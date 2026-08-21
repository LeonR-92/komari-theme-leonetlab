<script setup lang="ts">
import type { ColorPalette, CursorStyle, ThemeMode } from '@/stores/app'
import { Icon } from '@iconify/vue'
import { computed, inject, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Button } from '@/components/ui/button'
import { DataTooltip } from '@/components/ui/data-tooltip'
import { useMotionPreference } from '@/composables/useMotionPreference'
import { PALETTE_ACCENT_COLORS, PALETTE_THEME_COLORS, useAppStore } from '@/stores/app'

const router = useRouter()
const appStore = useAppStore()
const { motionReduced } = useMotionPreference()
const isScrolled = inject<ReturnType<typeof ref<boolean>>>('isScrolled', ref(false))
interface ThemeOrigin {
  x: number
  y: number
  radius: number
}

interface AppearanceChange {
  mode?: ThemeMode
  palette?: ColorPalette
  restore?: boolean
}

interface AppearanceTarget {
  mode: ThemeMode
  palette: ColorPalette
  resolvedMode: 'light' | 'dark'
}

interface HeaderAction {
  title: string
  icon: string
  action: string
}

const themeTransition = ref<{
  target: 'light' | 'dark'
  palette: ColorPalette
  color: string
  accent: string
  secondary: string
  phase: 'revealing' | 'settling'
} | null>(null)
const themeTransitionActive = ref(false)
const leavingForAdmin = ref(false)
const transitionTimers = new Set<number>()
const THEME_REVEAL_DURATION_MS = 680
const FALLBACK_THEME_COMMIT_MS = 610
const THEME_TRANSITION_FALLBACK_MS = THEME_REVEAL_DURATION_MS + 220
let themeCommitTimer: number | null = null
let themeFallbackTimer: number | null = null
let pendingAppearance: AppearanceChange | null = null
let queuedAppearance: AppearanceChange | null = null
let queuedThemeOrigin: ThemeOrigin | null = null
let activeViewTransition: ViewTransition | null = null
let componentUnmounting = false
const logoVisible = ref(true)
const appearancePanelOpen = ref(false)
const appearanceButton = ref<HTMLElement | null>(null)

const themeModeOptions: Array<{ value: ThemeMode, label: string, icon: string }> = [
  { value: 'system', label: '自动', icon: 'icon-park-outline:dark-mode' },
  { value: 'light', label: '浅色', icon: 'icon-park-outline:sun-one' },
  { value: 'dark', label: '深色', icon: 'icon-park-outline:moon' },
]
const paletteOptions: Array<{ value: ColorPalette, label: string, color: string }> = [
  { value: 'emerald', label: '观测翠绿', color: PALETTE_ACCENT_COLORS.emerald.light.primary },
  { value: 'aurora', label: '极光青', color: PALETTE_ACCENT_COLORS.aurora.light.primary },
  { value: 'cobalt', label: '深空蓝', color: PALETTE_ACCENT_COLORS.cobalt.light.primary },
  { value: 'amber', label: '琥珀金', color: PALETTE_ACCENT_COLORS.amber.light.primary },
]
const cursorOptions: Array<{ value: CursorStyle, label: string }> = [
  { value: 'native', label: '系统指针' },
  { value: 'halo', label: '光环指针' },
]

const actionButtons = computed(() => {
  const buttons: HeaderAction[] = [{
    title: '外观设置',
    icon: appStore.themeMode === 'system' ? 'icon-park-outline:dark-mode' : appStore.themeMode === 'light' ? 'icon-park-outline:sun-one' : 'icon-park-outline:moon',
    action: 'toggleAppearance',
  }]
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

function resolveAppearanceTarget(change: AppearanceChange): AppearanceTarget {
  const mode = change.restore ? appStore.defaultThemeMode : change.mode ?? appStore.themeMode
  const palette = change.restore ? appStore.defaultColorPalette : change.palette ?? appStore.colorPalette
  return { mode, palette, resolvedMode: appStore.resolveThemeMode(mode) }
}

function commitPendingTheme() {
  if (!pendingAppearance)
    return
  const change = pendingAppearance
  pendingAppearance = null
  if (change.restore) {
    appStore.restoreAppearanceDefaults()
    return
  }
  if (change.mode)
    appStore.updateThemeMode(change.mode)
  if (change.palette)
    appStore.updateColorPalette(change.palette)
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

  const queuedChange = queuedAppearance
  const queuedOrigin = queuedThemeOrigin
  queuedAppearance = null
  queuedThemeOrigin = null
  if (!componentUnmounting && queuedChange) {
    queueMicrotask(() => startThemeTransition(queuedChange, queuedOrigin ?? resolveThemeOrigin()))
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

function startFallbackThemeTransition(change: AppearanceChange, target: AppearanceTarget) {
  pendingAppearance = change
  const targetAccents = PALETTE_ACCENT_COLORS[target.palette][target.resolvedMode]
  themeTransition.value = {
    target: target.resolvedMode,
    palette: target.palette,
    color: PALETTE_THEME_COLORS[target.palette][target.resolvedMode],
    accent: targetAccents.primary,
    secondary: targetAccents.secondary,
    phase: 'revealing',
  }
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

function startThemeTransition(change: AppearanceChange, origin: ThemeOrigin) {
  if (themeTransitionActive.value) {
    queuedAppearance = change
    queuedThemeOrigin = origin
    return
  }

  const target = resolveAppearanceTarget(change)
  if (target.resolvedMode === appStore.resolvedThemeMode && target.palette === appStore.colorPalette) {
    pendingAppearance = change
    commitPendingTheme()
    return
  }

  if (motionReduced.value) {
    pendingAppearance = change
    commitPendingTheme()
    return
  }

  beginThemeTransition(origin)
  const transitionDocument = document as Document & {
    startViewTransition?: Document['startViewTransition']
  }
  if (typeof transitionDocument.startViewTransition === 'function') {
    pendingAppearance = change
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

  startFallbackThemeTransition(change, target)
}

function requestAppearance(change: AppearanceChange) {
  const origin = resolveThemeOrigin(appearanceButton.value)
  if (themeTransitionActive.value) {
    queuedAppearance = change
    queuedThemeOrigin = origin
    return
  }
  startThemeTransition(change, origin)
}

function toggleAppearancePanel(originElement?: Element | null) {
  if (originElement instanceof HTMLElement)
    appearanceButton.value = originElement
  appearancePanelOpen.value = !appearancePanelOpen.value
}

function selectCursor(style: CursorStyle) {
  appStore.updateCursorStyle(style)
}

function restoreAppearance() {
  requestAppearance({ restore: true })
}

function handleDocumentPointerDown(event: PointerEvent) {
  if (!appearancePanelOpen.value)
    return
  const target = event.target instanceof Element ? event.target : null
  if (target?.closest('.lnl-appearance-panel') || target?.closest('[data-action="toggleAppearance"]'))
    return
  appearancePanelOpen.value = false
}

function handleDocumentKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape')
    appearancePanelOpen.value = false
}

function handleVisibilityChange() {
  if (document.visibilityState === 'hidden' && themeTransitionActive.value)
    settleThemeTransitionImmediately()
}

onMounted(() => {
  document.addEventListener('visibilitychange', handleVisibilityChange)
  document.addEventListener('pointerdown', handleDocumentPointerDown)
  document.addEventListener('keydown', handleDocumentKeydown)
})

watch(motionReduced, reduced => reduced && settleThemeTransitionImmediately())

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
  if (action === 'toggleAppearance')
    toggleAppearancePanel(event.currentTarget instanceof Element ? event.currentTarget : null)
  if (action === 'jumpToSetting')
    jumpToSetting()
}

onUnmounted(() => {
  componentUnmounting = true
  queuedAppearance = null
  queuedThemeOrigin = null
  document.removeEventListener('visibilitychange', handleVisibilityChange)
  document.removeEventListener('pointerdown', handleDocumentPointerDown)
  document.removeEventListener('keydown', handleDocumentKeydown)
  transitionTimers.forEach(timer => window.clearTimeout(timer))
  transitionTimers.clear()
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
            :aria-label="button.title"
            :aria-expanded="button.action === 'toggleAppearance' ? appearancePanelOpen : undefined"
            :aria-controls="button.action === 'toggleAppearance' ? 'lnl-appearance-panel' : undefined"
            @click="handleButtonClick(button.action, $event)"
          >
            <Transition name="lnl-action-icon" mode="out-in">
              <Icon
                :key="button.icon"
                :icon="button.icon"
                :width="18"
                :height="18"
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
        v-if="appearancePanelOpen"
        id="lnl-appearance-panel"
        class="lnl-appearance-panel"
        role="dialog"
        aria-label="外观设置"
      >
        <header>
          <span>APPEARANCE</span>
          <strong>外观设置</strong>
        </header>
        <fieldset>
          <legend>亮度</legend>
          <div class="lnl-appearance-segments">
            <button
              v-for="option in themeModeOptions"
              :key="option.value"
              type="button"
              :data-theme-mode="option.value"
              :class="{ active: appStore.themeMode === option.value }"
              :aria-pressed="appStore.themeMode === option.value"
              @click="requestAppearance({ mode: option.value })"
            >
              <Icon :icon="option.icon" :width="15" :height="15" />
              {{ option.label }}
            </button>
          </div>
        </fieldset>
        <fieldset>
          <legend>配色</legend>
          <div class="lnl-palette-grid">
            <button
              v-for="option in paletteOptions"
              :key="option.value"
              type="button"
              :data-color-palette="option.value"
              :class="{ active: appStore.colorPalette === option.value }"
              :aria-pressed="appStore.colorPalette === option.value"
              @click="requestAppearance({ palette: option.value })"
            >
              <i :style="{ '--swatch': option.color }" />
              <span>{{ option.label }}</span>
              <Icon v-if="appStore.colorPalette === option.value" icon="tabler:check" :width="14" :height="14" />
            </button>
          </div>
        </fieldset>
        <fieldset>
          <legend>鼠标</legend>
          <div class="lnl-appearance-segments is-cursor">
            <button
              v-for="option in cursorOptions"
              :key="option.value"
              type="button"
              :data-cursor-style="option.value"
              :class="{ active: appStore.cursorStyle === option.value }"
              :aria-pressed="appStore.cursorStyle === option.value"
              @click="selectCursor(option.value)"
            >
              {{ option.label }}
            </button>
          </div>
        </fieldset>
        <button class="lnl-appearance-reset" type="button" @click="restoreAppearance">
          <Icon icon="tabler:restore" :width="15" :height="15" />
          恢复站点默认
        </button>
      </section>
    </Transition>
    <div
      v-if="themeTransition"
      class="lnl-theme-wipe"
      :class="[`to-${themeTransition.target}`, `is-${themeTransition.phase}`]"
      :style="{
        '--theme-target-color': themeTransition.color,
        '--theme-target-accent': themeTransition.accent,
        '--theme-target-secondary': themeTransition.secondary,
      }"
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

.lnl-header-action[data-action='toggleAppearance']:hover > :deep(svg) {
  transform: rotate(16deg) scale(1.08);
}

.lnl-header-action[data-action='jumpToSetting']:hover > :deep(svg) {
  transform: rotate(32deg);
}

.lnl-header-action.is-busy {
  color: var(--lnl-green);
}

.lnl-appearance-panel {
  position: fixed;
  z-index: 135;
  top: calc(env(safe-area-inset-top, 0px) + 76px);
  right: max(18px, env(safe-area-inset-right, 0px));
  width: min(332px, calc(100vw - 24px));
  padding: 15px;
  border: 1px solid color-mix(in srgb, var(--lnl-green) 34%, var(--border));
  border-radius: var(--lnl-radius-card);
  background: color-mix(in srgb, var(--popover) 97%, var(--lnl-green) 3%);
  box-shadow: var(--lnl-shadow-card-hover);
  color: var(--foreground);
}

.lnl-appearance-panel > header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 13px;
}

.lnl-appearance-panel > header span,
.lnl-appearance-panel legend {
  color: var(--muted-foreground);
  font: 600 9px/1.2 var(--font-mono);
  letter-spacing: 0.12em;
}

.lnl-appearance-panel > header strong {
  font: 650 14px/1.25 var(--font-sans);
}

.lnl-appearance-panel fieldset {
  min-width: 0;
  margin: 0 0 13px;
  padding: 0;
  border: 0;
}

.lnl-appearance-panel legend {
  margin-bottom: 7px;
}

.lnl-appearance-segments {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 5px;
  padding: 4px;
  border: 1px solid var(--lnl-line);
  border-radius: var(--lnl-radius-control);
  background: var(--lnl-surface-inner);
}

.lnl-appearance-segments.is-cursor {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.lnl-appearance-segments button,
.lnl-palette-grid button,
.lnl-appearance-reset {
  min-height: 36px;
  border: 0;
  border-radius: calc(var(--lnl-radius-control) - 3px);
  background: transparent;
  color: var(--muted-foreground);
  font: 600 12px/1.2 var(--font-sans);
}

.lnl-appearance-segments button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
}

.lnl-appearance-segments button.active {
  background: var(--lnl-surface-raised);
  box-shadow: 0 4px 13px color-mix(in srgb, #000 8%, transparent);
  color: var(--lnl-green);
}

.lnl-palette-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}

.lnl-palette-grid button {
  display: grid;
  grid-template-columns: 16px minmax(0, 1fr) 15px;
  align-items: center;
  gap: 7px;
  padding: 0 9px;
  border: 1px solid var(--lnl-line);
  text-align: left;
}

.lnl-palette-grid button.active {
  border-color: color-mix(in srgb, var(--lnl-green) 56%, var(--border));
  background: color-mix(in srgb, var(--lnl-green) 8%, transparent);
  color: var(--foreground);
}

.lnl-palette-grid i {
  width: 13px;
  height: 13px;
  border: 2px solid color-mix(in srgb, var(--swatch) 28%, white);
  border-radius: 50%;
  background: var(--swatch);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--swatch) 35%, transparent);
}

.lnl-appearance-reset {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: center;
  gap: 7px;
  border: 1px dashed color-mix(in srgb, var(--lnl-green) 35%, var(--border));
}

.lnl-appearance-reset:hover {
  background: color-mix(in srgb, var(--lnl-green) 7%, transparent);
  color: var(--foreground);
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
    linear-gradient(
      color-mix(in srgb, var(--theme-target-accent, var(--lnl-green)) 4%, transparent) 1px,
      transparent 1px
    ),
    linear-gradient(
      90deg,
      color-mix(in srgb, var(--theme-target-secondary, var(--lnl-cyan)) 4%, transparent) 1px,
      transparent 1px
    );
  background-size: 42px 42px;
  mask-image: radial-gradient(circle at var(--theme-x, 100%) var(--theme-y, 0%), #000, transparent 78%);
}
.lnl-theme-wipe.to-dark {
  background-color: var(--theme-target-color, #06100d);
}
.lnl-theme-wipe.to-light {
  background-color: var(--theme-target-color, #edf7f1);
}
.lnl-theme-wipe.is-revealing {
  animation: lnl-theme-fallback-reveal 680ms cubic-bezier(0.22, 1, 0.36, 1) both;
}
.lnl-theme-wipe.is-settling {
  clip-path: circle(var(--theme-radius, 150vmax) at var(--theme-x, 100%) var(--theme-y, 0%));
  animation: lnl-theme-fallback-settle 90ms ease-out both;
}
.lnl-route-cover {
  --route-bg: var(--background);
  --route-ink: var(--foreground);
  --route-muted: var(--muted-foreground);
  --route-accent: var(--lnl-green);
  --route-cyan: var(--lnl-cyan);
  --route-surface: var(--lnl-surface-raised);
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
  color-scheme: light;
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
  .lnl-cache-panel-leave-active {
    transition: none;
  }

  .lnl-theme-wipe,
  .lnl-route-cover,
  .lnl-route-core,
  .lnl-route-core img,
  .lnl-route-track i {
    animation: none;
  }
}
</style>
