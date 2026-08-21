# Changelog

## 1.4.3-fix2 — 2026-08-21

- Replaced the build-locked offline Service Worker with a network-only root worker that retires legacy theme caches without retaining HTML or hashed assets across Komari theme switches.
- Removed the theme-owned install prompt, background update checks, offline shell, explicit worker unregistration and destructive cache-repair path; installation is now left to the browser/Komari PWA surface.
- Removed the manifest's experimental `navigate-existing` launch handler and made installed-app launches replay the enabled intro deterministically, while manual reloads remain once-per-session.
- Restored Komari's `price`, `billing_cycle` and `currency` fields as the authoritative node-card payment source: `119 USD / year` now remains `$119` instead of being promoted to an approximate CNY headline.
- Derived monthly, quarterly and yearly views from recognized billing periods, preserved exact source amounts for matching periods, and limited day-based estimates to custom cycles.
- Reframed the existing managed card currency as a tooltip-only reference conversion, added one-time-payment handling, and moved the billing chevron into a true right-edge slot by making the trigger fill its finance cell.
- Kept runtime polling active after a transient startup request failure so node data can recover without reloading the page, while preserving private-site redirects.
- Guarded appearance override storage so restricted PWA/WebView storage cannot break theme, palette, cursor or restore interactions.

### Earlier 1.4.3-fix2b baseline (PWA behavior superseded above)

- Removed the conflicting in-page cache-refresh control; Service Worker updates now remain silent and activate naturally on the next launch, while the boot failure screen retains an explicit bounded recovery action.
- Fixed installed-app detection for standalone, minimal-UI and window-controls-overlay display modes, and discarded one-shot install prompts after every user choice.
- Hardened shell installation and navigation fallbacks against mismatched builds and invalid content while continuing to exclude RPC, API, telemetry and user data from caching.
- Closed long-running lifecycle gaps in request timeouts, post-unmount responses, animation-frame cleanup, hidden-page rendering and custom-background video playback.
- Tightened optional metric compatibility/error isolation and repaired visible-label accessibility for node, billing, Ping and globe interactions.

### Earlier 1.4.3-fix2a baseline (PWA behavior superseded above)

- Removed the full-screen animated DataOcean canvas and secondary depth plane, retaining one palette-aware, visibility-paused CSS dot plane.
- Capped the persistent COBE globe at 45 fps on desktops and 30 fps on mobile/coarse-pointer devices, with size-aware DPR pixel budgets and reduced map sampling.
- Removed per-frame computed-style and layout reads from regional markers, batched viewport measurements, and limited layer hints to active animation windows.
- Changed PWA updates to silent next-launch activation, made critical shell installation atomic, added a version-matched last-known-good shell and a built-in offline recovery page.
- Reworked startup recovery so its automatic retry does not unregister the Service Worker or delete caches; destructive recovery now requires an explicit user action.
- Added compact, standard and hidden managed homepage layouts, with compact spacing and type as the default.

## 1.4.3-fix1 — 2026-08-14

- Corrected finance semantics so homepage and detail summaries use the payment amount entered in Komari instead of depreciating it into a misleading remaining value.
- Renamed source-price tooltips to “backend payment” and added daily-average spending alongside payment total and monthly-average spending.
- Simplified the billing-period menu to direct monthly, quarterly and yearly choices, and rebuilt the compact trigger grid so its chevron stays centered while three-digit amounts remain readable.
- Made the first-visit cover, theme fallback texture, management handoff and the existing COBE globe inherit the active palette without recreating the WebGL instance.
- Added focused regression coverage for billing-menu readability, chevron geometry, intro palette inheritance, in-place globe recoloring and managed appearance defaults.
- Added a unified appearance panel with visitor-persisted brightness, four observatory palettes, native/halo cursor selection and restoration to managed site defaults.
- Added synchronized monthly, quarterly and yearly billing display with compact unambiguous currency symbols, precise tooltips and a portal-based keyboard menu.
- Fixed the Ping dialog transform so every animation frame remains centered, and rebuilt the mobile Ping workspace around readable horizontal probe cards and tighter chart spacing.
- Kept semantic health colors, legacy node normalization, controlled Ping fallback and Service Worker data-cache exclusions unchanged.

