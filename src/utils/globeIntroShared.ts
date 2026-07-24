/**
 * 首访 intro 与首页 dashboard 地球仪是两个独立的 WebGL 实例。
 * 本模块保存它们之间共享的交接朝向：intro 实例逐帧写入，dashboard 实例在
 * 交接完成时读取，保证 FLIP 交接全程旋转相位连续，不回跳到默认角度。
 *
 * 注意：共享状态必须放在独立模块（或 SFC 的模块作用域 <script> 块）中；
 * 声明在 <script setup> 顶层会让每个组件实例各持一份，dashboard 永远读不到
 * intro 的朝向（历史上 valid 恒 false 的交接瞬跳 bug 即源于此）。
 */

export interface GlobeOrientation {
  phi: number
  theta: number
  valid: boolean
}

/** intro 地球仪实时朝向（模块级单例） */
export const sharedIntroOrientation: GlobeOrientation = { phi: 0, theta: 0, valid: false }

/** 无头浏览器回归探针样本 */
export interface GlobeProbeSample {
  phi: number
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
