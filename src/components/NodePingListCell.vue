<script setup lang="ts">
import { DataTooltip } from '@/components/ui/data-tooltip'
import { useNodePingDisplay } from '@/composables/useNodePingDisplay'

const props = defineProps<{
  uuid: string
  online: boolean
}>()

const {
  latencyRenderBars,
  lossRenderBars,
} = useNodePingDisplay(() => props.uuid)
</script>

<template>
  <div class="group flex flex-col gap-[1px] pr-4">
    <div data-node-ping-panel="latency" class="group/panel relative items-center gap-1 opacity-90 hover:opacity-100">
      <div
        class="grid h-[6px] cursor-auto items-stretch gap-[1px] transition-transform"
        :style="{ gridTemplateColumns: `repeat(${latencyRenderBars.length}, minmax(0, 1fr))` }"
      >
        <DataTooltip
          v-for="bar in latencyRenderBars"
          :key="bar.key"
          placement="top"
          :content="bar.tooltip"
          class="block h-full min-w-0 w-full"
        >
          <span data-node-ping-bar class="block h-full min-w-[2px] w-full origin-bottom rounded-[1px] transition-transform hover:scale-y-150" :class="bar.className" />
        </DataTooltip>
      </div>
    </div>
    <div data-node-ping-panel="loss" class="group/panel relative items-center gap-1 opacity-90 hover:opacity-100">
      <div
        class="grid h-[6px] cursor-auto items-stretch gap-[1px] transition-transform"
        :style="{ gridTemplateColumns: `repeat(${lossRenderBars.length}, minmax(0, 1fr))` }"
      >
        <DataTooltip
          v-for="bar in lossRenderBars"
          :key="bar.key"
          placement="top"
          :content="bar.tooltip"
          class="block h-full min-w-0 w-full"
        >
          <span data-node-ping-bar class="block h-full min-w-[2px] w-full origin-bottom rounded-[1px] transition-transform hover:scale-y-150" :class="bar.className" />
        </DataTooltip>
      </div>
    </div>
  </div>
</template>
