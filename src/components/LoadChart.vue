<script setup lang="ts">
import type { RecordFormat } from '@/utils/recordHelper'
import type { MetricSeries, StatusRecord } from '@/utils/rpc'
import { Icon } from '@iconify/vue'
import { useDocumentVisibility, useIntervalFn, useMediaQuery } from '@vueuse/core'
import dayjs from 'dayjs'
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import VChart from 'vue-echarts'
import ChartViewport from '@/components/ChartViewport.vue'
import { CardX } from '@/components/ui/card-x'
import { Empty } from '@/components/ui/empty'
import { Spinner } from '@/components/ui/spinner'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useBackgroundSurface } from '@/composables/useBackgroundSurface'
import { useMotionPreference } from '@/composables/useMotionPreference'
import { useAppStore } from '@/stores/app'
import { useNodesStore } from '@/stores/nodes'
import { formatBytes, formatBytesSplit } from '@/utils/helper'
import { isMetricCapabilityUnavailable, listAvailableMetricDefinitions } from '@/utils/metricCapabilities'
import { isMobileLike } from '@/utils/mobilePerf'
import { fillMissingTimePoints, getAdaptiveHistoryDisplayIntervalSeconds, getHistoryDisplayIntervalSeconds, getSparsePointSymbolSize } from '@/utils/recordHelper'
import { getSharedRpc } from '@/utils/rpc'
import '@/utils/echarts' // 共享 ECharts 配置

const props = defineProps<{
  uuid: string
}>()

const appStore = useAppStore()
const { pickSurfaceClass } = useBackgroundSurface()
const { motionReduced } = useMotionPreference()
const nodesStore = useNodesStore()
const documentVisibility = useDocumentVisibility()
const compactCharts = useMediaQuery('(max-width: 640px)')

// 未加载设置时沿用内置保留期；后台明确关闭或设为 0 时必须原样保留。
const maxRecordPreserveTime = computed(() => {
  const value = appStore.publicSettings?.record_preserve_time
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, value)
    : 720
})
const historyRecordsEnabled = computed(() => appStore.publicSettings?.record_enabled !== false
  && maxRecordPreserveTime.value > 0)

// 与主题清单及全局节点轮询共用 5 秒下限，避免详情页额外放大 RPC 压力。
const dataUpdateInterval = computed(() => {
  const settings = appStore.publicSettings?.theme_settings
  const interval = settings?.dataUpdateInterval
  if (typeof interval === 'number' && Number.isFinite(interval))
    return Math.min(60, Math.max(5, interval)) * 1000
  return 5000
})

// 使用 store 中的 isDark computed
const isDark = computed(() => appStore.isDark)

// 恢复正式版的指标辨识色；主题色继续用于页签、焦点和交互状态。
const chartColors = {
  primary: '#FF6B6B',
  primaryAreaStrong: 'rgba(255, 107, 107, 0.25)',
  primaryAreaFaint: 'rgba(255, 107, 107, 0.02)',
  secondary: '#FFB347',
  tertiary: '#4ECDC4',
  quaternary: '#A78BFA',
  quinary: '#60A5FA',
}

// 图表主题相关颜色
const chartThemeColors = computed(() => ({
  text: isDark.value ? 'rgba(255, 255, 255, 0.85)' : 'rgba(0, 0, 0, 0.85)',
  textSecondary: isDark.value ? 'rgba(255, 255, 255, 0.55)' : 'rgba(0, 0, 0, 0.55)',
  textTertiary: isDark.value ? 'rgba(255, 255, 255, 0.35)' : 'rgba(0, 0, 0, 0.35)',
  borderColor: isDark.value ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
  splitLineColor: isDark.value ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)',
  tooltipBg: isDark.value ? 'rgba(40, 40, 40, 0.95)' : 'rgba(255, 255, 255, 0.8)',
  tooltipShadow: isDark.value ? 'rgba(0, 0, 0, 0.4)' : 'rgba(0, 0, 0, 0.06)',
  crosshairColor: isDark.value ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.1)',
}))

// 通用 Tooltip 配置
const baseTooltipConfig = computed(() => ({
  trigger: 'axis' as const,
  confine: compactCharts.value,
  backgroundColor: chartThemeColors.value.tooltipBg,
  borderColor: 'transparent',
  borderWidth: 0,
  borderRadius: 6,
  textStyle: {
    color: chartThemeColors.value.text,
    fontSize: 12,
    lineHeight: 20,
  },
  extraCssText: `${appStore.backgroundEnabled ? 'backdrop-filter: blur(5px);' : ''}z-index:9;box-shadow:0 0 0 1px ${chartThemeColors.value.tooltipShadow}, 0 0 16px ${chartThemeColors.value.tooltipShadow}`,
  axisPointer: {
    type: 'cross' as const,
    crossStyle: {
      color: chartThemeColors.value.textTertiary,
    },
    lineStyle: {
      color: chartThemeColors.value.crosshairColor,
      width: 1,
      type: 'dashed' as const,
    },
    shadowStyle: {
      color: chartThemeColors.value.crosshairColor,
    },
  },
}))

const chartMargin = computed(() => compactCharts.value
  ? { top: 28, right: 10, bottom: 30, left: 44 }
  : { top: 30, right: 24, bottom: 32, left: 56 })
const chartMarginWithLegend = computed(() => compactCharts.value
  ? { top: 28, right: 10, bottom: 50, left: 44 }
  : { top: 30, right: 24, bottom: 52, left: 56 })
// ECharts 动画在移动端关闭：图表动画是持续 GPU/CPU 负载，移动端直接呈现最终帧。
const chartAnimationConfig = computed(() => ({
  animation: !motionReduced.value && !isMobileLike,
  animationDuration: 520,
  animationDurationUpdate: 220,
  animationEasing: 'cubicOut' as const,
  animationEasingUpdate: 'cubicOut' as const,
}))

// 视图选项
const presetViews = [
  { label: '4 小时', hours: 4 },
  { label: '1 天', hours: 24 },
  { label: '7 天', hours: 168 },
  { label: '30 天', hours: 720 },
]

// 可用视图列表
const availableViews = computed(() => {
  const views: { label: string, hours?: number }[] = [{ label: '实时' }]
  if (!historyRecordsEnabled.value)
    return views

  const maxHours = maxRecordPreserveTime.value

  for (const v of presetViews) {
    if (maxHours >= v.hours) {
      views.push({ label: v.label, hours: v.hours })
    }
  }

  if (maxHours > 0 && !presetViews.some(v => v.hours === maxHours)) {
    const label = maxHours % 24 === 0
      ? `${Math.floor(maxHours / 24)} 天`
      : `${maxHours} 小时`
    views.push({ label, hours: maxHours })
  }

  return views
})

// 当前选中的视图
const selectedView = ref<string>('实时')
const selectedHours = computed(() => {
  const view = availableViews.value.find(v => v.label === selectedView.value)
  return view?.hours
})
const isRealtime = computed(() => selectedView.value === '实时')

