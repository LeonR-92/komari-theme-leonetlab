<script setup lang="ts">
import type { NodeData } from '@/stores/nodes'
import { Icon } from '@iconify/vue'
import { useDebounceFn, useIntervalFn, useNow } from '@vueuse/core'
import { computed, defineAsyncComponent, nextTick, onActivated, onBeforeUnmount, onDeactivated, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import MarkdownRenderer from '@/components/MarkdownRenderer.vue'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { DataTooltip } from '@/components/ui/data-tooltip'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Empty } from '@/components/ui/empty'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useBackgroundSurface } from '@/composables/useBackgroundSurface'
import { useFinanceRates } from '@/composables/useFinanceRates'
import { useAppStore } from '@/stores/app'
import { useNodesStore } from '@/stores/nodes'
import * as financeHelper from '@/utils/financeHelper'
import { isNodeInGroup, parseNodeGroups } from '@/utils/groupHelper'
import { isMobileLike, MOBILE_NO_MOVE_CLASS } from '@/utils/mobilePerf'
import { isRegionMatch } from '@/utils/regionHelper'

defineOptions({ name: 'HomeView' })

const NodeCard = defineAsyncComponent(() => import('@/components/NodeCard.vue'))
const NodeGeneralCards = defineAsyncComponent(() => import('@/components/NodeGeneralCards.vue'))
const NodeList = defineAsyncComponent(() => import('@/components/NodeList.vue'))
const PingChart = defineAsyncComponent(() => import('@/components/PingChart.vue'))

const nodeItemStaggerMs = 55
const nodeItemStaggerLimit = 12

const appStore = useAppStore()
const { pickSurfaceClass } = useBackgroundSurface()
const nodesStore = useNodesStore()
const router = useRouter()
const { rates: exchangeRates, ensureFinanceRates } = useFinanceRates()
const now = useNow({ interval: 60_000 })
const expiryRotationIndex = ref(0)
const EXPIRY_WARNING_MS = 3 * 24 * 60 * 60 * 1000
const showNodeLoadingState = ref(false)
let nodeLoadingStateTimer: number | null = null

function clearNodeLoadingStateTimer() {
  if (nodeLoadingStateTimer !== null) {
    window.clearTimeout(nodeLoadingStateTimer)
    nodeLoadingStateTimer = null
  }
}

function scheduleNodeLoadingState() {
  clearNodeLoadingStateTimer()
  showNodeLoadingState.value = false
  if (nodesStore.initialized)
    return
  nodeLoadingStateTimer = window.setTimeout(() => {
    nodeLoadingStateTimer = null
    if (!nodesStore.initialized)
      showNodeLoadingState.value = true
  }, 260)
}

const expiringNodes = computed(() => nodesStore.nodes
  .map(node => ({
    node,
    // expired_at 未设置（null/空）时记为 NaN，下方过滤会排除
    remainingMs: node.expired_at ? new Date(node.expired_at).getTime() - now.value.getTime() : Number.NaN,
  }))
  .filter(item => Number.isFinite(item.remainingMs) && item.remainingMs > 0 && item.remainingMs <= EXPIRY_WARNING_MS)
  .sort((a, b) => a.remainingMs - b.remainingMs))

const currentExpiringNode = computed(() => {
  if (expiringNodes.value.length === 0)
    return null
  return expiringNodes.value[expiryRotationIndex.value % expiringNodes.value.length]
})

const dailySpend = computed(() => financeHelper.formatFinanceAmount(
  financeHelper.calculateTotalDailyCostCNY(nodesStore.nodes, exchangeRates.value),
  'CNY',
))

