<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useMotionPreference } from '@/composables/useMotionPreference'
import { detectVisitorClient } from '@/utils/clientDetection'

const props = defineProps<{
  introComplete: boolean
  presentOnReady: boolean
}>()

const { motionReduced } = useMotionPreference()
const VISITOR_PRESENTATION_SESSION_KEY = `komari-observatory:visitor-presentation:${__BUILD_VERSION__}`

interface VisitorGeoData {
  ip: string
  isp: string
  asn: string
  location: string
  countryCode: string
}

interface VisitorInfoRow {
  label: string
  value: string
  icon: string
  wide?: boolean
}

const IPV4_SEGMENT_REGEX = /^\d+$/
const IPV6_SEGMENT_REGEX = /^[\dA-F]{1,4}$/i
const IPV6_DOUBLE_COLON = '::'

const loading = ref(true)
const device = ref('当前设备')
const browser = ref('当前浏览器')
const ip = ref('正在识别')
const isp = ref('正在识别网络')
const asn = ref('识别中')
const location = ref('网络访客')
const countryCode = ref('')
const visitTime = ref(formatVisitTime(new Date()))
const flagVisible = ref(true)
const expand = ref(false)

function isPresentationSessionEligible(): boolean {
  if (!props.presentOnReady || motionReduced.value)
    return false
  try {
    return sessionStorage.getItem(VISITOR_PRESENTATION_SESSION_KEY) !== 'seen'
  }
  catch {
    return true
  }
}

const presentationEligible = isPresentationSessionEligible()
const presentationState = ref<'waiting' | 'entering' | 'scanning' | 'verified' | 'morphing' | 'compact'>(
  presentationEligible ? 'waiting' : 'compact',
)
let presentationTimer: number | null = null
let presentationRun = 0
let presentationStarted = false
const presentationActive = computed(() => ['entering', 'scanning', 'verified', 'morphing'].includes(presentationState.value))
const isExpanded = computed(() => expand.value || presentationActive.value)
const keepExpandedRows = computed(() => isExpanded.value)

const subtitle = computed(() => loading.value ? '检测中' : location.value || '网络访客')
const flagSrc = computed(() => countryCode.value ? `/images/flags/${countryCode.value}.svg` : '')
const displayIp = computed(() => isExpanded.value ? ip.value : maskIpForCollapsedState(ip.value))
const greeting = computed(() => getTimeGreeting(new Date()))

const visitorRows = computed<VisitorInfoRow[]>(() => [
  {
    label: '来源',
    value: subtitle.value,
    icon: 'tabler:world-pin',
    wide: true,
  },
  {
    label: '设备',
    value: device.value,
    icon: 'tabler:device-desktop',
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
  },
  {
    label: 'ASN',
    value: asn.value,
    icon: 'tabler:network',
  },
  {
    label: '访问时间',
    value: visitTime.value,
    icon: 'tabler:clock-hour-4',
  },
])
function clearPresentationTimer() {
  if (presentationTimer !== null) {
    window.clearTimeout(presentationTimer)
    presentationTimer = null
  }
}

function settlePresentation(runId: number) {
  if (runId !== presentationRun)
    return
  clearPresentationTimer()
  presentationState.value = 'compact'
  expand.value = false
}

function schedulePresentationStep(
  runId: number,
  delay: number,
  nextState: 'scanning' | 'verified' | 'morphing',
  next: () => void,
) {
  clearPresentationTimer()
  presentationTimer = window.setTimeout(() => {
    presentationTimer = null
    if (runId !== presentationRun)
      return
    if (document.hidden) {
      settlePresentation(runId)
      return
    }
    presentationState.value = nextState
    next()
  }, delay)
}

function startPresentation() {
  if (motionReduced.value) {
    presentationRun += 1
    clearPresentationTimer()
    presentationState.value = 'compact'
    expand.value = false
    return
  }
  if (presentationStarted || !presentationEligible || !props.introComplete)
    return

  presentationStarted = true
  try {
    sessionStorage.setItem(VISITOR_PRESENTATION_SESSION_KEY, 'seen')
  }
  catch {
  }
  const runId = ++presentationRun
  presentationState.value = 'entering'
  schedulePresentationStep(runId, 680, 'scanning', () => {
    schedulePresentationStep(runId, 1700, 'verified', () => {
      schedulePresentationStep(runId, 1200, 'morphing', () => {
        clearPresentationTimer()
        presentationTimer = window.setTimeout(settlePresentation, 720, runId)
      })
    })
  })
}

watch([() => props.introComplete, motionReduced], startPresentation, { immediate: true })

function handleToggle() {
  if (presentationActive.value)
    return
  expand.value = !expand.value
}

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

