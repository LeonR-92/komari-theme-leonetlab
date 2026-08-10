/**
 * 数据处理工具函数
 * 参考 React 版本的 RecordHelper.tsx 实现
 */

import dayjs from 'dayjs'

/** 负载记录格式 */
export interface RecordFormat {
  client: string
  time: string
  cpu: number | null
  gpu: number | null
  gpu_usage: number | null
  gpu_memory: number | null
  gpu_detailed?: {
    [index: number]: {
      usage: number | null
      memory: number | null
      temperature: number | null
      device_index?: number
      device_name?: string
      mem_total?: number
      mem_used?: number
    }
  }
  ram: number | null
  ram_total: number | null
  swap: number | null
  swap_total: number | null
  load: number | null
  temp: number | null
  disk: number | null
  disk_total: number | null
  net_in: number | null
  net_out: number | null
  net_total_up: number | null
  net_total_down: number | null
  process: number | null
  connections: number | null
  connections_udp: number | null
}

type UnknownRecord = Record<string, unknown>

function readRecordField(record: object | undefined, key: string): unknown {
  return record ? (record as UnknownRecord)[key] : undefined
}

function writeRecordField(record: object, key: string, value: unknown): void {
  (record as UnknownRecord)[key] = value
}

/**
 * 仅供图表展示的短缺口桥接。
 *
 * 连续缺失点不超过 maxMissingSamples，且缺口两端都有有效数值时，
 * 使用线性插值生成一份新的数组。原始数组不会被修改；较长断线、
 * 首尾缺失和非有限数值会继续保持断开。
 */
export function bridgeShortDisplayGaps(
  values: Array<number | null>,
  maxMissingSamples = 2,
): Array<number | null> {
  const output = [...values]
  const limit = Math.max(0, Math.floor(maxMissingSamples))

  if (limit === 0 || output.length < 3)
    return output

  let index = 0
  while (index < values.length) {
    if (values[index] !== null) {
      index++
      continue
    }

    const gapStart = index
    while (index < values.length && values[index] === null)
      index++

    const gapEnd = index - 1
    const gapLength = gapEnd - gapStart + 1
    const left = values[gapStart - 1]
    const right = values[index]

    if (
      gapLength > limit
      || typeof left !== 'number'
      || !Number.isFinite(left)
      || typeof right !== 'number'
      || !Number.isFinite(right)
    ) {
      continue
    }

    const step = (right - left) / (gapLength + 1)
    for (let offset = 1; offset <= gapLength; offset++)
      output[gapStart + offset - 1] = left + step * offset
  }

  return output
}

/**
 * 创建空值模板
 * 递归设置所有数值属性为 null，用于填充缺失的时间点
 */
function createNullTemplate(obj: unknown): unknown {
  if (obj === null || obj === undefined)
    return null
  if (typeof obj === 'number')
    return null
  if (typeof obj === 'string' || typeof obj === 'boolean')
    return obj
  if (Array.isArray(obj))
    return obj.map(createNullTemplate)
  if (typeof obj === 'object') {
    const res: Record<string, unknown> = {}
    for (const k in obj as Record<string, unknown>) {
      if (k === 'updated_at' || k === 'time')
        continue
      res[k] = createNullTemplate((obj as Record<string, unknown>)[k])
    }
    return res
  }
  return null
}

/**
 * 填充缺失的时间点
 * 两种模式：
 * 1. 固定长度（默认）：生成指定长度的时间窗口数据，以最后一个数据点为终点
 * 2. 可变长度：如果 totalSeconds 为 null，则从第一个数据点填充到最后一个
 *
 * @param data 输入数据数组，应有 time 或 updated_at 属性
 * @param intervalSec 时间点间隔（秒）
 * @param totalSeconds 要显示的总时长（秒），设为 null 则从第一个数据点开始
 * @param matchToleranceSec 匹配时间点的容差（秒），默认为 intervalSec
 */
