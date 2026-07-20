<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { computed, onMounted, ref } from 'vue'

interface VisitorGeoData {
  ip: string
  isp: string
  location: string
  countryCode: string
}

interface VisitorClientData {
  device: string
  browser: string
}

interface VisitorInfoRow {
  value: string
  icon: string
  expandOnly?: boolean
}

const ANDROID_REGEX = /android/i
const IPHONE_OR_IPOD_REGEX = /iphone|ipod/i
const IPAD_REGEX = /ipad/i
const TABLET_REGEX = /tablet/i
const EDGE_VERSION_REGEX = /Edg\/(\d+)/i
const OPERA_VERSION_REGEX = /OPR\/(\d+)/i
const CHROME_VERSION_REGEX = /Chrome\/(\d+)/i
const EDGE_OR_OPERA_REGEX = /Edg|OPR/i
const FIREFOX_VERSION_REGEX = /Firefox\/(\d+)/i
const SAFARI_REGEX = /Safari/i
const CHROME_REGEX = /Chrome/i
const IPV4_SEGMENT_REGEX = /^\d+$/
const IPV6_SEGMENT_REGEX = /^[\dA-F]{1,4}$/i
const IPV6_DOUBLE_COLON = '::'

const loading = ref(true)
const device = ref('检测中')
const browser = ref('检测中')
const ip = ref('获取中')
const isp = ref('获取中')
const location = ref('正在定位访客来源')
const countryCode = ref('')
const visitTime = ref(formatVisitTime(new Date()))
const flagVisible = ref(true)
const expand = ref(false)

const subtitle = computed(() => loading.value ? '检测中' : location.value || '网络访客')
const flagSrc = computed(() => countryCode.value ? `/images/flags/${countryCode.value}.svg` : '')
const displayIp = computed(() => expand.value ? ip.value : maskIpForCollapsedState(ip.value))

const visitorRows = computed<VisitorInfoRow[]>(() => [
  {
    value: subtitle.value,
    icon: 'tabler:world-pin',
  },
  {
    value: device.value,
    icon: 'tabler:device-desktop',
    expandOnly: true,
  },
  {
    value: displayIp.value,
    icon: 'tabler:brand-socket-io',
  },
  {
    value: browser.value,
    icon: 'tabler:browser',
  },
  {
    value: isp.value,
    icon: 'tabler:building-skyscraper',
    expandOnly: true,
  },
  {
    value: visitTime.value,
    icon: 'tabler:clock-hour-4',
    expandOnly: true,
  },
])
const visibleRows = computed(() => visitorRows.value.filter(item => expand.value || !item.expandOnly))

function getItemTransitionStyle(index: number): Record<string, string> {
  return {
    '--visitor-pill-delay': `${index * 28}ms`,
  }
}