const auxiliaryStatus = computed(() => {
  const expiring = currentExpiringNode.value
  if (!expiring) {
    return {
      key: 'daily-cost',
      label: 'TODAY COST',
      value: `${dailySpend.value.symbol}${dailySpend.value.value}`,
      meta: dailySpend.value.currency,
      urgent: false,
    }
  }

  const hours = Math.max(1, Math.ceil(expiring.remainingMs / (60 * 60 * 1000)))
  const remaining = hours < 24 ? `${hours} 小时` : `${Math.ceil(hours / 24)} 天`
  return {
    key: expiring.node.uuid,
    label: 'EXPIRING ≤ 3D',
    value: expiring.node.name,
    meta: remaining,
    urgent: true,
  }
})

const { pause: pauseExpiryRotation, resume: resumeExpiryRotation } = useIntervalFn(() => {
  if (expiringNodes.value.length > 1)
    expiryRotationIndex.value = (expiryRotationIndex.value + 1) % expiringNodes.value.length
  else
    expiryRotationIndex.value = 0
}, 4200)

onActivated(() => {
  resumeExpiryRotation()
  scheduleNodeLoadingState()
  if (appStore.homeScrollPosition > 0) {
    nextTick(() => {
      window.scrollTo({ top: appStore.homeScrollPosition, behavior: 'instant' })
    })
  }
})

onDeactivated(() => {
  pauseExpiryRotation()
  clearNodeLoadingStateTimer()
  showNodeLoadingState.value = false
  appStore.homeScrollPosition = window.scrollY
})

watch(
  () => nodesStore.initialized,
  (initialized) => {
    if (initialized) {
      clearNodeLoadingStateTimer()
      showNodeLoadingState.value = false
    }
    else {
      scheduleNodeLoadingState()
    }
  },
  { immediate: true },
)

watch(
  () => nodesStore.nodes.some(node => Number(node.price) > 0),
  hasPaidNode => hasPaidNode && void ensureFinanceRates(),
  { immediate: true },
)

const searchText = ref('')
const debouncedSearchText = ref('')
const searchOpen = ref(false)
const searchReorderMotionActive = ref(false)
let searchReorderMotionTimer: number | null = null
const nodeMoveClass = computed(() =>
  isMobileLike && !searchReorderMotionActive.value ? MOBILE_NO_MOVE_CLASS : undefined,
)
const selectedPingNodeUuid = ref<string | null>(null)
const pingDialogOpen = ref(false)
let pingDialogCleanupTimer: number | null = null
let viewModeFeedbackFrame = 0
let viewModeCommitFrame = 0
const onlineNodeCount = computed(() => nodesStore.nodes.filter(node => node.online).length)
const totalNodeCount = computed(() => nodesStore.nodes.length)

function beginSearchReorderMotion() {
  if (searchReorderMotionTimer !== null) {
    window.clearTimeout(searchReorderMotionTimer)
    searchReorderMotionTimer = null
  }
  searchReorderMotionActive.value = true
}

function setNodeViewMode(mode: 'card' | 'list') {
  if (appStore.nodeViewMode === mode)
    return
  window.cancelAnimationFrame(viewModeFeedbackFrame)
  window.cancelAnimationFrame(viewModeCommitFrame)
  // Paint the control feedback before replacing the card/list DOM. The second
  // frame keeps view changes responsive on CPU-throttled mobile devices.
  viewModeFeedbackFrame = window.requestAnimationFrame(() => {
    viewModeFeedbackFrame = 0
    viewModeCommitFrame = window.requestAnimationFrame(() => {
      viewModeCommitFrame = 0
      appStore.nodeViewMode = mode
    })
  })
}

function finishSearchReorderMotionLater() {
  if (searchReorderMotionTimer !== null)
    window.clearTimeout(searchReorderMotionTimer)
  searchReorderMotionTimer = window.setTimeout(() => {
    searchReorderMotionActive.value = false
    searchReorderMotionTimer = null
  }, 520)
}

const updateDebouncedSearch = useDebounceFn((value: string) => {
  beginSearchReorderMotion()
  debouncedSearchText.value = value
  finishSearchReorderMotionLater()
}, 300)

watch(searchText, (value) => {
  updateDebouncedSearch(value)
})

