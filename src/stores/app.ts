import type { PublicSettings } from '@/utils/api'
import type { ByteDecimalsConfig } from '@/utils/helper'
import { useStorageAsync } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

export type ThemeMode = 'system' | 'light' | 'dark'
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

function isValidThemeMode(value: unknown): value is ThemeMode {
  return value === 'system' || value === 'light' || value === 'dark'
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
  const beijingClock = ref(Date.now())
  window.setInterval(() => {
    beijingClock.value = Date.now()
  }, 60_000)
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

  watch(publicSettings, (settings) => {
    if (settings && !hasThemeModeOverride.value) {
      themeMode.value = defaultThemeMode.value
    }
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

  function updateLoginState(loggedIn: boolean) {
    isLoggedIn.value = loggedIn
  }

  return {
    loading,
    introActive,
    themeMode,
    hasThemeModeOverride,
    defaultThemeMode,
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
    resolveThemeMode,
    updateLoginState,
  }
})

export { useAppStore }
