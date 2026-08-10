import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const read = path => readFileSync(resolve(root, path), 'utf8')
const manifest = JSON.parse(read('komari-theme.json'))
const packageJson = JSON.parse(read('package.json'))
const config = manifest.configuration?.data

assert.equal(typeof manifest.name, 'string')
assert.match(manifest.short, /^[\w-]+$/)
assert.notEqual(manifest.short, 'default')
assert.equal(manifest.version, packageJson.themeVersion)
assert.equal(manifest.configuration?.type, 'managed')
assert.ok(Array.isArray(config), 'managed configuration.data must be an array')

const keys = config.filter(item => item.type !== 'title').map(item => item.key)
assert.equal(new Set(keys).size, keys.length, 'theme setting keys must be unique')
for (const item of config) {
  assert.ok(['title', 'string', 'number', 'select', 'switch', 'richtext'].includes(item.type), `unsupported config type: ${item.type}`)
  if (item.type !== 'title')
    assert.equal(typeof item.key, 'string')
  if (item.type === 'select')
    assert.equal(typeof item.options, 'string')
}

const expectedSettingContract = {
  brandName: ['string', ''],
  brandShortName: ['string', ''],
  brandLogoUrl: ['string', ''],
  brandHeaderSubtitle: ['string', 'NETWORK OBSERVATORY'],
  brandStatusLabel: ['string', 'LIVE TELEMETRY'],
  brandHeroKicker: ['string', 'GLOBAL NETWORK / LIVE OBSERVATION'],
  brandHeroTitle: ['string', '全球节点观测'],
  brandHeroDescription: ['string', ''],
  brandIntroEyebrow: ['string', 'NETWORK OBSERVATORY / GLOBAL EDGE'],
  brandIntroSubtitle: ['string', '正在同步实时节点状态'],
  brandFooterEyebrow: ['string', 'EDGE / OBSERVATION COMPLETE'],
  dataUpdateInterval: ['number', 5],
  rpcTransportMode: ['select', 'websocket', 'websocket,http'],
  defaultViewMode: ['select', 'card', 'card,list'],
  defaultThemeMode: ['select', 'system', 'system,light,dark'],
  introAnimationEnabled: ['switch', false],
  earthViewMode: ['select', 'earth', 'earth,earth-stop,maps,cards,hide'],
  regionalTelemetryEnabled: ['switch', true],
  nodeCardDensity: ['select', 'compact', 'comfortable,compact'],
  nodeCardCurrency: ['select', 'CNY', 'AUD,BRL,CAD,CHF,CNY,CZK,DKK,EUR,GBP,HKD,HUF,IDR,ILS,INR,ISK,JPY,KRW,MXN,MYR,NOK,NZD,PHP,PLN,RON,SEK,SGD,THB,TRY,USD,ZAR'],
  visitorInfoCardEnabled: ['switch', true],
  hideAdminEntryWhenLoggedOut: ['switch', false],
  disablePageAnimation: ['switch', false],
  alertEnabled: ['switch', false],
  alertTitle: ['string', ''],
  alertContent: ['richtext', ''],
  backgroundEnabled: ['switch', false],
  backgroundType: ['select', 'image', 'image,video'],
  lightBackgroundUrl: ['string', ''],
  darkBackgroundUrl: ['string', ''],
  backgroundBlur: ['number', 0],
  backgroundOverlay: ['number', 0],
  icpEnabled: ['switch', false],
  icpNumber: ['string', ''],
  icpUrl: ['string', 'https://beian.miit.gov.cn/'],
  policeEnabled: ['switch', false],
  policeNumber: ['string', ''],
  policeUrl: ['string', ''],
}
assert.equal(keys.length, Object.keys(expectedSettingContract).length, 'managed setting contract count drifted')
for (const [key, [type, defaultValue, options]] of Object.entries(expectedSettingContract)) {
  const item = config.find(entry => entry.key === key)
  assert.ok(item, `missing managed setting contract: ${key}`)
  assert.equal(item.type, type, `managed setting type drifted: ${key}`)
  assert.deepEqual(item.default, defaultValue, `managed setting default drifted: ${key}`)
  if (options !== undefined)
    assert.equal(item.options, options, `managed setting options drifted: ${key}`)
}