async function toggleNodeSearch() {
  if (searchOpen.value) {
    beginSearchReorderMotion()
    searchText.value = ''
    debouncedSearchText.value = ''
    searchOpen.value = false
    finishSearchReorderMotionLater()
    return
  }

  beginSearchReorderMotion()
  searchOpen.value = true
  await nextTick()
  document.querySelector<HTMLInputElement>('#node-search')?.focus()
}

async function handleSearchKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape')
    return
  event.preventDefault()
  beginSearchReorderMotion()
  searchText.value = ''
  debouncedSearchText.value = ''
  searchOpen.value = false
  finishSearchReorderMotionLater()
  await nextTick()
  document.querySelector<HTMLButtonElement>('button[aria-controls="node-search"]')?.focus()
}

const groups = computed(() => [
  { tab: '全部节点', name: 'all' },
  ...nodesStore.groups.map(g => ({ tab: g, name: g })),
])

watch(
  () => nodesStore.groups,
  (gs) => {
    const cur = appStore.nodeSelectedGroup
    if (cur !== 'all' && !gs.includes(cur)) {
      appStore.nodeSelectedGroup = 'all'
    }
  },
  { immediate: true },
)

function isNodeMatchSearch(node: typeof nodesStore.nodes[number], search: string): boolean {
  if (!search.trim())
    return true
  const lowerSearch = search.toLowerCase().trim()
  if (node.name.toLowerCase().includes(lowerSearch))
    return true
  if (node.region && isRegionMatch(node.region, search))
    return true
  if (node.os && node.os.toLowerCase().includes(lowerSearch))
    return true
  if (parseNodeGroups(node.group).some(group => group.toLowerCase().includes(lowerSearch)))
    return true
  if (node.tags && node.tags.toLowerCase().includes(lowerSearch))
    return true
  if (node.remark && node.remark.toLowerCase().includes(lowerSearch))
    return true
  return false
}

const groupNodeList = computed(() => {
  return nodesStore.nodes.filter(node => isNodeInGroup(node.group, appStore.nodeSelectedGroup))
})

const sampledGroupNodeList = computed(() => {
  return nodesStore.earthNodes.filter(node => isNodeInGroup(node.group, appStore.nodeSelectedGroup))
})

const nodeList = computed(() => {
  let filtered = groupNodeList.value
  if (debouncedSearchText.value.trim()) {
    filtered = filtered.filter(n => isNodeMatchSearch(n, debouncedSearchText.value))
  }
  return filtered
})

const selectedPingNode = computed(() => {
  if (!selectedPingNodeUuid.value)
    return null
  return nodesStore.nodes.find(node => node.uuid === selectedPingNodeUuid.value) ?? null
})

watch(pingDialogOpen, (open) => {
  if (pingDialogCleanupTimer !== null) {
    window.clearTimeout(pingDialogCleanupTimer)
    pingDialogCleanupTimer = null
  }
  if (!open) {
    pingDialogCleanupTimer = window.setTimeout(() => {
      selectedPingNodeUuid.value = null
      pingDialogCleanupTimer = null
    }, 280)
  }
})

function handleNodeClick(node: typeof nodesStore.nodes[number]) {
  router.push({ name: 'instance-detail', params: { id: node.uuid } })
}

function handlePingClick(node: NodeData) {
  if (pingDialogCleanupTimer !== null) {
    window.clearTimeout(pingDialogCleanupTimer)
    pingDialogCleanupTimer = null
  }
  selectedPingNodeUuid.value = node.uuid
  nextTick(() => {
    pingDialogOpen.value = true
  })
}

onBeforeUnmount(() => {
  window.cancelAnimationFrame(viewModeFeedbackFrame)
  window.cancelAnimationFrame(viewModeCommitFrame)
  if (pingDialogCleanupTimer !== null)
    window.clearTimeout(pingDialogCleanupTimer)
  if (searchReorderMotionTimer !== null)
    window.clearTimeout(searchReorderMotionTimer)
  clearNodeLoadingStateTimer()
})

