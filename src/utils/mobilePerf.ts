// 移动端性能门控：触屏或小视口设备上降低常驻动效与轮询负载（发热/掉帧治理）。
// 一次性读取 matchMedia，与代码库既有 reducedMotion 探测方式保持一致；
// 仅用于性能降级决策，不影响功能可用性。
const coarsePointer = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
const smallViewport = typeof window !== 'undefined' && window.matchMedia('(max-width: 760px)').matches

export const isMobileLike = coarsePointer || smallViewport

// 移动端实时轮询间隔下限（毫秒）：桌面行为不变，移动端不低于 5 秒。
export const MOBILE_POLL_INTERVAL_FLOOR_MS = 5000

// 移动端 TransitionGroup 的 move 占位类：CSS 中不定义任何过渡，
// 使 Vue 的 hasCSSTransform 预检失败，从而跳过每子节点
// getBoundingClientRect 位置测量与强制回流（enter/leave 动画不受影响）。
export const MOBILE_NO_MOVE_CLASS = 'lnl-perf-no-move'
