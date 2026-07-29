<script setup lang="ts">
import type { NodeData } from '@/stores/nodes'
import { Icon } from '@iconify/vue'
import { computed } from 'vue'
import { Badge } from '@/components/ui/badge'
import { CardX } from '@/components/ui/card-x'
import { DataTooltip } from '@/components/ui/data-tooltip'
import { ProgressThin } from '@/components/ui/progress-thin'
import { useBackgroundSurface } from '@/composables/useBackgroundSurface'
import { useNodePingDisplay } from '@/composables/useNodePingDisplay'
import { useAppStore } from '@/stores/app'
import { formatBytesPerSecondWithConfig, formatBytesWithConfig, formatDateTime, formatUptimeWithFormat, getStatus } from '@/utils/helper'
import { getOSImage, getOSName } from '@/utils/osImageHelper'
import { getRegionCode, getRegionDisplayName } from '@/utils/regionHelper'
import { formatPriceWithCycle, getDaysUntilExpired, getExpireStatus, getExpireTextClass, parseTags } from '@/utils/tagHelper'

const props = defineProps<{ node: NodeData }>()

const emit = defineEmits<{
  click: []
  pingClick: [node: NodeData]
}>()

const appStore = useAppStore()
const { pickSurfaceClass } = useBackgroundSurface()

const formatBytes = (bytes: number) => formatBytesWithConfig(bytes, appStore.byteDecimals)
const formatBytesPerSecond = (bytes: number) => formatBytesPerSecondWithConfig(bytes, appStore.byteDecimals)
const formatUptime = (seconds: number) => formatUptimeWithFormat(seconds, 'hour')
const offlineTime = computed(() => formatDateTime(props.node.time))
const expiredDate = computed(() => formatDateTime(props.node.expired_at, 'YYYY-MM-DD'))

const cpuStatus = computed(() => getStatus(props.node.cpu ?? 0))
const memPercentage = computed(() => (props.node.ram ?? 0) / (props.node.mem_total || 1) * 100)
const memStatus = computed(() => getStatus(memPercentage.value))
const diskPercentage = computed(() => (props.node.disk ?? 0) / (props.node.disk_total || 1) * 100)
const diskStatus = computed(() => getStatus(diskPercentage.value))

const {
  latencyRenderBars,
  lossRenderBars,
  latencyDisplay,
  lossDisplay,
} = useNodePingDisplay(() => props.node.uuid, {
  liveNode: () => props.node,
})

function showTrafficProgress(node: NodeData): boolean {
  return node.traffic_limit > 0
}

const trafficUsedPercentage = computed(() => {
  if (props.node.traffic_limit <= 0)
    return 0
  const { net_total_up = 0, net_total_down = 0, traffic_limit_type } = props.node
  let used = 0
  switch (traffic_limit_type) {
    case 'up': used = net_total_up
      break
    case 'down': used = net_total_down
      break
    case 'min': used = Math.min(net_total_up, net_total_down)
      break
    case 'max': used = Math.max(net_total_up, net_total_down)
      break
    case 'sum':
    default:
      used = net_total_up + net_total_down
      break
  }
  return Math.min((used / props.node.traffic_limit) * 100, 100)
})

const trafficUsed = computed(() => {
  const { net_total_up = 0, net_total_down = 0, traffic_limit_type } = props.node
  switch (traffic_limit_type) {
    case 'up': return net_total_up
    case 'down': return net_total_down
    case 'min': return Math.min(net_total_up, net_total_down)
    case 'max': return Math.max(net_total_up, net_total_down)
    case 'sum':
    default: return net_total_up + net_total_down
  }
})

interface PriceTagItem {
  text: string
  highlightValue?: string
  prefix?: string
  suffix?: string
}

const priceTags = computed<PriceTagItem[]>(() => {
  const tags: PriceTagItem[] = []
  const lang = appStore.lang
  const node = props.node
  const priceText = formatPriceWithCycle(node.price, node.billing_cycle, node.currency, lang)
  if (node.price !== 0)
    tags.push({ text: priceText })
  // 未设置过期时间（expired_at 为 null/空）时不生成任何过期标签
  if (!node.expired_at)
    return tags
  const days = getDaysUntilExpired(node.expired_at)
  const status = getExpireStatus(node.expired_at)
  if (status === 'expired') {
    tags.push({ text: lang === 'zh-CN' ? '已过期' : 'Expired' })
  }
  else if (status === 'long_term') {
    tags.push({ text: lang === 'zh-CN' ? '长期' : 'Long-term' })
  }
  else if (status !== 'none' && days !== null) {
    if (lang === 'zh-CN')
      tags.push({ text: `余 ${days} 天`, prefix: '余 ', highlightValue: String(days), suffix: ' 天' })
    else
      tags.push({ text: `${days} days left`, highlightValue: String(days), suffix: ' days left' })
  }
  return tags
})
const hasFinanceDetails = computed(() => props.node.price !== 0 || Boolean(props.node.expired_at))