export function fillMissingTimePoints<T extends { time?: string, updated_at?: string }>(
  data: T[],
  intervalSec: number = 10,
  totalSeconds: number | null = 180,
  matchToleranceSec?: number,
): T[] {
  if (!data.length)
    return []

  const getTime = (item: T) =>
    dayjs(item.time ?? item.updated_at ?? '').valueOf()

  // 预计算时间戳并剔除非法记录，避免无效日期污染排序和补点。
  const timedData = data
    .map(item => ({ item, timeMs: getTime(item) }))
    .filter(entry => Number.isFinite(entry.timeMs))
  timedData.sort((a, b) => a.timeMs - b.timeMs)

  const firstItem = timedData[0]
  const lastItem = timedData.at(-1)

  if (!firstItem || !lastItem)
    return []

  const end = lastItem.timeMs
  const interval = intervalSec * 1000

  // 确定起始时间
  const start
    = totalSeconds !== null && totalSeconds > 0
      ? end - totalSeconds * 1000 + interval // 固定长度模式
      : firstItem.timeMs // 可变长度模式

  // 生成理想的时间点
  const timePoints: number[] = []
  for (let t = start; t <= end; t += interval) {
    timePoints.push(t)
  }

  // 创建空值模板
  const nullTemplate = createNullTemplate(lastItem.item) as T

  const matchToleranceMs = (matchToleranceSec ?? intervalSec) * 1000

  // 每条原始记录最多落入一个最近的时间格。旧实现命中后没有推进游标，
  // 在容差大于间隔时会把同一采样重复复制到多个格子，制造虚假平台。
  const slots = new Map<number, { item: T, distance: number }>()
  for (const entry of timedData) {
    const slotIndex = Math.round((entry.timeMs - start) / interval)
    if (slotIndex < 0 || slotIndex >= timePoints.length)
      continue

    const slotTime = timePoints[slotIndex]
    if (slotTime === undefined)
      continue

    const distance = Math.abs(entry.timeMs - slotTime)
    if (distance > matchToleranceMs)
      continue

    const current = slots.get(slotIndex)
    if (!current || distance < current.distance)
      slots.set(slotIndex, { item: entry.item, distance })
  }

  const filled: T[] = timePoints.map((t, index) => {
    const found = slots.get(index)?.item
    if (found) {
      // 找到则使用，但对齐时间到网格
      return { ...found, time: dayjs(t).toISOString() }
    }

    // 未找到则插入空值模板
    return { ...nullTemplate, time: dayjs(t).toISOString() } as T
  })

  return filled
}

/**
 * 线性插值填充
 * 在相邻两个有效点之间，用线性插值填充中间的 null 值
 * - 仅在"两个端点都存在且为数值"时进行插值
 * - 可通过 maxGapMs 控制最大可插值的时间跨度
 */
export function interpolateNullsLinear<T extends object>(
  rows: T[],
  keys: string[],
  options?:
    | number
    | {
      /** 统一的最大插值跨度 */
      maxGapMs?: number
      /** 若未提供 maxGapMs，则以典型间隔 * 该倍数作为最大插值跨度 */
      maxGapMultiplier?: number
      /** 统一的下限与上限（用于钳制） */
      minCapMs?: number
      maxCapMs?: number
    },
): T[] {
  if (!rows || rows.length === 0 || !keys.length)
    return rows

  const times = rows.map((r) => {
    const value = readRecordField(r, 'time') ?? readRecordField(r, 'updated_at')
    return dayjs(typeof value === 'string' || typeof value === 'number' ? value : '').valueOf()
  })
  const out: T[] = rows.map(r => ({ ...r }))

  // 解析配置
  const opts
    = typeof options === 'number'
      ? { maxGapMs: options }
      : options || {}
  const maxGapMsUnified = opts.maxGapMs
  const multiplier = opts.maxGapMultiplier ?? 6
  const minCap = opts.minCapMs ?? 2 * 60_000 // 2min
  const maxCap = opts.maxCapMs ?? 30 * 60_000 // 30min

  const clamp = (v: number, lo: number, hi: number) =>
    Math.max(lo, Math.min(hi, v))

  for (const key of keys) {
    // 收集该列的有效点索引
    const validIdx: number[] = []
    for (let i = 0; i < rows.length; i++) {
      const v = readRecordField(rows[i], key)
      if (typeof v === 'number' && Number.isFinite(v))
        validIdx.push(i)
    }

    if (validIdx.length < 2)
      continue

    // 计算该列的"典型间隔"（使用中位数）
    let perKeyMaxGap = maxGapMsUnified
    if (perKeyMaxGap === undefined) {
      const gaps: number[] = []
      for (let s = 0; s < validIdx.length - 1; s++) {
        const i0 = validIdx[s]
        const i1 = validIdx[s + 1]
        if (i0 === undefined || i1 === undefined)
          continue
        const t0 = times[i0]
        const t1 = times[i1]
        if (t0 !== undefined && t1 !== undefined && Number.isFinite(t0) && Number.isFinite(t1) && t1 > t0) {
          gaps.push(t1 - t0)
        }
      }
      if (gaps.length === 0)
        continue
      gaps.sort((a, b) => a - b)
      const median = gaps[Math.floor(gaps.length / 2)]
      if (median === undefined)
        continue
      perKeyMaxGap = clamp(median * multiplier, minCap, maxCap)
    }

    // 相邻有效点之间做线性插值
    for (let s = 0; s < validIdx.length - 1; s++) {
      const i0 = validIdx[s]
      const i1 = validIdx[s + 1]
      if (i0 === undefined || i1 === undefined)
        continue

      const t0 = times[i0]
      const t1 = times[i1]
      if (t0 === undefined || t1 === undefined)
        continue

      const row0 = rows[i0]
      const row1 = rows[i1]
      if (!row0 || !row1)
        continue

      const v0 = readRecordField(row0, key)
      const v1 = readRecordField(row1, key)

      if (!Number.isFinite(t0) || !Number.isFinite(t1) || t1 <= t0)
        continue
      if (typeof v0 !== 'number' || typeof v1 !== 'number')
        continue
      if (perKeyMaxGap && t1 - t0 > perKeyMaxGap)
        continue // 间隔太大，保持空洞

      for (let j = i0 + 1; j < i1; j++) {
        const tj = times[j]
        if (tj === undefined)
          continue
        const ratio = (tj - t0) / (t1 - t0)
        const outRow = out[j]
        if (outRow) {
          writeRecordField(outRow, key, v0 + (v1 - v0) * ratio)
        }
      }
    }
  }

  return out
}

