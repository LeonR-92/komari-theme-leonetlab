<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { useMediaQuery } from '@vueuse/core'
import dayjs from 'dayjs'
import { PopoverClose, PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from 'reka-ui'
import { computed, onActivated, onDeactivated, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import VChart from 'vue-echarts'
import ChartViewport from '@/components/ChartViewport.vue'
import { Button } from '@/components/ui/button'
import { DataTooltip } from '@/components/ui/data-tooltip'
import { Empty } from '@/components/ui/empty'
import { Spinner } from '@/components/ui/spinner'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useBackgroundSurface } from '@/composables/useBackgroundSurface'
import { useMotionPreference } from '@/composables/useMotionPreference'
import { useAppStore } from '@/stores/app'
import { isMetricCapabilityUnavailable } from '@/utils/metricCompatibility'
import { bridgeShortDisplayGaps, cutPeakValues } from '@/utils/recordHelper'
import { getSharedRpc, RpcError } from '@/utils/rpc'
import '@/utils/echarts' // 共享 ECharts 配置

const props = defineProps<{
  uuid: string
}>()

const appStore = useAppStore()
const { pickSurfaceClass } = useBackgroundSurface()
const { motionReduced } = useMotionPreference()
const isDark = computed(() => appStore.isDark)
const motionEnabled = computed(() => !motionReduced.value)
const narrowViewport = useMediaQuery('(max-width: 640px)')
const chartRef = ref<InstanceType<typeof VChart> | null>(null)
const pageVisible = ref(document.visibilityState === 'visible')
const componentActive = ref(true)
const interactiveChartUpdate = ref(true)
const chartMotionEnabled = computed(() => motionEnabled.value && pageVisible.value && componentActive.value && interactiveChartUpdate.value)
const chartAnimationDuration = computed(() => narrowViewport.value ? 360 : 560)
// 使用共享的 RPC 实例，避免重复创建连接
const rpc = getSharedRpc()

// 图表主题相关颜色
const chartThemeColors = computed(() => ({
  text: isDark.value ? 'rgba(255, 255, 255, 0.85)' : 'rgba(0, 0, 0, 0.85)',
  textSecondary: isDark.value ? 'rgba(255, 255, 255, 0.55)' : 'rgba(0, 0, 0, 0.55)',
  textTertiary: isDark.value ? 'rgba(255, 255, 255, 0.35)' : 'rgba(0, 0, 0, 0.35)',
  borderColor: isDark.value ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.06)',
  splitLineColor: isDark.value ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)',
  tooltipBg: isDark.value ? 'rgba(40, 40, 40, 0.95)' : 'rgba(255, 255, 255, 0.8)',
  tooltipShadow: isDark.value ? 'rgba(0, 0, 0, 0.4)' : 'rgba(0, 0, 0, 0.06)',
  crosshairColor: isDark.value ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.1)',
}))

// 优化后的图表配色方案（多任务时使用）
const chartColors = [
  '#FF6B6B', // 珊瑚红
  '#4ECDC4', // 青绿色
  '#A78BFA', // 紫罗兰
  '#60A5FA', // 天蓝色
  '#FFB347', // 琥珀黄
  '#F472B6', // 粉红色
  '#34D399', // 翠绿色
  '#FB923C', // 橙色
]

// 从 publicSettings 获取记录保留时间
const maxPingRecordPreserveTime = computed(() => {
  const value = appStore.publicSettings?.ping_record_preserve_time
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, value)
    : 168
})
const pingHistoryEnabled = computed(() => maxPingRecordPreserveTime.value > 0)

// 视图选项
const presetViews = [
  { label: '1 小时', hours: 1 },
  { label: '6 小时', hours: 6 },
  { label: '12 小时', hours: 12 },
  { label: '1 天', hours: 24 },
]

// 可用视图列表
const availableViews = computed(() => {
  const views: { label: string, hours: number }[] = []
  if (!pingHistoryEnabled.value)
    return views

  const maxHours = maxPingRecordPreserveTime.value

  for (const v of presetViews) {
    if (maxHours >= v.hours) {
      views.push(v)
    }
  }

  const maxPreset = presetViews.at(-1)
  if (maxPreset && maxHours > maxPreset.hours) {
    const label = maxHours % 24 === 0
      ? `${Math.floor(maxHours / 24)} 天`
      : `${maxHours} 小时`
    views.push({ label, hours: maxHours })
  }
  else if (maxHours > 1 && !presetViews.some(v => v.hours === maxHours)) {
    const label = maxHours % 24 === 0
      ? `${Math.floor(maxHours / 24)} 天`
      : `${maxHours} 小时`
    views.push({ label, hours: maxHours })
  }

  return views
})

// 当前选中的视图
const selectedView = ref<string>('')
const selectedHours = computed(() => {
  const view = availableViews.value.find(v => v.label === selectedView.value)
  return view?.hours || 1
})

// 初始化默认视图
watch(availableViews, (views) => {
  const firstView = views[0]
  if (views.some(view => view.label === selectedView.value))
    return

  selectedView.value = firstView?.label ?? ''
}, { immediate: true })

// ==================== 类型定义 ====================

interface PingRecord {
  client: string
  task_id: number
  time: string
  value: number
}

interface PingLossPoint {
  task_id: number
  time: string
  /** 0..1 ratio for metric data; legacy losses use 1. */
  loss: number
}

interface TaskInfo {
  id: number
  weight?: number
  name: string
  interval: number
  loss?: number
  lossApproximate?: boolean
  p99?: number
  p50?: number
  p99_p50_ratio?: number
  min?: number
  max?: number
  avg?: number
  latest?: number
  total?: number
  type?: string
}

interface MetricPoint {
  time: string
  value: number | null
  tags?: Record<string, string>
  tag?: Record<string, string>
  labels?: Record<string, string>
}

interface MetricSeries {
  metric_key: 'ping.latency_ms' | 'ping.loss'
  tags?: Record<string, string>
  tag?: Record<string, string>
  labels?: Record<string, string>
  interval_seconds?: number
  points: MetricPoint[]
}

interface MetricQueryResponse {
  interval_seconds?: number
  series: MetricSeries[]
}

interface PingMetricTaskStats {
  task_id: string
  name?: string
  type?: string
  interval?: number
  loss: number
  loss_approximate?: boolean
  min?: number
  max?: number
  avg?: number
  latest?: number
  total: number
  p50?: number
  p99?: number
  p99_p50_ratio?: number
}

interface PingMetricStatsResponse {
  interval_seconds?: number
  stats: PingMetricTaskStats[]
}

interface PingRecordsResponse {
  records: PingRecord[]
  tasks?: TaskInfo[]
}

interface PingChartData {
  records: PingRecord[]
  lossPoints: PingLossPoint[]
  tasks: TaskInfo[]
}

interface PublicPingTask {
  id: number
  weight?: number
}

// 数据状态
const remoteData = shallowRef<PingRecord[]>([])
const remoteLossData = shallowRef<PingLossPoint[]>([])
const tasks = shallowRef<TaskInfo[]>([])
const loading = ref(false)
const fetching = ref(false)
const backgroundRefreshing = ref(false)
const error = ref<string | null>(null)
const refreshError = ref(false)
const lastUpdatedAt = ref<number | null>(null)
let fetchRequestId = 0
let metricRpcSupported: boolean | null = null
let metricRpcRetryAt = 0
let refreshTimer: ReturnType<typeof window.setInterval> | null = null
const PING_DIALOG_REFRESH_INTERVAL_MS = 15_000
let pingTaskWeightCache = new Map<number, number>()
let pingTaskWeightCacheExpiresAt = 0

