<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'

const props = defineProps<{
  introComplete: boolean
  presentOnReady: boolean
}>()

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
  label: string
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
const presentationState = ref<'waiting' | 'entering' | 'scanning' | 'verified' | 'collapsing' | 'compacting' | 'compact'>(
  props.presentOnReady ? 'waiting' : 'compact',
)
const presentationTimers: number[] = []
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
let presentationStarted = false
const presentationActive = computed(() => ['entering', 'scanning', 'verified', 'collapsing'].includes(presentationState.value))
const isExpanded = computed(() => expand.value || presentationActive.value)

const subtitle = computed(() => loading.value ? '检测中' : location.value || '网络访客')
const flagSrc = computed(() => countryCode.value ? `/images/flags/${countryCode.value}.svg` : '')
const displayIp = computed(() => isExpanded.value ? ip.value : maskIpForCollapsedState(ip.value))

const visitorRows = computed<VisitorInfoRow[]>(() => [
  {
    label: '来源',
    value: subtitle.value,
    icon: 'tabler:world-pin',
  },
  {
    label: '设备',
    value: device.value,
    icon: 'tabler:device-desktop',
    expandOnly: true,
  },
  {
    label: '地址',
    value: displayIp.value,
    icon: 'tabler:brand-socket-io',
  },
  {
    label: '浏览器',
    value: browser.value,
    icon: 'tabler:browser',
  },
  {
    label: '网络',
    value: isp.value,
    icon: 'tabler:building-skyscraper',
    expandOnly: true,
  },
  {
    label: '访问时间',
    value: visitTime.value,
    icon: 'tabler:clock-hour-4',
    expandOnly: true,
  },
])
const visibleRows = computed(() => visitorRows.value.filter(item => isExpanded.value || !item.expandOnly))

function startPresentation() {
  if (presentationStarted || !props.presentOnReady || reducedMotion || !props.introComplete || loading.value)
    return

  presentationStarted = true
  presentationState.value = 'entering'
  presentationTimers.push(window.setTimeout(() => {
    presentationState.value = 'scanning'
  }, 680))
  presentationTimers.push(window.setTimeout(() => {
    presentationState.value = 'verified'
  }, 2380))
  presentationTimers.push(window.setTimeout(() => {
    presentationState.value = 'collapsing'
  }, 3580))
  presentationTimers.push(window.setTimeout(() => {
    presentationState.value = 'compacting'
  }, 4080))
  presentationTimers.push(window.setTimeout(() => {
    presentationState.value = 'compact'
    expand.value = false
  }, 4520))
}

watch([() => props.introComplete, loading], startPresentation, { immediate: true })

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

onUnmounted(() => presentationTimers.forEach(timer => window.clearTimeout(timer)))
</script>

<template>
  <aside
    class="lnl-visitor"
    :data-presentation-state="presentationState"
    :class="[
      `is-${presentationState}`,
      { 'is-presenting': presentationActive, 'is-expanded': isExpanded },
    ]"
    aria-label="访客网络信息"
  >
    <button
      type="button"
      class="lnl-visitor-trigger"
      :class="{ 'is-expanded': isExpanded }"
      :aria-expanded="isExpanded"
      @click="expand = !expand"
    >
      <span v-if="presentationActive" class="lnl-visitor-scan-head">
        <span><i /> 身份信息扫描</span>
        <b>{{ presentationState === 'verified' ? '验证完成' : presentationState === 'collapsing' ? '凭证已收束' : presentationState === 'entering' ? '建立会话' : '解析中' }}</b>
      </span>
      <TransitionGroup
        tag="div"
        name="visitor-pill"
        class="lnl-visitor-rows"
        :class="[isExpanded ? 'grid grid-cols-2 items-start justify-start gap-x-3 gap-y-2' : 'flex flex-nowrap items-center justify-center gap-x-3 gap-y-1']"
      >
        <div
          v-for="(item, index) in visibleRows" :key="item.icon"
          class="lnl-visitor-row flex min-w-0 items-center gap-2"
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
            :class="[isExpanded || !index ? 'block opacity-100 translate-y-0' : 'hidden md:block md:opacity-100', !isExpanded && index ? 'md:translate-y-0' : '']"
          >
            <div v-if="loading" class="h-2 w-15 animate-pulse rounded-full bg-muted/70" />
            <template v-else>
              <small>{{ item.label }}</small>
              <p>{{ item.value }}</p>
            </template>
          </div>
        </div>
      </TransitionGroup>
      <span class="lnl-visitor-action" aria-hidden="true">
        {{ isExpanded ? '收起' : '详情' }}
        <Icon :icon="isExpanded ? 'tabler:chevron-up' : 'tabler:chevron-down'" :width="13" :height="13" />
      </span>
      <span v-if="presentationState === 'scanning'" class="lnl-visitor-scan-beam" aria-hidden="true" />
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
  transition:
    opacity 0.56s ease,
    transform 0.76s cubic-bezier(0.16, 1, 0.3, 1);
}

.lnl-visitor.is-waiting {
  opacity: 0;
  transform: translate3d(calc(-100% - 28px), 0, 0);
}

