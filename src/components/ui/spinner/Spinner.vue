<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { useMotionPreference } from '@/composables/useMotionPreference'
import { cn } from '@/lib/utils'

interface Props {
  size?: number | string
  stroke?: number | string
  show?: boolean
  description?: string
  contentClass?: HTMLAttributes['class']
  class?: HTMLAttributes['class']
}

const props = withDefaults(defineProps<Props>(), {
  size: 24,
  stroke: 2,
  show: true,
})

const { motionReduced } = useMotionPreference()

function toSize(v: number | string) {
  return typeof v === 'number' ? `${v}px` : v
}
</script>

<template>
  <div :class="cn('relative', props.class)">
    <slot />
    <Transition name="lnl-spinner-fade" :css="!motionReduced">
      <div
        v-if="show"
        :class="cn(
          'lnl-spinner-overlay absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-card/60 backdrop-blur-sm',
          props.contentClass,
        )"
      >
        <span
          class="inline-block animate-spin rounded-full border-solid"
          :style="{
            width: toSize(size),
            height: toSize(size),
            borderWidth: toSize(stroke),
            borderColor: 'color-mix(in srgb, currentColor 18%, transparent)',
            borderTopColor: 'currentColor',
          }"
        />
        <span v-if="description || $slots.description" class="text-sm text-muted-foreground">
          <slot name="description">{{ description }}</slot>
        </span>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.lnl-spinner-fade-enter-active,
.lnl-spinner-fade-leave-active {
  transition:
    opacity 180ms ease,
    backdrop-filter 180ms ease;
}

.lnl-spinner-fade-leave-active {
  pointer-events: none;
}

.lnl-spinner-fade-enter-from,
.lnl-spinner-fade-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .lnl-spinner-fade-enter-active,
  .lnl-spinner-fade-leave-active {
    transition: none;
  }
}
</style>
