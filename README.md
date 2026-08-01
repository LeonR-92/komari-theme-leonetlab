# LeoNetLab Observatory

<p align="center">
  <a href="https://raw.githubusercontent.com/LeonR-92/komari-theme-leonetlab/main/docs/preview.png">
    <img src="https://raw.githubusercontent.com/LeonR-92/komari-theme-leonetlab/main/docs/preview.png" alt="LeoNetLab Observatory desktop preview" width="100%">
  </a>
</p>

面向 Komari Monitor 的精密网络观测主题：以连续可交互的 COBE 点阵地球、地区聚合遥测、实时 Ping 质量分析、响应式节点卡片与可控 PWA 缓存构成统一的仪表界面。

A precision network observatory for Komari Monitor, combining a continuous interactive COBE globe, regional telemetry, real-time Ping analytics, responsive node cards and controlled PWA caching in one instrument-grade interface.

Theme versions track Komari releases. LeoNetLab Observatory is derived from [Komari Emerald](https://github.com/Tokinx/komari-theme-emerald) and retains its MIT attribution.

## Highlights

- **Optional first-visit handoff** — a live dot-matrix globe remains on one persistent canvas from the cover through its exact landing in the dashboard; administrators can skip the cover entirely.
- **Seamless transition animations** — a single cobe engine moves from the intro stage to the dashboard without an intermediate blank frame, then releases a progressive theme halo; returning home uses a shorter one-shot ripple.
- **Regional globe telemetry** — desktop users get hover-intent previews and click-to-pin details, while touch devices use single-tap locking; the globe eases to a stop so CPU/memory and throughput remain readable.
- **Focused ambient motion** — the DataOcean canvas keeps a restrained perspective dot ocean on desktop and in a reduced 24 fps mobile profile, without decorative mesh lines or signal streaks competing with telemetry.
- **Heavily remixed color scheme** — a dark-green academic instrument palette with a calm light counterpart, built on oklch design tokens, hairline borders and serif display type.
- **Reworked Ping workspace** — selectable probe matrix, latest/loss/jitter metadata, a continuously updated timeline without recurring loading overlays, and ten-cell latency/loss rails on every node card.
- **Mobile performance engineering** — scroll-fixed background layers, reduced-density ambient motion, capped globe DPR and frame rate, background-tab polling pause, and deferred chart animation.
- **Controlled PWA updates** — versioned caches update automatically, with a header action that checks the service worker, clears only LeoNetLab theme caches, and reloads the current build.
- **Extensive managed customization** — 37 validated options cover branding, copy, data transport, refresh cadence, color defaults, globe behavior, card density, backgrounds, notices and footer records without editing source code.
- **Compatibility-first data handling** — modern Komari 1.3.2 metrics stay on the public metric APIs, while older node-response formats and approved metric-store fallbacks remain isolated behind tested normalization layers.

## Install

**From GitHub Release (recommended)**

1. In Komari, open **Settings → Theme management**.
2. Add or update the theme from the repository: `https://github.com/LeonR-92/komari-theme-leonetlab`.
3. Komari resolves the latest GitHub Release and imports its first ZIP asset.

**Manual ZIP upload**

1. Download `komari-theme-leonetlab-build-v1.3.2.zip` from the latest GitHub Release.
2. Upload the ZIP in Komari theme management and select **LeoNetLab Observatory**.

## Configuration

All settings are optional managed theme settings; blank brand fields fall back to the Komari site configuration.

- Branding: display name, short name, logo URL, header subtitle, live-status label.
- Copy: home eyebrow/title/description, intro eyebrow/subtitle, footer eyebrow.
- Data: refresh interval, WebSocket/HTTP realtime transport.
- Home: default card/list view, default color mode, first-visit switch, globe mode, regional telemetry, node-card density, visitor info card.

## Compatibility

- **Supported Komari servers**: `1.2.5-fix1`, `1.2.5-fix2`, `1.2.6`, `1.2.7`, and `1.3.x` — current interface usage verified against the official Komari 1.3.2 source.
- Node responses are normalized for both `1.2.5-fix1` arrays and `1.2.5-fix2`/`1.2.7` UUID-keyed objects.
- Ping charts prefer `public:queryMetrics` / `public:getPingMetricStats`, understand Komari 1.3.2's exact-sample and minute-rollup behavior, consume public PING task weights when present, and fall back to `common:getRecords` only on approved compatibility errors.
- Theme configuration uses the managed settings type; Komari server 1.0.5 or newer is required.

## Development

```powershell
npm install
npm run lint
npm run type-check
npm run validate
npm run smoke:1.2.5
npm run smoke:1.3.2
npm run build
```

The build emits `dist/` and `komari-theme-leonetlab-build-v1.3.2.zip` with a root `komari-theme.json` and `preview.png`.

## Theme Market

- Repository: `https://github.com/LeonR-92/komari-theme-leonetlab`
- Preview image: `https://raw.githubusercontent.com/LeonR-92/komari-theme-leonetlab/main/docs/preview.png`
- Package source: the single ZIP asset in the latest public GitHub Release

These URLs match the Komari Theme Market GitHub-theme submission format. The market validates the root manifest, `short`, version and exact ZIP SHA-256 before accepting an automated Release update.

## Tech Stack

| Category         | Technology                       |
| ---------------- | -------------------------------- |
| Framework        | Vue 3 + TypeScript               |
| Build tool       | Vite 7                           |
| UI components    | reka-ui (shadcn-vue style)       |
| Styling          | Tailwind CSS v4 + tw-animate-css |
| State management | Pinia 3                          |
| Router           | Vue Router 5                     |
| Charts           | ECharts 6 (vue-echarts)          |
| 3D globe         | cobe                             |
| Toasts           | vue-sonner                       |
| Icons            | @iconify/vue                     |
| Utilities        | @vueuse/core, dayjs              |
| Linting          | ESLint (@antfu/eslint-config)    |

## Acknowledgments & License

Based on [Komari Emerald](https://github.com/Tokinx/komari-theme-emerald) by Tokinx (MIT License) — special thanks for the original theme foundation.

- [Komari](https://github.com/komari-monitor/komari)
- [Komari Emerald](https://github.com/Tokinx/komari-theme-emerald)
- [Vue 3](https://vuejs.org/)
- [Vite](https://vitejs.dev/)
- [reka-ui](https://reka-ui.com/)
- [Tailwind CSS](https://tailwindcss.com/)
- [ECharts](https://echarts.apache.org/)
- [cobe](https://cobe.vercel.app/)

Released under the MIT License, © 2026 LeoNetLab ([LeonR-92](https://github.com/LeonR-92)).

`CHANGELOG.md` starts at v1.3.0 — theme versions now track Komari's own version numbers, and earlier releases were retired. Later changes are published in [GitHub Releases](https://github.com/LeonR-92/komari-theme-leonetlab/releases).