.lnl-visitor-trigger {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  width: min(460px, calc(100vw - 28px));
  max-width: 100%;
  align-items: center;
  gap: 14px;
  padding: 9px 11px 9px 13px;
  border: 1px solid var(--lnl-line);
  border-radius: 0;
  background: color-mix(in srgb, var(--background) 96%, transparent);
  box-shadow: 0 12px 38px rgb(0 0 0 / 18%);
  contain: layout paint style;
  color: inherit;
  text-align: left;
  overflow: hidden;
  height: 54px;
  transition:
    border-color 240ms ease,
    background-color 240ms ease,
    transform 320ms cubic-bezier(0.22, 1, 0.36, 1),
    width 440ms cubic-bezier(0.22, 1, 0.36, 1),
    height 440ms cubic-bezier(0.22, 1, 0.36, 1),
    padding 360ms cubic-bezier(0.22, 1, 0.36, 1);
}

.lnl-visitor.is-presenting .lnl-visitor-trigger,
.lnl-visitor.is-expanded .lnl-visitor-trigger {
  width: min(580px, calc(100vw - 28px));
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 13px 14px;
  padding: 16px 17px;
  border-color: color-mix(in srgb, var(--lnl-green) 58%, var(--lnl-line));
  box-shadow:
    0 18px 56px rgb(0 0 0 / 24%),
    inset 0 0 42px color-mix(in srgb, var(--lnl-green) 4%, transparent);
  height: 190px;
}

.lnl-visitor.is-collapsing .lnl-visitor-trigger,
.lnl-visitor.is-compacting .lnl-visitor-trigger {
  will-change: width, height, padding;
}

.lnl-visitor.is-presenting .lnl-visitor-rows,
.lnl-visitor.is-expanded .lnl-visitor-rows {
  width: 100%;
}

.lnl-visitor.is-collapsing .lnl-visitor-rows,
.lnl-visitor.is-collapsing .lnl-visitor-scan-head {
  opacity: 0;
  transform: translate3d(-14px, 0, 0);
}

.lnl-visitor.is-compacting .lnl-visitor-rows,
.lnl-visitor.is-compacting .lnl-visitor-action {
  opacity: 0;
  transform: translate3d(-8px, 0, 0);
}

.lnl-visitor-scan-head {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 9px;
  border-bottom: 1px solid color-mix(in srgb, var(--lnl-line) 72%, transparent);
  color: var(--lnl-green);
  font: 11px/1.3 var(--font-mono);
  letter-spacing: 0.12em;
}

.lnl-visitor-rows,
.lnl-visitor-scan-head {
  transition:
    opacity 420ms ease,
    transform 620ms cubic-bezier(0.16, 1, 0.3, 1);
}

.lnl-visitor-rows {
  position: relative;
}

.lnl-visitor-row small {
  display: none;
  margin-bottom: 2px;
  color: var(--lnl-green);
  font: 9px/1.1 var(--font-mono);
  letter-spacing: 0.09em;
}

.lnl-visitor-row p {
  max-width: 190px;
  overflow: hidden;
  color: color-mix(in srgb, var(--foreground) 84%, var(--muted-foreground));
  font-size: 12px;
  font-weight: 550;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lnl-visitor.is-presenting .lnl-visitor-row small,
.lnl-visitor.is-expanded .lnl-visitor-row small {
  display: block;
}

.lnl-visitor.is-presenting .lnl-visitor-row p,
.lnl-visitor.is-expanded .lnl-visitor-row p {
  max-width: 215px;
  color: var(--foreground);
  font-size: 13px;
}

.lnl-visitor-scan-head span {
  display: flex;
  align-items: center;
  gap: 7px;
}

.lnl-visitor-scan-head i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--lnl-green);
  box-shadow: 0 0 12px color-mix(in srgb, var(--lnl-green) 70%, transparent);
  animation: visitor-scan-pulse 0.72s ease-in-out infinite alternate;
}

.lnl-visitor-scan-head b {
  color: var(--muted-foreground);
  font-weight: 500;
}

.lnl-visitor-scan-beam {
  position: absolute;
  z-index: 2;
  inset: 0 0 auto;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--lnl-green), var(--lnl-cyan), transparent);
  box-shadow: 0 0 14px color-mix(in srgb, var(--lnl-green) 46%, transparent);
  animation: visitor-scan-beam 1.7s cubic-bezier(0.4, 0, 0.2, 1) both;
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
  transition:
    opacity 240ms ease,
    transform 320ms cubic-bezier(0.22, 1, 0.36, 1);
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

@keyframes visitor-scan-beam {
  from {
    translate: 0 10px;
    opacity: 0;
  }
  12% {
    opacity: 1;
  }
  88% {
    opacity: 1;
  }
  to {
    translate: 0 136px;
    opacity: 0;
  }
}

@keyframes visitor-scan-pulse {
  to {
    opacity: 0.45;
    transform: scale(0.72);
  }
}

@media (max-width: 760px) {
  .lnl-visitor {
    right: 14px;
    max-width: none;
  }

  .lnl-visitor-trigger {
    width: 100%;
    max-width: 100%;
    align-items: flex-start;
  }

  .lnl-visitor.is-presenting .lnl-visitor-trigger {
    width: 100%;
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

  .lnl-visitor,
  .lnl-visitor-scan-head i,
  .lnl-visitor-scan-beam {
    transition: none;
    animation: none;
  }

  .visitor-pill-enter-from,
  .visitor-pill-leave-to {
    opacity: 1;
    transform: none;
  }
}
</style>