function formatVisitTime(date: Date): string {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

function maskIpForCollapsedState(value: string): string {
  return maskIpv4Address(value) ?? maskIpv6Address(value) ?? value
}

function maskIpv4Address(value: string): string | null {
  const segments = value.split('.')
  if (segments.length !== 4 || segments.some(segment => !IPV4_SEGMENT_REGEX.test(segment))) {
    return null
  }

  const [first, second, third, fourth] = segments as [string, string, string, string]

  return [
    first,
    second,
    '*'.repeat(third.length),
    fourth,
  ].join('.')
}

function maskIpv6Address(value: string): string | null {
  const percentIndex = value.indexOf('%')
  const address = percentIndex >= 0 ? value.slice(0, percentIndex) : value
  const scope = percentIndex >= 0 ? value.slice(percentIndex + 1) : ''
  if (!address.includes(':') || address.includes(':::')) {
    return null
  }

  const doubleColonCount = address.split(IPV6_DOUBLE_COLON).length - 1
  if (doubleColonCount > 1) {
    return null
  }

  const segments = address.split(':')
  if (segments.some((segment, index) => !isValidIpv6Segment(segment, index, segments))) {
    return null
  }

  let maskedAddress = address
  if (address.includes('::')) {
    const [prefix = ''] = address.split('::')
    const visibleSegments = prefix ? prefix.split(':').filter(Boolean).slice(0, 4) : []
    maskedAddress = visibleSegments.length > 0 ? `${visibleSegments.join(':')}::*` : '::*'
  }
  else if (segments.length > 4) {
    maskedAddress = `${segments.slice(0, 4).join(':')}:*`
  }

  return scope ? `${maskedAddress}%${scope}` : maskedAddress
}

function isValidIpv6Segment(segment: string, index: number, segments: string[]): boolean {
  if (!segment) {
    return true
  }
  if (segment.includes('.')) {
    return index === segments.length - 1 && maskIpv4Address(segment) !== null
  }
  return IPV6_SEGMENT_REGEX.test(segment)
}

function detectClient(): VisitorClientData {
  const ua = navigator.userAgent

  let detectedDevice = '桌面设备'
  if (ANDROID_REGEX.test(ua))
    detectedDevice = 'Android 手机'
  else if (IPHONE_OR_IPOD_REGEX.test(ua))
    detectedDevice = 'iPhone'
  else if (IPAD_REGEX.test(ua))
    detectedDevice = 'iPad'
  else if (TABLET_REGEX.test(ua))
    detectedDevice = '平板电脑'

  let detectedBrowser = '未知浏览器'
  const edgeMatch = ua.match(EDGE_VERSION_REGEX)
  const operaMatch = ua.match(OPERA_VERSION_REGEX)
  const chromeMatch = ua.match(CHROME_VERSION_REGEX)
  const firefoxMatch = ua.match(FIREFOX_VERSION_REGEX)

  if (edgeMatch) {
    detectedBrowser = 'Edge'
  }
  else if (operaMatch) {
    detectedBrowser = 'Opera'
  }
  else if (chromeMatch && !EDGE_OR_OPERA_REGEX.test(ua)) {
    detectedBrowser = 'Chrome'
  }
  else if (firefoxMatch) {
    detectedBrowser = 'Firefox'
  }
  else if (SAFARI_REGEX.test(ua) && !CHROME_REGEX.test(ua)) {
    detectedBrowser = 'Safari'
  }

  return {
    device: detectedDevice,
    browser: detectedBrowser,
  }
}

async function fetchJson<T>(url: string, timeoutMs: number): Promise<T> {
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, { signal: controller.signal })
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status}`)
    }
    return await response.json() as T
  }
  finally {
    window.clearTimeout(timeoutId)
  }
}

async function fetchVisitorGeo(): Promise<VisitorGeoData | null> {
  const loaders = [
    async (): Promise<VisitorGeoData> => {
      const data = await fetchJson<{
        ip?: string
        isp?: string
        organization?: string
        asn_organization?: string
        country?: string
        country_code?: string
        region?: string
        city?: string
      }>('https://api.ip.sb/geoip', 4000)

      if (!data.ip) {
        throw new Error('ip.sb unavailable')
      }

      return {
        ip: data.ip,
        isp: data.isp || data.organization || data.asn_organization || '未知运营商',
        location: [data.country, data.city || data.region].filter(Boolean).join(' · ') || '未知位置',
        countryCode: data.country_code || '',
      }
    },
    async (): Promise<VisitorGeoData> => {
      const data = await fetchJson<{
        success?: boolean
        message?: string
        ip?: string
        country?: string
        country_code?: string
        region?: string
        city?: string
        connection?: {
          isp?: string
          org?: string
        }
      }>('https://ipwho.is/', 4000)

      if (data.success === false || !data.ip) {
        throw new Error(data.message || 'ipwho.is unavailable')
      }

      return {
        ip: data.ip,
        isp: data.connection?.isp || data.connection?.org || '未知运营商',
        location: [data.country, data.city || data.region].filter(Boolean).join(' · ') || '未知位置',
        countryCode: data.country_code || '',
      }
    },
    async (): Promise<VisitorGeoData> => {
      const data = await fetchJson<{
        ip?: string
        company?: {
          name?: string
        }
        asn?: {
          org?: string
          descr?: string
          country?: string
        }
        datacenter?: {
          datacenter?: string
          country?: string
          region?: string
          city?: string
        }
        location?: {
          country?: string
          country_code?: string
          state?: string
          city?: string
        }
      }>('https://api.ipapi.is/', 4000)

      if (!data.ip) {
        throw new Error('ipapi.is unavailable')
      }

      return {
        ip: data.ip,
        isp: data.asn?.org || data.company?.name || data.datacenter?.datacenter || data.asn?.descr || '未知运营商',
        location: [
          data.location?.country || data.datacenter?.country,
          data.location?.city || data.location?.state || data.datacenter?.city || data.datacenter?.region,
        ].filter(Boolean).join(' · ') || '未知位置',
        countryCode: data.location?.country_code || data.asn?.country || data.datacenter?.country || '',
      }
    },
    async (): Promise<VisitorGeoData> => {
      const data = await fetchJson<{
        error?: boolean
        reason?: string
        ip?: string
        org?: string
        country_name?: string
        country_code?: string
        region?: string
        city?: string
      }>('https://ipapi.co/json/', 4000)

      if (data.error || !data.ip) {
        throw new Error(data.reason || 'ipapi unavailable')
      }

      return {
        ip: data.ip,
        isp: data.org || '未知运营商',
        location: [data.country_name, data.city || data.region].filter(Boolean).join(' · ') || '未知位置',
        countryCode: data.country_code || '',
      }
    },
    async (): Promise<VisitorGeoData> => {
      const data = await fetchJson<{
        code: number
        data?: {
          ip?: string
          isp?: string
          country?: string
          province?: string
          city?: string
          countryCode?: string
        }
      }>('https://api.vore.top/api/IPdata', 5000)

      if (data.code !== 0 || !data.data?.ip) {
        throw new Error('vore unavailable')
      }

      return {
        ip: data.data.ip,
        isp: data.data.isp || '未知运营商',
        location: [data.data.country, data.data.city || data.data.province].filter(Boolean).join(' · ') || '未知位置',
        countryCode: data.data.countryCode || '',
      }
    },
  ]

  for (const load of loaders) {
    try {
      return await load()
    }
    catch {
    }
  }

  return null
}

function handleFlagError(): void {
  flagVisible.value = false
}

onMounted(async () => {
  const client = detectClient()
  device.value = client.device
  browser.value = client.browser
  visitTime.value = formatVisitTime(new Date())

  const geo = await fetchVisitorGeo()
  if (geo) {
    ip.value = geo.ip
    isp.value = geo.isp
    location.value = geo.location
    countryCode.value = geo.countryCode.toUpperCase()
  }
  else {
    ip.value = '暂无法获取'
    isp.value = '网络信息不可用'
    location.value = '网络访客'
  }

  loading.value = false
})
</script>

<template>
  <aside class="lnl-visitor" aria-label="访客网络信息">
    <button
      type="button"
      class="lnl-visitor-trigger"
      :class="{ 'is-expanded': expand }"
      :aria-expanded="expand"
      @click="expand = !expand"
    >
      <TransitionGroup
        tag="div"
        name="visitor-pill"
        class="lnl-visitor-rows transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
        :class="[expand ? 'grid grid-cols-2 items-start justify-start gap-x-3 gap-y-2' : 'flex flex-nowrap items-center justify-center gap-x-3 gap-y-1']"
      >
        <div
          v-for="(item, index) in visibleRows" :key="item.icon"
          class="flex min-w-0 items-center gap-1 rounded-full transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
          :style="getItemTransitionStyle(index)"
        >
          <img
            v-if="item.icon === 'tabler:world-pin' && flagSrc && flagVisible" :src="flagSrc" :alt="countryCode"
            class="h-4 w-4 object-cover" @error="handleFlagError"
          >
          <div
            v-else
            class="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-emerald-500/10 text-emerald-600"
          >
            <Icon :icon="item.icon" :width="14" :height="14" />
          </div>
          <div
            class="min-w-0 transition-[opacity,transform] duration-220 ease-[cubic-bezier(0.22,1,0.36,1)]"
            :class="[expand || !index ? 'block opacity-100 translate-y-0' : 'hidden md:block md:opacity-100', !expand && index ? 'md:translate-y-0' : '']"
          >
            <div v-if="loading" class="h-2 w-15 animate-pulse rounded-full bg-muted/70" />
            <p v-else class="max-w-30 truncate text-xs font-medium text-muted-foreground sm:max-w-50">
              {{ item.value }}
            </p>
          </div>
        </div>
      </TransitionGroup>
      <span class="lnl-visitor-action" aria-hidden="true">
        {{ expand ? '收起' : '详情' }}
        <Icon :icon="expand ? 'tabler:chevron-up' : 'tabler:chevron-down'" :width="13" :height="13" />
      </span>
    </button>
  </aside>
</template>

<style scoped>
.lnl-visitor {
  position: fixed;
  z-index: 30;
  left: max(14px, env(safe-area-inset-left));
  bottom: max(14px, env(safe-area-inset-bottom));
  display: flex;
  max-width: min(680px, calc(100vw - 28px));
  justify-content: flex-start;
}

.lnl-visitor-trigger {
  display: flex;
  max-width: 100%;
  align-items: center;
  gap: 14px;
  padding: 9px 11px 9px 13px;
  border: 1px solid var(--lnl-line);
  border-radius: 0;
  background: color-mix(in srgb, var(--background) 90%, transparent);
  box-shadow: 0 12px 38px rgb(0 0 0 / 18%);
  backdrop-filter: blur(16px) saturate(120%);
  color: inherit;
  text-align: left;
  transition:
    border-color 240ms ease,
    background-color 240ms ease,
    transform 320ms cubic-bezier(0.22, 1, 0.36, 1);
}

.lnl-visitor-trigger:hover,
.lnl-visitor-trigger:focus-visible,
.lnl-visitor-trigger.is-expanded {
  border-color: color-mix(in srgb, var(--lnl-green) 48%, var(--lnl-line));
  background: color-mix(in srgb, var(--lnl-surface) 94%, transparent);
}

.lnl-visitor-trigger:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--lnl-green) 45%, transparent);
  outline-offset: 3px;
}

.lnl-visitor-action {
  display: flex;
  flex: none;
  align-items: center;
  gap: 3px;
  padding-left: 10px;
  border-left: 1px solid var(--lnl-line);
  color: var(--lnl-green);
  font: 9px var(--font-mono);
  letter-spacing: 0.08em;
}

.visitor-pill-enter-active,
.visitor-pill-leave-active,
.visitor-pill-move {
  transition:
    opacity 220ms ease,
    transform 280ms cubic-bezier(0.22, 1, 0.36, 1);
}

.visitor-pill-enter-active {
  transition-delay: var(--visitor-pill-delay, 0ms);
}

.visitor-pill-enter-from,
.visitor-pill-leave-to {
  opacity: 0;
  transform: translateY(8px) scale(0.96);
}

.visitor-pill-leave-active {
  position: absolute;
}

@media (max-width: 760px) {
  .lnl-visitor {
    right: 14px;
    max-width: none;
  }

  .lnl-visitor-trigger {
    width: auto;
    max-width: 100%;
    align-items: flex-start;
  }

  .lnl-visitor-rows {
    flex: 1;
    justify-content: flex-start !important;
  }
}

@media (prefers-reduced-motion: reduce) {
  .visitor-pill-enter-active,
  .visitor-pill-leave-active,
  .visitor-pill-move {
    transition: none;
  }

  .lnl-visitor-trigger {
    transition: none;
  }

  .visitor-pill-enter-from,
  .visitor-pill-leave-to {
    opacity: 1;
    transform: none;
  }
}
</style>