## 1.4.3 — 2026-08-13

- Replaced the full-page color interpolation with a single 680 ms circular View Transition reveal from the top-right theme control.
- Added a lightweight clip-path fallback, last-request queueing, reduced-motion settlement and early theme boot synchronization without rebuilding page state.
- Tightened the mobile visitor scan and compact-bar typography so the final shrink remains aligned without clipped or overflowing labels at 320–390 px.
- Centered the compact visitor location, masked address and detail action on one shared horizontal axis.
- Added focused desktop and mobile regression coverage for reveal geometry, both theme directions, rapid input and fallback cleanup.

## 1.4.3-pre.0 — 2026-08-13

- Refined the top-right light/dark circular wipe with a longer compositor-driven expansion, a smoother two-stage easing curve and a coverage-aligned theme commit.
- Preserved immediate reduced-motion settlement, single completion, hidden-render fallback and managed color-mode priority.
- Rechecked the Komari 1.4.3 settings contract, extended telemetry linkage and primary interface/transition paths before the release candidate stage.

## 1.4.3-beta.3 — 2026-08-13

- Aligned the primary runtime and fixture target with Komari 1.4.3 while preserving the legacy node normalization and controlled Ping fallbacks.
- Added backend-managed switches for the extended telemetry workspace and each connection, process, GPU utilization, GPU memory and GPU temperature view.
- Added capability-gated GPU memory and temperature charts using the official public metric definitions and query interface without introducing admin RPC access.
- Re-audited the intro handoff, visitor morph, theme transition, chart lifecycle and responsive interaction paths.

## 1.4.3-beta.2 — 2026-08-13

- Fixed a desktop/PWA startup deadlock where an invalid or stale entry asset could leave the pre-mount loading screen visible forever.
- Added one bounded, theme-only cache recovery attempt before presenting an actionable retry state; theme settings and user data are never cleared.
- Restricted Service Worker reads to the current version cache, removed superseded theme caches on activation, and rejected HTML fallback responses for JavaScript or CSS assets.

## 1.4.3-beta.1 — 2026-08-13

- Restored the visible single-instance globe flight by committing its source geometry across a real paint boundary without a forced synchronous layout.
- Isolated optional GPU telemetry states so unavailable, empty, stale or failed requests never block the connection and process charts.
- Improved first-render concurrency, animation lifecycle cleanup and intentional node-reorder transitions.
- Bundled the exact Iconify glyph set locally and expanded deterministic Windows PWA icon coverage.
- Added capability-gated metric definitions and lazy GPU telemetry without changing managed settings or legacy compatibility fallbacks.
- Consolidated optional connection, process and GPU charts into one viewport-lazy extended telemetry workspace.

## 1.4.2-fix1 — 2026-08-10

- Formalized the `1.4.2-opt.a` and `1.4.2-opt.b` optimization work as the stable `1.4.2-fix1` release.
- Fixed visitor-scan completion so the expanded card continuously transitions into the final clickable bar without an intermediate width snap.
- Moved rounded uptime into a fixed-width header status slot, balanced the remaining lifecycle metrics into three equal cells, and replaced false loading cards with one delayed sync status.
- Renamed the public theme to **Komari Observatory** while retaining the unique market short name `LeoNetLab` for update compatibility.
- Refreshed the public four-node preview, shortened the README, and removed obsolete one-off audit scripts.

## 1.4.2-opt.b — 2026-08-10

- Reworked the visitor scan finish into one continuous card-to-compact-bar geometry transition, removing the intermediate full-width strip and final snap.
- Moved rounded uptime into a fixed-width header status badge and redistributed upload, download, and monthly cost into three equal lifecycle cells to prevent truncation.
- Replaced the immediate three-card loading skeleton with one delayed semantic sync indicator so fast node responses no longer flash false empty cards.

## 1.4.2-opt.a — 2026-08-10

- Optimized motion lifecycle handling, reduced-motion responsiveness, browser and device detection, and animation cleanup without changing managed settings or Komari data contracts.
- Froze the production browser baseline across Chromium, Firefox, and WebKit and added reproducible Playwright coverage for the primary responsive interaction paths.
- Tightened TypeScript boundaries, removed confirmed dead transport code, separated lint checking from automatic fixes, and preserved the legacy node normalization and controlled Ping fallback layers.
- Refined observatory surfaces, focus treatment, safe-area behavior, and cross-device interaction details while retaining the established Soft Network Observatory identity.
- This version is a local candidate only. It is not committed, pushed, released, or installed on a live Komari instance.