function getTimeGreeting(date: Date): string {
  const hour = date.getHours()
  if (hour >= 5 && hour < 11)
    return '早上好'
  if (hour >= 11 && hour < 14)
    return '中午好'
  if (hour >= 14 && hour < 18)
    return '下午好'
  if (hour >= 18 || hour < 1)
    return '晚上好'
  return '夜深了'
}

function normalizeAsn(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value))
    return `AS${Math.trunc(value)}`
  if (typeof value !== 'string' || !value.trim())
    return '未知'
  const normalized = value.trim().toUpperCase()
  return normalized.startsWith('AS') ? normalized : `AS${normalized}`
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

let visitorGeoDeadline = Number.POSITIVE_INFINITY

async function fetchJson<T>(url: string, timeoutMs: number): Promise<T> {
  const remainingBudget = Math.max(1, visitorGeoDeadline - performance.now())
  const requestTimeout = Math.min(timeoutMs, remainingBudget)
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), requestTimeout)

  try {
    const response = await fetch(url, {
      signal: controller.signal,
    })
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
  visitorGeoDeadline = performance.now() + 4500
  const loaders = [
    async (): Promise<VisitorGeoData> => {
      const data = await fetchJson<{
        ip?: string
        isp?: string
        organization?: string
        asn_organization?: string
        asn?: string | number
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
        asn: normalizeAsn(data.asn),
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
          asn?: string | number
        }
      }>('https://ipwho.is/', 4000)

      if (data.success === false || !data.ip) {
        throw new Error(data.message || 'ipwho.is unavailable')
      }

      return {
        ip: data.ip,
        isp: data.connection?.isp || data.connection?.org || '未知运营商',
        asn: normalizeAsn(data.connection?.asn),
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
          asn?: string | number
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
        asn: normalizeAsn(data.asn?.asn),
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
        asn?: string | number
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
        asn: normalizeAsn(data.asn),
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
          asn?: string | number
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
        asn: normalizeAsn(data.data.asn),
        location: [data.data.country, data.data.city || data.data.province].filter(Boolean).join(' · ') || '未知位置',
        countryCode: data.data.countryCode || '',
      }
    },
  ]

  for (const load of loaders) {
    if (performance.now() >= visitorGeoDeadline)
      break
    try {
      const result = await load()
      visitorGeoDeadline = Number.POSITIVE_INFINITY
      return result
    }
    catch {
    }
  }

  visitorGeoDeadline = Number.POSITIVE_INFINITY
  return null
}

function handleFlagError(): void {
  flagVisible.value = false
}

onMounted(() => {
  const client = detectVisitorClient(navigator.userAgent, navigator.maxTouchPoints)
  device.value = client.device
  browser.value = client.browser
  visitTime.value = formatVisitTime(new Date())

  void fetchVisitorGeo().then((geo) => {
    if (!geo) {
      ip.value = '识别失败'
      isp.value = '网络识别暂不可用'
      asn.value = '未知'
      return
    }
    ip.value = geo.ip
    isp.value = geo.isp
    asn.value = geo.asn
    location.value = geo.location
    countryCode.value = geo.countryCode.toUpperCase()
  }).finally(() => {
    loading.value = false
  })

  document.addEventListener('visibilitychange', handleVisibilityChange)
})

function handleVisibilityChange() {
  if (document.hidden && presentationActive.value)
    settlePresentation(presentationRun)
}

onUnmounted(() => {
  presentationRun += 1
  clearPresentationTimer()
  document.removeEventListener('visibilitychange', handleVisibilityChange)
})
</script>