function getNodeItemTransitionKey(node: typeof nodesStore.nodes[number]): string {
  return `${appStore.nodeSelectedGroup}-${node.uuid}`
}

function getNodeItemTransitionStyle(index: number): Record<string, string> {
  return {
    '--node-item-delay': `${Math.min(index, nodeItemStaggerLimit) * nodeItemStaggerMs}ms`,
  }
}

function freezeLeavingNodeRect(element: Element) {
  const item = element as HTMLElement
  const { offsetHeight, offsetLeft, offsetTop, offsetWidth } = item
  item.style.position = 'absolute'
  item.style.inset = 'auto'
  item.style.top = `${offsetTop}px`
  item.style.left = `${offsetLeft}px`
  item.style.width = `${offsetWidth}px`
  item.style.height = `${offsetHeight}px`
  item.style.pointerEvents = 'none'
}

function clearLeavingNodeRect(element: Element) {
  const item = element as HTMLElement
  for (const property of ['position', 'inset', 'top', 'left', 'width', 'height', 'pointer-events'])
    item.style.removeProperty(property)
}
</script>

<template>
  <div class="home-view">
    <section class="lnl-dashboard-head" aria-labelledby="overview-title">
      <div>
        <span class="lnl-kicker">{{ appStore.brandHeroKicker }}</span>
        <h1 id="overview-title">
          {{ appStore.brandHeroTitle }}
        </h1>
        <p>{{ appStore.brandHeroDescription }}</p>
      </div>
      <dl class="lnl-dashboard-status">
        <div><dt>ONLINE</dt><dd>{{ onlineNodeCount }}<span>/ {{ totalNodeCount }}</span></dd></div>
        <div><dt>TRANSPORT</dt><dd>{{ appStore.rpcTransportMode.toUpperCase() }}</dd></div>
        <Transition name="status-rotate" mode="out-in">
          <div
            :key="auxiliaryStatus.key"
            class="lnl-dashboard-status-aux lnl-dashboard-status-aux-inner"
            :class="{ 'is-urgent': auxiliaryStatus.urgent }"
          >
            <dt>{{ auxiliaryStatus.label }}</dt>
            <DataTooltip as="dd" placement="bottom" :content="auxiliaryStatus.value" class="block" content-class="whitespace-nowrap px-2 py-1 text-[11px]">
              <span class="lnl-dashboard-status-value">{{ auxiliaryStatus.value }}</span>
              <small>{{ auxiliaryStatus.meta }}</small>
            </DataTooltip>
          </div>
        </Transition>
      </dl>
    </section>
    <div v-if="appStore.connectionError" class="alert lnl-link-interruption px-4">
      <Alert
        variant="destructive"
        :class="pickSurfaceClass('border border-red-500/20 bg-red-400/8 rounded-[var(--lnl-radius-card)]', 'border border-red-400/25 bg-red-400/10 rounded-[var(--lnl-radius-card)]')"
      >
        <AlertTitle>RPC 服务错误</AlertTitle>
        <AlertDescription>连接服务器失败，请检查网络设置或刷新页面后再试。</AlertDescription>
      </Alert>
    </div>

    <div v-if="appStore.alertEnabled && appStore.alertContent" class="alert px-4">
      <Alert :class="pickSurfaceClass('border-none bg-background rounded-md', 'border-none bg-background/60 backdrop-blur-xs rounded-md')">
        <AlertTitle v-if="appStore.alertTitle">
          {{ appStore.alertTitle }}
        </AlertTitle>
        <AlertDescription>
          <MarkdownRenderer :content="appStore.alertContent" />
        </AlertDescription>
      </Alert>
    </div>

    <NodeGeneralCards
      v-if="appStore.earthViewMode !== 'hide'"
      :nodes="groupNodeList"
      :globe-nodes="sampledGroupNodeList"
      :transition-key="appStore.nodeSelectedGroup"
    />

    <div class="node-info p-4 pt-0 flex flex-col gap-4 relative z-1 md:pointer-events-none" :class="appStore.earthViewMode === 'hide' && 'pt-4'">
      <div class="nodes">
        <Tabs v-model="appStore.nodeSelectedGroup" class="w-full flex-col gap-4">
          <div
            class="lnl-node-toolbar"
            :class="{ 'is-searching': searchOpen, 'is-motion-reduced': appStore.disablePageAnimation }"
          >
            <div class="lnl-node-tabs overflow-x-auto rounded-sm md:pointer-events-auto">
              <TabsList :class="pickSurfaceClass('w-max h-8 bg-background/60 rounded-md', 'w-max h-8 bg-background/50 backdrop-blur-xl rounded-md')">
                <TabsTrigger
                  v-for="g in groups" :key="g.name" :value="g.name"
                  class="h-6.5 flex-none shrink-0 text-xs border-none data-[state=active]:text-emerald-800 dark:data-[state=active]:text-emerald-300 shadow-none rounded-sm"
                >
                  {{ g.tab }}
                </TabsTrigger>
              </TabsList>
            </div>
            <div class="lnl-node-actions ml-auto search flex gap-2 items-center pointer-events-auto">
              <Button
                variant="outline" size="icon" aria-label="卡片视图"
                :aria-pressed="appStore.nodeViewMode === 'card'"
                class="h-8 w-8 border-none shadow-none rounded-md"
                :class="[pickSurfaceClass('bg-background hover:bg-background/95', 'bg-background/50 hover:bg-background/60 backdrop-blur-xs'), appStore.nodeViewMode === 'card' ? '!text-emerald-800 dark:!text-emerald-300 !bg-background' : '']"
                @click="setNodeViewMode('card')"
              >
                <Icon icon="tabler:layout-grid" :width="14" :height="14" />
              </Button>
              <Button
                variant="outline" size="icon" aria-label="列表视图"
                :aria-pressed="appStore.nodeViewMode === 'list'"
                class="h-8 w-8 border-none shadow-none rounded-md"
                :class="[pickSurfaceClass('bg-background hover:bg-background/95', 'bg-background/50 hover:bg-background/60 backdrop-blur-xs'), appStore.nodeViewMode === 'list' ? '!text-emerald-800 dark:!text-emerald-300 !bg-background' : '']"
                @click="setNodeViewMode('list')"
              >
                <Icon icon="tabler:table" :width="14" :height="14" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                class="lnl-node-search-toggle h-8 w-8 border-none shadow-none"
                :aria-label="searchOpen ? '关闭节点搜索' : '打开节点搜索'"
                :aria-expanded="searchOpen"
                aria-controls="node-search"
                @click="toggleNodeSearch"
              >
                <Icon :icon="searchOpen ? 'tabler:x' : 'tabler:search'" :width="14" :height="14" />
              </Button>
            </div>
            <div class="lnl-node-search-drawer" :class="{ 'is-open': searchOpen }">
              <div class="lnl-node-search-drawer-inner">
                <div class="lnl-node-search-field">
                  <Icon icon="tabler:search" :width="15" :height="15" aria-hidden="true" />
                  <Input
                    id="node-search"
                    v-model="searchText"
                    name="node-search"
                    placeholder="搜索节点名称、地区、系统"
                    :tabindex="searchOpen ? 0 : -1"
                    :aria-hidden="!searchOpen"
                    class="lnl-node-search-input h-9 rounded-[var(--lnl-radius-control)] !border-0 !bg-transparent pl-9 pr-24 !shadow-none !ring-0 focus:!ring-0"
                    @keydown="handleSearchKeydown"
                  />
                  <span class="lnl-node-search-meta">{{ debouncedSearchText ? `${nodeList.length} 个结果` : `${groupNodeList.length} 个节点` }}</span>
                </div>
              </div>
            </div>
          </div>
          <TabsContent :key="appStore.nodeSelectedGroup" :value="appStore.nodeSelectedGroup" class="pointer-events-auto">
            <TransitionGroup
              v-if="nodeList.length !== 0 && appStore.nodeViewMode === 'card'"
              :appear="!appStore.disablePageAnimation"
              :css="!appStore.disablePageAnimation"
              :move-class="nodeMoveClass"
              name="node-card-switch"
              tag="div"
              class="relative gap-4 grid grid-cols-1 sm:grid-cols-[repeat(auto-fill,minmax(344px,1fr))]"
              @before-leave="freezeLeavingNodeRect"
              @leave-cancelled="clearLeavingNodeRect"
            >
              <div
                v-for="(node, index) in nodeList"
                :key="getNodeItemTransitionKey(node)"
                class="min-w-0"
                :style="getNodeItemTransitionStyle(index)"
              >
                <NodeCard :node="node" @click="handleNodeClick(node)" @ping-click="handlePingClick" />
              </div>
            </TransitionGroup>
            <NodeList
              v-else-if="nodeList.length !== 0 && appStore.nodeViewMode === 'list'"
              :nodes="nodeList"
              :transition-key="appStore.nodeSelectedGroup"
              @click="handleNodeClick"
              @ping-click="handlePingClick"
            />
            <div
              v-else-if="!nodesStore.initialized"
              class="lnl-node-loading-stage"
              aria-label="正在载入节点"
              aria-busy="true"
            >
              <div v-if="showNodeLoadingState" class="lnl-node-loading-indicator" role="status">
                <Icon icon="tabler:loader-2" :width="18" :height="18" aria-hidden="true" />
                <span>
                  <strong>正在同步节点</strong>
                  <small>读取 Komari 实时状态</small>
                </span>
              </div>
            </div>
            <div v-else class="text-muted-foreground text-center py-8">
              <Empty description="暂无节点" />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>

    <Dialog v-model:open="pingDialogOpen">
      <DialogContent
        v-if="selectedPingNode"
        class="lnl-ping-dialog w-[calc(100vw-1rem)] max-w-[1240px] gap-0 overflow-hidden rounded-[var(--lnl-radius-card)] border-emerald-600/20 p-0 shadow-[0_0_3rem] shadow-emerald-950/20 sm:w-[calc(100vw-2rem)]"
        :class="pickSurfaceClass('bg-background', 'bg-background/94')"
      >
        <DialogHeader class="lnl-ping-dialog-head flex flex-row items-center pr-12">
          <span class="lnl-ping-dialog-index" aria-hidden="true">PING</span>
          <div class="min-w-0">
            <span class="lnl-ping-dialog-kicker">NETWORK QUALITY / ACTIVE PROBES</span>
            <DialogTitle class="truncate text-base font-semibold sm:text-lg">
              {{ selectedPingNode.name }} 延迟与丢包
            </DialogTitle>
          </div>
        </DialogHeader>
        <div class="max-h-[calc(92dvh-64px)] overflow-y-auto p-2 sm:p-3">
          <PingChart :uuid="selectedPingNode.uuid" />
        </div>
      </DialogContent>
    </Dialog>
  </div>