## 1.4.2 — 2026-08-08

- Rebuilt the interface around softer rounded surfaces, compact visual telemetry, animated resource gauges, a refined dark-mode hierarchy, and consistent interaction motion.
- Aligned modern Ping metrics and compatibility behavior with Komari 1.4.2 while preserving legacy array and UUID-keyed node responses.
- Improved globe dragging, regional telemetry, search reordering, monthly finance presentation, first-visit handoff, PWA installation, offline fallback, and user-confirmed cache updates.
- Fixed the visitor scan completion path so it uses one serial state machine, never replays row-exit motion, and settles into the compact bar without a trailing size animation.
- Added regression coverage for visitor playback, mobile/desktop layout, theme settings, data interfaces, PWA startup, compatibility boundaries, and package privacy.

> 自 1.3.0 起，主题版本号跟随 Komari 官方版本号一并升级。1.3.0 之前的历史版本（1.0.x – 1.2.9）及其 Release 已随仓库清理移除，本日志从 1.3.0 重新开始记录。

## 1.4.2pre3（SemVer: 1.4.2-pre.3）— 2026-08-08

- 修复访客扫描收束到紧凑态后再次展开时内容层被错误隐藏、紧凑层继续覆盖详情的问题，并增加完整字段与已解析网络信息回归。
- 为搜索抽屉、内层容器、圆角输入框建立统一宽度和溢出边界，移除嵌套输入框的第二层描边，并覆盖 390px 与 1440px 几何回归。
- 重新压低暗色详情页、资源图表和 Ping 工作区的绿色亮度，明确基础、内层与抬升表面层级，保持边界与进度信息可读。
- 首屏公开设置超过有限等待时立即挂载安全默认外壳，HTML 同步提供明暗自适应启动占位，避免慢接口或首次 PWA 安装期间出现纯黑空页。
- Service Worker 更新改为用户确认后接管，不再激活即删除旧版本分包缓存；导航和静态资源加入超时与离线降级，手动清理后自动重建离线核心缓存。
- 本版本只生成本地预览包，不提交、不推送、不创建 Release，也不上传至 Komari。

## 1.4.2pre2（SemVer: 1.4.2-pre.2）— 2026-08-08

- 修复访客扫描解析状态、第三方网络信息与收束阶段的空白卡片；网络查询恢复为默认启用，访客动画继续独立于首访动画。
- 首访启动状态与唯一地球槽位重新同步，消除慢接口下封面迟到、进度已过半和主页槽位提前接管 canvas 的竞态。
- 节点卡统一使用“月付”短标签，列表视图改为圆角分层行、整合节点/系统/标签信息，并补充月付、到期与 Ping 质量信息。
- 搜索框限制桌面宽度并采用独立圆角抽屉，修复展开后横贯整页的双线观感；保留移动端全宽布局和 UUID 驱动的连续重排。
- 按测试要求回退 `1.4.2pre` 新增的 RPC 白名单、节点投影与 URL 拦截行为，仅保留常规代码、依赖、构建产物与敏感信息审计。
- 本版本只生成本地预览包，不提交、不推送、不创建 Release，也不上传至 Komari。

## 1.4.2pre（SemVer: 1.4.2-pre.0）— 2026-08-08

- Ping、地区遥测、搜索、缓存状态、访客卡和中断提示统一为 16/12/10px 圆角层级，并增强暗色模式的表面、文字、边界和质量轨道对比度。
- 搜索改为稳定的第二行抽屉并保留 UUID 驱动的 FLIP 重排；访客扫描使用同锚点交叉收束，且不再依赖首访动画开关。
- 节点卡费用精简为可配置币种的月付金额，30 种币种按需共享汇率；免费、未填写、异常周期和汇率失败均有明确降级。
- 首屏设置与健康检查并行，地球和骨架不再等待节点接口；PWA 更新改为空闲节流检查与用户确认，不缓存导航、RPC、API、访客、汇率或用户数据。
- Komari 1.4.2 优先读取脱敏公开节点接口；旧版回退数据进入 Store 前再次投影，RPC 仅允许已知访客只读方法，公开 URL 拒绝危险协议，访客地理外查默认关闭。
- 本版本只生成本地预览包，不提交、不推送、不创建 Release，也不上传至 Komari。