<template>
  <aside
    class="lnl-visitor"
    :data-presentation-state="presentationState"
    :class="[
      `is-${presentationState}`,
      {
        'is-presenting': presentationActive,
        'is-expanded': isExpanded,
      },
    ]"
    aria-label="访客网络信息"
  >
    <button
      type="button"
      class="lnl-visitor-trigger"
      :class="{ 'is-expanded': isExpanded }"
      :aria-expanded="isExpanded"
      :aria-label="isExpanded ? '收起访客网络信息' : '查看访客网络信息详情'"
      @click="handleToggle"
    >
      <div class="lnl-visitor-expanded-layer" :aria-hidden="!isExpanded">
        <span v-if="keepExpandedRows" class="lnl-visitor-scan-head">
          <span><i :class="{ 'is-live': presentationActive }" /> {{ greeting }} · 身份扫描</span>
          <b>{{ presentationActive ? (presentationState === 'verified' ? '验证完成' : presentationState === 'morphing' ? '收束中' : presentationState === 'entering' ? '建立会话' : '解析中') : '访客会话' }}</b>
        </span>
        <div
          class="lnl-visitor-rows"
          :class="[keepExpandedRows ? 'grid grid-cols-2 items-start justify-start gap-x-3 gap-y-2' : 'flex flex-nowrap items-center justify-center gap-x-3 gap-y-1']"
        >
          <div
            v-for="(item, index) in visitorRows" :key="item.icon"
            class="lnl-visitor-row flex min-w-0 items-center gap-2"
            :class="{ 'is-source': item.wide }"
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
              <div v-if="loading" class="h-2 w-15 animate-pulse motion-reduce:animate-none rounded-full bg-muted/70" />
              <template v-else>
                <small>{{ item.label }}</small>
                <p>{{ item.value }}</p>
              </template>
            </div>
          </div>
        </div>
      </div>
      <span class="lnl-visitor-compact-layer" aria-hidden="true">
        <span class="lnl-visitor-compact-source">
          <img v-if="flagSrc && flagVisible" :src="flagSrc" :alt="countryCode" @error="handleFlagError">
          <Icon v-else icon="tabler:world-pin" :width="14" :height="14" />
          <b>{{ subtitle }}</b>
        </span>
        <span>{{ displayIp }}</span>
      </span>
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
  border-radius: var(--lnl-radius-card);
  background: var(--background);
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
    clip-path 520ms cubic-bezier(0.16, 1, 0.3, 1),
    width 440ms cubic-bezier(0.22, 1, 0.36, 1),
    height 440ms cubic-bezier(0.22, 1, 0.36, 1),
    padding 360ms cubic-bezier(0.22, 1, 0.36, 1);
}

:global(.dark) .lnl-visitor-trigger {
  border-color: var(--lnl-line-strong);
  background: var(--lnl-surface-raised);
  box-shadow:
    0 16px 44px rgb(0 0 0 / 36%),
    0 0 24px color-mix(in srgb, var(--lnl-green) 5%, transparent);
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
  height: 238px;
}

.lnl-visitor.is-morphing .lnl-visitor-trigger {
  width: min(460px, calc(100vw - 28px));
  height: 54px;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 14px;
  padding: 9px 11px 9px 13px;
  border-color: color-mix(in srgb, var(--lnl-green) 42%, var(--lnl-line));
  background: var(--background);
  box-shadow: 0 12px 38px rgb(0 0 0 / 18%);
  will-change: width, height, padding;
}

.lnl-visitor.is-morphing .lnl-visitor-compact-layer {
  right: 52px;
  left: 13px;
}

:global(.dark) .lnl-visitor.is-morphing .lnl-visitor-trigger {
  background: var(--lnl-surface-raised);
  box-shadow: 0 16px 44px rgb(0 0 0 / 34%);
}

.lnl-visitor.is-presenting .lnl-visitor-rows,
.lnl-visitor.is-expanded .lnl-visitor-rows {
  width: 100%;
}

.lnl-visitor.is-presenting .lnl-visitor-row.is-source,
.lnl-visitor.is-expanded .lnl-visitor-row.is-source {
  grid-column: 1 / -1;
  min-height: 32px;
  padding-bottom: 7px;
  border-bottom: 1px solid color-mix(in srgb, var(--lnl-line) 62%, transparent);
}

.lnl-visitor.is-presenting .lnl-visitor-row.is-source p,
.lnl-visitor.is-expanded .lnl-visitor-row.is-source p {
  max-width: min(450px, calc(100vw - 120px));
}

.lnl-visitor.is-morphing .lnl-visitor-expanded-layer,
.lnl-visitor.is-compact:not(.is-expanded) .lnl-visitor-expanded-layer {
  opacity: 0;
  transform: translate3d(-14px, 0, 0);
}

.lnl-visitor-expanded-layer {
  display: grid;
  min-width: 0;
  gap: 10px;
  transition:
    opacity 360ms ease,
    transform 540ms cubic-bezier(0.16, 1, 0.3, 1);
}

.lnl-visitor.is-expanded:not(.is-morphing) .lnl-visitor-expanded-layer {
  opacity: 1;
  transform: none;
}

.lnl-visitor-compact-layer {
  position: absolute;
  right: 52px;
  bottom: 0;
  left: 13px;
  display: flex;
  height: 54px;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  overflow: hidden;
  opacity: 0;
  transform: translate3d(10px, 0, 0);
  transition:
    opacity 320ms ease,
    transform 480ms cubic-bezier(0.16, 1, 0.3, 1);
}

.lnl-visitor.is-morphing .lnl-visitor-compact-layer,
.lnl-visitor.is-compact:not(.is-expanded) .lnl-visitor-compact-layer {
  opacity: 1;
  transform: none;
}

.lnl-visitor.is-expanded:not(.is-morphing) .lnl-visitor-compact-layer {
  opacity: 0;
  transform: translate3d(10px, 0, 0);
}

.lnl-visitor-compact-source {
  display: flex;
  flex: 1 1 auto;
  min-width: 0;
  align-items: center;
  gap: 7px;
}