watch(pingHistoryEnabled, (enabled) => {
  if (enabled)
    return

  fetchRequestId += 1
  remoteData.value = []
  remoteLossData.value = []
  tasks.value = []
  loading.value = false
  fetching.value = false
  backgroundRefreshing.value = false
  error.value = null
}, { immediate: true })

// 任务选择
const taskSelectionMode = ref<'all' | 'custom' | 'none'>('all')
// Keep visitor intent independent of the tasks available in a particular range.
const requestedTaskIds = ref<number[]>([])
const requestedTaskIdSet = computed(() => new Set(requestedTaskIds.value))
const selectedTaskIds = computed(() => tasks.value
  .filter(task => taskSelectionMode.value === 'all' || (taskSelectionMode.value === 'custom' && requestedTaskIdSet.value.has(task.id)))
  .map(task => task.id))
const cutPeak = ref(false)
const showDelay = ref(true)
const showLoss = ref(true)
const probeDetailsOpen = ref(false)
const chartMargin = computed(() => narrowViewport.value
  ? { top: 22, right: 10, bottom: 42, left: 40 }
  : { top: 30, right: 24, bottom: 52, left: 56 })
const chartAxisFontSize = computed(() => narrowViewport.value ? 9 : 11)

const mergeToleranceMs = computed(() => {
  const taskIntervals = tasks.value
    .map(t => t.interval)
    .filter((v): v is number => typeof v === 'number' && v > 0)

  const fallbackIntervalSec = taskIntervals.length ? Math.min(...taskIntervals) : 60
  return Math.min(
    6000,
    Math.max(800, Math.floor(fallbackIntervalSec * 1000 * 0.25)),
  )
})

// ==================== 数据获取 ====================

function isMethodNotFoundError(err: unknown): boolean {
  return err instanceof RpcError && err.code === -32601
}

function canFallbackToLegacyRecords(err: unknown): boolean {
  if (isMethodNotFoundError(err) || isMetricCapabilityUnavailable(err))
    return true
  if (!(err instanceof RpcError))
    return false
  if (err.code === -32602)
    return true
  return false
}

function getMetricTaskId(series: MetricSeries, point: MetricPoint): number | null {
  const taskId = Number(
    point.tags?.task_id
    ?? series.tags?.task_id
    ?? point.tag?.task_id
    ?? series.tag?.task_id
    ?? point.labels?.task_id
    ?? series.labels?.task_id,
  )

  return Number.isInteger(taskId) ? taskId : null
}

function isValidPingTime(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(dayjs(value).valueOf())
}

function normalizePingRecords(value: unknown, fallbackClient: string): PingRecord[] {
  if (!Array.isArray(value))
    return []

  return value.flatMap((candidate) => {
    if (!candidate || typeof candidate !== 'object')
      return []
    const record = candidate as Partial<PingRecord>
    const taskId = Number(record.task_id)
    if (!Number.isInteger(taskId) || !isValidPingTime(record.time) || typeof record.value !== 'number' || !Number.isFinite(record.value))
      return []
    return [{
      client: typeof record.client === 'string' ? record.client : fallbackClient,
      task_id: taskId,
      time: record.time,
      value: record.value,
    }]
  })
}

function validStatistic(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined
}

function normalizeTaskStatistics(task: TaskInfo): TaskInfo {
  return {
    ...task,
    loss: validStatistic(task.loss),
    latest: validStatistic(task.latest),
    avg: validStatistic(task.avg),
    min: validStatistic(task.min),
    max: validStatistic(task.max),
    p99_p50_ratio: validStatistic(task.p99_p50_ratio),
  }
}

async function fetchMetricRecords(uuid: string, hours: number): Promise<PingChartData> {
  const [metricResult, statsResult, taskWeights] = await Promise.all([
    rpc.getClient().call<MetricQueryResponse>('public:queryMetrics', {
      metric_keys: ['ping.latency_ms', 'ping.loss'],
      entity_id: uuid,
      hours,
      max_points: 500,
      fill_empty: true,
      aggregation_by_metric: {
        // Ping latency stores packet loss as -1. `last` preserves that
        // sentinel so fill_empty can turn an all-loss bucket into a gap.
        'ping.latency_ms': 'last',
        'ping.loss': 'avg',
      },
    }),
    rpc.getClient().call<PingMetricStatsResponse>('public:getPingMetricStats', {
      uuid,
      hours,
      max_points: 500,
    }),
    fetchPublicPingTaskWeights(),
  ])

  const records: PingRecord[] = []
  const lossPoints: PingLossPoint[] = []
  const metricSeries = Array.isArray(metricResult?.series) ? metricResult.series : []
  for (const series of metricSeries) {
    const points = Array.isArray(series?.points) ? series.points : []
    for (const point of points) {
      if (!point || typeof point !== 'object')
        continue
      const taskId = getMetricTaskId(series, point)
      if (taskId === null)
        continue

      if (!isValidPingTime(point.time) || typeof point.value !== 'number' || !Number.isFinite(point.value))
        continue

      if (series.metric_key === 'ping.loss') {
        if (point.value > 0) {
          lossPoints.push({ task_id: taskId, time: point.time, loss: point.value })
        }
        continue
      }

      if (point.value >= 0) {
        records.push({
          client: uuid,
          task_id: taskId,
          time: point.time,
          value: point.value,
        })
      }
    }
  }

  const metricStats = Array.isArray(statsResult?.stats) ? statsResult.stats : []
  const metricTasks = metricStats.filter(task => task && typeof task === 'object').map(task => normalizeTaskStatistics({
    id: Number(task.task_id),
    weight: taskWeights.get(Number(task.task_id)),
    name: task.name || `Ping ${task.task_id}`,
    interval: task.interval ?? 60,
    loss: task.loss,
    lossApproximate: task.loss_approximate === true,
    p99: task.p99,
    p50: task.p50,
    p99_p50_ratio: task.p99_p50_ratio,
    min: task.min,
    max: task.max,
    avg: task.avg,
    latest: task.latest,
    total: task.total,
    type: task.type,
  })).filter(task => Number.isInteger(task.id)).sort(compareTasks)

  return { records, lossPoints, tasks: metricTasks }
}

async function fetchLegacyRecords(uuid: string, hours: number): Promise<PingChartData> {
  const [result, taskWeights] = await Promise.all([
    rpc.getClient().call<PingRecordsResponse>('common:getRecords', {
      type: 'ping',
      uuid,
      hours,
      maxCount: 4000,
    }),
    fetchPublicPingTaskWeights(),
  ])

  const records = normalizePingRecords(result?.records, uuid)
  const legacyTasks = Array.isArray(result?.tasks) ? result.tasks : []
  return {
    records,
    lossPoints: records
      .filter(record => record.value < 0)
      .map(record => ({ task_id: record.task_id, time: record.time, loss: 1 })),
    tasks: legacyTasks
      .filter(task => task && typeof task === 'object' && Number.isInteger(task.id))
      .map(task => normalizeTaskStatistics({ ...task, weight: task.weight ?? taskWeights.get(task.id) }))
      .sort(compareTasks),
  }
}