## 1.4.2b（SemVer: 1.4.2-beta.0）— 2026-08-08

- 光标改为内点快速跟随、外环缓动追随的双速结构，并在位置收敛后停止动画帧。
- 修复国旗图片原生拖拽打断地球指针捕获的问题，补齐取消、失焦和切页清理。
- 网络与生命周期整合为响应式信息轨道，资源环形仪表加入真实数值更新过渡。
- 修正详情卡片标题分隔线重叠，柔化详情折线图，并让访客扫描独立于可选的首访动画、每标签页至多自动播放一次。

## 1.4.2a（SemVer: 1.4.2-alpha.0）— 2026-08-08

- 将整体视觉重构为“柔和网络观测站”：统一圆角曲面、低对比度 1px 边框和中性灰阶，绿色仅承担在线、质量、进度与交互语义。
- 节点卡片改用四项 CSS 环形仪表与清晰的资源、网络生命周期、网络质量层级；紧凑型成为默认，长名称、缺失值、异常百分比和费用状态均保持稳定降级。
- 建立中英文可读的本地系统字体栈和等宽实时数字；新增仅用于精细指针设备的 Observatory 光标，并在输入、触摸、简化动效和文本选择时恢复系统光标。
- 重写地球拖动指针状态机，覆盖国旗、在线数字和详情边缘起拖、阈值判断、指针捕获丢失、窗口失焦及页面隐藏，避免地球偶发锁死和拖后误点。
- 对齐 Komari 1.4.2 的 `interval_seconds`、空采样、指标标签、真实丢包与 `loss_approximate`，继续保留旧节点响应兼容层和受控 Ping 回退。
- PWA 保留稳定静态清单，增加 maskable/Apple 图标、安全区域、安装引导、导航预加载及构建哈希静态预缓存；RPC、API、WebSocket、访客和用户数据仍不进入缓存。
- 本版本仅生成本地测试包，不提交、不推送、不创建 Release，也不上传至 Komari。

## 1.3.1-R — 2026-07-29

- 首访地球从封面开始即驻留于持久交接层，取消交接前的空等和二次搬运；涟漪、位移与缩放同帧启动，落位确认绘制后才释放飞行层。
- 地球国旗结合 COBE 原生正背面可见性信号：背面标记不可见、不可点击，已展开地区转入背面时自动收起；地区详情精简为 CPU、内存和实时吞吐并放大读数。
- 节点卡片补强下半部网络/生命周期与质量仪表层级，费用字段区分“未填写”“免费”和付费状态；访客来源独占首行，其余字段按响应式网格排列。
- 手机节点搜索改为可补间的第二行抽屉，避免打开/关闭时从 flex 瞬切 grid；卡片悬停、触摸反馈和弹窗内容统一使用主题动效变量。
- Ping 仅在 1–2 个采样周期的短缺口使用展示副本线性桥接，长断线仍断开、竖向丢包线保留；原始统计、Tooltip、平滑、节点质量色块不使用插值值。
- 对齐 Komari 1.3.1，并保留 1.2.5-fix1/fix2、1.2.6、1.2.7 回归边界；PWA 缓存升级至 `1.3.1-R`，首访沿用预览阶段已更新的动画会话键，避免重复播放。
- 更新公开预览封面与 README 双语介绍，补充主题市场要求的仓库、原始预览图和最新 Release 安装包说明。

## 1.3.1c（SemVer: 1.3.1-c.1）— 2026-07-29

- 修复地球国旗与在线数量重叠；桌面端保持悬停交互，触屏端改为单击展开地区遥测，再次单击收起。
- 首访动画移除卫星，改为主题色呼吸光环与涟漪释放；同一 WebGL 地球随后精确平移、缩放到主页，完成后再分层浮出界面内容。
- 明暗模式统一采用从右上角展开的全屏圆形遮罩，在完全覆盖后提交主题状态；移除移动端快照分支，降低地球和动态背景并存时的切换卡顿。
- 节点卡片强化资源、网络生命周期与网络质量分区，并将实时节点状态中的 Ping 延迟/丢包同步到读数和最后一个质量色块。
- 修复手机节点搜索遮挡分组按钮的问题；访客详情常驻显示时段问候；PWA 缓存键升级至 `1.3.1-c.1`。

