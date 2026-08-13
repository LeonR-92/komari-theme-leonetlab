<script setup lang="ts">
import { Icon } from '@iconify/vue'
import dayjs from 'dayjs'
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import VChart from 'vue-echarts'
import { Button } from '@/components/ui/button'
import { DataTooltip } from '@/components/ui/data-tooltip'
import { Empty } from '@/components/ui/empty'
import { Spinner } from '@/components/ui/spinner'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useBackgroundSurface } from '@/composables/useBackgroundSurface'
import { useMotionPreference } from '@/composables/useMotionPreference'
import { useAppStore } from '@/stores/app'
import { isMobileLike } from '@/utils/mobilePerf'
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
// ECharts 动画在移动端关闭：图表动画是持续 GPU/CPU 负载，移动端只保留 CSS 入场。
const chartMotionEnabled = computed(() => motionEnabled.value && !isMobileLike)
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
const maxPingRecordPreserveTime = computed(() => appStore.publicSettings?.ping_record_preserve_time || 168)

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
  if (firstView && !selectedView.value) {
    selectedView.value = firstView.label
  }
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
  loss: number
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

// 任务选择
const selectedTaskIds = ref<number[]>([])
/** 用户手动清空选择标记：置位后 30 秒后台轮询不再自动恢复全选 */
const userClearedSelection = ref(false)
const cutPeak = ref(false)
const showDelay = ref(true)
const showLoss = ref(true)
const chartMargin = { top: 30, right: 24, bottom: 52, left: 56 }

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

// 官方 metric store 未初始化错误消息的识别模式（模块作用域，避免重复编译）
const METRIC_STORE_ERROR_PATTERN = /metric store/i