</template>

<style scoped>
.lnl-node-loading-stage {
  display: grid;
  min-height: 8rem;
  place-items: center;
}

.lnl-node-loading-indicator {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border: 1px solid var(--lnl-line);
  border-radius: var(--lnl-radius-control);
  background: color-mix(in srgb, var(--lnl-surface-raised) 88%, transparent);
  color: var(--muted-foreground);
  animation: lnl-node-loading-enter 220ms ease both;
}

.lnl-node-loading-indicator > svg {
  flex: none;
  color: var(--lnl-green);
  animation: lnl-node-loading-spin 900ms linear infinite;
}

.lnl-node-loading-indicator span {
  display: grid;
  gap: 2px;
}

.lnl-node-loading-indicator strong {
  color: var(--foreground);
  font-size: 12px;
  font-weight: 620;
}

.lnl-node-loading-indicator small {
  font: 9px/1.2 var(--font-mono);
  letter-spacing: 0.04em;
}

@keyframes lnl-node-loading-enter {
  from {
    opacity: 0;
    transform: translate3d(0, 4px, 0);
  }
}

@keyframes lnl-node-loading-spin {
  to {
    transform: rotate(1turn);
  }
}

.lnl-ping-dialog-head {
  min-height: 58px;
  gap: 12px;
  padding: 8px 16px;
  border-bottom: 1px solid var(--lnl-line);
  background:
    linear-gradient(90deg, color-mix(in srgb, var(--lnl-green) 7%, transparent), transparent 48%),
    color-mix(in srgb, var(--background) 96%, var(--lnl-surface));
}
.lnl-ping-dialog-index {
  display: grid;
  width: 38px;
  height: 38px;
  flex: 0 0 38px;
  place-items: center;
  border: 1px solid color-mix(in srgb, var(--lnl-green) 52%, var(--lnl-line));
  border-radius: var(--lnl-radius-control);
  color: var(--lnl-green);
  font: 9px var(--font-mono);
  letter-spacing: 0.08em;
}