## 1.3.1b（SemVer: 1.3.1-b.1）— 2026-07-29

- 修复地球地区详情被同级国旗与在线数量覆盖的问题；激活地区会提升整个定位层，标记平滑收束后再展开不透明遥测卡片，并放大卡片字号。
- PING 每 15 秒刷新改为无阻塞实时同步：保留现有折线与探针选择，不再周期性显示整页转圈；网络短暂失败时保留旧数据并显示重试状态。
- 明暗切换移植个人站已验证的双路径方案：桌面端使用仅变换与透明度的合成层光晕，移动端使用浏览器 View Transition 圆形揭示；切换期间暂停地球与 DataOcean 绘制，避免掉帧与国旗错位。
- 首访地球新增可关闭的卫星发射、信号扫描与回收动画，完成后仍由同一个 COBE 实例精确平移至主页。
- 访客扫描卡片改为不透明表面，增加本地时段问候与 ASN 展示；节点卡片借鉴清晰的信息层级，新增舒适/紧凑字号后台选项。
- 新增“首访卫星扫描”“地区遥测详情”“节点卡片字号”后台设置，所有开关均有明确前端消费者与回退默认值。
- PWA 缓存键升级至 `1.3.1-b.1`，继续支持页头一键检查更新和仅清理本主题缓存。

## 1.3.1 — 2026-07-29

- 对齐 Komari 1.3.1：PING 指标读取适配“最近 10 分钟精确样本 + 分钟汇总”语义，并读取公开 PING 任务新增的 `weight` 排序字段；旧版仍按受控白名单回退 `common:getRecords`。
- 首访动画新增后台开关。关闭或本会话已播放时不再弹出封面，改为地球、总览与节点卡片分层浮出；封面阶段只保留稳定旋转的地球，国旗在落位后依次出现。
- 基于 COBE 原生标记能力重绘地区标记：悬停、点击或键盘聚焦国旗可查看该地区在线节点、CPU、内存、累计流量与实时吞吐聚合信息。
- 修复 PING 平滑跨越丢包间隙的问题；缺测点现在会真正断开折线、重置 EWMA，并与丢包标记保持同一时间轴。窗口前台刷新缩短为 15 秒，实际新鲜度仍受探针任务周期约束。
- PING 信息提示改为视口级浮层，避免大屏被相邻板块裁切；搜索框开合、PING 内容入场与明暗切换改用更稳定的合成层过渡。
- 节点卡片字体小幅放大并同步调整卡片宽度与 PING 色块高度；移动端 DataOcean 恢复动态，以 24 fps、1x DPR、低密度网格运行。
- PWA 缓存升级至 1.3.1，并在页头新增“刷新主题缓存”操作，只清理 LeoNetLab 主题缓存后重新检查 Service Worker。

## 1.3.0 — 2026-07-25

首个跟随 Komari 版本号发布的版本，当前能力基线：

- 单 cobe 实例首访交接：全程只有一个地球引擎，经 Vue Teleport 从 intro 封面飞入仪表盘槽位，canvas、WebGL 上下文、旋转相位与拖拽状态全程连续，无瞬跳。
- 明暗双主题（北京时间自动模式）、PWA 离线回退、保守的 Service Worker 缓存策略。
- 后台 33 项托管设置全部生效：品牌、文案、刷新间隔、传输方式、默认视图、默认明暗、地球模式、访客信息卡等。
- 移动端性能基线：背景固定不随地址栏抖动、移动端静态背景帧、地球 DPR/帧率上限、轮询后台暂停、图表动画移动端关闭。
- 兼容 Komari `1.2.5-fix1` 至 `1.3.x`；Ping 指标 RPC 不可用时自动回退 `common:getRecords`。
- 仓库卫生：源码树与 git 历史零敏感信息，GitHub secret scanning 与 push protection 开启。