const remainingTimeTagClass = computed(() => {
  if (props.node.price === 0)
    return ''
  return getExpireTextClass(props.node.expired_at)
})

const customTags = computed(() => parseTags(props.node.tags).map(t => t.text))

function hasRegion(region: string | null | undefined): boolean {
  return Boolean(region?.trim())
}

function openPingDialog() {
  emit('pingClick', props.node)
}
</script>

<template>
  <CardX
    hoverable
    role="link"
    tabindex="0"
    :aria-label="`查看节点 ${props.node.name} 详情`"
    class="node-card h-full w-full cursor-pointer border-none rounded-md bg-background/60"
    :class="[
      pickSurfaceClass('', 'backdrop-blur-sm'),
      appStore.nodeCardDensity === 'compact' && 'is-compact',
      appStore.disablePageAnimation && 'is-motion-reduced',
      !props.node.online && 'shadow-[0_0_0_1px] !shadow-red-600/20',
    ]"
    @click="emit('click')"
    @keydown.enter="emit('click')"
    @keydown.space.prevent="emit('click')"
  >
    <template #header>
      <div class="flex gap-2 min-w-0 items-center">
        <div class="size-2 rounded-full relative" :class="[props.node.online ? 'bg-emerald-600' : 'bg-red-600']">
          <div
            class="animate-ping motion-reduce:animate-none absolute inset-0 rounded-full opacity-50"
            :class="[props.node.online ? 'bg-emerald-600' : 'bg-red-600']"
          />
        </div>
        <div class="text-md font-bold flex-1 min-w-0 truncate">
          {{ props.node.name }}
        </div>
      </div>
    </template>

    <template #header-extra>
      <div class="flex gap-2 items-center">
        <img :src="getOSImage(props.node.os)" :alt="getOSName(props.node.os)" class="size-4">
        <img
          v-if="hasRegion(props.node.region)" :src="`/images/flags/${getRegionCode(props.node.region)}.svg`"
          :alt="getRegionDisplayName(props.node.region)" class="size-5 shrink-0"
        >
      </div>
    </template>

    <template #default>
      <div class="flex flex-col gap-3">
        <div class="lnl-node-section-head">
          <span>RESOURCE TELEMETRY</span>
          <b>{{ props.node.online ? 'LIVE' : 'OFFLINE' }}</b>
        </div>
        <div class="lnl-node-resource-grid gap-x-3 gap-y-1 grid grid-cols-2">
          <!-- CPU -->
          <div class="lnl-node-resource-cell flex flex-col gap-1">
            <div class="w-full text-xs flex flex-row justify-between">
              <span class="text-muted-foreground">
                CPU
              </span>
              <span>{{ (props.node.cpu ?? 0).toFixed(1) }}%</span>
            </div>
            <ProgressThin :percentage="props.node.cpu ?? 0" :status="cpuStatus" :height="4" />
            <div class="text-[11px] text-muted-foreground truncate">
              {{ (props.node.load ?? 0).toFixed(2) }}, {{ (props.node.load5 ?? 0).toFixed(2) }}, {{
                (props.node.load15 ?? 0).toFixed(2) }}
            </div>
          </div>

          <!-- 内存 -->
          <div class="lnl-node-resource-cell flex flex-col gap-1">
            <div class="w-full text-xs flex flex-row justify-between">
              <span class="text-muted-foreground">
                内存
              </span>
              <span>{{ memPercentage.toFixed(1) }}%</span>
            </div>
            <ProgressThin :percentage="memPercentage" :status="memStatus" :height="4" />
            <DataTooltip placement="top" class="block" :content-class="[!props.node.swap && '!hidden']">
              <div class="text-[11px] text-muted-foreground truncate">
                {{ formatBytes(props.node.ram ?? 0) }} / {{ formatBytes(props.node.mem_total ?? 0) }}
              </div>
              <template #content>
                <div class="flex items-center justify-between gap-3 whitespace-nowrap">
                  <span class="text-muted-foreground">Swap</span>
                  <span>{{ formatBytes(props.node.swap ?? 0) }}</span>
                </div>
              </template>
            </DataTooltip>
          </div>

          <!-- 硬盘 -->
          <div class="lnl-node-resource-cell flex flex-col gap-1">
            <div class="w-full text-xs flex flex-row justify-between">
              <span class="text-muted-foreground">
                硬盘
              </span>
              <span>{{ diskPercentage.toFixed(1) }}%</span>
            </div>
            <ProgressThin :percentage="diskPercentage" :status="diskStatus" :height="4" />
            <div class="text-[11px] text-muted-foreground truncate">
              {{ formatBytes(props.node.disk ?? 0) }} / {{ formatBytes(props.node.disk_total ?? 0) }}
            </div>
          </div>

          <!-- 流量进度条 -->
          <div class="lnl-node-resource-cell flex flex-col gap-1">
            <div class="w-full text-xs flex flex-row justify-between">
              <span class="text-muted-foreground">
                流量
              </span>
              <span>{{ trafficUsedPercentage.toFixed(1) }}%</span>
            </div>
            <ProgressThin :percentage="trafficUsedPercentage" status="success" :height="4" />
            <DataTooltip placement="top" class="block">
              <div class="text-[11px] text-muted-foreground truncate">
                {{ formatBytes(trafficUsed) }} /
                <template v-if="showTrafficProgress(node)">
                  {{ formatBytes(props.node.traffic_limit) }}
                </template>
                <template v-else>
                  ∞
                </template>
              </div>
              <template #content>
                <div class="flex items-center justify-between gap-3 whitespace-nowrap">
                  <div class="text-[11px] flex flex-col">
                    <div class="flex flex-row items-center gap-1">
                      <Icon icon="tabler:chevron-up" width="12" height="12" />
                      {{ formatBytes(props.node.net_total_up ?? 0) }}
                    </div>
                    <div class="flex flex-row items-center gap-1">
                      <Icon icon="tabler:chevron-down" width="12" height="12" />
                      {{ formatBytes(props.node.net_total_down ?? 0) }}
                    </div>
                  </div>
                </div>
              </template>
            </DataTooltip>
          </div>
        </div>
        <div class="lnl-node-lifecycle-frame">
          <div class="lnl-node-section-head">
            <span>NETWORK / LIFECYCLE</span>
            <b>REALTIME</b>
          </div>
          <div class="lnl-node-telemetry relative text-[11px] text-muted-foreground">
            <div
              v-if="!props.node.online"
              class="absolute inset-0 z-10 flex flex-col items-center justify-center space-y-1"
            >
              <span class="text-sm text-red-600">离线</span>
              <div>{{ offlineTime }}</div>
            </div>
            <div class="lnl-node-telemetry-grid" :class="[!props.node.online && 'blur-xs opacity-60 pointer-events-none']">
              <div class="lnl-node-telemetry-cell is-speed flex items-center">
                <span class="truncate">
                  速率
                </span>
                <div class="border-t-2 border-dotted border-gray-500/10 mx-2 flex-1" />
                <div class="truncate flex flex-row gap-1">
                  <div class="text-green-600 flex flex-row items-center gap-1">
                    <Icon icon="tabler:chevron-up" width="12" height="12" />
                    {{ formatBytesPerSecond(props.node.net_out ?? 0) }}
                  </div>
                  <div class="text-blue-600 flex flex-row items-center gap-1">
                    <Icon icon="tabler:chevron-down" width="12" height="12" />
                    {{ formatBytesPerSecond(props.node.net_in ?? 0) }}
                  </div>
                </div>
              </div>
              <div class="lnl-node-telemetry-cell flex items-center justify-between">
                <span class="truncate">
                  在线
                </span>
                <div class="border-t-2 border-dotted border-gray-500/10 mx-2 flex-1" />
                <span class="truncate">
                  {{ props.node.uptime > 0 ? formatUptime(props.node.uptime) : '' }}
                </span>
              </div>
              <div
                class="lnl-node-telemetry-cell is-finance flex items-center"
                :data-finance-state="props.node.price === 0 ? 'missing' : props.node.price < 0 ? 'free' : 'paid'"
              >
                <DataTooltip
                  v-if="hasFinanceDetails"
                  placement="left"
                  :content="props.node.expired_at ? expiredDate : ''"
                  :content-class="['whitespace-nowrap right-0 mr-0', !props.node.expired_at && '!hidden']"
                  class="min-w-0 w-full"
                >
                  <span class="lnl-node-finance-value flex min-w-0 flex-row justify-end gap-1">
                    <template v-for="(tag, index) in priceTags" :key="tag">
                      <span class="inline-flex flex-row gap-1 items-center">
                        <template v-if="tag.highlightValue">
                          <span>{{ tag.prefix }}</span>
                          <span :class="remainingTimeTagClass">{{ tag.highlightValue }}</span>
                          <span>{{ tag.suffix }}</span>
                        </template>
                        <template v-else>
                          {{ tag.text }}
                        </template>
                      </span>
                      <span v-if="index < priceTags.length - 1" :key="`${tag}-${index}`">·</span>
                    </template>
                  </span>
                </DataTooltip>
                <span v-else class="lnl-node-finance-empty">
                  请在后台填写费用详情
                </span>
              </div>
              <div class="lnl-node-section-head is-quality">
                <span>NETWORK QUALITY</span>
                <b>1H / LIVE SYNC</b>
              </div>
              <div class="lnl-node-quality grid grid-cols-6 gap-x-3">
                <!-- 延迟 -->
                <div
                  role="button" tabindex="0"
                  data-node-ping-panel="latency"
                  class="group/panel relative col-span-3 flex h-9 cursor-pointer flex-col gap-1 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  :aria-label="`${props.node.name} 延迟`" @click.stop="openPingDialog"
                  @keydown.enter.stop.prevent="openPingDialog" @keydown.space.stop.prevent="openPingDialog"
                >
                  <div class="flex items-center justify-between text-[11px] leading-none relative">
                    <span class="text-muted-foreground">延迟</span>
                    <div class="border-t-2 border-dotted border-gray-500/10 mx-2 flex-1" />
                    <span class="font-medium text-foreground/85">{{ latencyDisplay }}</span>
                  </div>
                  <div
                    class="grid h-[7px] shrink-0 items-stretch gap-[1px] opacity-90 group-hover/panel:opacity-100"
                    :style="{ gridTemplateColumns: `repeat(${latencyRenderBars.length}, minmax(0, 1fr))` }"
                  >
                    <DataTooltip
                      v-for="bar in latencyRenderBars" :key="bar.key" placement="top" :content="bar.tooltip"
                      class="block h-full min-w-0 w-full"
                    >
                      <span
                        data-node-ping-bar
                        class="block h-full min-w-[2px] w-full origin-bottom rounded-[1px] transition-transform duration-150 group-hover/data-tooltip:scale-y-150"
                        :class="bar.className"
                      />
                    </DataTooltip>
                  </div>
                </div>
                <!-- 丢包 -->
                <div
                  role="button" tabindex="0"
                  data-node-ping-panel="loss"
                  class="group/panel relative col-span-3 flex h-9 cursor-pointer flex-col gap-1 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  :aria-label="`${props.node.name} 丢包`" @click.stop="openPingDialog"
                  @keydown.enter.stop.prevent="openPingDialog" @keydown.space.stop.prevent="openPingDialog"
                >
                  <div class="flex items-center justify-between text-[11px] leading-none">
                    <span class="text-muted-foreground">丢包</span>
                    <div class="border-t-2 border-dotted border-gray-500/10 mx-2 flex-1" />
                    <span class="font-medium text-foreground/85">{{ lossDisplay }}</span>
                  </div>
                  <div
                    class="grid h-[7px] shrink-0 items-stretch gap-[1px] opacity-90 group-hover/panel:opacity-100"
                    :style="{ gridTemplateColumns: `repeat(${lossRenderBars.length}, minmax(0, 1fr))` }"
                  >
                    <DataTooltip
                      v-for="bar in lossRenderBars" :key="bar.key" placement="top" :content="bar.tooltip"
                      class="block h-full min-w-0 w-full"
                    >
                      <span
                        data-node-ping-bar
                        class="block h-full min-w-[2px] w-full origin-bottom rounded-[1px] transition-transform duration-150 group-hover/data-tooltip:scale-y-150"
                        :class="bar.className"
                      />
                    </DataTooltip>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div v-if="customTags.length > 0" class="flex shrink-0 flex-wrap gap-1 items-center">
          <Badge
            v-for="(tag, index) in customTags" :key="index" variant="outline"
            class="!text-[11px] rounded text-muted-foreground border-muted-foreground/10 px-1.5"
          >
            {{ tag }}
          </Badge>
        </div>
      </div>
    </template>
  </CardX>