.lnl-link-interruption :deep([role='alert']) {
  box-shadow: 0 14px 34px color-mix(in srgb, var(--destructive) 9%, transparent);
}
.lnl-ping-dialog-kicker {
  display: block;
  margin-bottom: 3px;
  color: var(--lnl-green);
  font: 8px/1.3 var(--font-mono);
  letter-spacing: 0.13em;
}

.lnl-node-search-drawer {
  grid-column: 1 / -1;
  display: grid;
  z-index: 2;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  box-sizing: border-box;
  grid-template-rows: 0fr;
  overflow: hidden;
  pointer-events: none;
  transition: grid-template-rows var(--lnl-motion-standard) var(--lnl-ease-emphasis);
}

.lnl-node-search-drawer.is-open {
  grid-template-rows: 1fr;
  pointer-events: auto;
}

.lnl-node-search-drawer-inner {
  display: flex;
  width: 100%;
  max-width: 100%;
  min-height: 0;
  min-width: 0;
  box-sizing: border-box;
  justify-content: flex-end;
  overflow: hidden;
  opacity: 0;
  transform: translate3d(0, -8px, 0);
  transition:
    opacity var(--lnl-motion-fast) ease,
    transform var(--lnl-motion-standard) var(--lnl-ease-emphasis),
    padding-top var(--lnl-motion-standard) var(--lnl-ease-emphasis);
}

