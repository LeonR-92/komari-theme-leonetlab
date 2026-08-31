const pendingActivations: Array<() => void> = []
const ACTIVATIONS_PER_FRAME = 2
let scheduledFrame = 0

function flushActivations(): void {
  scheduledFrame = 0
  for (let index = 0; index < ACTIVATIONS_PER_FRAME; index++) {
    const activate = pendingActivations.shift()
    if (!activate)
      break
    activate()
  }

  if (pendingActivations.length > 0)
    scheduledFrame = window.requestAnimationFrame(flushActivations)
}

/** Schedule expensive ECharts mounts in small frame-aligned batches. */
export function scheduleChartActivation(activate: () => void): () => void {
  if (typeof window === 'undefined') {
    activate()
    return () => undefined
  }

  let cancelled = false
  const task = () => {
    if (!cancelled)
      activate()
  }
  pendingActivations.push(task)

  if (!scheduledFrame)
    scheduledFrame = window.requestAnimationFrame(flushActivations)

  return () => {
    cancelled = true
    const index = pendingActivations.indexOf(task)
    if (index >= 0)
      pendingActivations.splice(index, 1)
    if (!pendingActivations.length && scheduledFrame) {
      window.cancelAnimationFrame(scheduledFrame)
      scheduledFrame = 0
    }
  }
}