</template>

<style scoped>
.node-card {
  position: relative;
  overflow: hidden;
  box-shadow:
    0 0 0 1px transparent,
    0 8px 22px transparent;
  transition:
    transform var(--lnl-motion-standard) var(--lnl-ease-out),
    box-shadow var(--lnl-motion-standard) ease,
    border-color var(--lnl-motion-fast) ease,
    background-color var(--lnl-motion-fast) ease;
  will-change: transform;
}

@media (hover: hover) and (pointer: fine) {
  .node-card:hover {
    z-index: 1;
    background: var(--background);
    box-shadow:
      0 0 0 1px color-mix(in srgb, var(--lnl-green) 24%, transparent),
      0 16px 36px color-mix(in srgb, var(--lnl-green) 10%, transparent);
    transform: translate3d(0, -3px, 0);
  }
}

@media (hover: none), (pointer: coarse) {
  .node-card:active {
    transform: scale(0.992);
  }
}

.lnl-node-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-width: 0;
  padding: 0 1px;
  color: var(--lnl-green);
  font: 8px/1.2 var(--font-mono);
  letter-spacing: 0.12em;
}

.lnl-node-section-head b {
  color: var(--muted-foreground);
  font-weight: 500;
  letter-spacing: 0.08em;
}

.lnl-node-resource-grid {
  overflow: hidden;
  gap: 1px;
  border: 1px solid color-mix(in srgb, var(--lnl-line) 62%, transparent);
  background: color-mix(in srgb, var(--lnl-line) 62%, transparent);
}