function compareTasks(a: TaskInfo, b: TaskInfo): number {
  const weightA = Number.isFinite(a.weight) ? a.weight! : Number.MAX_SAFE_INTEGER
  const weightB = Number.isFinite(b.weight) ? b.weight! : Number.MAX_SAFE_INTEGER
  return weightA - weightB || a.id - b.id
}

async function fetchPublicPingTaskWeights(): Promise<Map<number, number>> {
  if (Date.now() < pingTaskWeightCacheExpiresAt)
    return new Map(pingTaskWeightCache)

  try {
    const publicTasks = await rpc.getClient().call<PublicPingTask[]>('public:getPublicPingTasks')
    const taskList = Array.isArray(publicTasks) ? publicTasks : []
    pingTaskWeightCache = new Map(taskList
      .filter(task => Number.isInteger(task.id) && Number.isFinite(task.weight))
      .map(task => [task.id, task.weight!] as const))
    pingTaskWeightCacheExpiresAt = Date.now() + 5 * 60_000
    return new Map(pingTaskWeightCache)
  }
  catch {
    // 1.2.5-compatible servers may omit this public method or the weight field.
    pingTaskWeightCache = new Map()
    pingTaskWeightCacheExpiresAt = Date.now() + 5 * 60_000
    return new Map()
  }
}

async function fetchRecords(options: { background?: boolean } = {}) {
  if (!props.uuid || !pingHistoryEnabled.value || !componentActive.value)
    return
  const background = options.background === true
  if (background && fetching.value)
    return

  const requestId = ++fetchRequestId
  const uuid = props.uuid
  const hours = selectedHours.value
  const blockWorkspace = !background || (remoteData.value.length === 0 && tasks.value.length === 0)

  fetching.value = true
  backgroundRefreshing.value = background && !blockWorkspace
  loading.value = blockWorkspace
  if (!background)
    error.value = null

  try {
    let result: PingChartData
    if (metricRpcSupported === false && Date.now() < metricRpcRetryAt) {
      result = await fetchLegacyRecords(uuid, hours)
    }
    else {
      try {
        result = await fetchMetricRecords(uuid, hours)
        metricRpcSupported = true
        metricRpcRetryAt = 0
      }
      catch (err) {
        if (!canFallbackToLegacyRecords(err))
          throw err

        metricRpcSupported = false
        // A migrating/restarting 1.3.x metric store can become available while
        // the dialog remains open. Retry that transient state without forcing
        // the visitor to close and reopen the chart; unsupported old methods
        // remain on the legacy path for this component lifetime.
        metricRpcRetryAt = err instanceof RpcError && err.code === -32603
          ? Date.now() + 60_000
          : Number.POSITIVE_INFINITY
        result = await fetchLegacyRecords(uuid, hours)
      }
    }

    if (requestId !== fetchRequestId)
      return

    const records = result.records
    records.sort((a, b) => dayjs(a.time).valueOf() - dayjs(b.time).valueOf())

    interactiveChartUpdate.value = !background
    remoteData.value = records
    remoteLossData.value = result.lossPoints
    tasks.value = result.tasks
    error.value = null
    refreshError.value = false
    lastUpdatedAt.value = Date.now()
  }
  catch (err) {
    if (requestId !== fetchRequestId)
      return

    if (background && (remoteData.value.length > 0 || tasks.value.length > 0)) {
      refreshError.value = true
    }
    else {
      error.value = err instanceof Error ? err.message : '获取数据失败'
      remoteData.value = []
      remoteLossData.value = []
      tasks.value = []
    }
  }
  finally {
    if (requestId === fetchRequestId) {
      loading.value = false
      fetching.value = false
      backgroundRefreshing.value = false
    }
  }
}

// ==================== 数据处理 ====================

const mergedData = computed(() => {
  const data = remoteData.value
  const lossData = remoteLossData.value
  if (!data.length && !lossData.length)
    return []

  const toleranceMs = mergeToleranceMs.value

  const grouped: Map<number, Record<string, unknown>> = new Map()
  const anchors: number[] = []

  for (const rec of data) {
    const ts = dayjs(rec.time).valueOf()
    let anchor: number | null = null

    for (const a of anchors) {
      if (Math.abs(a - ts) <= toleranceMs) {
        anchor = a
        break
      }
    }

    const useTs = anchor ?? ts
    if (!grouped.has(useTs)) {
      grouped.set(useTs, { time: dayjs(useTs).toISOString() })
      if (anchor === null) {
        anchors.push(useTs)
      }
    }

    const group = grouped.get(useTs)!
    group[rec.task_id] = rec.value < 0 ? null : rec.value
  }

  // A fully lost bucket has no latency sample in Komari 1.3.2's metric
  // response. Keep an explicit null row so the line breaks at the real loss
  // timestamp and the loss marker remains aligned with the x-axis.
  for (const loss of lossData) {
    const ts = dayjs(loss.time).valueOf()
    let anchor: number | null = null
    for (const candidate of anchors) {
      if (Math.abs(candidate - ts) <= toleranceMs) {
        anchor = candidate
        break
      }
    }
    const useTs = anchor ?? ts
    if (!grouped.has(useTs)) {
      grouped.set(useTs, { time: dayjs(useTs).toISOString() })
      anchors.push(useTs)
    }
    const group = grouped.get(useTs)!
    if (!(loss.task_id in group))
      group[loss.task_id] = null
  }

  const merged = Array.from(grouped.values()).sort(
    (a, b) => dayjs(a.time as string).valueOf() - dayjs(b.time as string).valueOf(),
  )

  const hours = selectedHours.value
  const lastItem = merged.at(-1)
  const lastTs = lastItem ? dayjs(lastItem.time as string).valueOf() : dayjs().valueOf()
  const fromTs = lastTs - hours * 3600_000

  let startIdx = 0
  for (let i = 0; i < merged.length; i++) {
    const item = merged[i]
    if (!item)
      continue
    const ts = dayjs(item.time as string).valueOf()
    if (ts >= fromTs) {
      startIdx = Math.max(0, i - 1)
      break
    }
  }

  return merged.slice(startIdx)
})

const chartData = computed(() => {
  let data = mergedData.value
  const selectedKeys = selectedTaskIds.value.map(String)

  if (selectedKeys.length === 0)
    return []

  if (cutPeak.value) {
    data = cutPeakValues(data, selectedKeys)
  }

  return data
})

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

const showDateInAxis = computed(() => selectedHours.value >= 24)

// ==================== 任务选择 ====================

// 获取任务颜色（根据任务在完整列表中的索引）
const taskColorMap = computed(() => new Map(tasks.value.map((task, index) => [task.id, chartColors[index % chartColors.length]!])))
const taskById = computed(() => new Map(tasks.value.map(task => [task.id, task])))

function getTaskColor(taskId: number): string {
  return taskColorMap.value.get(taskId) ?? chartColors[0]!
}

const TOOLTIP_ESCAPE_PATTERN = /[&<>"']/g
const TOOLTIP_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }
function escapeTooltipText(value: string): string {
  return value.replace(TOOLTIP_ESCAPE_PATTERN, character => TOOLTIP_ESCAPES[character]!)
}