assert.ok(existsSync(resolve(root, 'dist/index.html')), 'dist/index.html is missing; run the build first')
const distIndex = read('dist/index.html')
assert.match(distIndex, /<title>Komari Monitor<\/title>/)
assert.match(distIndex, /<meta name="description" content="A simple server monitor tool\."/)

const rpc = read('src/utils/rpc.ts')
const init = read('src/utils/init.ts')
const pingChart = read('src/components/PingChart.vue')
const nodeResponse = read('src/utils/nodeResponse.ts')
const nodesStore = read('src/stores/nodes.ts')
for (const method of ['common:getNodes', 'common:getNodesLatestStatus', 'common:getRecords'])
  assert.ok(`${rpc}\n${init}\n${pingChart}`.includes(method), `missing RPC compatibility method: ${method}`)
assert.match(pingChart, /public:queryMetrics/)
assert.match(pingChart, /isMethodNotFoundError/)
assert.match(pingChart, /fetchLegacyRecords/)
assert.match(rpc, /normalizeUuidCollection/)
assert.match(nodeResponse, /Array\.isArray\(collection\)/)
assert.match(nodeResponse, /normalized\[uuid\] = item/)

const loadingCover = read('src/components/LoadingCover.vue')
const mainCss = read('src/styles/main.css')
assert.match(loadingCover, /brandLogoUrl/)
assert.match(loadingCover, /object-fit:\s*contain/)
assert.match(loadingCover, /prefers-reduced-motion/)
assert.match(loadingCover, /LIVE TOPOLOGY SYNCHRONIZATION/)
assert.match(loadingCover, /NODE STATUS \/ SYNCHRONIZING/)
assert.match(loadingCover, /nodesStore\.initialized/)
assert.match(nodesStore, /const initialized = ref\(false\)/)
assert.match(loadingCover, /lnl-intro-ocean/)
assert.match(loadingCover, /\.lnl-intro:not\(\.has-globe-handoff\)\.lnl-intro-exit-leave-to \.lnl-intro-globe/)
assert.match(loadingCover, /handoffReady/)

const background = read('src/components/Background.vue')
const dataOcean = read('src/components/DataOcean.vue')
const app = read('src/App.vue')
const header = read('src/components/Header.vue')
const footer = read('src/components/Footer.vue')
const visitorInfo = read('src/components/VisitorInfoCard.vue')
const appStore = read('src/stores/app.ts')
const mainSource = read('src/main.ts')
const provider = read('src/components/Provider.vue')
const serviceWorker = read('public/sw.js')
const earthGlobe = read('src/components/NodeEarthGlobe.vue')
const nodeGeneralCards = read('src/components/NodeGeneralCards.vue')
const managedSettingsRuntime = [
  app,
  appStore,
  header,
  footer,
  loadingCover,
  background,
  visitorInfo,
  nodeGeneralCards,
  earthGlobe,
  read('src/components/NodeCard.vue'),
  read('src/components/LoadChart.vue'),
  read('src/composables/useBackgroundSurface.ts'),
  read('src/utils/api.ts'),
  read('src/utils/init.ts'),
  read('src/views/HomeView.vue'),
].join('\n')
for (const settingKey of keys)
  assert.match(managedSettingsRuntime, new RegExp(`\\b${settingKey}\\b`), `managed setting has no runtime consumer: ${settingKey}`)
