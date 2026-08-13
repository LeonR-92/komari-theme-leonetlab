import type { DeepReadonly, Ref } from 'vue'
import { readonly, ref } from 'vue'

const clock = ref(Date.now())
let timer: number | null = null
let started = false

function clearClockTimer(): void {
  if (timer === null)
    return
  window.clearTimeout(timer)
  timer = null
}

function scheduleNextMinute(): void {
  clearClockTimer()
  if (document.hidden)
    return

  const now = Date.now()
  const delay = 60_000 - (now % 60_000) + 20
  timer = window.setTimeout(() => {
    clock.value = Date.now()
    scheduleNextMinute()
  }, delay)
}

function handleVisibilityChange(): void {
  if (document.hidden) {
    clearClockTimer()
    return
  }

  clock.value = Date.now()
  scheduleNextMinute()
}

export function useVisibleMinuteClock(): DeepReadonly<Ref<number>> {
  if (!started) {
    started = true
    document.addEventListener('visibilitychange', handleVisibilityChange)
    scheduleNextMinute()
  }
  return readonly(clock)
}