// 最新值统计（从服务端 tasks 获取，保持颜色顺序）
const latestValues = computed(() => {
  if (!tasks.value.length)
    return []

  const latestMap = new Map<number, number | null>()
  for (let index = remoteData.value.length - 1; index >= 0; index--) {
    const record = remoteData.value[index]
    if (!record || record.value < 0 || latestMap.has(record.task_id))
      continue
    latestMap.set(record.task_id, record.value)
  }

  return tasks.value.map((task, idx) => {
    const safeIdx = Math.max(0, idx % chartColors.length)
    return {
      ...task,
      latestValue: latestMap.get(task.id) ?? task.latest ?? null,
      color: chartColors[safeIdx]!,
    }
  })
})

const selectedTaskIdSet = computed(() => new Set(selectedTaskIds.value))
const selectedTasks = computed(() => {
  return tasks.value.filter(task => selectedTaskIdSet.value.has(task.id))
})

function findNearestTimeIndex(sortedTimes: number[], target: number, tolerance: number): number {
  let low = 0
  let high = sortedTimes.length
  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    if ((sortedTimes[middle] ?? Number.POSITIVE_INFINITY) < target)
      low = middle + 1
    else
      high = middle
  }

  const candidates = [low - 1, low]
    .filter(index => index >= 0 && index < sortedTimes.length)
    .sort((left, right) => Math.abs((sortedTimes[left] ?? 0) - target) - Math.abs((sortedTimes[right] ?? 0) - target))
  const nearest = candidates[0]
  return nearest !== undefined && Math.abs((sortedTimes[nearest] ?? 0) - target) <= tolerance
    ? nearest
    : -1
}

const packetLossMarkers = computed(() => {
  const data = mergedData.value
  const markers = new Map<number, number[]>()

  if (!data.length || !selectedTasks.value.length)
    return markers

  const chartTimes = data.map(item => dayjs(item.time as string).valueOf())
  const toleranceMs = mergeToleranceMs.value

  const markerSets = new Map<number, Set<number>>()
  for (const record of remoteLossData.value) {
    if (record.loss <= 0 || !selectedTaskIdSet.value.has(record.task_id))
      continue
    const matchedIndex = findNearestTimeIndex(chartTimes, dayjs(record.time).valueOf(), toleranceMs)
    if (matchedIndex < 0)
      continue
    const points = markerSets.get(record.task_id) ?? new Set<number>()
    points.add(matchedIndex)
    markerSets.set(record.task_id, points)
  }

  for (const task of selectedTasks.value)
    markers.set(task.id, Array.from(markerSets.get(task.id) ?? []).sort((a, b) => a - b))

  return markers
})

function formatProbeLatency(task: TaskInfo & { latestValue: number | null }): string {
  const value = task.latestValue ?? task.avg
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value).toString() : '—'
}

function formatProbeLoss(task: TaskInfo): string {
  return task.loss !== undefined ? `${task.lossApproximate ? '≈' : ''}${task.loss.toFixed(2)}%` : '—'
}

// 切换任务选中状态
function toggleTask(taskId: number) {
  interactiveChartUpdate.value = true
  const ids = new Set(taskSelectionMode.value === 'custom' ? requestedTaskIds.value : selectedTaskIds.value)
  if (ids.has(taskId))
    ids.delete(taskId)
  else
    ids.add(taskId)
  const hasVisibleSelection = tasks.value.some(task => ids.has(task.id))
  requestedTaskIds.value = hasVisibleSelection ? [...ids] : []
  taskSelectionMode.value = hasVisibleSelection ? 'custom' : 'none'
}

function showAllTasks() {
  interactiveChartUpdate.value = true
  taskSelectionMode.value = 'all'
  requestedTaskIds.value = []
}

function hideAllTasks() {
  interactiveChartUpdate.value = true
  taskSelectionMode.value = 'none'
  requestedTaskIds.value = []
}

function handleLegendSelection(event: { selected: Record<string, boolean> }) {
  interactiveChartUpdate.value = true
  const availableIds = new Set(tasks.value.map(task => task.id))
  const unavailableIds = taskSelectionMode.value === 'custom' ? requestedTaskIds.value.filter(id => !availableIds.has(id)) : []
  const visibleIds = tasks.value.filter(task => event.selected[String(task.id)] !== false).map(task => task.id)
  requestedTaskIds.value = visibleIds.length ? [...unavailableIds, ...visibleIds] : []
  taskSelectionMode.value = visibleIds.length ? 'custom' : 'none'
}

// ==================== 图表配置 ====================