// 数据状态
const remoteData = shallowRef<StatusRecord[]>([])
const loading = ref(false)
const isInitialLoad = ref(true) // 是否为首次加载（用于控制实时模式下的 NSpin 显示）
const error = ref<string | null>(null)
/** 单调递增请求序号：过期响应直接丢弃，防止慢历史响应覆盖新数据 */
let fetchRequestId = 0

interface HistoryCacheEntry {
  fetchedAt: number
  records: StatusRecord[]
}

const HISTORY_CACHE_TTL_MS = 60_000
const HISTORY_CACHE_MAX_ENTRIES = 8
const historyCache = new Map<string, HistoryCacheEntry>()
const historyRequests = new Map<string, Promise<StatusRecord[]>>()

// 节点信息
const nodeInfo = computed(() => nodesStore.nodesByUuid.get(props.uuid))

// RPC 客户端
const rpc = getSharedRpc()

function historyCacheKey(uuid: string, hours: number): string {
  return `${uuid}|${hours}`
}

function rememberHistory(key: string, records: StatusRecord[]): void {
  historyCache.delete(key)
  historyCache.set(key, { fetchedAt: Date.now(), records })
  while (historyCache.size > HISTORY_CACHE_MAX_ENTRIES) {
    const oldestKey = historyCache.keys().next().value
    if (typeof oldestKey !== 'string')
      break
    historyCache.delete(oldestKey)
  }
}

async function loadHistoryRecords(uuid: string, hours: number): Promise<StatusRecord[]> {
  const key = historyCacheKey(uuid, hours)
  const cached = historyCache.get(key)
  if (cached && Date.now() - cached.fetchedAt <= HISTORY_CACHE_TTL_MS)
    return cached.records

  const pending = historyRequests.get(key)
  if (pending)
    return pending

  const request = rpc.getLoadRecords(uuid, hours, 'all', 4000)
    .then(({ records }) => {
      rememberHistory(key, records)
      return records
    })
    .finally(() => historyRequests.delete(key))
  historyRequests.set(key, request)
  return request
}

// ==================== 数据获取 ====================

function statusToRecordFormat(records: StatusRecord[]): RecordFormat[] {
  return records.map(r => ({
    client: r.client,
    time: r.time,
    cpu: r.cpu ?? null,
    gpu: r.gpu ?? null,
    gpu_usage: null,
    gpu_memory: null,
    ram: r.ram ?? null,
    ram_total: r.ram_total ?? null,
    swap: r.swap ?? null,
    swap_total: r.swap_total ?? null,
    load: r.load ?? null,
    temp: r.temp ?? null,
    disk: r.disk ?? null,
    disk_total: r.disk_total ?? null,
    net_in: r.net_in ?? null,
    net_out: r.net_out ?? null,
    net_total_up: r.net_total_up ?? null,
    net_total_down: r.net_total_down ?? null,
    process: r.process ?? null,
    connections: r.connections ?? null,
    connections_udp: r.connections_udp ?? null,
  }))
}

async function fetchRecentData() {
  if (!props.uuid)
    return

  const requestId = ++fetchRequestId

  // 只在首次加载时显示 loading
  if (isInitialLoad.value) {
    loading.value = true
  }
  error.value = null

  try {
    const result = await rpc.getNodeRecentStatus(props.uuid)
    if (requestId !== fetchRequestId)
      return
    const records = result?.records || []
    records.sort((a, b) => dayjs(a.time).valueOf() - dayjs(b.time).valueOf())
    const maxLength = 150
    remoteData.value = records.slice(-maxLength)
  }
  catch (err) {
    if (requestId !== fetchRequestId)
      return
    error.value = err instanceof Error ? err.message : '获取数据失败'
    // 实时模式单次轮询失败保留旧数据，避免图表被清空
  }
  finally {
    if (requestId === fetchRequestId) {
      loading.value = false
      isInitialLoad.value = false
    }
  }
}

async function fetchHistoryData() {
  const hours = selectedHours.value
  if (!props.uuid || !historyRecordsEnabled.value || hours === undefined)
    return

  const requestId = ++fetchRequestId

  loading.value = true
  error.value = null

  try {
    const records = await loadHistoryRecords(props.uuid, hours)
    if (requestId !== fetchRequestId)
      return
    remoteData.value = records
  }
  catch (err) {
    if (requestId !== fetchRequestId)
      return
    error.value = err instanceof Error ? err.message : '获取数据失败'
    remoteData.value = []
  }
  finally {
    if (requestId === fetchRequestId) {
      loading.value = false
    }
  }
}

async function fetchData() {
  if (isRealtime.value) {
    await fetchRecentData()
  }
  else {
    await fetchHistoryData()
  }
}

// ==================== 数据处理 ====================

const historyDisplayIntervalSeconds = computed(() => {
  if (isRealtime.value)
    return 0
  const hours = selectedHours.value || 4
  const minimumIntervalSec = getHistoryDisplayIntervalSeconds(hours)
  const data = statusToRecordFormat(remoteData.value)
  return getAdaptiveHistoryDisplayIntervalSeconds(data, minimumIntervalSec)
})

const chartData = computed(() => {
  const data = statusToRecordFormat(remoteData.value)
  if (!data.length)
    return []

  if (isRealtime.value) {
    return data
  }

  const hours = selectedHours.value || 4
  const intervalSec = historyDisplayIntervalSeconds.value

  // 圆整到最近时间格时，任意合法采样与格点的距离最多为半个间隔。
  // 稍加余量可容纳服务端聚合时间的秒级偏移，但不会复制同一采样。
  return fillMissingTimePoints(data, intervalSec, hours * 3600, intervalSec * 0.6)
})

