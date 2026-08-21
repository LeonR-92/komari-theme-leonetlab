/**
 * v1.2.8 起 intro 与首页 dashboard 使用同一个 cobe 实例：引擎组件的 DOM
 * （含 canvas 与 WebGL 上下文）在交接时经 Vue Teleport 从 intro 槽位移入
 * 飞行壳、再搬入 dashboard 槽位，旋转相位连续性由"同一实例"天然保证，
 * 原先的 sharedIntroOrientation 朝向共享职责已退役。
 *
 * 本模块保留无头浏览器回归探针：仅当页面预置 window.__lnlGlobeProbe 时
 * 启用，生产环境不存在该全局变量，保持零开销。
 */

/** 无头浏览器回归探针样本 */
export interface GlobeProbeSample {
  phi: number
  /** Component mount orientation, used to prove that the intro rotated at least once. */
  initialPhi?: number
  theta: number
  t: number
  /** 采样时是否允许自动旋转 / 是否满足渲染条件（定位交接期暂停用） */
  autoRotate?: boolean
  shouldRender?: boolean
}

export interface GlobeProbeStore {
  intro?: GlobeProbeSample
  dashboard?: GlobeProbeSample
  handoff?: GlobeProbeSample
  /** 最近一次 rAF 暂停的诊断信息 */
  lastPause?: {
    variant: string
    t: number
    shouldRender: boolean
    autoRotate: boolean
    documentVisibility: string
    elementVisible: boolean
  }
}

/**
 * 测试探针：仅当页面脚本预置 window.__lnlGlobeProbe 时启用；
 * 生产环境不存在该全局变量，保持零开销。
 */
export function getGlobeProbe(): GlobeProbeStore | null {
  if (typeof window === 'undefined')
    return null
  return (window as unknown as { __lnlGlobeProbe?: GlobeProbeStore }).__lnlGlobeProbe ?? null
}