// 通用 Tooltip 配置
const baseTooltipConfig = computed(() => ({
  trigger: 'axis' as const,
  confine: true,
  backgroundColor: chartThemeColors.value.tooltipBg,
  borderColor: 'transparent',
  borderWidth: 0,
  borderRadius: 12,
  textStyle: {
    color: chartThemeColors.value.text,
    fontSize: 12,
    lineHeight: 20,
  },
  extraCssText: `backdrop-filter: blur(5px);z-index:9;box-shadow:0 0 0 1px ${chartThemeColors.value.tooltipShadow}, 0 0 16px ${chartThemeColors.value.tooltipShadow}`,
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

const pingChartOption = computed(() => {
  const taskList = tasks.value
  const data = chartData.value
  const hours = selectedHours.value

  // 构建 series，确保颜色与卡片一致
  const series = taskList.map((task) => {
    const color = getTaskColor(task.id)
    const lossMarkerIndexes = packetLossMarkers.value.get(task.id) || []
    const rawValues = data.map(d => d[task.id] as number | null ?? null)
    const displayValues = bridgeShortDisplayGaps(rawValues, 2)
    return {
      id: `ping-task-${task.id}`,
      // ECharts legends also key by name; IDs keep equal display names independent.
      name: String(task.id),
      type: 'line' as const,
      // 只在绘制副本上桥接 1–2 个采样周期；统计、Tooltip 与状态色块继续读取原始值。
      data: displayValues,
      smooth: showDelay.value ? (cutPeak.value ? 0.32 : 0.22) : 0,
      smoothMonotone: 'x' as const,
      showSymbol: false,
      connectNulls: false,
      lineStyle: { width: showDelay.value ? 1.8 : 0, color, cap: 'round' as const, join: 'round' as const },
      itemStyle: { color, opacity: showDelay.value ? 1 : 0 },
      markLine: showLoss.value && lossMarkerIndexes.length
        ? {
            silent: true,
            symbol: ['none', 'none'],
            animation: false,
            label: { show: false },
            lineStyle: {
              color,
              width: 1,
              type: 'solid' as const,
              opacity: 0.55,
            },
            data: lossMarkerIndexes.map(index => ({
              xAxis: index,
            })),
          }
        : undefined,
    }
  })

  // 颜色映射表（用于 Tooltip）
  const colorMap = new Map<number, string>()
  tasks.value.forEach((task, idx) => {
    const safeIdx = Math.max(0, idx % chartColors.length)
    colorMap.set(task.id, chartColors[safeIdx]!)
  })

  return {
    animation: chartMotionEnabled.value,
    animationDuration: chartAnimationDuration.value,
    animationDurationUpdate: chartMotionEnabled.value ? 180 : 0,
    animationEasing: 'cubicOut' as const,
    animationEasingUpdate: 'cubicOut' as const,
    // 全局颜色设置（用于图例等）
    color: tasks.value.map((_, idx) => {
      const safeIdx = Math.max(0, idx % chartColors.length)
      return chartColors[safeIdx]!
    }),
    tooltip: {
      ...baseTooltipConfig.value,
      formatter: (params: unknown) => {
        const p = params as Array<{ seriesId: string, value: number | null, dataIndex: number }>
        if (!p.length)
          return ''
        const firstParam = p[0]
        if (!firstParam)
          return ''
        const rowData = data[firstParam.dataIndex]
        if (!rowData)
          return ''

        const time = rowData.time as string
        const timeStr = formatTimeForTooltip(time, hours)
        let html = `<div style="font-weight:600;margin-bottom:6px;color:${chartThemeColors.value.textSecondary}">${timeStr}</div>`
        html += '<div style="display:flex;flex-direction:column;gap:4px">'

        // Tooltip 始终读取原始行，绝不展示绘制副本中的插值值。
        const rawItems = p
          .map((item) => {
            const task = taskById.value.get(Number(item.seriesId.replace('ping-task-', '')))
            const rawValue = task ? rowData[task.id] : null
            return {
              ...item,
              task,
              rawValue: typeof rawValue === 'number' && Number.isFinite(rawValue) ? rawValue : null,
            }
          })
          .sort((a, b) => (a.rawValue ?? Number.POSITIVE_INFINITY) - (b.rawValue ?? Number.POSITIVE_INFINITY))

        for (const item of rawItems) {
          if (item.rawValue !== null) {
            const color = item.task ? colorMap.get(item.task.id) || chartColors[0] : chartColors[0]
            const colorDot = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};margin-right:8px;flex-shrink:0"></span>`
            html += `<div style="display:flex;align-items:center">${colorDot}<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeTooltipText(item.task?.name ?? '')}</span><span style="margin-left:16px;font-weight:600;font-variant-numeric:tabular-nums">${Math.round(item.rawValue)} ms</span></div>`
          }
        }
        html += '</div>'
        return html
      },
    },
    legend: {
      type: 'scroll',
      bottom: 0,
      itemWidth: 12,
      itemHeight: 12,
      itemGap: 16,
      icon: 'roundRect',
      textStyle: { fontSize: chartAxisFontSize.value, color: chartThemeColors.value.textSecondary },
      data: taskList.map(t => String(t.id)),
      selected: Object.fromEntries(taskList.map(task => [String(task.id), selectedTaskIdSet.value.has(task.id)])),
      formatter: (name: string) => taskById.value.get(Number(name))?.name ?? name,
    },
    grid: chartMargin.value,
    xAxis: {
      type: 'category',
      data: data.map(d => formatTime(d.time as string, showDateInAxis.value)),
      axisLabel: {
        fontSize: chartAxisFontSize.value,
        color: chartThemeColors.value.textSecondary,
        margin: 12,
      },
      axisLine: {
        show: true,
        lineStyle: { color: chartThemeColors.value.borderColor, width: 1 },
      },
      axisTick: { show: false },
      boundaryGap: false,
    },
    yAxis: {
      type: 'value',
      name: '延迟 (ms)',
      scale: true,
      min: (range: { min: number, max: number }) => {
        const padding = Math.max(8, (range.max - range.min) * 0.18)
        return Math.max(0, Math.floor((range.min - padding) / 10) * 10)
      },
      max: (range: { min: number, max: number }) => {
        const padding = Math.max(8, (range.max - range.min) * 0.18)
        return Math.ceil((range.max + padding) / 10) * 10
      },
      nameTextStyle: { color: chartThemeColors.value.textSecondary },
      axisLabel: { fontSize: chartAxisFontSize.value, color: chartThemeColors.value.textSecondary, formatter: '{value}' },
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: {
        lineStyle: {
          color: chartThemeColors.value.splitLineColor,
          type: 'dashed' as const,
        },
      },
    },
    series,
  }
})

// ==================== 生命周期 ====================

watch(selectedView, () => {
  interactiveChartUpdate.value = true
  void fetchRecords()
}, { immediate: true })

watch(() => props.uuid, () => {
  remoteData.value = []
  remoteLossData.value = []
  tasks.value = []
  taskSelectionMode.value = 'all'
  requestedTaskIds.value = []
  probeDetailsOpen.value = false
  void fetchRecords()
})

function stopChartAnimation() {
  chartRef.value?.chart?.getZr().storage.traverse((element) => {
    element.stopAnimation(undefined, true)
    element.getClipPath()?.stopAnimation(undefined, true)
    element.getTextContent()?.stopAnimation(undefined, true)
  })
}

watch(motionReduced, (reduced) => {
  if (reduced)
    stopChartAnimation()
})

watch([cutPeak, showDelay, showLoss], () => {
  interactiveChartUpdate.value = true
}, { flush: 'sync' })

function refreshWhenVisible() {
  if (pingHistoryEnabled.value && pageVisible.value && componentActive.value)
    void fetchRecords({ background: true })
}

function handleVisibilityChange() {
  pageVisible.value = document.visibilityState === 'visible'
  if (!pageVisible.value)
    stopChartAnimation()
  else
    refreshWhenVisible()
}

onMounted(() => {
  refreshTimer = window.setInterval(refreshWhenVisible, PING_DIALOG_REFRESH_INTERVAL_MS)
  document.addEventListener('visibilitychange', handleVisibilityChange)
})

onActivated(() => {
  if (componentActive.value)
    return
  componentActive.value = true
  refreshTimer = window.setInterval(refreshWhenVisible, PING_DIALOG_REFRESH_INTERVAL_MS)
  refreshWhenVisible()
})

onDeactivated(() => {
  componentActive.value = false
  fetchRequestId += 1
  fetching.value = false
  loading.value = false
  backgroundRefreshing.value = false
  probeDetailsOpen.value = false
  stopChartAnimation()
  if (refreshTimer !== null)
    window.clearInterval(refreshTimer)
  refreshTimer = null
})

onUnmounted(() => {
  fetchRequestId += 1
  if (refreshTimer !== null)
    window.clearInterval(refreshTimer)
  document.removeEventListener('visibilitychange', handleVisibilityChange)
})
</script>

<template>
  <div class="lnl-ping-panel" :class="{ 'is-motion-enabled': motionEnabled }">
    <div class="lnl-ping-toolbar">
      <div class="lnl-ping-window">
        <span>OBSERVATION WINDOW</span>
        <Tabs v-if="pingHistoryEnabled" v-model="selectedView" class="w-full items-center">
          <div class="min-w-0 flex-1 overflow-x-auto pointer-events-auto">
            <TabsList class="lnl-ping-window-tabs w-max h-8 rounded-xl bg-transparent">
              <TabsTrigger
                v-for="view in availableViews" :key="view.label" :value="view.label"
                class="lnl-ping-window-tab h-7 flex-none shrink-0 rounded-lg border-none px-3 text-xs shadow-none"
              >
                {{ view.label }}
              </TabsTrigger>
            </TabsList>
          </div>
        </Tabs>
      </div>
      <div v-if="pingHistoryEnabled" class="lnl-ping-selection">
        <span>PROBES {{ selectedTaskIds.length }} / {{ tasks.length }}</span>
        <Button
          variant="ghost" size="xs" class="lnl-ping-select-action h-7 rounded-lg"
          :class="{ 'is-active': selectedTaskIds.length === tasks.length }"
          @click="showAllTasks"
        >
          全选
        </Button>
        <Button
          variant="ghost" size="xs" class="lnl-ping-select-action h-7 rounded-lg"
          :class="{ 'is-active': !selectedTaskIds.length }"
          @click="hideAllTasks"
        >
          清空
        </Button>
      </div>
    </div>

    <div v-if="!pingHistoryEnabled" class="py-8">
      <Empty description="后台未启用 Ping 历史记录" />
    </div>
    <Spinner v-else :show="loading" content-class="lnl-ping-content">
      <div v-if="error" class="text-red-500 py-8 text-center">
        {{ error }}
      </div>
      <div v-else-if="tasks.length === 0 && !loading" class="py-8">
        <Empty description="暂无延迟数据" />
      </div>

      <template v-else>
        <div class="lnl-ping-workspace">
          <aside v-if="latestValues.length > 0" class="lnl-ping-probes" aria-label="探测线路">
            <div class="lnl-ping-probes-head">
              <div>
                <span>探测线路</span>
                <small>{{ selectedTaskIds.length }} ACTIVE</small>
              </div>
              <PopoverRoot v-model:open="probeDetailsOpen">
                <PopoverTrigger as-child>
                  <Button variant="ghost" size="icon-xs" class="lnl-ping-probes-info" aria-label="查看探测线路统计说明">
                    <Icon icon="carbon:information" :width="14" :height="14" />
                  </Button>
                </PopoverTrigger>
                <PopoverPortal>
                  <PopoverContent class="z-[160]" align="end" :side-offset="8" :collision-padding="8">
                    <div class="lnl-ping-probe-details">
                      <header>
                        <strong>探测线路统计</strong>
                        <PopoverClose as-child>
                          <button type="button" aria-label="关闭探测线路统计">
                            ×
                          </button>
                        </PopoverClose>
                      </header>
                      <p>卡片保留当前延迟与统计窗口丢包率；点击卡片可启停对应线路。</p>
                      <div v-for="task in latestValues" :key="task.id" class="lnl-ping-probe-detail">
                        <strong>{{ task.name }}</strong>
                        <span>{{ task.type?.toUpperCase() || 'PING' }} · {{ task.interval || 60 }}s</span>
                        <span>均值 {{ task.avg !== undefined ? `${Math.round(task.avg)}ms` : '—' }}</span>
                        <span>范围 {{ task.min !== undefined && task.max !== undefined ? `${Math.round(task.min)}–${Math.round(task.max)}ms` : '—' }}</span>
                        <span>JIT {{ task.p99_p50_ratio !== undefined ? task.p99_p50_ratio.toFixed(2) : '—' }}</span>
                      </div>
                      <p v-if="latestValues.some(task => task.lossApproximate)" class="text-muted-foreground">
                        ≈ 表示丢包率由延迟缺失样本近似推算；真实丢包指标可用后会自动切换。
                      </p>
                    </div>
                  </PopoverContent>
                </PopoverPortal>
              </PopoverRoot>
            </div>
            <div class="lnl-ping-probe-list">
              <button
                v-for="(task, taskIndex) in latestValues" :key="task.id"
                type="button"
                class="lnl-ping-probe"
                :class="{ 'is-disabled': !selectedTaskIdSet.has(task.id) }"
                :style="{ '--lnl-probe-index': Math.min(taskIndex, 5) }"
                :aria-pressed="selectedTaskIdSet.has(task.id)"
                :data-ping-task-id="task.id"
                :aria-label="`${task.name}，延迟 ${formatProbeLatency(task)} 毫秒，丢包 ${formatProbeLoss(task)}`"
                @click="toggleTask(task.id)"
              >
                <div class="lnl-ping-probe-copy">
                  <i :style="{ backgroundColor: task.color }" aria-hidden="true" />
                  <strong>{{ task.name }}</strong>
                  <span class="lnl-ping-probe-check" aria-hidden="true">{{ selectedTaskIdSet.has(task.id) ? '✓' : '' }}</span>
                </div>
                <div class="lnl-ping-probe-value">
                  <strong>{{ formatProbeLatency(task) }}</strong>
                  <small>ms</small>
                </div>
                <div class="lnl-ping-probe-meta">
                  <span>丢包 {{ formatProbeLoss(task) }}</span>
                </div>
              </button>
            </div>
          </aside>

          <section class="lnl-ping-plot" aria-label="延迟时间线">
            <div class="lnl-ping-plot-head">
              <div>
                <span>LATENCY TIMELINE</span>
                <strong>网络质量时间线</strong>
              </div>
              <div class="lnl-ping-plot-actions">
                <span
                  class="lnl-ping-live-state"
                  :class="{ 'is-refreshing': backgroundRefreshing, 'is-stale': refreshError }"
                  :title="lastUpdatedAt ? `最近更新：${dayjs(lastUpdatedAt).format('HH:mm:ss')}` : '等待首批数据'"
                >
                  <i /> {{ refreshError ? '连接重试' : backgroundRefreshing ? '实时同步' : '实时' }}
                </span>
                <Button variant="ghost" size="xs" class="lnl-ping-chart-action h-7 rounded-lg" :class="{ 'is-active': showDelay }" @click="showDelay = !showDelay">
                  延迟
                </Button>
                <Button variant="ghost" size="xs" class="lnl-ping-chart-action h-7 rounded-lg" :class="{ 'is-active': showLoss }" @click="showLoss = !showLoss">
                  丢包
                </Button>
                <Button variant="ghost" size="xs" class="lnl-ping-chart-action h-7 rounded-lg" :class="{ 'is-active': cutPeak }" @click="cutPeak = !cutPeak">
                  平滑
                </Button>
                <DataTooltip portal placement="bottom" :width="272" :content-class="pickSurfaceClass('text-[11px] leading-relaxed', 'text-[11px] leading-relaxed backdrop-blur-xl')">
                  <Button variant="ghost" size="icon-xs" class="text-slate-500" aria-label="查看 Ping 平滑算法说明">
                    <Icon icon="carbon:information" :width="14" :height="14" />
                  </Button>
                  <template #content>
                    <span>Komari 1.4.2 及后续版本在最近 10 分钟保留精确样本，更长窗口由服务端分钟汇总。开启“平滑”只对连续有效片段应用 Hampel + EWMA；图表可在 1–2 个采样周期的短缺口间绘制展示线，长断线仍保持断开。原始统计、Tooltip、丢包标记和节点质量色块均不使用插值值。</span>
                  </template>
                </DataTooltip>
              </div>
            </div>
            <div class="lnl-ping-chart">
              <ChartViewport class="!h-full !min-h-full">
                <VChart ref="chartRef" :option="pingChartOption" :update-options="{ notMerge: false, replaceMerge: ['series'] }" autoresize @legendselectchanged="handleLegendSelection" />
              </ChartViewport>
            </div>
          </section>
        </div>
      </template>
    </Spinner>
  </div>
</template>

<style scoped>
.lnl-ping-panel {
  position: relative;
  overflow: hidden;
  border-radius: var(--lnl-radius-card);
  border: 1px solid color-mix(in srgb, var(--lnl-line) 92%, var(--foreground) 8%);
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--lnl-green) 3%, transparent), transparent 42%),
    color-mix(in srgb, var(--lnl-surface-base, var(--background)) 97%, var(--lnl-surface));
  box-shadow: var(--lnl-shadow-soft);
}
.lnl-ping-panel::before {
  position: absolute;
  z-index: 0;
  top: 0;
  right: 0;
  width: 84px;
  height: 1px;
  background: var(--lnl-green);
  content: '';
  opacity: 0.75;
}
.lnl-ping-panel > * {
  position: relative;
  z-index: 1;
}
.lnl-ping-panel.is-motion-enabled .lnl-ping-toolbar {
  animation: ping-section-in 360ms cubic-bezier(0.22, 1, 0.36, 1) both;
}
.lnl-ping-panel.is-motion-enabled .lnl-ping-probes-head {
  animation: ping-section-in 420ms 70ms cubic-bezier(0.22, 1, 0.36, 1) both;
}
.lnl-ping-panel.is-motion-enabled .lnl-ping-probe {
  animation: ping-section-in 440ms calc(100ms + var(--lnl-probe-index, 0) * 55ms) cubic-bezier(0.22, 1, 0.36, 1) both;
}
.lnl-ping-panel.is-motion-enabled .lnl-ping-plot-head {
  animation: ping-section-in 440ms 180ms cubic-bezier(0.22, 1, 0.36, 1) both;
}
.lnl-ping-panel.is-motion-enabled .lnl-ping-chart {
  animation: ping-chart-in 560ms 230ms cubic-bezier(0.16, 1, 0.3, 1) both;
}
@keyframes ping-section-in {
  from {
    opacity: 0;
    transform: translateY(9px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
@keyframes ping-chart-in {
  from {
    opacity: 0;
    transform: translateY(12px) scale(0.992);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
.lnl-ping-toolbar {
  display: flex;
  min-height: 60px;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 9px 12px 8px;
  border-bottom: 1px solid var(--lnl-line);
  background: color-mix(in srgb, var(--lnl-surface-inner, var(--lnl-surface)) 72%, transparent);
}
.lnl-ping-window {
  min-width: 0;
}
.lnl-ping-window > span,
.lnl-ping-selection > span,
.lnl-ping-plot-head span {
  display: block;
  color: var(--lnl-green);
  font: 8px/1.4 var(--font-mono);
  letter-spacing: 0.14em;
}
.lnl-ping-window-tabs {
  margin-top: 2px;
}
.lnl-ping-window-tab[data-state='active'] {
  color: var(--lnl-green);
  background: color-mix(in srgb, var(--lnl-green) 10%, transparent);
}
.lnl-ping-window-tab:focus-visible,
.lnl-ping-select-action:focus-visible,
.lnl-ping-chart-action:focus-visible,
.lnl-ping-probes-info:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--lnl-green) 48%, transparent);
  outline-offset: 1px;
}
.lnl-ping-selection {
  display: flex;
  align-items: center;
  gap: 7px;
  flex: none;
}
.lnl-ping-selection > span {
  margin-right: 4px;
  color: var(--muted-foreground);
}
.lnl-ping-select-action {
  border: 1px solid color-mix(in srgb, var(--lnl-green) 18%, var(--lnl-line));
}
.lnl-ping-select-action.is-active {
  color: var(--lnl-green);
  background: color-mix(in srgb, var(--lnl-green) 7%, transparent);
}
.lnl-ping-chart-action.is-active {
  color: var(--lnl-green);
  background: color-mix(in srgb, var(--lnl-green) 7%, transparent);
}
.lnl-ping-content {
  min-height: 390px;
}
.lnl-ping-workspace {
  display: flex;
  min-height: 0;
  flex-direction: column;
}
.lnl-ping-probes {
  display: flex;
  flex-direction: column;
  min-width: 0;
  border-bottom: 1px solid var(--lnl-line);
  padding: 8px;
  gap: 8px;
  background: transparent;
}
.lnl-ping-probes-head {
  display: flex;
  min-height: 44px;
  align-items: center;
  justify-content: space-between;
  flex-direction: row;
  gap: 6px;
  padding: 0 4px;
  font-family: var(--font-display);
  font-size: 13px;
  font-weight: 650;
}
.lnl-ping-probes-head > div:first-child::before {
  display: none;
  color: var(--lnl-green);
  font: 8px/1.2 var(--font-mono);
  letter-spacing: 0.14em;
  content: 'PROBE MATRIX';
}
.lnl-ping-probes-head small {
  display: inline-block;
  margin-left: 8px;
  color: var(--lnl-green);
  font: 8px/1.3 var(--font-mono);
  letter-spacing: 0.1em;
}
.lnl-ping-probes-info {
  flex: none;
  min-width: 44px;
  min-height: 44px;
  color: var(--muted-foreground);
}
.lnl-ping-probe-details {
  z-index: 160;
  width: min(320px, calc(100vw - 16px));
  max-height: min(440px, calc(100dvh - 24px), var(--reka-popper-available-height, 440px));
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 12px;
  border: 1px solid var(--lnl-line);
  border-radius: var(--lnl-radius-inner);
  background: var(--popover);
  color: var(--foreground);
  box-shadow: var(--lnl-shadow-soft);
  font: 12px/1.6 var(--font-sans);
}
.lnl-ping-probe-details > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.lnl-ping-probe-details > header button {
  min-width: 44px;
  min-height: 44px;
  border-radius: var(--lnl-radius-control);
  cursor: pointer;
  font-size: 24px;
}
.lnl-ping-probe-details > header button:focus-visible {
  outline: 2px solid var(--lnl-green);
  outline-offset: -2px;
}
.lnl-ping-probe-details > p {
  margin-bottom: 8px;
  color: var(--muted-foreground);
}
.lnl-ping-probe-detail {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 2px 10px;
  padding-top: 7px;
  border-top: 1px solid var(--lnl-line);
}
.lnl-ping-probe-detail strong {
  grid-column: 1 / -1;
  overflow-wrap: anywhere;
}
.lnl-ping-probe-detail span {
  color: var(--muted-foreground);
}
.lnl-ping-probe-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(160px, 100%), 1fr));
  align-items: start;
  min-width: 0;
  gap: 8px;
}
.lnl-ping-probe {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  grid-template-rows: auto auto;
  width: 100%;
  max-width: 200px;
  min-width: 0;
  gap: 7px 8px;
  min-height: 64px;
  align-items: center;
  padding: 9px 10px;
  border: 1px solid color-mix(in srgb, var(--lnl-green) 28%, var(--lnl-line));
  border-radius: var(--lnl-radius-inner);
  background: color-mix(in srgb, var(--lnl-green) 5%, var(--lnl-surface-base, var(--background)));
  cursor: pointer;
  color: inherit;
  text-align: left;
  appearance: none;
  transition:
    background-color 180ms ease,
    border-color 140ms ease,
    box-shadow 140ms ease;
}
.lnl-ping-probe:focus-visible {
  outline: 2px solid var(--lnl-green);
  outline-offset: -2px;
}
.lnl-ping-probe:active {
  background: color-mix(in srgb, var(--lnl-green) 13%, var(--lnl-surface-inner));
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--lnl-green) 35%, transparent);
}
@media (hover: hover) and (pointer: fine) {
  .lnl-ping-probe:hover {
    border-color: var(--lnl-green);
  }
}
.lnl-ping-probe.is-disabled {
  border-color: var(--lnl-line);
  background: transparent;
}
.lnl-ping-probe-copy {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: 6px minmax(0, 1fr) 12px;
  gap: 6px;
  align-items: start;
  min-width: 0;
}
.lnl-ping-probe-copy i {
  width: 6px;
  height: 6px;
  margin-top: 5px;
  border-radius: 50%;
}
.lnl-ping-probe-check {
  color: var(--lnl-green);
  font-size: 12px;
}
.lnl-ping-probe-copy strong {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow-wrap: anywhere;
  font-size: 12px;
  line-height: 1.3;
}
.lnl-ping-probe-value small,
.lnl-ping-probe-meta {
  color: var(--muted-foreground);
  font: 11px/1.3 var(--font-sans);
  font-variant-numeric: tabular-nums;
}
.lnl-ping-probe-value {
  display: flex;
  align-items: baseline;
  gap: 3px;
  color: var(--foreground);
  font-family: var(--font-sans);
  font-variant-numeric: tabular-nums;
}
.lnl-ping-probe-value strong {
  font-size: 16px;
}
.lnl-ping-probe-meta {
  grid-column: 2;
  justify-self: end;
  display: flex;
  gap: 10px;
}
.lnl-ping-plot {
  min-width: 0;
  display: flex;
  min-height: 0;
  flex-direction: column;
  margin: 8px;
  overflow: hidden;
  border: 1px solid var(--lnl-line);
  border-radius: var(--lnl-radius-inner);
  background: color-mix(in srgb, var(--lnl-surface-base, var(--background)) 94%, transparent);
}
.lnl-ping-plot-head {
  display: flex;
  min-height: 54px;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 8px 14px;
  border-bottom: 1px solid var(--lnl-line);
  background: linear-gradient(90deg, color-mix(in srgb, var(--lnl-green) 4%, transparent), transparent 38%);
}
.lnl-ping-plot-head strong {
  display: block;
  margin-top: 2px;
  font-family: var(--font-display);
  font-size: 15px;
}
.lnl-ping-plot-actions {
  display: flex;
  align-items: center;
  gap: 2px;
}
.lnl-ping-live-state {
  display: inline-flex !important;
  align-items: center;
  gap: 5px;
  margin-right: 5px;
  color: var(--muted-foreground) !important;
  font-size: 8px !important;
  letter-spacing: 0.1em !important;
  white-space: nowrap;
}
.lnl-ping-live-state i {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--lnl-green);
  box-shadow: 0 0 8px color-mix(in srgb, var(--lnl-green) 60%, transparent);
}
.lnl-ping-live-state.is-refreshing i {
  animation: ping-live-pulse 720ms ease-in-out infinite alternate;
}
.lnl-ping-live-state.is-stale {
  color: var(--destructive) !important;
}
.lnl-ping-live-state.is-stale i {
  background: var(--destructive);
  box-shadow: none;
}
.lnl-ping-chart {
  min-height: 330px;
  height: clamp(330px, 42dvh, 420px);
  flex: none;
  padding: 6px 10px 10px;
  border-radius: 0 0 var(--lnl-radius-inner) var(--lnl-radius-inner);
  background: linear-gradient(180deg, color-mix(in srgb, var(--lnl-green) 2.5%, transparent), transparent 48%);
}
.lnl-ping-chart :deep(.echarts) {
  width: 100%;
  height: 100%;
}
:global(.dark) .lnl-ping-panel {
  border-color: color-mix(in srgb, var(--lnl-line-strong) 78%, transparent);
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--lnl-green) 2%, transparent), transparent 44%),
    var(--lnl-surface-base);
  box-shadow: 0 20px 60px rgb(0 0 0 / 28%);
}
:global(.dark) .lnl-ping-toolbar,
:global(.dark) .lnl-ping-probes {
  background: color-mix(in srgb, var(--lnl-surface-inner) 78%, transparent);
}
:global(.dark) .lnl-ping-probes-head,
:global(.dark) .lnl-ping-probe {
  border-color: color-mix(in srgb, var(--lnl-line-strong) 62%, transparent);
  background: var(--lnl-surface-raised);
  box-shadow: inset 0 1px rgb(255 255 255 / 2%);
}
:global(.dark) .lnl-ping-plot {
  border-color: color-mix(in srgb, var(--lnl-line-strong) 68%, transparent);
  background: var(--lnl-surface-base);
}
@media (max-width: 820px) {
  .lnl-ping-toolbar {
    align-items: stretch;
    flex-direction: column;
    gap: 6px;
    padding-inline: 8px;
  }
  .lnl-ping-selection,
  .lnl-ping-plot-actions {
    justify-content: flex-start;
  }
  .lnl-ping-selection {
    overflow-x: auto;
  }
  .lnl-ping-probes {
    display: block;
    border-radius: var(--lnl-radius-inner);
  }
  .lnl-ping-probes-head {
    min-height: 42px;
    align-items: center;
    justify-content: space-between;
    flex-direction: row;
    padding: 7px 10px;
    border-right: 0;
    border-bottom: 1px solid var(--lnl-line);
  }
  .lnl-ping-probes-head > div:first-child::before {
    display: none;
  }
  .lnl-ping-plot-head {
    min-height: 72px;
    align-items: flex-start;
    flex-direction: column;
    gap: 5px;
    padding: 8px 10px;
  }
  .lnl-ping-plot-actions {
    width: 100%;
    flex-wrap: wrap;
    overflow: visible;
  }
  .lnl-ping-chart {
    min-height: 260px;
    height: clamp(260px, 38dvh, 320px);
    padding-inline: 2px;
  }
}