function isFiniteValue(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

interface ChartTooltipParam {
  dataIndex: number
  seriesName: string
  value: unknown
  color: string
}

function renderableTooltipParams(params: unknown): ChartTooltipParam[] {
  if (!Array.isArray(params))
    return []
  return (params as ChartTooltipParam[]).filter(item => isFiniteValue(item.value))
}

/**
 * Long-range rollups can legitimately contain isolated samples. A line with
 * showSymbol=false renders those samples invisibly, so reveal only isolated
 * points while leaving continuous lines visually unchanged.
 */
const latestStatus = computed(() => {
  const data = remoteData.value
  if (!data.length)
    return null
  return data.at(-1) ?? null
})

const hasRenderableBaseData = computed(() => remoteData.value.some(record => [
  record.cpu,
  record.load,
  record.ram,
  record.swap,
  record.disk,
  record.net_in,
  record.net_out,
  record.process,
  record.connections,
  record.connections_udp,
].some(isFiniteValue)))

// ==================== 工具函数 ====================

function formatTime(time: string, showDate: boolean): string {
  const date = dayjs(time)
  if (showDate) {
    return date.format('M/D HH:mm')
  }
  return date.format('HH:mm')
}

function formatTimeForTooltip(time: string, hours: number): string {
  const date = dayjs(time)
  if (hours < 24) {
    return date.format('HH:mm:ss')
  }
  return date.format('MM/DD HH:mm')
}

const showDateInAxis = computed(() => (selectedHours.value || 1) >= 24)

// 通用 X 轴配置
const baseXAxisConfig = computed(() => ({
  type: 'category' as const,
  data: chartData.value.map(r => formatTime(r.time, showDateInAxis.value)),
  axisLabel: {
    fontSize: 11,
    color: chartThemeColors.value.textSecondary,
    margin: 12,
  },
  axisLine: {
    show: true,
    lineStyle: { color: chartThemeColors.value.borderColor, width: 1 },
  },
  axisTick: { show: false },
  boundaryGap: false,
}))

// 通用 Y 轴配置
const baseYAxisConfig = computed(() => ({
  type: 'value' as const,
  axisLabel: {
    fontSize: 11,
    color: chartThemeColors.value.textSecondary,
  },
  axisLine: { show: false },
  axisTick: { show: false },
  splitLine: {
    lineStyle: {
      color: chartThemeColors.value.splitLineColor,
      type: 'dashed' as const,
    },
  },
}))

const cpuValues = computed(() => chartData.value.map(r => r.cpu))
const loadValues = computed(() => chartData.value.map(r => r.load))
const ramValues = computed(() => chartData.value.map(r => r.ram))
const swapValues = computed(() => chartData.value.map(r => r.swap))
const diskValues = computed(() => chartData.value.map(r => r.disk))
const networkInValues = computed(() => chartData.value.map(r => r.net_in))
const networkOutValues = computed(() => chartData.value.map(r => r.net_out))
const connectionValues = computed(() => chartData.value.map(r => r.connections))
const udpConnectionValues = computed(() => chartData.value.map(r => r.connections_udp))
const processValues = computed(() => chartData.value.map(r => r.process))

// ==================== 图表配置 ====================

// CPU 图表
const cpuChartOption = computed(() => ({
  ...chartAnimationConfig.value,
  // 全局颜色配置（确保 Tooltip 圆点颜色与线条一致）
  color: [chartColors.primary, chartColors.secondary],
  tooltip: {
    ...baseTooltipConfig.value,
    formatter: (params: unknown) => {
      const p = renderableTooltipParams(params)
      if (!p.length)
        return ''
      const firstParam = p[0]
      if (!firstParam)
        return ''
      const record = chartData.value[firstParam.dataIndex]
      if (!record)
        return ''

      const timeStr = formatTimeForTooltip(record.time, selectedHours.value || 1)
      let html = `<div style="font-weight:600;margin-bottom:6px;color:${chartThemeColors.value.textSecondary}">${timeStr}</div>`
      html += '<div style="display:flex;flex-direction:column;gap:4px">'

      for (const item of p) {
        const colorDot = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${item.color};margin-right:8px;flex-shrink:0"></span>`
        if (item.seriesName === 'CPU') {
          html += `<div style="display:flex;align-items:center">${colorDot}<span>CPU</span><span style="margin-left:auto;font-weight:600;margin-left:16px">${Number(item.value).toFixed(1)}%</span></div>`
        }
        else if (item.seriesName === '负载') {
          html += `<div style="display:flex;align-items:center">${colorDot}<span>系统负载</span><span style="margin-left:auto;font-weight:600;margin-left:16px">${Number(item.value).toFixed(2)}</span></div>`
        }
      }
      html += '</div>'
      return html
    },
  },
  grid: chartMargin.value,
  xAxis: baseXAxisConfig.value,
  yAxis: [
    {
      ...baseYAxisConfig.value,
      name: 'CPU %',
      nameTextStyle: { color: chartThemeColors.value.textSecondary, padding: [0, 40, 0, 0] },
      min: 0,
      max: 100,
      axisLabel: { ...baseYAxisConfig.value.axisLabel, formatter: '{value}%' },
    },
    {
      ...baseYAxisConfig.value,
      name: '负载',
      nameTextStyle: { color: chartThemeColors.value.textSecondary, padding: [0, 0, 0, 40] },
      min: 0,
      splitLine: { show: false },
    },
  ],
  series: [
    {
      name: 'CPU',
      type: 'line',
      data: cpuValues.value,
      smooth: 0.24,
      smoothMonotone: 'x' as const,
      connectNulls: false,
      showSymbol: true,
      symbolSize: (_value: unknown, params: { dataIndex: number }) => getSparsePointSymbolSize(cpuValues.value, params.dataIndex),
      yAxisIndex: 0,
      lineStyle: { width: 1.5, color: chartColors.primary, cap: 'round' as const },
      areaStyle: {
        color: {
          type: 'linear',
          x: 0,
          y: 0,
          x2: 0,
          y2: 1,
          colorStops: [
            { offset: 0, color: chartColors.primaryAreaStrong },
            { offset: 1, color: chartColors.primaryAreaFaint },
          ],
        },
      },
    },
    {
      name: '负载',
      type: 'line',
      data: loadValues.value,
      smooth: 0.24,
      smoothMonotone: 'x' as const,
      connectNulls: false,
      showSymbol: true,
      symbolSize: (_value: unknown, params: { dataIndex: number }) => getSparsePointSymbolSize(loadValues.value, params.dataIndex),
      yAxisIndex: 1,
      lineStyle: { width: 1.5, color: chartColors.secondary, cap: 'round' as const },
    },
  ],
}))

// 内存图表
const memoryChartOption = computed(() => ({
  ...chartAnimationConfig.value,
  color: [chartColors.primary, chartColors.secondary],
  tooltip: {
    ...baseTooltipConfig.value,
    formatter: (params: unknown) => {
      const p = renderableTooltipParams(params)
      if (!p.length)
        return ''
      const firstParam = p[0]
      if (!firstParam)
        return ''
      const record = chartData.value[firstParam.dataIndex]
      if (!record)
        return ''

      const ramUsed = isFiniteValue(record.ram) ? record.ram : null
      const ramTotal = record.ram_total ?? nodeInfo.value?.mem_total ?? 0
      const swapUsed = isFiniteValue(record.swap) ? record.swap : null
      const swapTotal = record.swap_total ?? nodeInfo.value?.swap_total ?? 0
      const ramPercent = ramUsed !== null && ramTotal > 0 ? `${((ramUsed / ramTotal) * 100).toFixed(1)}%` : '-'
      const swapPercent = swapUsed !== null && swapTotal > 0 ? `${((swapUsed / swapTotal) * 100).toFixed(1)}%` : '-'

      const timeStr = formatTimeForTooltip(record.time, selectedHours.value || 1)
      let html = `<div style="font-weight:600;margin-bottom:6px;color:${chartThemeColors.value.textSecondary}">${timeStr}</div>`
      html += '<div style="display:flex;flex-direction:column;gap:4px">'

      for (const item of p) {
        const colorDot = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${item.color};margin-right:8px;flex-shrink:0"></span>`
        if (item.seriesName === 'RAM' && ramUsed !== null) {
          html += `<div style="display:flex;align-items:center">${colorDot}<span>RAM</span><span style="margin-left:auto;font-weight:600;margin-left:16px">${formatBytes(ramUsed)} (${ramPercent})</span></div>`
        }
        else if (item.seriesName === 'Swap' && swapUsed !== null) {
          html += `<div style="display:flex;align-items:center">${colorDot}<span>Swap</span><span style="margin-left:auto;font-weight:600;margin-left:16px">${formatBytes(swapUsed)} (${swapPercent})</span></div>`
        }
      }
      html += '</div>'
      return html
    },
  },
  grid: chartMargin.value,
  xAxis: baseXAxisConfig.value,
  yAxis: {
    ...baseYAxisConfig.value,
    name: '内存',
    nameTextStyle: { color: chartThemeColors.value.textSecondary, padding: [0, 40, 0, 0] },
    axisLabel: {
      ...baseYAxisConfig.value.axisLabel,
      formatter: (val: number) => formatBytes(val),
    },
  },
  series: [
    {
      name: 'RAM',
      type: 'line',
      data: ramValues.value,
      smooth: 0.24,
      smoothMonotone: 'x' as const,
      connectNulls: false,
      showSymbol: true,
      symbolSize: (_value: unknown, params: { dataIndex: number }) => getSparsePointSymbolSize(ramValues.value, params.dataIndex),
      lineStyle: { width: 1.5, color: chartColors.primary, cap: 'round' as const },
      areaStyle: {
        color: {
          type: 'linear',
          x: 0,
          y: 0,
          x2: 0,
          y2: 1,
          colorStops: [
            { offset: 0, color: chartColors.primaryAreaStrong },
            { offset: 1, color: chartColors.primaryAreaFaint },
          ],
        },
      },
    },
    {
      name: 'Swap',
      type: 'line',
      data: swapValues.value,
      smooth: 0.24,
      smoothMonotone: 'x' as const,
      connectNulls: false,
      showSymbol: true,
      symbolSize: (_value: unknown, params: { dataIndex: number }) => getSparsePointSymbolSize(swapValues.value, params.dataIndex),
      lineStyle: { width: 1.5, color: chartColors.secondary, cap: 'round' as const },
    },
  ],
}))

// 磁盘图表
const diskChartOption = computed(() => ({
  ...chartAnimationConfig.value,
  color: [chartColors.tertiary],
  tooltip: {
    ...baseTooltipConfig.value,
    formatter: (params: unknown) => {
      const p = renderableTooltipParams(params)
      if (!p.length)
        return ''
      const firstParam = p[0]
      if (!firstParam)
        return ''
      const record = chartData.value[firstParam.dataIndex]
      if (!record)
        return ''

      const diskUsed = isFiniteValue(record.disk) ? record.disk : null
      if (diskUsed === null)
        return ''
      const diskTotal = record.disk_total ?? nodeInfo.value?.disk_total ?? 0
      const diskPercent = diskTotal > 0 ? ((diskUsed / diskTotal) * 100).toFixed(1) : '0'

      const timeStr = formatTimeForTooltip(record.time, selectedHours.value || 1)
      const colorDot = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${firstParam.color};margin-right:8px;flex-shrink:0"></span>`

      let html = `<div style="font-weight:600;margin-bottom:6px;color:${chartThemeColors.value.textSecondary}">${timeStr}</div>`
      html += '<div style="display:flex;flex-direction:column;gap:4px">'
      html += `<div style="display:flex;align-items:center">${colorDot}<span>磁盘已用</span><span style="margin-left:auto;font-weight:600;margin-left:16px">${formatBytes(diskUsed)} (${diskPercent}%)</span></div>`
      html += '</div>'
      return html
    },
  },
  grid: chartMargin.value,
  xAxis: baseXAxisConfig.value,
  yAxis: {
    ...baseYAxisConfig.value,
    name: '磁盘',
    nameTextStyle: { color: chartThemeColors.value.textSecondary, padding: [0, 40, 0, 0] },
    axisLabel: {
      ...baseYAxisConfig.value.axisLabel,
      formatter: (val: number) => formatBytes(val),
    },
  },
  series: [
    {
      name: '磁盘已用',
      type: 'line',
      data: diskValues.value,
      smooth: 0.24,
      smoothMonotone: 'x' as const,
      connectNulls: false,
      showSymbol: true,
      symbolSize: (_value: unknown, params: { dataIndex: number }) => getSparsePointSymbolSize(diskValues.value, params.dataIndex),
      lineStyle: { width: 1.5, color: chartColors.tertiary, cap: 'round' as const },
      areaStyle: {
        color: {
          type: 'linear',
          x: 0,
          y: 0,
          x2: 0,
          y2: 1,
          colorStops: [
            { offset: 0, color: 'rgba(78, 205, 196, 0.25)' },
            { offset: 1, color: 'rgba(78, 205, 196, 0.02)' },
          ],
        },
      },
    },
  ],
}))

// 网络图表
const networkChartOption = computed(() => ({
  ...chartAnimationConfig.value,
  color: [chartColors.quinary, chartColors.quaternary],
  tooltip: {
    ...baseTooltipConfig.value,
    formatter: (params: unknown) => {
      const p = renderableTooltipParams(params)
      if (!p.length)
        return ''
      const firstParam = p[0]
      if (!firstParam)
        return ''
      const record = chartData.value[firstParam.dataIndex]
      if (!record)
        return ''

      const timeStr = formatTimeForTooltip(record.time, selectedHours.value || 1)
      let html = `<div style="font-weight:600;margin-bottom:6px;color:${chartThemeColors.value.textSecondary}">${timeStr}</div>`
      html += '<div style="display:flex;flex-direction:column;gap:4px">'

      for (const item of p) {
        const colorDot = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${item.color};margin-right:8px;flex-shrink:0"></span>`
        const label = item.seriesName === '下载' ? '↓ 下载' : '↑ 上传'
        html += `<div style="display:flex;align-items:center">${colorDot}<span>${label}</span><span style="margin-left:auto;font-weight:600;margin-left:16px">${formatBytes(Number(item.value))}/s</span></div>`
      }
      html += '</div>'
      return html
    },
  },
  legend: {
    data: ['下载', '上传'],
    bottom: 4,
    itemWidth: 12,
    itemHeight: 12,
    itemGap: 20,
    icon: 'roundRect',
    textStyle: { fontSize: 11, color: chartThemeColors.value.textSecondary },
  },
  grid: chartMarginWithLegend.value,
  xAxis: baseXAxisConfig.value,
  yAxis: {
    ...baseYAxisConfig.value,
    name: '速度',
    nameTextStyle: { color: chartThemeColors.value.textSecondary, padding: [0, 40, 0, 0] },
    axisLabel: {
      ...baseYAxisConfig.value.axisLabel,
      formatter: (val: number) => formatBytes(val),
    },
  },
  series: [
    {
      name: '下载',
      type: 'line',
      data: networkInValues.value,
      smooth: 0.24,
      smoothMonotone: 'x' as const,
      connectNulls: false,
      showSymbol: true,
      symbolSize: (_value: unknown, params: { dataIndex: number }) => getSparsePointSymbolSize(networkInValues.value, params.dataIndex),
      lineStyle: { width: 1.5, color: chartColors.quinary, cap: 'round' as const },
    },
    {
      name: '上传',
      type: 'line',
      data: networkOutValues.value,
      smooth: 0.24,
      smoothMonotone: 'x' as const,
      connectNulls: false,
      showSymbol: true,
      symbolSize: (_value: unknown, params: { dataIndex: number }) => getSparsePointSymbolSize(networkOutValues.value, params.dataIndex),
      lineStyle: { width: 1.5, color: chartColors.quaternary, cap: 'round' as const },
    },
  ],
}))

// 连接数图表
const connectionsChartOption = computed(() => ({
  ...chartAnimationConfig.value,
  color: [chartColors.primary, chartColors.tertiary],
  tooltip: {
    ...baseTooltipConfig.value,
    formatter: (params: unknown) => {
      const p = renderableTooltipParams(params)
      if (!p.length)
        return ''
      const firstParam = p[0]
      if (!firstParam)
        return ''
      const record = chartData.value[firstParam.dataIndex]
      if (!record)
        return ''

      const timeStr = formatTimeForTooltip(record.time, selectedHours.value || 1)
      let html = `<div style="font-weight:600;margin-bottom:6px;color:${chartThemeColors.value.textSecondary}">${timeStr}</div>`
      html += '<div style="display:flex;flex-direction:column;gap:4px">'

      for (const item of p) {
        const colorDot = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${item.color};margin-right:8px;flex-shrink:0"></span>`
        const displayValue = Math.round(Number(item.value))
        html += `<div style="display:flex;align-items:center">${colorDot}<span>${item.seriesName}</span><span style="margin-left:auto;font-weight:600;margin-left:16px">${displayValue}</span></div>`
      }
      html += '</div>'
      return html
    },
  },
  legend: {
    data: ['TCP', 'UDP'],
    bottom: 4,
    itemWidth: 12,
    itemHeight: 12,
    itemGap: 20,
    icon: 'roundRect',
    textStyle: { fontSize: 11, color: chartThemeColors.value.textSecondary },
  },
  grid: chartMarginWithLegend.value,
  xAxis: baseXAxisConfig.value,
  yAxis: {
    ...baseYAxisConfig.value,
    name: '连接数',
    nameTextStyle: { color: chartThemeColors.value.textSecondary, padding: [0, 40, 0, 0] },
    min: 0,
    axisLabel: {
      ...baseYAxisConfig.value.axisLabel,
      formatter: (val: number) => Math.round(val).toString(),
    },
  },
  series: [
    {
      name: 'TCP',
      type: 'line',
      data: connectionValues.value,
      smooth: 0.12,
      smoothMonotone: 'x' as const,
      connectNulls: false,
      showSymbol: true,
      symbolSize: (_value: unknown, params: { dataIndex: number }) => getSparsePointSymbolSize(connectionValues.value, params.dataIndex),
      lineStyle: { width: 1.5, color: chartColors.primary, cap: 'round' as const },
    },
    {
      name: 'UDP',
      type: 'line',
      data: udpConnectionValues.value,
      smooth: 0.12,
      smoothMonotone: 'x' as const,
      connectNulls: false,
      showSymbol: true,
      symbolSize: (_value: unknown, params: { dataIndex: number }) => getSparsePointSymbolSize(udpConnectionValues.value, params.dataIndex),
      lineStyle: { width: 1.5, color: chartColors.tertiary, cap: 'round' as const },
    },
  ],
}))

// 进程数图表
const processChartOption = computed(() => ({
  ...chartAnimationConfig.value,
  color: [chartColors.quaternary],
  tooltip: {
    ...baseTooltipConfig.value,
    formatter: (params: unknown) => {
      const p = renderableTooltipParams(params)
      if (!p.length)
        return ''
      const firstParam = p[0]
      if (!firstParam)
        return ''
      const record = chartData.value[firstParam.dataIndex]
      if (!record)
        return ''

      const timeStr = formatTimeForTooltip(record.time, selectedHours.value || 1)
      const colorDot = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${firstParam.color};margin-right:8px;flex-shrink:0"></span>`
      const displayValue = Math.round(Number(firstParam.value))

      let html = `<div style="font-weight:600;margin-bottom:6px;color:${chartThemeColors.value.textSecondary}">${timeStr}</div>`
      html += '<div style="display:flex;flex-direction:column;gap:4px">'
      html += `<div style="display:flex;align-items:center">${colorDot}<span>进程数</span><span style="margin-left:auto;font-weight:600;margin-left:16px">${displayValue}</span></div>`
      html += '</div>'
      return html
    },
  },
  grid: chartMargin.value,
  xAxis: baseXAxisConfig.value,
  yAxis: {
    ...baseYAxisConfig.value,
    name: '进程',
    nameTextStyle: { color: chartThemeColors.value.textSecondary, padding: [0, 40, 0, 0] },
    min: 0,
    axisLabel: {
      ...baseYAxisConfig.value.axisLabel,
      formatter: (val: number) => Math.round(val).toString(),
    },
  },
  series: [
    {
      name: '进程数',
      type: 'line',
      data: processValues.value,
      smooth: 0.12,
      smoothMonotone: 'x' as const,
      connectNulls: false,
      showSymbol: true,
      symbolSize: (_value: unknown, params: { dataIndex: number }) => getSparsePointSymbolSize(processValues.value, params.dataIndex),
      lineStyle: { width: 1.5, color: chartColors.quaternary, cap: 'round' as const },
      areaStyle: {
        color: {
          type: 'linear',
          x: 0,
          y: 0,
          x2: 0,
          y2: 1,
          colorStops: [
            { offset: 0, color: 'rgba(167, 139, 250, 0.25)' },
            { offset: 1, color: 'rgba(167, 139, 250, 0.02)' },
          ],
        },
      },
    },
  ],
}))

// ==================== 实时更新 ====================

// 使用 VueUse 的 useIntervalFn 自动管理定时器
type OptionalTelemetryTab = 'gpu' | 'gpu-memory' | 'gpu-temperature'
type ExtendedTelemetryTab = 'connections' | 'process' | OptionalTelemetryTab
type OptionalTelemetryStatus = 'idle' | 'loading' | 'ready' | 'empty' | 'unavailable' | 'error'

interface OptionalTelemetryCacheEntry {
  status: 'ready' | 'empty'
  series: MetricSeries[]
}

const extendedTelemetryTab = ref<ExtendedTelemetryTab>('connections')
const availableMetricNames = ref<ReadonlySet<string>>(new Set())
const optionalMetricSeries = shallowRef<MetricSeries[]>([])
const optionalTelemetryStatus = ref<OptionalTelemetryStatus>('idle')
const optionalTelemetryError = ref<string | null>(null)
const optionalTelemetryCache = new Map<string, OptionalTelemetryCacheEntry>()
let metricCapabilityRequestId = 0
let optionalTelemetryRequestId = 0

const gpuUsageMetricKey = computed(() => ['gpu.device.usage', 'gpu.usage'].find(name => availableMetricNames.value.has(name)) ?? null)
const hasGpuMemoryMetrics = computed(() => availableMetricNames.value.has('gpu.memory.used') && availableMetricNames.value.has('gpu.memory.total'))
const hasGpuTemperatureMetric = computed(() => availableMetricNames.value.has('gpu.temperature'))
const shouldDetectOptionalMetrics = computed(() => appStore.extendedTelemetryEnabled
  && Boolean(nodeInfo.value?.gpu_name)
  && (appStore.extendedTelemetryGpuUsageEnabled
    || appStore.extendedTelemetryGpuMemoryEnabled
    || appStore.extendedTelemetryGpuTemperatureEnabled))

const extendedTelemetryTabs = computed<Array<{ value: ExtendedTelemetryTab, label: string }>>(() => {
  if (!appStore.extendedTelemetryEnabled)
    return []
  const tabs: Array<{ value: ExtendedTelemetryTab, label: string }> = []
  if (appStore.extendedTelemetryConnectionsEnabled)
    tabs.push({ value: 'connections', label: '连接' })
  if (appStore.extendedTelemetryProcessEnabled)
    tabs.push({ value: 'process', label: '进程' })
  if (appStore.extendedTelemetryGpuUsageEnabled && gpuUsageMetricKey.value)
    tabs.push({ value: 'gpu', label: 'GPU' })
  if (appStore.extendedTelemetryGpuMemoryEnabled && hasGpuMemoryMetrics.value)
    tabs.push({ value: 'gpu-memory', label: '显存' })
  if (appStore.extendedTelemetryGpuTemperatureEnabled && hasGpuTemperatureMetric.value)
    tabs.push({ value: 'gpu-temperature', label: '温度' })
  return tabs
})
const hasExtendedTelemetry = computed(() => extendedTelemetryTabs.value.length > 0)
const optionalTelemetryActive = computed(() => extendedTelemetryTab.value === 'gpu'
  || extendedTelemetryTab.value === 'gpu-memory'
  || extendedTelemetryTab.value === 'gpu-temperature')

function metricSeriesLabel(series: MetricSeries, index: number): string {
  const device = series.tags?.device_name || series.tags?.device || series.tags?.name || series.tags?.device_index
  const suffix = device || `GPU ${index + 1}`
  if (series.metric_key === 'gpu.memory.used')
    return `${suffix} 已用`
  if (series.metric_key === 'gpu.memory.total')
    return `${suffix} 总量`
  if (series.metric_key === 'gpu.temperature')
    return suffix
  return suffix
}

function formatOptionalMetricValue(value: number): string {
  if (extendedTelemetryTab.value === 'gpu-memory')
    return formatBytes(value)
  if (extendedTelemetryTab.value === 'gpu-temperature')
    return `${Math.round(value)} °C`
  return `${Math.round(value * 10) / 10}%`
}

const optionalMetricChartOption = computed(() => ({
  ...chartAnimationConfig.value,
  color: [chartColors.tertiary, chartColors.quinary, chartColors.quaternary, chartColors.secondary],
  tooltip: {
    ...baseTooltipConfig.value,
    valueFormatter: (value: number) => formatOptionalMetricValue(value),
  },
  legend: {
    bottom: 4,
    itemWidth: 12,
    itemHeight: 12,
    textStyle: { fontSize: 11, color: chartThemeColors.value.textSecondary },
  },
  grid: chartMarginWithLegend.value,
  xAxis: {
    ...baseXAxisConfig.value,
    data: optionalMetricSeries.value[0]?.points.map(point => formatTime(point.time, showDateInAxis.value)) ?? [],
  },
  yAxis: {
    ...baseYAxisConfig.value,
    name: extendedTelemetryTab.value === 'gpu-memory' ? '显存' : extendedTelemetryTab.value === 'gpu-temperature' ? '°C' : '%',
    min: 0,
    max: extendedTelemetryTab.value === 'gpu' ? 100 : undefined,
    axisLabel: {
      ...baseYAxisConfig.value.axisLabel,
      formatter: (value: number) => extendedTelemetryTab.value === 'gpu-memory' ? formatBytes(value) : Math.round(value).toString(),
    },
  },
  series: optionalMetricSeries.value.map((series, index) => {
    const values = series.points.map(point => point.value)
    return {
      name: metricSeriesLabel(series, index),
      type: 'line',
      data: values,
      smooth: 0.16,
      smoothMonotone: 'x' as const,
      connectNulls: false,
      showSymbol: true,
      symbolSize: (_value: unknown, params: { dataIndex: number }) => getSparsePointSymbolSize(values, params.dataIndex),
      lineStyle: {
        width: 1.5,
        cap: 'round' as const,
        type: series.metric_key === 'gpu.memory.total' ? 'dashed' as const : 'solid' as const,
      },
    }
  }),
}))

const extendedTelemetryOption = computed(() => {
  if (extendedTelemetryTab.value === 'process')
    return processChartOption.value
  if (optionalTelemetryActive.value)
    return optionalMetricChartOption.value
  return connectionsChartOption.value
})

function optionalMetricKeys(tab: ExtendedTelemetryTab = extendedTelemetryTab.value): string[] {
  if (tab === 'gpu')
    return gpuUsageMetricKey.value ? [gpuUsageMetricKey.value] : []
  if (tab === 'gpu-memory')
    return hasGpuMemoryMetrics.value ? ['gpu.memory.used', 'gpu.memory.total'] : []
  if (tab === 'gpu-temperature')
    return hasGpuTemperatureMetric.value ? ['gpu.temperature'] : []
  return []
}

function optionalMetricCacheKey(metricKeys: string[]): string {
  return `${props.uuid}|${selectedHours.value || 1}|${extendedTelemetryTab.value}|${metricKeys.join(',')}`
}

function resetOptionalTelemetry(status: OptionalTelemetryStatus = 'idle'): void {
  optionalTelemetryRequestId += 1
  optionalMetricSeries.value = []
  optionalTelemetryError.value = null
  optionalTelemetryStatus.value = status
}

function normalizeOptionalMetricSeries(value: unknown): MetricSeries[] {
  if (!Array.isArray(value))
    return []

  return value.flatMap((candidate) => {
    if (!candidate || typeof candidate !== 'object')
      return []
    const series = candidate as Partial<MetricSeries>
    if (!Array.isArray(series.points))
      return []
    const points = series.points.filter(point => point && typeof point.time === 'string' && (typeof point.value === 'number' || point.value === null))
    if (points.length === 0 || typeof series.metric_key !== 'string' || typeof series.entity_id !== 'string')
      return []
    return [{ ...series, count: typeof series.count === 'number' ? series.count : points.length, points } as MetricSeries]
  })
}

async function detectOptionalMetricCapabilities(): Promise<void> {
  // Capability discovery and chart queries have independent lifecycles. A tab or
  // range reset must not discard a valid definition response that is still in flight.
  const capabilityRequestId = ++metricCapabilityRequestId
  availableMetricNames.value = new Set()
  optionalMetricSeries.value = []
  optionalTelemetryError.value = null
  optionalTelemetryStatus.value = 'idle'
  if (!shouldDetectOptionalMetrics.value)
    return
  try {
    const definitions = await listAvailableMetricDefinitions(rpc)
    if (capabilityRequestId !== metricCapabilityRequestId || !shouldDetectOptionalMetrics.value)
      return
    availableMetricNames.value = new Set(definitions.map(definition => definition.name))
  }
  catch {
    if (capabilityRequestId !== metricCapabilityRequestId)
      return
    // Optional capability discovery never blocks local connection/process data.
    availableMetricNames.value = new Set()
  }
}

async function fetchOptionalMetrics(): Promise<void> {
  if (!optionalTelemetryActive.value)
    return

  const metricKeys = optionalMetricKeys()
  if (metricKeys.length === 0) {
    resetOptionalTelemetry('unavailable')
    return
  }
  const cacheKey = optionalMetricCacheKey(metricKeys)
  const cached = optionalTelemetryCache.get(cacheKey)
  if (cached) {
    optionalMetricSeries.value = cached.series
    optionalTelemetryError.value = null
    optionalTelemetryStatus.value = cached.status
    return
  }

  const requestId = ++optionalTelemetryRequestId
  optionalMetricSeries.value = []
  optionalTelemetryError.value = null
  optionalTelemetryStatus.value = 'loading'
  try {
    const result = await rpc.queryMetrics({
      metric_keys: metricKeys,
      entity_ids: [props.uuid],
      hours: selectedHours.value || 1,
      max_points: 400,
      aggregation_by_metric: Object.fromEntries(metricKeys.map(metricKey => [metricKey, 'avg'])),
      fill_empty: false,
    })
    if (requestId !== optionalTelemetryRequestId)
      return
    const series = normalizeOptionalMetricSeries(result?.series)
    const status = series.length > 0 ? 'ready' : 'empty'
    optionalTelemetryCache.set(cacheKey, { status, series })
    optionalMetricSeries.value = series
    optionalTelemetryStatus.value = status
  }
  catch (err) {
    if (requestId !== optionalTelemetryRequestId)
      return
    if (isMetricCapabilityUnavailable(err)) {
      optionalMetricSeries.value = []
      optionalTelemetryStatus.value = 'unavailable'
      return
    }
    optionalMetricSeries.value = []
    optionalTelemetryError.value = '该指标暂时无法加载，请稍后重试'
    optionalTelemetryStatus.value = 'error'
  }
}

const { pause: pauseRealtimeUpdate, resume: resumeRealtimeUpdate } = useIntervalFn(
  () => fetchData(),
  dataUpdateInterval,
  { immediate: false },
)

// 根据是否为实时模式控制定时器
watch([isRealtime, documentVisibility], ([realtime, visibility]) => {
  if (realtime && visibility === 'visible') {
    resumeRealtimeUpdate()
  }
  else {
    pauseRealtimeUpdate()
  }
}, { immediate: true })

// 生命周期 ====================

watch(selectedView, () => {
  resetOptionalTelemetry()
  if (optionalTelemetryActive.value)
    void fetchOptionalMetrics()
  isInitialLoad.value = true // 切换视图时重置首次加载状态
  void fetchData()
})

watch(availableViews, (views) => {
  if (views.some(view => view.label === selectedView.value))
    return
  selectedView.value = '实时'
}, { immediate: true })

watch(extendedTelemetryTab, (tab) => {
  resetOptionalTelemetry()
  if (tab === 'gpu' || tab === 'gpu-memory' || tab === 'gpu-temperature')
    void fetchOptionalMetrics()
})

watch(extendedTelemetryTabs, (tabs) => {
  if (tabs.some(tab => tab.value === extendedTelemetryTab.value))
    return
  resetOptionalTelemetry()
  extendedTelemetryTab.value = tabs[0]?.value ?? 'connections'
}, { immediate: true })

watch(() => props.uuid, () => {
  remoteData.value = []
  resetOptionalTelemetry()
  availableMetricNames.value = new Set()
  extendedTelemetryTab.value = 'connections'
  isInitialLoad.value = true // 切换节点时重置首次加载状态
  void fetchData()
})

watch([() => props.uuid, () => nodeInfo.value?.gpu_name, shouldDetectOptionalMetrics], () => {
  void detectOptionalMetricCapabilities()
}, { flush: 'post', immediate: true })

onMounted(() => {
  void fetchData()
})

onUnmounted(() => {
  // 卸载后丢弃仍在途的响应
  fetchRequestId += 1
  metricCapabilityRequestId += 1
  resetOptionalTelemetry()
  pauseRealtimeUpdate()
})
</script>

<template>
  <div
    class="lnl-load-chart flex flex-col gap-4"
    :class="{ 'is-motion-reduced': appStore.disablePageAnimation }"
    :data-history-display-interval="isRealtime ? 'realtime' : historyDisplayIntervalSeconds"
  >
    <!-- 时间选择器 -->
    <Tabs v-model="selectedView" class="w-full min-w-0 items-center overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <TabsList :class="pickSurfaceClass('h-8 min-w-max bg-background/60 pointer-events-auto rounded-md', 'h-8 min-w-max bg-background/50 backdrop-blur-xl pointer-events-auto rounded-md')">
        <TabsTrigger
          v-for="view in availableViews" :key="view.label" :value="view.label"
          class="lnl-history-tab h-6.5 text-xs border-none shadow-none rounded-sm"
        >
          {{ view.label }}
        </TabsTrigger>
      </TabsList>
    </Tabs>

    <div
      v-if="!historyRecordsEnabled"
      class="lnl-history-notice px-1 text-[11px] text-muted-foreground flex items-center gap-1.5"
      role="status"
    >
      <Icon icon="tabler:history-off" width="13" height="13" aria-hidden="true" />
      <span>后台未启用历史记录，当前仅显示实时数据</span>
    </div>

    <!-- 内容区域 -->
    <Spinner :show="loading">
      <div v-if="error" class="text-red-500 py-8 text-center">
        {{ error }}
      </div>
      <div v-else-if="(!remoteData.length || !hasRenderableBaseData) && !loading" class="py-8">
        <Empty description="暂无可用负载数据" />
      </div>

      <!-- 图表网格 -->
      <div v-else class="gap-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
        <!-- CPU 卡片 -->
        <CardX
          size="small" segmented
          class="lnl-panel-motion border-none rounded-md"
          :class="pickSurfaceClass('bg-background/60 hover:bg-background', 'bg-background/50 hover:bg-background backdrop-blur-xs')"
        >
          <template #header>
            <div class="flex items-center justify-between">
              <span class="text-base font-bold">CPU</span>
              <div v-if="latestStatus?.cpu != null" class="text-xs flex gap-0.5 items-baseline">
                <span>{{ latestStatus.cpu.toFixed(1) }}</span>
                <span>%</span>
              </div>
              <span v-else>-</span>
            </div>
          </template>
          <ChartViewport>
            <VChart :option="cpuChartOption" autoresize />
          </ChartViewport>
        </CardX>

        <!-- 内存卡片 -->
        <CardX
          size="small" segmented
          class="lnl-panel-motion border-none rounded-md"
          :class="pickSurfaceClass('bg-background/60 hover:bg-background', 'bg-background/50 hover:bg-background backdrop-blur-xs')"
        >
          <template #header>
            <div class="flex items-center justify-between">
              <span class="text-base font-bold">内存</span>
              <div class="min-w-28 justify-end text-xs flex gap-1 items-baseline">
                <template v-if="latestStatus?.ram != null">
                  <span>{{ formatBytesSplit(latestStatus.ram).value }}</span>
                  <span>{{ formatBytesSplit(latestStatus.ram).unit }}</span>
                </template>
                <span v-else>-</span>
                <span>·</span>
                <template v-if="nodeInfo?.mem_total">
                  <span>{{
                    formatBytesSplit(nodeInfo.mem_total).value }}</span>
                  <span>{{ formatBytesSplit(nodeInfo.mem_total).unit }}</span>
                </template>
                <span v-else>-</span>
              </div>
            </div>
          </template>
          <ChartViewport>
            <VChart :option="memoryChartOption" autoresize />
          </ChartViewport>
        </CardX>

        <!-- 磁盘卡片 -->
        <CardX
          size="small" segmented
          class="lnl-panel-motion border-none rounded-md"
          :class="pickSurfaceClass('bg-background/60 hover:bg-background', 'bg-background/50 hover:bg-background backdrop-blur-xs')"
        >
          <template #header>
            <div class="flex items-center justify-between">
              <span class="text-base font-bold">磁盘</span>
              <div class="min-w-28 justify-end text-xs flex gap-1 items-baseline">
                <template v-if="latestStatus?.disk != null">
                  <span>{{ formatBytesSplit(latestStatus.disk).value }}</span>
                  <span>{{ formatBytesSplit(latestStatus.disk).unit }}</span>
                </template>
                <span v-else>-</span>
                <span>·</span>
                <template v-if="nodeInfo?.disk_total">
                  <span>{{ formatBytesSplit(nodeInfo.disk_total).value }}</span>
                  <span>{{ formatBytesSplit(nodeInfo.disk_total).unit }}</span>
                </template>
                <span v-else>-</span>
              </div>
            </div>
          </template>
          <ChartViewport>
            <VChart :option="diskChartOption" autoresize />
          </ChartViewport>
        </CardX>

        <!-- 网络卡片 -->
        <CardX
          size="small" segmented
          class="lnl-panel-motion border-none rounded-md"
          :class="pickSurfaceClass('bg-background/60 hover:bg-background', 'bg-background/50 hover:bg-background backdrop-blur-xs')"
        >
          <template #header>
            <div class="flex items-center justify-between">
              <span class="text-base font-bold">网络</span>
              <div class="text-xs flex gap-2 items-baseline">
                <span class="flex flex-row items-center justify-center gap-0.5">
                  <Icon icon="tabler:chevron-up" width="12" height="12" />
                  <template v-if="latestStatus?.net_out != null">
                    {{ formatBytesSplit(latestStatus.net_out).value }}
                    {{ formatBytesSplit(latestStatus.net_out).unit }}/s
                  </template>
                  <template v-else>-</template>
                </span>
                <span class="flex flex-row items-center justify-center gap-0.5">
                  <Icon icon="tabler:chevron-down" width="12" height="12" />
                  <template v-if="latestStatus?.net_in != null">
                    {{ formatBytesSplit(latestStatus.net_in).value }}
                    {{ formatBytesSplit(latestStatus.net_in).unit }}/s
                  </template>
                  <template v-else>-</template>
                </span>
              </div>
            </div>
          </template>
          <ChartViewport>
            <VChart :option="networkChartOption" autoresize />
          </ChartViewport>
        </CardX>

        <!-- 同一时间仅挂载一个附加图表，避免连接、进程与 GPU 并行占用。 -->
        <CardX
          v-if="hasExtendedTelemetry"
          size="small" segmented
          data-extended-telemetry
          class="lnl-panel-motion border-none rounded-md xl:col-span-2"
          :class="pickSurfaceClass('bg-background/60 hover:bg-background', 'bg-background/50 hover:bg-background backdrop-blur-xs')"
        >
          <template #header>
            <div class="flex min-w-0 flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
              <span class="text-base font-bold shrink-0">扩展遥测</span>
              <Tabs v-model="extendedTelemetryTab" class="min-w-0">
                <TabsList class="h-auto min-h-7 max-w-full flex-wrap justify-start bg-foreground/5 rounded-sm sm:justify-center">
                  <TabsTrigger
                    v-for="tab in extendedTelemetryTabs"
                    :key="tab.value"
                    :value="tab.value"
                    class="h-5.5 px-2 text-[11px] border-none shadow-none rounded-xs"
                  >
                    {{ tab.label }}
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </template>
          <ChartViewport>
            <div v-if="optionalTelemetryActive && optionalTelemetryStatus === 'error'" class="h-full px-4 text-xs text-destructive flex items-center justify-center text-center">
              {{ optionalTelemetryError }}
            </div>
            <div v-else-if="optionalTelemetryActive && optionalTelemetryStatus === 'loading'" class="h-full flex items-center justify-center">
              <Spinner :show="true" />
            </div>
            <Empty
              v-else-if="optionalTelemetryActive && (optionalTelemetryStatus === 'empty' || optionalTelemetryStatus === 'unavailable')"
              description="该项历史采集未启用或暂无数据"
            />
            <VChart v-else :key="extendedTelemetryTab" :option="extendedTelemetryOption" autoresize />
          </ChartViewport>
        </CardX>
      </div>
    </Spinner>
  </div>
</template>

<style scoped>
.lnl-history-tab[data-state='active'] {
  color: var(--lnl-green);
}

.lnl-history-tab:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--lnl-green) 46%, transparent);
  outline-offset: 1px;
}
</style>