function canFallbackToLegacyRecords(err: unknown): boolean {
  if (isMethodNotFoundError(err))
    return true
  if (!(err instanceof RpcError))
    return false
  if (err.code === -32602)
    return true
  // 官方 public:queryMetrics 在 metric store 初始化失败时返回
  // InternalError(-32603) "metric store not initialized"；仅该场景回退到
  // common:getRecords，其它 -32603 内部错误继续上抛，不静默吞掉。
  return err.code === -32603 && METRIC_STORE_ERROR_PATTERN.test(err.message)
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
  for (const series of metricResult?.series ?? []) {
    for (const point of series.points ?? []) {
      const taskId = getMetricTaskId(series, point)
      if (taskId === null)
        continue

      if (point.value === null)
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

  const metricTasks = (statsResult?.stats ?? []).map(task => ({
    id: Number(task.task_id),
    weight: taskWeights.get(Number(task.task_id)),
    name: task.name || `Ping ${task.task_id}`,
    interval: task.interval ?? 60,
    loss: Number.isFinite(task.loss) ? task.loss : 0,
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

  return {
    records: result?.records ?? [],
    lossPoints: (result?.records ?? [])
      .filter(record => record.value < 0)
      .map(record => ({ task_id: record.task_id, time: record.time, loss: 1 })),
    tasks: (result?.tasks ?? [])
      .map(task => ({ ...task, weight: task.weight ?? taskWeights.get(task.id) }))
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
    pingTaskWeightCache = new Map((publicTasks ?? [])
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
  if (!props.uuid)
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

    remoteData.value = records
    remoteLossData.value = result.lossPoints
    tasks.value = result.tasks
    refreshError.value = false
    lastUpdatedAt.value = Date.now()

    // 仅在用户未手动清空时自动全选；后台轮询不得撤销「清空」操作
    if (tasks.value.length > 0 && selectedTaskIds.value.length === 0 && !userClearedSelection.value) {
      selectedTaskIds.value = tasks.value.map(t => t.id)
    }
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
function getTaskColor(taskId: number): string {
  const taskIndex = tasks.value.findIndex(t => t.id === taskId)
  const safeIndex = Math.max(0, taskIndex % chartColors.length)
  return chartColors[safeIndex]!
}

// 最新值统计（从服务端 tasks 获取，保持颜色顺序）
const latestValues = computed(() => {
  if (!tasks.value.length)
    return []

  const latestMap = new Map<number, number | null>()
  for (const task of tasks.value) {
    for (let i = remoteData.value.length - 1; i >= 0; i--) {
      const rec = remoteData.value[i]
      if (rec && rec.task_id === task.id && rec.value >= 0) {
        latestMap.set(task.id, rec.value)
        break
      }
    }
  }

  return tasks.value.map((task, idx) => {
    const safeIdx = Math.max(0, idx % chartColors.length)
    return {
      ...task,
      latestValue: latestMap.get(task.id) ?? null,
      color: chartColors[safeIdx]!,
    }
  })
})

const selectedTasks = computed(() => {
  return tasks.value.filter(t => selectedTaskIds.value.includes(t.id))
})

const packetLossMarkers = computed(() => {
  const data = mergedData.value
  const markers = new Map<number, number[]>()

  if (!data.length || !selectedTasks.value.length)
    return markers

  const chartTimes = data.map(item => dayjs(item.time as string).valueOf())
  const toleranceMs = mergeToleranceMs.value

  for (const task of selectedTasks.value) {
    const points = new Set<number>()
    const taskLossRecords = remoteLossData.value.filter(rec => rec.task_id === task.id && rec.loss > 0)

    for (const record of taskLossRecords) {
      const lossTs = dayjs(record.time).valueOf()
      let matchedIndex = -1

      for (let i = 0; i < chartTimes.length; i++) {
        const chartTs = chartTimes[i]
        if (chartTs === undefined)
          continue

        if (Math.abs(chartTs - lossTs) <= toleranceMs) {
          matchedIndex = i
          break
        }
      }

      if (matchedIndex >= 0) {
        points.add(matchedIndex)
      }
    }

    markers.set(task.id, Array.from(points).sort((a, b) => a - b))
  }

  return markers
})

// 切换任务选中状态
function toggleTask(taskId: number) {
  if (selectedTaskIds.value.includes(taskId)) {
    selectedTaskIds.value = selectedTaskIds.value.filter(id => id !== taskId)
  }
  else {
    // 重新勾选任意任务视为撤销「清空」意图
    userClearedSelection.value = false
    selectedTaskIds.value = [...selectedTaskIds.value, taskId]
  }
}

function showAllTasks() {
  userClearedSelection.value = false
  selectedTaskIds.value = tasks.value.map(t => t.id)
}

function hideAllTasks() {
  // 记录用户手动清空意图，阻止后台轮询自动恢复全选
  userClearedSelection.value = true
  selectedTaskIds.value = []
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
  const taskList = selectedTasks.value
  const data = chartData.value
  const hours = selectedHours.value

  // 构建 series，确保颜色与卡片一致
  const series = taskList.map((task) => {
    const color = getTaskColor(task.id)
    const lossMarkerIndexes = packetLossMarkers.value.get(task.id) || []
    const rawValues = data.map(d => d[task.id] as number | null ?? null)
    const displayValues = bridgeShortDisplayGaps(rawValues, 2)
    return {
      name: task.name,
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
    animationDuration: 560,
    animationDurationUpdate: 240,
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
        const p = params as Array<{ seriesName: string, value: number | null, dataIndex: number }>
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
            const task = tasks.value.find(t => t.name === item.seriesName)
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
            html += `<div style="display:flex;align-items:center">${colorDot}<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${item.seriesName}</span><span style="margin-left:auto;font-weight:600;margin-left:16px;font-variant-numeric:tabular-nums">${Math.round(item.rawValue)} ms</span></div>`
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
      textStyle: { fontSize: 11, color: chartThemeColors.value.textSecondary },
      data: taskList.map(t => t.name),
    },
    grid: chartMargin,
    xAxis: {
      type: 'category',
      data: data.map(d => formatTime(d.time as string, showDateInAxis.value)),
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
      axisLabel: { fontSize: 11, color: chartThemeColors.value.textSecondary, formatter: '{value}' },
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
  // 切换时间窗：清除手动清空标记并重新自动全选
  userClearedSelection.value = false
  selectedTaskIds.value = []
  void fetchRecords()
}, { immediate: true })

watch(() => props.uuid, () => {
  remoteData.value = []
  remoteLossData.value = []
  tasks.value = []
  // 切换节点：清除手动清空标记并重新自动全选
  userClearedSelection.value = false
  selectedTaskIds.value = []
  void fetchRecords()
})

function refreshWhenVisible() {
  if (document.visibilityState === 'visible')
    void fetchRecords({ background: true })
}

onMounted(() => {
  refreshTimer = window.setInterval(refreshWhenVisible, PING_DIALOG_REFRESH_INTERVAL_MS)
  document.addEventListener('visibilitychange', refreshWhenVisible)
})

onUnmounted(() => {
  fetchRequestId += 1
  if (refreshTimer !== null)
    window.clearInterval(refreshTimer)
  document.removeEventListener('visibilitychange', refreshWhenVisible)
})
</script>

<template>
  <div class="lnl-ping-panel" :class="{ 'is-motion-enabled': motionEnabled }">
    <div class="lnl-ping-toolbar">
      <div class="lnl-ping-window">
        <span>OBSERVATION WINDOW</span>
        <Tabs v-model="selectedView" class="w-full items-center">
          <div class="min-w-0 flex-1 overflow-x-auto pointer-events-auto">
            <TabsList class="lnl-ping-window-tabs w-max h-8 rounded-xl bg-transparent">
              <TabsTrigger
                v-for="view in availableViews" :key="view.label" :value="view.label"
                class="h-7 flex-none shrink-0 rounded-lg border-none px-3 text-xs shadow-none data-[state=active]:bg-emerald-500/10 data-[state=active]:text-emerald-600"
              >
                {{ view.label }}
              </TabsTrigger>
            </TabsList>
          </div>
        </Tabs>
      </div>
      <div class="lnl-ping-selection">
        <span>PROBES {{ selectedTaskIds.length }} / {{ tasks.length }}</span>
        <Button
          variant="ghost" size="xs" class="h-7 rounded-lg border border-emerald-600/15"
          :class="[selectedTaskIds.length === tasks.length && '!text-emerald-600']"
          @click="showAllTasks"
        >
          全选
        </Button>
        <Button
          variant="ghost" size="xs" class="h-7 rounded-lg border border-emerald-600/15"
          :class="[!selectedTaskIds.length && '!text-emerald-600']"
          @click="hideAllTasks"
        >
          清空
        </Button>
      </div>
    </div>

    <Spinner :show="loading" content-class="lnl-ping-content">
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
              <span>探测线路</span>
              <small>{{ selectedTaskIds.length }} ACTIVE</small>
            </div>
            <div class="lnl-ping-probe-list">
              <div
                v-for="(task, taskIndex) in latestValues" :key="task.id"
                role="button" tabindex="0"
                class="lnl-ping-probe"
                :class="{ 'is-disabled': !selectedTaskIds.includes(task.id) }"
                :style="{ '--lnl-probe-index': taskIndex }"
                @click="toggleTask(task.id)"
                @keydown.enter.prevent="toggleTask(task.id)"
                @keydown.space.prevent="toggleTask(task.id)"
              >
                <i :style="{ backgroundColor: task.color }" />
                <div class="lnl-ping-probe-copy">
                  <strong>{{ task.name }}</strong>
                  <small>{{ task.type?.toUpperCase() || 'PING' }} · {{ task.interval || 60 }}s</small>
                </div>
                <div class="lnl-ping-probe-value">
                  <strong>{{ task.latestValue !== null ? Math.round(task.latestValue) : task.avg !== undefined ? Math.round(task.avg) : '-' }}</strong>
                  <small>ms</small>
                </div>
                <div class="lnl-ping-probe-meta">
                  <span>LOSS{{ task.lossApproximate ? '≈' : '' }} {{ Number.isFinite(task.loss) ? task.loss.toFixed(2) : '0.00' }}%</span>
                  <span v-if="task.p99_p50_ratio !== undefined">JIT {{ task.p99_p50_ratio.toFixed(2) }}</span>
                </div>
                <DataTooltip portal placement="top" content-class="!rounded-xl p-3 w-64">
                  <Button variant="ghost" size="icon-xs" class="lnl-ping-probe-info" @click.stop>
                    <Icon icon="carbon:information" :width="14" :height="14" />
                  </Button>
                  <template #content>
                    <div class="space-y-1.5 text-xs leading-relaxed">
                      <p>每条探测线路按任务周期上报时延与丢包；行内 LOSS 为统计窗口丢包率，JIT 为 P99/P50 抖动比值。</p>
                      <p class="text-muted-foreground">
                        数值随最近统计窗口滚动更新，点按该行可启停此线路。
                      </p>
                      <p v-if="task.lossApproximate" class="text-muted-foreground">
                        当前丢包率由延迟缺失样本近似推算；真实丢包指标可用后会自动切换。
                      </p>
                    </div>
                  </template>
                </DataTooltip>
              </div>
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
                <Button variant="ghost" size="xs" class="h-7 rounded-lg" :class="[showDelay && '!text-emerald-600']" @click="showDelay = !showDelay">
                  延迟
                </Button>
                <Button variant="ghost" size="xs" class="h-7 rounded-lg" :class="[showLoss && '!text-emerald-600']" @click="showLoss = !showLoss">
                  丢包
                </Button>
                <Button variant="ghost" size="xs" class="h-7 rounded-lg" :class="[cutPeak && '!text-emerald-600']" @click="cutPeak = !cutPeak">
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
              <VChart :option="pingChartOption" autoresize />
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
.lnl-ping-content {
  min-height: 390px;
}
.lnl-ping-workspace {
  display: flex;
  min-height: 0;
  flex-direction: column;
}
.lnl-ping-probes {
  display: grid;
  grid-template-columns: 150px minmax(0, 1fr);
  min-width: 0;
  border-bottom: 1px solid var(--lnl-line);
  padding: 8px;
  gap: 8px;
  background: color-mix(in srgb, var(--lnl-surface-inner, var(--lnl-surface)) 74%, transparent);
  border-radius: var(--lnl-radius-inner);
}
.lnl-ping-probes-head {
  display: flex;
  min-height: 88px;
  align-items: flex-start;
  justify-content: center;
  flex-direction: column;
  gap: 6px;
  padding: 12px 14px;
  border-right: 1px solid var(--lnl-line);
  border-radius: var(--lnl-radius-inner);
  background: color-mix(in srgb, var(--lnl-surface-raised, var(--card)) 88%, transparent);
  font-family: var(--font-display);
  font-size: 13px;
  font-weight: 650;
}
.lnl-ping-probes-head::before {
  color: var(--lnl-green);
  font: 8px/1.2 var(--font-mono);
  letter-spacing: 0.14em;
  content: 'PROBE MATRIX';
}
.lnl-ping-probes-head small {
  color: var(--lnl-green);
  font: 8px/1.3 var(--font-mono);
  letter-spacing: 0.1em;
}
.lnl-ping-probe-list {
  display: flex;
  min-width: 0;
  overflow-x: auto;
  overscroll-behavior-inline: contain;
  gap: 8px;
}
.lnl-ping-probe {
  position: relative;
  display: grid;
  grid-template-columns: 4px minmax(0, 1fr) auto auto;
  grid-template-rows: auto auto;
  width: clamp(240px, 31vw, 330px);
  min-width: 240px;
  gap: 3px 9px;
  min-height: 88px;
  align-items: center;
  padding: 12px;
  border: 1px solid color-mix(in srgb, var(--lnl-line) 82%, transparent);
  border-radius: var(--lnl-radius-inner);
  background: color-mix(in srgb, var(--lnl-surface-raised, var(--card)) 90%, transparent);
  cursor: pointer;
  transition:
    background-color 180ms ease,
    opacity 180ms ease,
    box-shadow 180ms ease;
}
.lnl-ping-probe:hover,
.lnl-ping-probe:focus-visible {
  background: color-mix(in srgb, var(--lnl-green) 6%, transparent);
  box-shadow: inset 0 -2px color-mix(in srgb, var(--lnl-green) 54%, transparent);
  outline: none;
}
.lnl-ping-probe.is-disabled {
  opacity: 0.34;
}
.lnl-ping-probe > i {
  grid-row: 1 / 3;
  width: 4px;
  height: 40px;
  box-shadow: 0 0 12px currentColor;
}
.lnl-ping-probe-copy {
  min-width: 0;
}
.lnl-ping-probe-copy strong,
.lnl-ping-probe-copy small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.lnl-ping-probe-copy strong {
  font-size: 13px;
}
.lnl-ping-probe-copy small,
.lnl-ping-probe-value small,
.lnl-ping-probe-meta {
  color: var(--muted-foreground);
  font: 8px/1.4 var(--font-mono);
  letter-spacing: 0.05em;
}
.lnl-ping-probe-value {
  display: flex;
  align-items: baseline;
  gap: 3px;
  color: var(--foreground);
  font-family: var(--font-mono);
}
.lnl-ping-probe-value strong {
  font-size: 19px;
}
.lnl-ping-probe-meta {
  grid-column: 2 / 4;
  display: flex;
  gap: 10px;
}
.lnl-ping-probe-info {
  grid-row: 1 / 3;
  color: var(--muted-foreground);
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
  .lnl-ping-probes-head::before {
    display: none;
  }
  .lnl-ping-probe-list {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(98px, 1fr));
    overflow: visible;
  }
  .lnl-ping-probe {
    grid-template-columns: 3px minmax(0, 1fr) auto auto;
    width: auto;
    min-width: 0;
    min-height: 78px;
    gap: 2px 5px;
    padding: 8px 7px;
    border: 1px solid var(--lnl-line);
    border-radius: var(--lnl-radius-control);
  }
  .lnl-ping-probe > i {
    width: 3px;
    height: 34px;
  }
  .lnl-ping-probe-copy strong {
    font-size: 12px;
  }
  .lnl-ping-probe-copy small {
    font-size: 7px;
  }
  .lnl-ping-probe-value {
    gap: 2px;
  }
  .lnl-ping-probe-value strong {
    font-size: 16px;
  }
  .lnl-ping-probe-value small,
  .lnl-ping-probe-meta {
    font-size: 7px;
  }
  .lnl-ping-probe-meta {
    gap: 4px;
  }
  .lnl-ping-probe-info {
    width: 22px;
    height: 22px;
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
    min-height: 300px;
    height: 300px;
    padding-inline: 2px;
  }
}
@media (max-width: 520px) {
  .lnl-ping-probe-meta span:nth-child(2) {
    display: none;
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