assert.match(appStore, /isValidEarthViewMode/)
assert.match(appStore, /isValidViewMode/)
assert.match(appStore, /backgroundOverlay >= -100 && settings\.backgroundOverlay <= 100/)
assert.match(appStore, /backgroundBlur >= 0/)
assert.match(background, /lnl-background-ocean/)
assert.match(background, /lnl-background-depth/)
assert.match(background, /<DataOcean/)
assert.doesNotMatch(background, /telemetryLanes|lnl-data-lane|lnl-background-data-ocean|lnl-background-signal|lnl-background-grid|ocean-scan/)
assert.match(dataOcean, /requestAnimationFrame/)
assert.match(dataOcean, /ctx\.arc/)
assert.doesNotMatch(dataOcean, /quadraticCurveTo|createLinearGradient|createRadialGradient/)
assert.match(dataOcean, /prefers-reduced-motion/)
assert.match(dataOcean, /saveData/)
assert.match(dataOcean, /leonetlab:theme-transition-start/)
assert.doesNotMatch(dataOcean, /NODE:|TELEMETRY|DATA STREAM/)
// The intro session key changes only when the intro itself is intentionally
// Preview regressions intentionally receive a fresh session key so the repaired
// handoff can be exercised once without replaying on every visit.
assert.match(app, /komari-observatory:intro:1\.4\.2-fix1/)
assert.match(app, /appShellMounted/)
// 交接离场改用手动 leave 类切换（组件飞行期间保持存活，地球持续旋转）。
assert.match(app, /introLeaving/)
assert.match(app, /'lnl-intro-exit-leave-active lnl-intro-exit-leave-to'/)
// 单实例交接：唯一 COBE 引擎从首访开始驻留于持久飞行层，完成动画后
// 才把同一 canvas 移入 dashboard 槽位，避免任何中间 Teleport 空白帧。
assert.match(app, /<Teleport v-if="globePhase !== 'none'" :to="globeTeleportTarget">/)
assert.match(app, /globePhase/)
assert.match(app, /lnl-globe-flight-shell/)
assert.match(app, /mountIntroGlobeStage/)
assert.match(app, /globePhase === 'intro-stage'/)
assert.match(app, /handoff-active/)
assert.match(app, /#lnl-globe-dashboard-slot/)
assert.match(app, /startGlobeFlight/)
assert.match(app, /void Promise\.allSettled/)
assert.match(app, /initApp\(ensureInitialShell\)/)
assert.match(earthGlobe, /lnl-intro-halo/)
assert.match(earthGlobe, /intro-halo-release/)
assert.match(earthGlobe, /lnl-dashboard-halo/)
assert.match(earthGlobe, /dashboard-halo-ripple/)
assert.match(earthGlobe, /REGION_HOVER_OPEN_MS = 120/)
assert.match(earthGlobe, /REGION_HOVER_CLOSE_MS = 220/)
assert.match(earthGlobe, /pinnedRegionCode/)
assert.match(earthGlobe, /hasFineHoverPointer/)
assert.match(earthGlobe, /handleDocumentPointerDown/)
assert.match(app, /requestDashboardPulse\('route'\)/)
assert.doesNotMatch(earthGlobe, /lnl-intro-satellite/)
assert.match(earthGlobe, /regionalTelemetryEnabled/)
assert.match(earthGlobe, /lnl-earth-overlay\.is-active/)
assert.match(earthGlobe, /--cobe-visible-/)
assert.match(earthGlobe, /data-front/)
assert.doesNotMatch(earthGlobe, /累计流量/)
assert.match(pingChart, /fetchRecords\(\{ background: true \}\)/)
assert.match(pingChart, /backgroundRefreshing/)
assert.match(header, /lnl-theme-orb-desktop/)
assert.match(visitorInfo, /normalizeAsn/)
assert.match(visitorInfo, /getTimeGreeting/)
assert.match(visitorInfo, /is-source/)
assert.match(visitorInfo, /schedulePresentationStep/)
assert.doesNotMatch(visitorInfo, /presentationTimers/)
assert.doesNotMatch(visitorInfo, /<TransitionGroup/)
for (const settingKey of ['regionalTelemetryEnabled', 'nodeCardDensity'])
  assert.ok(keys.includes(settingKey), `missing managed customization setting: ${settingKey}`)
assert.match(app, /introRevealActive/)
assert.match(app, /revealDashboardWithoutIntro/)
assert.match(app, /appStore\.introAnimationEnabled/)
assert.match(app, /:show-markers="globePhase === 'slot'"/)
// 交接收尾由 transitionend 驱动（固定计时器仅兜底），飞行前等待目标槽位挂载。
assert.match(app, /INTRO_HANDOFF_FALLBACK_MS/)
assert.match(app, /INTRO_HANDOFF_TARGET_WAIT_MS/)
assert.match(app, /handleHandoffTransitionEnd/)
assert.match(app, /window\.addEventListener\('transitionend', handleHandoffTransitionEnd\)/)
assert.match(header, /自动（北京时间）/)
assert.match(header, /resolveThemeMode/)
assert.match(header, /lnl-theme-wipe/)
assert.match(header, /lnl-route-cover/)
assert.match(header, /lnl-route-cover\.is-light/)
assert.match(header, /lnl-cache-panel/)
assert.match(header, /data-cache-phase/)
assert.match(header, /cachePanelPhase\.value = 'reloading'/)
assert.match(footer, /<VisitorInfoCard/)
assert.match(visitorInfo, /position:\s*fixed/)
assert.match(visitorInfo, /aria-expanded/)
assert.match(visitorInfo, /\.lnl-visitor\.is-morphing \.lnl-visitor-trigger[\s\S]*width:\s*min\(460px/)
assert.doesNotMatch(visitorInfo, /is-presentation-snap/)
const homeView = read('src/views/HomeView.vue')
assert.match(homeView, /showNodeLoadingState/)
assert.match(homeView, /lnl-node-loading-indicator/)
assert.doesNotMatch(homeView, /lnl-node-skeleton-card/)
assert.match(visitorInfo, /身份信息扫描/)
assert.match(visitorInfo, /visitor-scan-beam/)
assert.match(visitorInfo, /morphing/)
assert.match(visitorInfo, /clip-path/)
assert.doesNotMatch(visitorInfo, /width 760ms/)
assert.doesNotMatch(visitorInfo, /backdrop-filter:\s*blur\(16px\)/)
assert.match(footer, /github\.com\/LeonR-92\/komari-theme-leonetlab/)
assert.match(earthGlobe, /AUTO_ROTATION_RADIANS_PER_MS\s*\*\s*Math\.min\(delta/)
assert.match(earthGlobe, /appStore\.earthViewMode === 'earth'/)
assert.doesNotMatch(earthGlobe, /autoRotate\?: boolean/)
// v1.2.8 起朝向共享职责退役：同一实例天然相位连续，模块只保留回归探针；
// reduced-motion 下仍停止自动旋转。
const globeIntroShared = read('src/utils/globeIntroShared.ts')
assert.match(globeIntroShared, /getGlobeProbe/)
assert.doesNotMatch(globeIntroShared, /export const sharedIntroOrientation/)
assert.match(earthGlobe, /from '@\/utils\/globeIntroShared'/)
assert.match(earthGlobe, /__lnlGlobeProbe|globeIntroShared/)
assert.doesNotMatch(earthGlobe, /adoptSharedIntroOrientation/)
assert.doesNotMatch(earthGlobe, /sharedIntroOrientation/)
assert.match(earthGlobe, /useMediaQuery\('\(prefers-reduced-motion: reduce\)'\)/)
assert.match(earthGlobe, /!prefersReducedMotion\.value/)
assert.match(earthGlobe, /motion-reduce:animate-none/)
// 移动端性能门控：独立模块提供 isMobileLike，移动端限制地球 DPR/采样/帧率。
const mobilePerf = read('src/utils/mobilePerf.ts')
assert.match(mobilePerf, /export const isMobileLike/)
assert.match(mobilePerf, /export const MOBILE_NO_MOVE_CLASS/)
assert.match(mobilePerf, /export const MOBILE_POLL_INTERVAL_FLOOR_MS/)
assert.match(earthGlobe, /isMobileLike \? 1\.5 : 2/)
assert.match(earthGlobe, /fpsLimit: isMobileLike \? 30 : null/)
assert.match(dataOcean, /targetFps = isMobileLike \? 24 : 40/)
assert.match(dataOcean, /motionReduced\.value \|\| saveData/)
assert.match(dataOcean, /watch\(motionReduced, syncAnimation\)/)
assert.match(dataOcean, /mobile \? 1 : 1\.3/)
const initManager = read('src/utils/init.ts')
assert.match(initManager, /document\.visibilityState === 'hidden'/)
assert.match(initManager, /POLL_INTERVAL_FLOOR_MS = 5000/)
assert.match(initManager, /return Math\.max\(base, POLL_INTERVAL_FLOOR_MS\)/)
assert.match(initManager, /CLIENT_METADATA_REFRESH_INTERVAL_MS = 60_000/)
assert.match(read('src/views/HomeView.vue'), /MOBILE_NO_MOVE_CLASS/)
assert.match(read('src/views/HomeView.vue'), /freezeLeavingNodeRect/)
assert.match(read('src/views/HomeView.vue'), /@before-leave="freezeLeavingNodeRect"/)
assert.match(read('src/components/NodeList.vue'), /MOBILE_NO_MOVE_CLASS/)
// 封面只保留布局槽位与 HUD，引擎由 App.vue 的 Teleport 放入（intro 变体自动旋转）。
assert.doesNotMatch(loadingCover, /NodeEarthGlobe/)
assert.match(loadingCover, /lnl-intro-globe-hud/)
assert.match(app, /:motion="globePhase === 'slot' \? undefined : 'auto'"/)
assert.match(earthGlobe, /dashboard-marker-in/)
assert.match(earthGlobe, /REGION TELEMETRY/)
assert.match(earthGlobe, /id: cluster\.code/)
assert.match(earthGlobe, /mapBaseBrightness/)
assert.match(earthGlobe, /baseColor:\s*\[1, 1, 1\]/)
assert.match(earthGlobe, /handleFlagError/)
assert.match(earthGlobe, /object-fit:\s*contain/)
assert.match(earthGlobe, /is-dragging[\s\S]*transition:\s*none/)
assert.doesNotMatch(earthGlobe, /watch\(\(\) => appStore\.isDark,[\s\S]{0,180}rebuildGlobe/)
assert.match(earthGlobe, /globe\.update\(\{[\s\S]{0,180}mapBrightness/)
assert.match(earthGlobe, /@pointerdown\.capture="onPointerDown"/)
assert.match(earthGlobe, /POINTER_DRAG_THRESHOLD = 6/)
assert.match(earthGlobe, /lostpointercapture/)
assert.match(earthGlobe, /pointer-events-none absolute inset-0/)
assert.match(nodeGeneralCards, /data-finance-popover/)
assert.match(nodeGeneralCards, /class="sr-only">按下查看财务汇率详情/)
assert.doesNotMatch(nodeGeneralCards, /title="查看财务汇率详情"/)
assert.match(nodeGeneralCards, /width:\s*calc\(200% \+ 8px\)/)
assert.match(nodeGeneralCards, /max-width:\s*calc\(100vw - 32px\)/)
// dashboard 槽位：引擎经 Teleport 落入的宿主，自挂载起占住布局高度。
assert.match(nodeGeneralCards, /id="lnl-globe-dashboard-slot"/)
assert.doesNotMatch(nodeGeneralCards, /<NodeEarthGlobe/)
assert.match(mainCss, /\.lnl-globe-slot \{[\s\S]*?aspect-ratio:\s*1/)
assert.match(mainCss, /\.lnl-globe-slot > \.node-earth-globe/)
assert.match(appStore, /leonetlab:appearance:user-override/)
assert.match(appStore, /!hasThemeModeOverride\.value/)
assert.match(mainSource, /registration\.update\(\)/)
assert.doesNotMatch(mainSource, /controllerchange/)
assert.match(mainSource, /requestIdleCallback/)
assert.match(mainSource, /WARM_THEME_ASSETS/)
assert.match(provider, /brandLogoUrl/)
assert.doesNotMatch(provider, /createObjectURL/)
assert.doesNotMatch(provider, /link\[rel="manifest"\]/)
assert.match(read('index.html'), /rel="manifest" href="\/manifest\.webmanifest"/)
// Service Worker 缓存名必须与 Komari 外显版本保持同步，避免 npm 内部 SemVer 泄漏到安装包。
assert.match(serviceWorker, new RegExp(`komari-observatory-v${packageJson.themeVersion.replaceAll('.', '\\.')}`))
assert.match(serviceWorker, /function cacheFirst/)
assert.match(serviceWorker, /function networkFirst/)
assert.match(serviceWorker, /Promise\.allSettled/)
assert.match(serviceWorker, /navigationPreload/)
assert.match(serviceWorker, /PRECACHE_ASSETS/)
assert.doesNotMatch(serviceWorker, /\.\.\.PRECACHE_ASSETS/)
assert.match(serviceWorker, /WARM_THEME_ASSETS/)
assert.match(serviceWorker, /SKIP_WAITING/)
assert.doesNotMatch(serviceWorker, /\.then\(\(\) => globalThis\.skipWaiting\(\)\)/)
assert.match(read('index.html'), /lnl-boot-fallback/)
assert.ok(['brandName', 'brandShortName', 'brandLogoUrl', 'brandHeroTitle', 'brandIntroSubtitle'].every(key => keys.includes(key)))
assert.match(read('index.html'), /rel="icon" href="\/favicon\.ico"/)
assert.match(read('public/robots.txt'), /Disallow:\s*\/admin/)
assert.match(read('public/llms.txt'), /^# Komari Network Observatory/m)

const nodeCard = read('src/components/NodeCard.vue')
assert.match(nodeCard, /grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/)
assert.match(nodeCard, /Math\.round\(props\.node\.uptime \/ 86_400\)/)
const nodePingDisplay = read('src/composables/useNodePingDisplay.ts')
const nodePingStats = read('src/composables/useNodePingStats.ts')
const pingChartSource = read('src/components/PingChart.vue')
const compatibilityTest = read('scripts/test-node-compat.mjs')
const smokeTest = read('scripts/smoke-komari-1.2.5.mjs')
assert.doesNotMatch(nodeCard, /min-height:\s*354px/)
assert.match(nodeCard, /data-finance-state/)
assert.match(nodeCard, />月付</)
assert.match(nodeCard, /formatNodeMonthlyCost/)
assert.match(nodeCard, /data-node-ping-panel="latency"/)
assert.match(nodeCard, /lnl-node-resource-grid/)
assert.match(nodeCard, /conic-gradient/)
assert.match(nodeCard, /font-variant-numeric:\s*tabular-nums/)
assert.match(nodeCard, /data-node-ping-bar/)
assert.match(nodeCard, /repeat\(\$\{latencyRenderBars\.length\}/)
assert.match(nodePingDisplay, /RECENT_PING_RECORDS_QUERY_HOURS\s*=\s*1/)
assert.match(nodePingDisplay, /livePing/)
assert.match(nodePingDisplay, /nodesStore\.nodesByUuid/)
assert.match(nodePingStats, /PING_RECORD_REFRESH_INTERVAL_MS\s*=\s*15_000/)
assert.match(pingChartSource, /PING_DIALOG_REFRESH_INTERVAL_MS\s*=\s*15_000/)
assert.match(pingChartSource, /public:getPublicPingTasks/)
assert.match(pingChartSource, /weight\?: number/)
assert.match(pingChartSource, /aggregation_by_metric/)
assert.match(pingChartSource, /'ping\.latency_ms':\s*'last'/)
assert.match(pingChartSource, /'ping\.loss':\s*'avg'/)
assert.match(pingChartSource, /fill_empty:\s*true/)
assert.match(pingChartSource, /remoteLossData/)
assert.match(pingChartSource, /interval_seconds/)
assert.match(pingChartSource, /loss_approximate/)
assert.match(pingChartSource, /point\.labels\?\.task_id/)
assert.doesNotMatch(pingChartSource, /point\.value\s*>\s*0\s*\?\s*-1/)
assert.doesNotMatch(pingChartSource, /interpolateNullsLinear/)
assert.match(pingChartSource, /bridgeShortDisplayGaps\(rawValues, 2\)/)
assert.match(pingChartSource, /connectNulls:\s*false/)
assert.match(compatibilityTest, /bridgeShortDisplayGaps/)
assert.match(pingChartSource, /lnl-ping-workspace/)
assert.match(pingChartSource, /repeat\(auto-fit, minmax\(98px, 1fr\)\)/)
assert.match(pingChartSource, /scale:\s*true/)
assert.match(pingChartSource, /ping-chart-in/)
assert.match(pingChartSource, /animationDuration:\s*560/)
assert.match(pingChartSource, /portal placement="bottom"/)
assert.match(read('src/components/LoadChart.vue'), /chartAnimationConfig/)
assert.doesNotMatch(read('src/components/LoadChart.vue'), /r\.(?:ram|swap|disk|net_in|net_out|tcp|udp|process)\s*\?\?\s*0/)
// -32603 只允许 "metric store not initialized" 场景回退，其余内部错误必须上抛。
assert.match(pingChartSource, /METRIC_STORE_ERROR_PATTERN = \/metric store\/i/)
assert.match(pingChartSource, /err\.code === -32603 && METRIC_STORE_ERROR_PATTERN\.test\(err\.message\)/)
assert.match(compatibilityTest, /1\.2\.5-fix2/)
assert.match(smokeTest, /auditMobileFinanceOverflow/)
assert.match(smokeTest, /documentWidth <= result\?\.viewportWidth/)
assert.match(smokeTest, /auditPingBarGeometry/)
assert.match(smokeTest, /bar\.width >= 2 && bar\.height >= 6/)
assert.match(smokeTest, /auditConfiguredThemeMode/)
assert.match(smokeTest, /auditMobileProbeMatrix/)
assert.match(smokeTest, /auditVisitorCollapse/)
assert.match(smokeTest, /auditPingDialogCloseAnimation/)
assert.match(smokeTest, /auditIntroGlobeHandoff/)
assert.match(smokeTest, /auditGlobeRegionInteraction/)
assert.match(smokeTest, /auditGlobeRouteRipple/)
assert.match(smokeTest, /canvasIdentity/)
assert.match(smokeTest, /maxDistanceJump/)
assert.match(smokeTest, /landErrorX < 2/)
assert.match(smokeTest, /auditMetricStoreFallback/)
assert.match(smokeTest, /metric store not initialized/)
assert.match(smokeTest, /auditGlobeMotionMode/)
assert.match(smokeTest, /auditPingContentMotion/)

const webManifest = JSON.parse(read('public/manifest.webmanifest'))
assert.equal(webManifest.display, 'standalone')
assert.equal(webManifest.prefer_related_applications, false)
assert.ok(webManifest.icons.some(icon => icon.sizes === '192x192'))
assert.ok(webManifest.icons.some(icon => icon.sizes === '512x512'))
assert.ok(webManifest.icons.some(icon => icon.purpose === 'maskable'))
assert.ok(existsSync(resolve(root, 'dist/sw.js')), 'dist/sw.js is missing')
assert.ok(existsSync(resolve(root, 'dist/offline.html')), 'dist/offline.html is missing')
assert.ok(keys.includes('introAnimationEnabled'))
assert.match(read('src/utils/pwa.ts'), /CLEAR_THEME_CACHE/)
assert.doesNotMatch(read('src/utils/pwa.ts'), /location\.reload/)
assert.match(serviceWorker, /CLEAR_THEME_CACHE/)
assert.doesNotMatch(nodePingStats, /localStorage/)
assert.match(packageJson.scripts['smoke:1.3.2'], /--komari-version=1\.3\.2/)
assert.match(packageJson.scripts['smoke:1.4.2'], /--komari-version=1\.4\.2/)
assert.match(smokeTest, /usesModernKomariFixture/)
assert.match(smokeTest, /public:getPingMetricStats/)
const compiledCss = readdirSync(resolve(root, 'dist/assets'))
  .filter(file => file.endsWith('.css'))
  .map(file => read(`dist/assets/${file}`))
  .join('\n')
assert.match(compiledCss, /\.lnl-intro:not\(\.has-globe-handoff\)\.lnl-intro-exit-leave-to \.lnl-intro-globe/, 'compiled intro handoff selector lost its globe descendant')

console.log('Komari Observatory theme validation passed.')
