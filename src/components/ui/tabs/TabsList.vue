<script setup lang="ts">
import type { TabsListProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import type { TabsListVariants } from '.'
import { reactiveOmit } from '@vueuse/core'
import { TabsIndicator, TabsList } from 'reka-ui'
import { useMotionPreference } from '@/composables/useMotionPreference'
import { cn } from '@/lib/utils'
import { tabsListVariants } from '.'

const props = withDefaults(defineProps<TabsListProps & {
  class?: HTMLAttributes['class']
  variant?: TabsListVariants['variant']
}>(), {
  variant: 'default',
})

const delegatedProps = reactiveOmit(props, 'class', 'variant')
const { motionReduced } = useMotionPreference()
</script>

<template>
  <TabsList
    data-slot="tabs-list"
    :data-variant="variant"
    v-bind="delegatedProps"
    :class="cn('relative isolate', tabsListVariants({ variant }), props.class)"
  >
    <TabsIndicator
      v-if="variant !== 'line'"
      data-slot="tabs-indicator"
      class="lnl-tabs-indicator pointer-events-none absolute top-1 bottom-1 left-0 z-0 w-[var(--reka-tabs-indicator-size)] translate-x-[var(--reka-tabs-indicator-position)] rounded-[calc(var(--lnl-radius-control)-2px)] transition-[width,transform,opacity] duration-220 ease-[var(--lnl-ease-emphasis)] motion-reduce:transition-none"
      :class="{ 'transition-none': motionReduced }"
      aria-hidden="true"
    />
    <slot />
  </TabsList>
</template>
