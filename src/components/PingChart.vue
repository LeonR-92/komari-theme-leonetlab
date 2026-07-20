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
import { useAppStore } from '@/stores/app'
import { cutPeakValues, interpolateNullsLinear } from '@/utils/recordHelper'
import { getSharedRpc, RpcError } from '@/utils/rpc'
import '@/utils/echarts' // 共享 ECharts 配置

const props = defineProps<{
  uuid: string
}>()

const appStore = useAppStore()
const { pickSurfaceClass } = useBackgroundSurface()
const isDark = computed(() => appStore.isDark)
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

interface TaskInfo {
  id: number
  name: string
  interval: number
  loss: number
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
}

interface MetricSeries {
  metric_key: 'ping.latency_ms' | 'ping.loss'
  tags?: Record<string, string>
  tag?: Record<string, string>
  points: MetricPoint[]
}

interface MetricQueryResponse {
  series: MetricSeries[]
}

interface PingMetricTaskStats {
  task_id: string
  name?: string
  type?: string
  interval?: number
  loss: number
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
  stats: PingMetricTaskStats[]
}

interface PingRecordsResponse {
  records: PingRecord[]
  tasks?: TaskInfo[]
}

interface PingChartData {
  records: PingRecord[]
  tasks: TaskInfo[]
}