.lnl-visitor-compact-source img {
  width: 16px;
  height: 16px;
  object-fit: cover;
}

.lnl-visitor-compact-source b,
.lnl-visitor-compact-layer > span:last-child {
  min-width: 0;
  overflow: hidden;
  font-size: 12px;
  font-weight: 560;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lnl-visitor-compact-source b {
  flex: 1 1 auto;
}

.lnl-visitor-compact-source,
.lnl-visitor-compact-layer > span:last-child {
  transform: translateY(1px);
}

.lnl-visitor-compact-layer > span:last-child {
  flex: 0 1 42%;
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
}

.lnl-visitor-scan-head i.is-live {
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
  background: var(--background);
}

.lnl-visitor-trigger:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--lnl-green) 45%, transparent);
  outline-offset: 3px;
}

.lnl-visitor-action {
  display: flex;
  flex: none;
  align-self: center;
  align-items: center;
  justify-content: center;
  height: 32px;
  gap: 3px;
  padding-left: 10px;
  border-left: 1px solid var(--lnl-line);
  color: var(--lnl-green);
  font: 9px/1 var(--font-mono);
  letter-spacing: 0.08em;
  white-space: nowrap;
  transition:
    opacity 240ms ease,
    transform 320ms cubic-bezier(0.22, 1, 0.36, 1);
}

.lnl-visitor-action :deep(svg) {
  display: block;
  flex: none;
}

.lnl-visitor.is-entering .lnl-visitor-row {
  animation: visitor-row-enter 420ms cubic-bezier(0.22, 1, 0.36, 1) backwards;
  animation-delay: var(--visitor-pill-delay, 0ms);
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

@keyframes visitor-row-enter {
  from {
    opacity: 0;
    transform: translate3d(0, 7px, 0) scale(0.98);
  }
}

@media (max-width: 760px) {
  .lnl-visitor {
    right: max(14px, env(safe-area-inset-right));
    max-width: none;
  }

  .lnl-visitor-trigger {
    width: 100%;
    max-width: 100%;
    align-items: flex-start;
    transition:
      border-color 180ms ease,
      background-color 180ms ease,
      opacity 220ms ease,
      transform 280ms cubic-bezier(0.22, 1, 0.36, 1),
      clip-path 520ms cubic-bezier(0.16, 1, 0.3, 1);
  }

  .lnl-visitor.is-presenting .lnl-visitor-trigger {
    width: 100%;
  }

  .lnl-visitor-rows {
    flex: 1;
    justify-content: flex-start !important;
  }

  .lnl-visitor.is-presenting .lnl-visitor-trigger,
  .lnl-visitor.is-expanded .lnl-visitor-trigger {
    height: min(250px, calc(100vh - 124px));
    height: min(250px, calc(100dvh - 124px));
  }

  /* The card is fixed and layout-contained, so one bounded height interpolation
     can preserve the same scan-to-bar motion on touch devices without moving the page. */
  .lnl-visitor.is-morphing .lnl-visitor-trigger {
    height: 54px;
    align-items: center;
    padding: 9px 11px 9px 13px;
    transition:
      border-color 180ms ease,
      background-color 180ms ease,
      opacity 220ms ease,
      transform 280ms cubic-bezier(0.22, 1, 0.36, 1),
      clip-path 520ms cubic-bezier(0.16, 1, 0.3, 1),
      height 440ms cubic-bezier(0.22, 1, 0.36, 1),
      padding 360ms cubic-bezier(0.22, 1, 0.36, 1);
    will-change: height, padding;
  }

  .lnl-visitor-compact-layer {
    gap: 6px;
  }

  .lnl-visitor-compact-source {
    gap: 5px;
  }

  .lnl-visitor-compact-source b,
  .lnl-visitor-compact-layer > span:last-child {
    font-size: 11px;
    letter-spacing: -0.01em;
  }

  .lnl-visitor-scan-head {
    gap: 7px;
    font-size: 10px;
    letter-spacing: 0.04em;
  }

  .lnl-visitor-scan-head > span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .lnl-visitor-scan-head > b {
    flex: none;
  }

  .lnl-visitor.is-presenting .lnl-visitor-row p,
  .lnl-visitor.is-expanded .lnl-visitor-row p {
    max-width: min(34vw, 150px);
  }

  .lnl-visitor.is-presenting .lnl-visitor-row.is-source p,
  .lnl-visitor.is-expanded .lnl-visitor-row.is-source p {
    max-width: calc(100vw - 116px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .lnl-visitor-trigger {
    transition: none;
  }

  .lnl-visitor,
  .lnl-visitor-scan-head i,
  .lnl-visitor-scan-beam {
    transition: none;
    animation: none;
  }

  .lnl-visitor.is-entering .lnl-visitor-row {
    animation: none;
  }
}
</style>