.lnl-node-resource-cell {
  min-width: 0;
  padding: 9px 10px;
  background: color-mix(in srgb, var(--background) 96%, var(--lnl-surface));
}

.lnl-node-telemetry-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--lnl-line) 58%, transparent);
  background: color-mix(in srgb, var(--lnl-line) 58%, transparent);
}

.lnl-node-lifecycle-frame {
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--lnl-line) 72%, transparent);
  background:
    linear-gradient(90deg, color-mix(in srgb, var(--lnl-green) 5%, transparent), transparent 44%),
    color-mix(in srgb, var(--background) 94%, var(--lnl-surface));
}

.lnl-node-lifecycle-frame > .lnl-node-section-head {
  min-height: 29px;
  padding: 7px 10px;
  border-bottom: 1px solid color-mix(in srgb, var(--lnl-line) 68%, transparent);
}

.lnl-node-lifecycle-frame .lnl-node-telemetry-grid {
  border: 0;
}

.lnl-node-telemetry-cell {
  min-width: 0;
  min-height: 34px;
  padding: 8px 10px;
  background: color-mix(in srgb, var(--background) 96%, var(--lnl-surface));
}

.lnl-node-telemetry-cell.is-finance {
  justify-content: flex-end;
  text-align: right;
}

.lnl-node-finance-value {
  overflow: hidden;
  color: color-mix(in srgb, var(--foreground) 88%, var(--muted-foreground));
  font-weight: 550;
  white-space: nowrap;
}