// 数据状态
const remoteData = shallowRef<PingRecord[]>([])
const tasks = shallowRef<TaskInfo[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
let fetchRequestId = 0
let metricRpcSupported: boolean | null = null
let refreshTimer: ReturnType<typeof window.setInterval> | null = null
const PING_DIALOG_REFRESH_INTERVAL_MS = 30_000

// 任务选择
const selectedTaskIds = ref<number[]>([])
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

function canFallbackToLegacyRecords(err: unknown): boolean {
  return isMethodNotFoundError(err)
    || (err instanceof RpcError && err.code === -32602)
}

function getMetricTaskId(series: MetricSeries, point: MetricPoint): number | null {
  const taskId = Number(
    point.tags?.task_id
    ?? series.tags?.task_id
    ?? point.tag?.task_id
    ?? series.tag?.task_id,
  )

  return Number.isInteger(taskId) ? taskId : null
}

async function fetchMetricRecords(uuid: string, hours: number): Promise<PingChartData> {
  const [metricResult, statsResult] = await Promise.all([
    rpc.getClient().call<MetricQueryResponse>('public:queryMetrics', {
      metric_keys: ['ping.latency_ms', 'ping.loss'],
      entity_id: uuid,
      hours,
      downsample: true,
      max_points: 500,
      aggregation: 'avg',
    }),
    rpc.getClient().call<PingMetricStatsResponse>('public:getPingMetricStats', {
      uuid,
      hours,
      max_points: 500,
    }),
  ])

  const records: PingRecord[] = []
  for (const series of metricResult?.series ?? []) {
    for (const point of series.points ?? []) {
      const taskId = getMetricTaskId(series, point)
      if (taskId === null)
        continue

      if (point.value === null)
        continue

      if (series.metric_key === 'ping.loss' && point.value <= 0)
        continue

      records.push({
        client: uuid,
        task_id: taskId,
        time: point.time,
        value: series.metric_key === 'ping.loss' ? -1 : point.value,
      })
    }
  }

  const metricTasks = (statsResult?.stats ?? []).map(task => ({
    id: Number(task.task_id),
    name: task.name || `Ping ${task.task_id}`,
    interval: task.interval ?? 60,
    loss: task.loss,
    p99: task.p99,
    p50: task.p50,
    p99_p50_ratio: task.p99_p50_ratio,
    min: task.min,
    max: task.max,
    avg: task.avg,
    latest: task.latest,
    total: task.total,
    type: task.type,
  })).filter(task => Number.isInteger(task.id))

  return { records, tasks: metricTasks }
}

async function fetchLegacyRecords(uuid: string, hours: number): Promise<PingChartData> {
  const result = await rpc.getClient().call<PingRecordsResponse>('common:getRecords', {
    type: 'ping',
    uuid,
    hours,
    maxCount: 4000,
  })

  return {
    records: result?.records ?? [],
    tasks: result?.tasks ?? [],
  }
}

async function fetchRecords() {
  if (!props.uuid)
    return

  const requestId = ++fetchRequestId
  const uuid = props.uuid
  const hours = selectedHours.value

  loading.value = true
  error.value = null

  try {
    let result: PingChartData
    if (metricRpcSupported === false) {
      result = await fetchLegacyRecords(uuid, hours)
    }
    else {
      try {
        result = await fetchMetricRecords(uuid, hours)
        metricRpcSupported = true
      }
      catch (err) {
        if (!canFallbackToLegacyRecords(err))
          throw err

        metricRpcSupported = false
        result = await fetchLegacyRecords(uuid, hours)
      }
    }

    if (requestId !== fetchRequestId)
      return

    const records = result.records
    records.sort((a, b) => dayjs(a.time).valueOf() - dayjs(b.time).valueOf())

    remoteData.value = records
    tasks.value = result.tasks

    if (tasks.value.length > 0 && selectedTaskIds.value.length === 0) {
      selectedTaskIds.value = tasks.value.map(t => t.id)
    }
  }
  catch (err) {
    if (requestId !== fetchRequestId)
      return

    error.value = err instanceof Error ? err.message : '获取数据失败'
    remoteData.value = []
    tasks.value = []
  }
  finally {
    if (requestId === fetchRequestId) {
      loading.value = false
    }
  }
}

// ==================== 数据处理 ====================

const mergedData = computed(() => {
  const data = remoteData.value
  if (!data.length)
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

  if (selectedKeys.length > 0 && data.length > 0) {
    data = interpolateNullsLinear(data, selectedKeys, {
      maxGapMultiplier: 6,
      minCapMs: 2 * 60_000,
      maxCapMs: 30 * 60_000,
    })
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
    const taskLossRecords = remoteData.value.filter(rec => rec.task_id === task.id && rec.value < 0)

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
    selectedTaskIds.value = [...selectedTaskIds.value, taskId]
  }
}

function showAllTasks() {
  selectedTaskIds.value = tasks.value.map(t => t.id)
}

function hideAllTasks() {
  selectedTaskIds.value = []
}

// ==================== 图表配置 ====================

// 通用 Tooltip 配置
const baseTooltipConfig = computed(() => ({
  trigger: 'axis' as const,
  confine: false,
  backgroundColor: chartThemeColors.value.tooltipBg,
  borderColor: 'transparent',
  borderWidth: 0,
  borderRadius: 6,
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
    return {
      name: task.name,
      type: 'line' as const,
      data: data.map(d => d[task.id] as number | null ?? null),
      smooth: showDelay.value ? (cutPeak.value ? 0.6 : 0.1) : 0,
      showSymbol: false,
      connectNulls: false,
      lineStyle: { width: showDelay.value ? 1.5 : 0, color, cap: 'round' as const },
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
    animation: false,
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

        // 按延迟值排序显示
        const sortedParams = [...p].sort((a, b) => (a.value ?? 0) - (b.value ?? 0))

        for (const item of sortedParams) {
          if (item.value !== null && item.value !== undefined) {
            // 通过任务名找到对应的任务ID，再获取颜色
            const task = tasks.value.find(t => t.name === item.seriesName)
            const color = task ? colorMap.get(task.id) || chartColors[0] : chartColors[0]
            const colorDot = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};margin-right:8px;flex-shrink:0"></span>`
            html += `<div style="display:flex;align-items:center">${colorDot}<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${item.seriesName}</span><span style="margin-left:auto;font-weight:600;margin-left:16px;font-variant-numeric:tabular-nums">${Math.round(item.value)} ms</span></div>`
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
  selectedTaskIds.value = []
  fetchRecords()
}, { immediate: true })

watch(() => props.uuid, () => {
  remoteData.value = []
  tasks.value = []
  selectedTaskIds.value = []
  fetchRecords()
})

function refreshWhenVisible() {
  if (document.visibilityState === 'visible')
    void fetchRecords()
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
  <div class="lnl-ping-panel">
    <div class="lnl-ping-toolbar">
      <div class="lnl-ping-window">
        <span>OBSERVATION WINDOW</span>
        <Tabs v-model="selectedView" class="w-full items-center">
          <div class="min-w-0 flex-1 overflow-x-auto pointer-events-auto">
            <TabsList class="lnl-ping-window-tabs w-max h-8 rounded-none bg-transparent">
              <TabsTrigger
                v-for="view in availableViews" :key="view.label" :value="view.label"
                class="h-7 flex-none shrink-0 rounded-none border-none px-3 text-xs shadow-none data-[state=active]:bg-emerald-500/10 data-[state=active]:text-emerald-600"
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
          variant="ghost" size="xs" class="h-7 rounded-none border border-emerald-600/15"
          :class="[selectedTaskIds.length === tasks.length && '!text-emerald-600']"
          @click="showAllTasks"
        >
          全选
        </Button>
        <Button
          variant="ghost" size="xs" class="h-7 rounded-none border border-emerald-600/15"
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
                v-for="task in latestValues" :key="task.id"
                role="button" tabindex="0"
                class="lnl-ping-probe"
                :class="{ 'is-disabled': !selectedTaskIds.includes(task.id) }"
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
                  <span>LOSS {{ task.loss.toFixed(2) }}%</span>
                  <span v-if="task.p99_p50_ratio !== undefined">JIT {{ task.p99_p50_ratio.toFixed(2) }}</span>
                </div>
                <DataTooltip placement="right" content-class="!rounded-none p-3 w-60 backdrop-blur">
                  <Button variant="ghost" size="icon-xs" class="lnl-ping-probe-info" @click.stop>
                    <Icon icon="carbon:information" :width="14" :height="14" />
                  </Button>
                  <template #content>
                    <div class="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                      <template v-if="task.min !== undefined">
                        <span class="text-muted-foreground">最小</span><span>{{ Math.round(task.min) }} ms</span>
                      </template>
                      <template v-if="task.max !== undefined">
                        <span class="text-muted-foreground">最大</span><span>{{ Math.round(task.max) }} ms</span>
                      </template>
                      <template v-if="task.avg !== undefined">
                        <span class="text-muted-foreground">平均</span><span>{{ Math.round(task.avg) }} ms</span>
                      </template>
                      <template v-if="task.p50 !== undefined">
                        <span class="text-muted-foreground">P50</span><span>{{ Math.round(task.p50) }} ms</span>
                      </template>
                      <template v-if="task.p99 !== undefined">
                        <span class="text-muted-foreground">P99</span><span>{{ Math.round(task.p99) }} ms</span>
                      </template>
                      <template v-if="task.total !== undefined">
                        <span class="text-muted-foreground">样本</span><span>{{ task.total }}</span>
                      </template>
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
                <Button variant="ghost" size="xs" class="h-7 rounded-none" :class="[showDelay && '!text-emerald-600']" @click="showDelay = !showDelay">
                  延迟
                </Button>
                <Button variant="ghost" size="xs" class="h-7 rounded-none" :class="[showLoss && '!text-emerald-600']" @click="showLoss = !showLoss">
                  丢包
                </Button>
                <Button variant="ghost" size="xs" class="h-7 rounded-none" :class="[cutPeak && '!text-emerald-600']" @click="cutPeak = !cutPeak">
                  平滑
                </Button>
                <DataTooltip content="使用 EWMA 算法平滑数据并过滤突变值" placement="top" :content-class="pickSurfaceClass('whitespace-nowrap text-[11px]', 'whitespace-nowrap text-[11px] backdrop-blur-xl')">
                  <Button variant="ghost" size="icon-xs" class="text-slate-500">
                    <Icon icon="carbon:information" :width="14" :height="14" />
                  </Button>
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
  border: 1px solid color-mix(in srgb, var(--lnl-line) 92%, var(--foreground) 8%);
  background: color-mix(in srgb, var(--background) 97%, var(--lnl-surface));
}
.lnl-ping-toolbar {
  display: flex;
  min-height: 54px;
  align-items: end;
  justify-content: space-between;
  gap: 18px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--lnl-line);
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
  margin-top: 3px;
}
.lnl-ping-selection {
  display: flex;
  align-items: center;
  gap: 7px;
}
.lnl-ping-selection > span {
  margin-right: 4px;
  color: var(--muted-foreground);
}
.lnl-ping-content {
  min-height: 360px;
}
.lnl-ping-workspace {
  display: grid;
  grid-template-columns: minmax(220px, 260px) minmax(0, 1fr);
  min-height: min(56dvh, 520px);
}
.lnl-ping-probes {
  min-width: 0;
  border-right: 1px solid var(--lnl-line);
  background: color-mix(in srgb, var(--lnl-surface) 68%, transparent);
}
.lnl-ping-probes-head {
  display: flex;
  min-height: 46px;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  border-bottom: 1px solid var(--lnl-line);
  font-size: 12px;
  font-weight: 650;
}
.lnl-ping-probes-head small {
  color: var(--lnl-green);
  font: 8px var(--font-mono);
  letter-spacing: 0.1em;
}
.lnl-ping-probe-list {
  max-height: min(49dvh, 458px);
  overflow: auto;
}
.lnl-ping-probe {
  position: relative;
  display: grid;
  grid-template-columns: 4px minmax(0, 1fr) auto auto;
  grid-template-rows: auto auto;
  gap: 3px 9px;
  min-height: 78px;
  align-items: center;
  padding: 10px 9px;
  border-bottom: 1px solid color-mix(in srgb, var(--lnl-line) 72%, transparent);
  cursor: pointer;
  transition:
    background-color 180ms ease,
    opacity 180ms ease;
}
.lnl-ping-probe:hover,
.lnl-ping-probe:focus-visible {
  background: color-mix(in srgb, var(--lnl-green) 6%, transparent);
  outline: none;
}
.lnl-ping-probe.is-disabled {
  opacity: 0.34;
}
.lnl-ping-probe > i {
  grid-row: 1 / 3;
  width: 4px;
  height: 34px;
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
  font-size: 12px;
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
  font-size: 17px;
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
  flex-direction: column;
}
.lnl-ping-plot-head {
  display: flex;
  min-height: 46px;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 7px 12px;
  border-bottom: 1px solid var(--lnl-line);
}
.lnl-ping-plot-head strong {
  display: block;
  margin-top: 2px;
  font-family: var(--font-display);
  font-size: 14px;
}
.lnl-ping-plot-actions {
  display: flex;
  align-items: center;
  gap: 2px;
}
.lnl-ping-chart {
  min-height: 310px;
  flex: 1;
  padding: 4px 8px 8px;
}
@media (max-width: 820px) {
  .lnl-ping-toolbar,
  .lnl-ping-plot-head {
    align-items: stretch;
    flex-direction: column;
  }
  .lnl-ping-selection,
  .lnl-ping-plot-actions {
    justify-content: flex-start;
  }
  .lnl-ping-workspace {
    display: block;
  }
  .lnl-ping-probes {
    border-right: 0;
    border-bottom: 1px solid var(--lnl-line);
  }
  .lnl-ping-probe-list {
    display: grid;
    grid-auto-columns: minmax(210px, 72vw);
    grid-auto-flow: column;
    max-height: none;
    overflow-x: auto;
  }
  .lnl-ping-probe {
    border-right: 1px solid var(--lnl-line);
    border-bottom: 0;
  }
  .lnl-ping-chart {
    height: 310px;
  }
}
</style>