.lnl-node-search-drawer.is-open .lnl-node-search-drawer-inner {
  padding: 10px 4px 4px;
  opacity: 1;
  transform: none;
}

.lnl-node-search-field {
  position: relative;
  display: flex;
  flex: 0 1 720px;
  width: clamp(280px, 52vw, 720px);
  max-width: calc(100% - 8px);
  min-width: 0;
  box-sizing: border-box;
  align-items: center;
  border: 1px solid color-mix(in srgb, var(--lnl-line) 82%, var(--foreground) 8%);
  border-radius: var(--lnl-radius-inner);
  background: color-mix(in srgb, var(--lnl-surface-raised, var(--card)) 92%, transparent);
  box-shadow: var(--lnl-shadow-soft, 0 8px 24px rgb(0 0 0 / 8%));
}

.lnl-node-search-field > svg {
  position: absolute;
  z-index: 1;
  left: 12px;
  color: var(--lnl-green);
}

.lnl-node-search-field:focus-within {
  border-color: color-mix(in srgb, var(--lnl-green) 56%, var(--lnl-line));
  box-shadow:
    inset 0 0 0 1px color-mix(in srgb, var(--lnl-green) 22%, transparent),
    var(--lnl-shadow-soft, 0 8px 24px rgb(0 0 0 / 8%));
}

