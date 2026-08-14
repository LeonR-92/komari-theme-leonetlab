import type { PublicSettings } from '@/utils/api'
import type { CurrencyCode } from '@/utils/financeHelper'
import type { ByteDecimalsConfig } from '@/utils/helper'
import { useStorageAsync } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { normalizeCurrency } from '@/utils/financeHelper'
import { useVisibleMinuteClock } from '@/utils/visibleMinuteClock'

export type ThemeMode = 'system' | 'light' | 'dark'
export type ColorPalette = 'emerald' | 'aurora' | 'cobalt' | 'amber'
export type CursorStyle = 'halo' | 'native'
export type BillingDisplayPeriod = 'monthly' | 'quarterly' | 'yearly'
export type NodeCardDensity = 'comfortable' | 'compact'
type Lang = 'zh-CN' | 'en-US'
type NodeViewMode = 'card' | 'list'
type RpcTransportMode = 'websocket' | 'http'
type EarthViewMode = 'earth' | 'earth-stop' | 'maps' | 'cards' | 'hide'

/** 固定的字节精度配置 */
const BYTE_DECIMALS: ByteDecimalsConfig = {
  B: 0,
  KB: 0,
  MB: 1,
  GB: 1,
  TB: 2,
}

const THEME_MODE_STORAGE_KEY = 'appearance'
const THEME_MODE_OVERRIDE_KEY = 'leonetlab:appearance:user-override'
const COLOR_PALETTE_STORAGE_KEY = 'komari-observatory:palette'
const COLOR_PALETTE_OVERRIDE_KEY = 'komari-observatory:palette:override'
const CURSOR_STYLE_STORAGE_KEY = 'komari-observatory:cursor-style'
const CURSOR_STYLE_OVERRIDE_KEY = 'komari-observatory:cursor-style:override'
const BILLING_PERIOD_STORAGE_KEY = 'komari-observatory:billing-period'

export const PALETTE_THEME_COLORS: Record<ColorPalette, Record<'light' | 'dark', string>> = {
  emerald: { light: '#edf7f1', dark: '#04100d' },
  aurora: { light: '#edf8f8', dark: '#061013' },
  cobalt: { light: '#f1f5fb', dark: '#070d18' },
  amber: { light: '#fbf6eb', dark: '#151007' },
}

export const PALETTE_ACCENT_COLORS: Record<ColorPalette, Record<'light' | 'dark', { primary: string, secondary: string }>> = {
  emerald: {
    light: { primary: '#167a56', secondary: '#4a9eaa' },
    dark: { primary: '#74e6b2', secondary: '#75c9d4' },
  },
  aurora: {
    light: { primary: '#147f87', secondary: '#347fa5' },
    dark: { primary: '#67e1e7', secondary: '#82baff' },
  },
  cobalt: {
    light: { primary: '#315ea8', secondary: '#397ca8' },
    dark: { primary: '#82aaff', secondary: '#72d1e7' },
  },
  amber: {
    light: { primary: '#9a6515', secondary: '#8b7045' },
    dark: { primary: '#f2bd62', secondary: '#d8a779' },
  },
}

function isValidThemeMode(value: unknown): value is ThemeMode {
  return value === 'system' || value === 'light' || value === 'dark'
}

function isValidColorPalette(value: unknown): value is ColorPalette {
  return value === 'emerald' || value === 'aurora' || value === 'cobalt' || value === 'amber'
}

function isValidCursorStyle(value: unknown): value is CursorStyle {
  return value === 'halo' || value === 'native'
}

function isValidBillingDisplayPeriod(value: unknown): value is BillingDisplayPeriod {
  return value === 'monthly' || value === 'quarterly' || value === 'yearly'
}

function getBeijingHour(timestamp = Date.now()): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(timestamp)
  const hour = Number(parts.find(part => part.type === 'hour')?.value)
  return Number.isFinite(hour) ? hour : 12
}

function isValidEarthViewMode(value: unknown): value is EarthViewMode {
  return value === 'earth' || value === 'earth-stop' || value === 'maps' || value === 'cards' || value === 'hide'
}