/**
 * EWMA（指数加权移动平均）视觉平滑
 * 使用 Hampel 风格的中位数/MAD 检测抑制孤立异常点，再应用 EWMA。
 * null/undefined 代表真实缺测或丢包，必须原样保留，不能前向填充。
 *
 * @param data 输入数据数组
 * @param keys 需要处理的数值属性名数组
 * @param alpha 平滑因子
 * @param windowSize 突变检测窗口大小
 * @param spikeThreshold MAD 倍数阈值
 */
export function cutPeakValues<T extends object>(
  data: T[],
  keys: string[],
  alpha: number = 0.3,
  windowSize: number = 15,
  spikeThreshold: number = 3,
): T[] {
  if (!data || data.length === 0)
    return data

  const result: T[] = data.map(row => ({ ...row }))
  const halfWindow = Math.floor(windowSize / 2)

  const median = (values: number[]): number => {
    const sorted = [...values].sort((a, b) => a - b)
    const middle = Math.floor(sorted.length / 2)
    const upper = sorted[middle]
    if (upper === undefined)
      return 0
    if (sorted.length % 2 === 1)
      return upper
    return ((sorted[middle - 1] ?? upper) + upper) / 2
  }

  for (const key of keys) {
    const sourceValues = data.map(row => readRecordField(row, key))
    const segmentIds: number[] = []
    let segmentId = 0
    let previousWasGap = true
    for (const value of sourceValues) {
      const isGap = typeof value !== 'number' || !Number.isFinite(value)
      if (!isGap && previousWasGap)
        segmentId += 1
      segmentIds.push(isGap ? -1 : segmentId)
      previousWasGap = isGap
    }
    let ewma: number | null = null

    for (let i = 0; i < result.length; i++) {
      const row = result[i]
      if (!row)
        continue
      const rawValue = sourceValues[i]
      if (typeof rawValue !== 'number' || !Number.isFinite(rawValue)) {
        writeRecordField(row, key, null)
        // Never carry the pre-loss EWMA state into a new continuous segment.
        ewma = null
        continue
      }

      const neighborValues = sourceValues
        .slice(Math.max(0, i - halfWindow), Math.min(sourceValues.length, i + halfWindow + 1))
        .filter((value, neighborIndex): value is number => {
          const absoluteIndex = Math.max(0, i - halfWindow) + neighborIndex
          return absoluteIndex !== i
            && segmentIds[absoluteIndex] === segmentIds[i]
            && typeof value === 'number'
            && Number.isFinite(value)
        })

      let filteredValue = rawValue
      if (neighborValues.length >= 3) {
        const center = median(neighborValues)
        const mad = median(neighborValues.map(value => Math.abs(value - center)))
        const robustLimit = mad > 0
          ? spikeThreshold * 1.4826 * mad
          : Math.max(1, Math.abs(center) * 0.5)
        if (Math.abs(rawValue - center) > robustLimit)
          filteredValue = center
      }

      ewma = ewma === null
        ? filteredValue
        : alpha * filteredValue + (1 - alpha) * ewma
      writeRecordField(row, key, ewma)
    }
  }

  return result
}