@media (max-width: 640px) {
  .lnl-ping-panel {
    border-radius: var(--lnl-radius-inner);
  }

  .lnl-ping-toolbar {
    min-height: 0;
    padding: 6px;
  }

  .lnl-ping-window > span,
  .lnl-ping-selection > span,
  .lnl-ping-probes-head > div:first-child::before {
    display: none;
  }

  .lnl-ping-selection {
    gap: 5px;
  }

  .lnl-ping-probes {
    padding: 5px;
  }

  .lnl-ping-probes-head {
    min-height: 34px;
    padding: 4px 7px;
  }

  .lnl-ping-probe-list {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px;
    padding: 2px 1px 1px;
    overflow: visible;
  }

  .lnl-ping-probe {
    grid-template-columns: minmax(0, 1fr) auto;
    width: 100%;
    min-width: 0;
    min-height: 60px;
    max-width: none;
    gap: 6px;
    padding: 7px;
  }

  .lnl-ping-probe-copy strong {
    display: -webkit-box;
    overflow: hidden;
    font-size: 12px;
    line-height: 1.25;
    text-overflow: unset;
    white-space: normal;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }

  .lnl-ping-probe-value small,
  .lnl-ping-probe-meta {
    font-size: 10px;
  }

  .lnl-ping-probe-value strong {
    font-size: 16px;
  }

  .lnl-ping-probe-meta {
    gap: 7px;
  }

  .lnl-ping-probes-info {
    width: 44px;
    height: 44px;
  }

  .lnl-ping-plot {
    margin: 5px;
  }

  .lnl-ping-plot-head {
    min-height: 60px;
    padding: 6px 8px;
  }

  .lnl-ping-chart {
    padding: 2px 0 6px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .lnl-ping-panel.is-motion-enabled
    :is(.lnl-ping-toolbar, .lnl-ping-probes-head, .lnl-ping-probe, .lnl-ping-plot-head, .lnl-ping-chart) {
    animation: none;
  }
}
@keyframes ping-live-pulse {
  to {
    opacity: 0.32;
    transform: scale(0.72);
  }
}
</style>