.lnl-node-search-meta {
  position: absolute;
  right: 11px;
  color: var(--muted-foreground);
  font-size: 11px;
  white-space: nowrap;
}

.lnl-node-toolbar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  gap: 0 8px;
}

@media (max-width: 640px) {
  .lnl-node-toolbar {
    width: 100%;
  }

  .lnl-node-toolbar .lnl-node-tabs {
    width: 100%;
    min-width: 0;
  }

  .lnl-node-toolbar .lnl-node-actions {
    width: auto;
    min-width: 0;
    margin-left: 0;
  }

  .lnl-node-search-meta {
    font-size: 10px;
  }

  .lnl-node-search-field {
    flex-basis: auto;
    width: calc(100% - 8px);
    max-width: calc(100% - 8px);
  }
}

.lnl-node-search-input {
  display: block;
  width: 100%;
  min-width: 0;
  border: 0 !important;
  box-shadow: none !important;
  outline: 0 !important;
}

.lnl-node-search-toggle {
  flex: 0 0 32px;
  transition:
    color var(--lnl-motion-fast) ease,
    background-color var(--lnl-motion-fast) ease,
    transform var(--lnl-motion-standard) var(--lnl-ease-emphasis);
}

.lnl-node-toolbar.is-searching .lnl-node-search-toggle {
  color: var(--lnl-green);
  transform: rotate(90deg);
}

:global(.lnl-ping-dialog[data-state='open']) {
  animation: lnl-ping-dialog-in 360ms cubic-bezier(0.16, 1, 0.3, 1) both;
}

:global(.lnl-ping-dialog[data-state='closed']) {
  animation: lnl-ping-dialog-out 240ms cubic-bezier(0.4, 0, 1, 1) both;
}

@keyframes lnl-ping-dialog-in {
  from {
    opacity: 0;
    transform: translate3d(0, 20px, 0) scale(0.985);
  }
  to {
    opacity: 1;
    transform: translate3d(0, 0, 0) scale(1);
  }
}

@keyframes lnl-ping-dialog-out {
  from {
    opacity: 1;
    transform: translate3d(0, 0, 0) scale(1);
  }
  to {
    opacity: 0;
    transform: translate3d(0, 12px, 0) scale(0.992);
  }
}

.node-card-switch-enter-active,
.node-card-switch-leave-active {
  transition:
    opacity 360ms ease,
    transform 520ms cubic-bezier(0.16, 1, 0.3, 1);
}

.node-card-switch-enter-active {
  transition-delay: var(--node-item-delay, 0ms);
}

.node-card-switch-move {
  transition: transform 360ms cubic-bezier(0.22, 1, 0.36, 1);
}

.node-card-switch-leave-active {
  z-index: 0;
}

.node-card-switch-enter-from {
  opacity: 0;
  transform: translate3d(0, 18px, 0);
}

.node-card-switch-leave-to {
  opacity: 0;
  transform: translate3d(0, -6px, 0);
}

@media (prefers-reduced-motion: reduce) {
  .lnl-node-loading-indicator,
  .lnl-node-loading-indicator > svg {
    animation: none;
  }

  :global(.lnl-ping-dialog[data-state='open']),
  :global(.lnl-ping-dialog[data-state='closed']) {
    animation: none;
  }

  .node-card-switch-enter-active,
  .node-card-switch-leave-active,
  .node-card-switch-move {
    transition: none;
    transition-delay: 0ms;
  }

  .node-card-switch-enter-from,
  .node-card-switch-leave-to {
    opacity: 1;
    transform: none;
  }

  .lnl-node-search-drawer,
  .lnl-node-search-input,
  .lnl-node-search-toggle {
    transition: none;
  }
}

.lnl-node-toolbar.is-motion-reduced .lnl-node-search-drawer,
.lnl-node-toolbar.is-motion-reduced .lnl-node-search-input,
.lnl-node-toolbar.is-motion-reduced .lnl-node-search-toggle {
  transition: none;
}
</style>