const useAppStore = defineStore('app', () => {
  const loading = ref<boolean>(true)
  const introActive = ref<boolean>(false)

  // appearance 会被存储组件自动写入，不能仅凭它是否存在来判断访客是否
  // 手动选择过主题。单独的 override 标记只由页头切换操作写入。
  const themeMode = useStorageAsync<ThemeMode>(THEME_MODE_STORAGE_KEY, 'system', localStorage)
  const hasThemeModeOverride = ref(localStorage.getItem(THEME_MODE_OVERRIDE_KEY) === '1')
  const storedColorPalette = useStorageAsync<ColorPalette | null>(COLOR_PALETTE_STORAGE_KEY, null, localStorage)
  const hasColorPaletteOverride = ref(localStorage.getItem(COLOR_PALETTE_OVERRIDE_KEY) === '1')
  const storedCursorStyle = useStorageAsync<CursorStyle | null>(CURSOR_STYLE_STORAGE_KEY, null, localStorage)
  const hasCursorStyleOverride = ref(localStorage.getItem(CURSOR_STYLE_OVERRIDE_KEY) === '1')
  const storedBillingDisplayPeriod = useStorageAsync<BillingDisplayPeriod>(BILLING_PERIOD_STORAGE_KEY, 'monthly', localStorage)
  const lang = useStorageAsync<Lang>('language', 'zh-CN', localStorage)
  const publicSettings = ref<PublicSettings>()
  const readThemeString = (key: string, fallback = ''): string => {
    const value = publicSettings.value?.theme_settings?.[key]
    return typeof value === 'string' && value.trim() ? value.trim() : fallback
  }

  // Branding is intentionally sourced from Komari's public site settings/theme settings.
  // /favicon.ico is Komari's official favicon route and automatically prefers the
  // administrator-uploaded icon over the icon bundled with this theme.
  const brandName = computed(() => readThemeString('brandName', publicSettings.value?.sitename?.trim() || 'Komari Monitor'))
  const brandShortName = computed(() => readThemeString('brandShortName', brandName.value))
  const brandLogoUrl = computed(() => readThemeString('brandLogoUrl', '/favicon.ico'))
  const brandHeaderSubtitle = computed(() => readThemeString('brandHeaderSubtitle', 'NETWORK OBSERVATORY'))
  const brandStatusLabel = computed(() => readThemeString('brandStatusLabel', 'LIVE TELEMETRY'))
  const brandHeroKicker = computed(() => readThemeString('brandHeroKicker', 'GLOBAL NETWORK / LIVE OBSERVATION'))
  const brandHeroTitle = computed(() => readThemeString('brandHeroTitle', '全球节点观测'))
  const brandHeroDescription = computed(() => readThemeString('brandHeroDescription', `${brandName.value} 的实时状态、资源占用与网络质量。`))
  const brandIntroEyebrow = computed(() => readThemeString('brandIntroEyebrow', 'NETWORK OBSERVATORY / GLOBAL EDGE'))
  const brandIntroSubtitle = computed(() => readThemeString('brandIntroSubtitle', '正在同步实时节点状态'))
  const brandFooterEyebrow = computed(() => readThemeString('brandFooterEyebrow', 'EDGE / OBSERVATION COMPLETE'))
  const beijingClock = useVisibleMinuteClock()
  const nodeSelectedGroup = useStorageAsync<string>('nodeSelectedGroup', 'all', localStorage)
  const isLoggedIn = ref<boolean>(false)
  const connectionError = ref<boolean>(false)

  // 首页滚动位置记忆
  const homeScrollPosition = ref<number>(0)

  // 使用 null 表示未设置，等待主题配置加载后决定
  const storedViewMode = useStorageAsync<NodeViewMode | null>('nodeViewMode', null, localStorage)

  // 计算属性：从主题配置获取默认视图模式
  const defaultViewMode = computed<NodeViewMode>(() => {
    const settings = publicSettings.value?.theme_settings
    if (settings && typeof settings.defaultViewMode === 'string') {
      const mode = settings.defaultViewMode
      if (mode === 'card' || mode === 'list') {
        return mode
      }
    }
    return 'card'
  })

  // 校验视图模式是否为合法值
  function isValidViewMode(value: string | null): value is NodeViewMode {
    return value === 'card' || value === 'list'
  }

  // 当前实际使用的视图模式
  const nodeViewMode = computed<NodeViewMode>({
    get: () => {
      // 校验 storedViewMode 是否为合法值，非法值时使用默认值
      if (storedViewMode.value !== null && isValidViewMode(storedViewMode.value)) {
        return storedViewMode.value
      }
      return defaultViewMode.value
    },
    set: (val) => {
      storedViewMode.value = val
    },
  })

  // 计算属性：从主题配置获取 RPC 连接模式
  const rpcTransportMode = computed<RpcTransportMode>(() => {
    const settings = publicSettings.value?.theme_settings
    if (settings && typeof settings.rpcTransportMode === 'string') {
      const mode = settings.rpcTransportMode
      if (mode === 'websocket' || mode === 'http') {
        return mode
      }
    }
    return 'websocket'
  })

  // 字节格式化精度（固定配置）
  const byteDecimals: ByteDecimalsConfig = { ...BYTE_DECIMALS }

  // 计算属性：公告配置
  const alertEnabled = computed<boolean>(() => {
    const settings = publicSettings.value?.theme_settings
    if (settings && typeof settings.alertEnabled === 'boolean') {
      return settings.alertEnabled
    }
    return false
  })

  const alertTitle = computed<string>(() => {
    const settings = publicSettings.value?.theme_settings
    if (settings && typeof settings.alertTitle === 'string') {
      return settings.alertTitle
    }
    return ''
  })

  const alertContent = computed<string>(() => {
    const settings = publicSettings.value?.theme_settings
    if (settings && typeof settings.alertContent === 'string') {
      return settings.alertContent
    }
    return ''
  })

  const earthViewMode = computed<EarthViewMode>(() => {
    const settings = publicSettings.value?.theme_settings
    if (settings && typeof settings.earthViewMode === 'string' && isValidEarthViewMode(settings.earthViewMode)) {
      return settings.earthViewMode
    }
    return 'earth'
  })

  const visitorInfoCardEnabled = computed<boolean>(() => {
    const settings = publicSettings.value?.theme_settings
    if (settings && typeof settings.visitorInfoCardEnabled === 'boolean') {
      return settings.visitorInfoCardEnabled
    }
    return true
  })

  const hideAdminEntryWhenLoggedOut = computed<boolean>(() => {
    const settings = publicSettings.value?.theme_settings
    if (settings && typeof settings.hideAdminEntryWhenLoggedOut === 'boolean') {
      return settings.hideAdminEntryWhenLoggedOut
    }
    return false
  })

  const disablePageAnimation = computed<boolean>(() => {
    const settings = publicSettings.value?.theme_settings
    if (settings && typeof settings.disablePageAnimation === 'boolean') {
      return settings.disablePageAnimation
    }
    return false
  })

  const introAnimationEnabled = computed<boolean>(() => {
    const settings = publicSettings.value?.theme_settings
    if (settings && typeof settings.introAnimationEnabled === 'boolean') {
      return settings.introAnimationEnabled
    }
    return false
  })

  const regionalTelemetryEnabled = computed<boolean>(() => {
    const settings = publicSettings.value?.theme_settings
    if (settings && typeof settings.regionalTelemetryEnabled === 'boolean') {
      return settings.regionalTelemetryEnabled
    }
    return true
  })

  const readThemeBoolean = (key: string, fallback: boolean): boolean => {
    const value = publicSettings.value?.theme_settings?.[key]
    return typeof value === 'boolean' ? value : fallback
  }

  const extendedTelemetryEnabled = computed(() => readThemeBoolean('extendedTelemetryEnabled', true))
  const extendedTelemetryConnectionsEnabled = computed(() => readThemeBoolean('extendedTelemetryConnectionsEnabled', true))
  const extendedTelemetryProcessEnabled = computed(() => readThemeBoolean('extendedTelemetryProcessEnabled', true))
  const extendedTelemetryGpuUsageEnabled = computed(() => readThemeBoolean('extendedTelemetryGpuUsageEnabled', true))
  const extendedTelemetryGpuMemoryEnabled = computed(() => readThemeBoolean('extendedTelemetryGpuMemoryEnabled', true))
  const extendedTelemetryGpuTemperatureEnabled = computed(() => readThemeBoolean('extendedTelemetryGpuTemperatureEnabled', true))

  const nodeCardDensity = computed<NodeCardDensity>(() => {
    const density = publicSettings.value?.theme_settings?.nodeCardDensity
    return density === 'comfortable' ? 'comfortable' : 'compact'
  })

  const nodeCardCurrency = computed<CurrencyCode>(() => {
    const value = publicSettings.value?.theme_settings?.nodeCardCurrency
    return normalizeCurrency(typeof value === 'string' ? value : 'CNY')
  })

  // 计算属性：ICP 备案配置
  const icpEnabled = computed<boolean>(() => {
    const settings = publicSettings.value?.theme_settings
    if (settings && typeof settings.icpEnabled === 'boolean') {
      return settings.icpEnabled
    }
    return false
  })

  const icpNumber = computed<string>(() => {
    const settings = publicSettings.value?.theme_settings
    if (settings && typeof settings.icpNumber === 'string') {
      return settings.icpNumber
    }
    return ''
  })

  const icpUrl = computed<string>(() => {
    const settings = publicSettings.value?.theme_settings
    if (settings && typeof settings.icpUrl === 'string' && settings.icpUrl.trim()) {
      return settings.icpUrl.trim()
    }
    return 'https://beian.miit.gov.cn/'
  })

  // 计算属性：公安备案配置
  const policeEnabled = computed<boolean>(() => {
    const settings = publicSettings.value?.theme_settings
    if (settings && typeof settings.policeEnabled === 'boolean') {
      return settings.policeEnabled
    }
    return false
  })

  const policeNumber = computed<string>(() => {
    const settings = publicSettings.value?.theme_settings
    if (settings && typeof settings.policeNumber === 'string') {
      return settings.policeNumber
    }
    return ''
  })

  const policeUrl = computed<string>(() => {
    const settings = publicSettings.value?.theme_settings
    if (settings && typeof settings.policeUrl === 'string' && settings.policeUrl.trim()) {
      return settings.policeUrl.trim()
    }
    return ''
  })

  // 计算属性：自定义背景配置
  const backgroundEnabled = computed<boolean>(() => {
    const settings = publicSettings.value?.theme_settings
    if (settings && typeof settings.backgroundEnabled === 'boolean') {
      return settings.backgroundEnabled
    }
    return false
  })

  const backgroundType = computed<'image' | 'video'>(() => {
    const settings = publicSettings.value?.theme_settings
    if (settings && typeof settings.backgroundType === 'string') {
      const type = settings.backgroundType
      if (type === 'image' || type === 'video') {
        return type
      }
    }
    return 'image'
  })

  const lightBackgroundUrl = computed<string>(() => {
    const settings = publicSettings.value?.theme_settings
    if (settings && typeof settings.lightBackgroundUrl === 'string') {
      return settings.lightBackgroundUrl.trim()
    }
    return ''
  })

  const darkBackgroundUrl = computed<string>(() => {
    const settings = publicSettings.value?.theme_settings
    if (settings && typeof settings.darkBackgroundUrl === 'string') {
      return settings.darkBackgroundUrl.trim()
    }
    return ''
  })

  const backgroundBlur = computed<number>(() => {
    const settings = publicSettings.value?.theme_settings
    if (settings && typeof settings.backgroundBlur === 'number' && settings.backgroundBlur >= 0) {
      return settings.backgroundBlur
    }
    return 0
  })

  const backgroundOverlay = computed<number>(() => {
    const settings = publicSettings.value?.theme_settings
    if (settings && typeof settings.backgroundOverlay === 'number' && settings.backgroundOverlay >= -100 && settings.backgroundOverlay <= 100) {
      return settings.backgroundOverlay
    }
    return 0
  })

  // 当 publicSettings 加载后，如果 localStorage 没有保存过视图模式或值为非法值，使用默认值
  // 竞态审计结论（2026-07）：不存在水合覆盖风险。useStorageAsync 基于同步的
  // localStorage 读取，在 store 创建后的微任务内即完成水合；而 publicSettings
  // 只能在 init() 的网络请求完成后才被赋值，远晚于水合。immediate watcher 首次
  // 触发时 settings 为 undefined，不会写回默认值覆盖用户偏好。
  watch(publicSettings, (settings) => {
    if (settings && !isValidViewMode(storedViewMode.value)) {
      // 触发 computed setter，会自动保存到 localStorage
      storedViewMode.value = defaultViewMode.value
    }
  }, { immediate: true })

  const defaultThemeMode = computed<ThemeMode>(() => {
    const mode = publicSettings.value?.theme_settings?.defaultThemeMode
    if (mode === 'light' || mode === 'dark')
      return mode
    return 'system'
  })

  const defaultColorPalette = computed<ColorPalette>(() => {
    const palette = publicSettings.value?.theme_settings?.defaultColorPalette
    return isValidColorPalette(palette) ? palette : 'emerald'
  })

  const defaultCursorStyle = computed<CursorStyle>(() => {
    const style = publicSettings.value?.theme_settings?.defaultCursorStyle
    return isValidCursorStyle(style) ? style : 'halo'
  })

  const colorPalette = computed<ColorPalette>(() => {
    if (hasColorPaletteOverride.value && isValidColorPalette(storedColorPalette.value))
      return storedColorPalette.value
    return defaultColorPalette.value
  })

  const cursorStyle = computed<CursorStyle>(() => {
    if (hasCursorStyleOverride.value && isValidCursorStyle(storedCursorStyle.value))
      return storedCursorStyle.value
    return defaultCursorStyle.value
  })

  const billingDisplayPeriod = computed<BillingDisplayPeriod>(() => {
    return isValidBillingDisplayPeriod(storedBillingDisplayPeriod.value)
      ? storedBillingDisplayPeriod.value
      : 'monthly'
  })

  watch(publicSettings, (settings) => {
    if (settings && !hasThemeModeOverride.value) {
      themeMode.value = defaultThemeMode.value
    }
    if (settings && !hasColorPaletteOverride.value)
      storedColorPalette.value = defaultColorPalette.value
    if (settings && !hasCursorStyleOverride.value)
      storedCursorStyle.value = defaultCursorStyle.value
  }, { immediate: true })

  watch(themeMode, (mode) => {
    if (!isValidThemeMode(mode)) {
      themeMode.value = 'system'
    }
  }, { immediate: true })

  function resolveThemeMode(mode: ThemeMode): 'light' | 'dark' {
    if (mode === 'system') {
      const hour = getBeijingHour(beijingClock.value)
      return hour >= 7 && hour < 19 ? 'light' : 'dark'
    }
    return mode
  }

  // “自动”按北京时间 07:00–18:59 使用浅色，其余时段使用深色。
  const isDark = computed(() => resolveThemeMode(themeMode.value) === 'dark')

  const resolvedThemeMode = computed<'light' | 'dark'>(() => isDark.value ? 'dark' : 'light')

  // 计算属性：当前主题模式下的背景 URL
  const currentBackgroundUrl = computed<string>(() => {
    if (!backgroundEnabled.value) {
      return ''
    }

    if (resolvedThemeMode.value === 'dark') {
      return darkBackgroundUrl.value
    }
    return lightBackgroundUrl.value
  })

  function updateThemeMode(mode?: ThemeMode) {
    hasThemeModeOverride.value = true
    localStorage.setItem(THEME_MODE_OVERRIDE_KEY, '1')

    if (mode) {
      themeMode.value = isValidThemeMode(mode) ? mode : 'system'
      return
    }

    const nextMode: Record<ThemeMode, ThemeMode> = {
      system: 'light',
      light: 'dark',
      dark: 'system',
    }

    const currentMode = isValidThemeMode(themeMode.value) ? themeMode.value : 'system'
    themeMode.value = nextMode[currentMode]
  }

  function updateColorPalette(palette: ColorPalette) {
    if (!isValidColorPalette(palette))
      return
    hasColorPaletteOverride.value = true
    localStorage.setItem(COLOR_PALETTE_OVERRIDE_KEY, '1')
    storedColorPalette.value = palette
  }

  function updateCursorStyle(style: CursorStyle) {
    if (!isValidCursorStyle(style))
      return
    hasCursorStyleOverride.value = true
    localStorage.setItem(CURSOR_STYLE_OVERRIDE_KEY, '1')
    storedCursorStyle.value = style
  }

  function updateBillingDisplayPeriod(period: BillingDisplayPeriod) {
    storedBillingDisplayPeriod.value = isValidBillingDisplayPeriod(period) ? period : 'monthly'
  }

  function restoreAppearanceDefaults() {
    hasThemeModeOverride.value = false
    hasColorPaletteOverride.value = false
    hasCursorStyleOverride.value = false
    localStorage.removeItem(THEME_MODE_OVERRIDE_KEY)
    localStorage.removeItem(COLOR_PALETTE_OVERRIDE_KEY)
    localStorage.removeItem(CURSOR_STYLE_OVERRIDE_KEY)
    themeMode.value = defaultThemeMode.value
    storedColorPalette.value = defaultColorPalette.value
    storedCursorStyle.value = defaultCursorStyle.value
  }

  function updateLoginState(loggedIn: boolean) {
    isLoggedIn.value = loggedIn
  }

  return {
    loading,
    introActive,
    themeMode,
    hasThemeModeOverride,
    defaultThemeMode,
    colorPalette,
    defaultColorPalette,
    hasColorPaletteOverride,
    cursorStyle,
    defaultCursorStyle,
    hasCursorStyleOverride,
    billingDisplayPeriod,
    isDark,
    resolvedThemeMode,
    lang,
    nodeSelectedGroup,
    nodeViewMode,
    defaultViewMode,
    rpcTransportMode,
    byteDecimals,
    alertEnabled,
    alertTitle,
    alertContent,
    earthViewMode,
    visitorInfoCardEnabled,
    hideAdminEntryWhenLoggedOut,
    disablePageAnimation,
    introAnimationEnabled,
    regionalTelemetryEnabled,
    extendedTelemetryEnabled,
    extendedTelemetryConnectionsEnabled,
    extendedTelemetryProcessEnabled,
    extendedTelemetryGpuUsageEnabled,
    extendedTelemetryGpuMemoryEnabled,
    extendedTelemetryGpuTemperatureEnabled,
    nodeCardDensity,
    nodeCardCurrency,
    icpEnabled,
    icpNumber,
    icpUrl,
    policeEnabled,
    policeNumber,
    policeUrl,
    backgroundEnabled,
    backgroundType,
    lightBackgroundUrl,
    darkBackgroundUrl,
    currentBackgroundUrl,
    backgroundBlur,
    backgroundOverlay,
    isLoggedIn,
    publicSettings,
    brandName,
    brandShortName,
    brandLogoUrl,
    brandHeaderSubtitle,
    brandStatusLabel,
    brandHeroKicker,
    brandHeroTitle,
    brandHeroDescription,
    brandIntroEyebrow,
    brandIntroSubtitle,
    brandFooterEyebrow,
    connectionError,
    homeScrollPosition,
    updateThemeMode,
    updateColorPalette,
    updateCursorStyle,
    updateBillingDisplayPeriod,
    restoreAppearanceDefaults,
    resolveThemeMode,
    updateLoginState,
  }
})

export { useAppStore }