.lnl-node-finance-empty {
  overflow: hidden;
  color: var(--muted-foreground);
  font-size: 10px;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lnl-node-telemetry-cell.is-speed {
  grid-column: 1 / -1;
}

.lnl-node-section-head.is-quality {
  grid-column: 1 / -1;
  padding: 8px 10px 6px;
  border-top: 1px solid color-mix(in srgb, var(--lnl-line) 72%, transparent);
  background: color-mix(in srgb, var(--background) 96%, var(--lnl-surface));
}

.lnl-node-quality {
  position: relative;
  grid-column: 1 / -1;
  padding: 4px 10px 9px;
  background: color-mix(in srgb, var(--background) 96%, var(--lnl-surface));
  box-shadow: inset 0 -2px color-mix(in srgb, var(--lnl-green) 13%, transparent);
}

.node-card:not(.is-compact) :deep([data-slot='card-title']),
.node-card:not(.is-compact) .text-md {
  font-size: 15px;
}

.node-card.is-compact .lnl-node-resource-cell {
  padding: 7px 8px;
}

.node-card.is-compact .lnl-node-telemetry-cell {
  min-height: 31px;
  padding: 6px 8px;
}

.node-card.is-compact .lnl-node-quality {
  padding-inline: 8px;
}

.node-card.is-motion-reduced {
  transition: none;
  will-change: auto;
}

.node-card.is-motion-reduced:hover,
.node-card.is-motion-reduced:active {
  transform: none;
}

@media (prefers-reduced-motion: reduce) {
  .node-card {
    transition: none;
    will-change: auto;
  }

  .node-card:hover,
  .node-card:active {
    transform: none;
  }
}
</style>
