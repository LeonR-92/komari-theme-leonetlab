import { useMediaQuery } from '@vueuse/core'
import { computed } from 'vue'
import { useAppStore } from '@/stores/app'

export function useMotionPreference() {
  const appStore = useAppStore()
  const systemReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  const motionReduced = computed(() => systemReducedMotion.value || appStore.disablePageAnimation)

  return {
    motionReduced,
    systemReducedMotion,
  }
}
