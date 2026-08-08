# LeoNetLab Observatory

<p align="center">
  <a href="https://raw.githubusercontent.com/LeonR-92/komari-theme-leonetlab/main/docs/preview.png">
    <img src="https://raw.githubusercontent.com/LeonR-92/komari-theme-leonetlab/main/docs/preview.png" alt="LeoNetLab Observatory desktop preview" width="100%">
  </a>
</p>

LeoNetLab Observatory is a responsive network-monitoring theme for [Komari](https://github.com/komari-monitor/komari). It combines a live COBE globe, visual resource telemetry, real-time Ping analytics, rounded adaptive surfaces, and installable PWA support in one coherent observatory interface.

Version `1.4.2` is aligned with Komari `1.4.2`. Theme versions follow Komari release numbers.

## Highlights

- **Soft observatory interface** — neutral layered surfaces, low-contrast 1px borders, coordinated 16/12/10px radii, and clear light/dark hierarchies replace sharp nested instrument frames.
- **Visual node telemetry** — animated SVG gauges present CPU, memory, disk, and monthly traffic while keeping every value available as readable text.
- **Reliable live data** — node status, throughput, uptime, billing, Ping latency, packet loss, historical load, and system details remain tied to Komari data rather than decorative estimates.
- **Interactive global view** — the COBE globe supports automatic rotation, pointer dragging, touch interaction, front-side marker visibility, and regional CPU, memory, and throughput summaries.
- **Real-time Ping workspace** — modern metric queries update in place, preserve true loss markers and raw statistics, and only bridge short display gaps without hiding long outages.
- **Responsive card and list views** — compact is the default density; both layouts preserve long node names, missing values, free plans, monthly costs, expiry states, and quality indicators without overflow.
- **Focused motion system** — search reordering, route transitions, theme switching, globe landing ripples, dialogs, charts, and visitor scanning share restrained timing and reduced-motion fallbacks.
- **Visitor session panel** — a once-per-tab scan resolves device, browser, network, ASN, location, and visit time, then settles into a compact expandable status bar.
- **Configurable branding** — site name, logo, headings, descriptive copy, footer text, theme mode, globe mode, card density, transport, refresh interval, filings, notices, and background behavior are managed from Komari theme settings.
- **Installable PWA** — static install metadata, maskable and Apple icons, safe-area support, navigation preload, offline fallback, update confirmation, and manual theme-cache refresh are included. RPC, API, WebSocket, visitor, exchange-rate, and user data are not stored by the Service Worker.
- **Compatibility-first parsing** — the theme preserves Komari 1.2.5-fix1 array responses, later UUID-keyed responses, and controlled metric fallback behavior behind tested normalization layers.

## Installation

### Install from GitHub

1. Open **Settings → Theme management** in Komari.
2. Add or update the theme using this repository:

   `https://github.com/LeonR-92/komari-theme-leonetlab`

3. Komari resolves the latest GitHub Release and imports its single ZIP asset.

### Manual installation

1. Download `komari-theme-leonetlab-build-v1.4.2.zip` from the latest Release.
2. Upload the ZIP in Komari theme management.
3. Select **LeoNetLab Observatory**.

## Configuration

All options use Komari managed theme settings. Blank branding fields inherit the Komari site configuration.

- Brand name, short name, logo, header labels, home copy, intro copy, and footer label
- WebSocket or HTTP transport and refresh interval
- Card or list default view, compact or comfortable card density, and monthly display currency
- Light, dark, or Beijing-time automatic color mode
- Animated, static, map, cards-only, or hidden global node view
- Optional first-visit animation, regional telemetry, visitor panel, notice, filing information, and custom background
- PWA installation guidance, update detection, and theme-cache refresh

Komari publishes managed theme settings to visitors. Never place passwords, API keys, node tokens, private endpoints, or personal data in theme configuration.

When the visitor panel is enabled, it uses public third-party IP geolocation services to resolve approximate network information. Disable the visitor panel if that lookup is not appropriate for your deployment.

## Compatibility

- **Primary target:** Komari `1.4.2`
- **Regression coverage:** `1.2.5-fix1`, `1.2.5-fix2`, `1.2.6`, `1.2.7`, and `1.3.2`
- `common:getNodes` supports both the legacy `Client[]` response and UUID-keyed objects through `src/utils/nodeResponse.ts`.
- Ping prefers `public:queryMetrics` and `public:getPingMetricStats`, including nullable samples, `interval_seconds`, metric labels, real loss, and `loss_approximate`.
- `common:getRecords` remains a controlled fallback only for supported legacy or metric-store compatibility errors.
- Managed theme configuration requires Komari `1.0.5` or later.

## Tech Stack

| Area          | Technology                                                          |
| ------------- | ------------------------------------------------------------------- |
| Application   | Vue 3, TypeScript, Vue Router 5                                     |
| Build         | Vite 7, vue-tsc                                                     |
| State         | Pinia 3                                                             |
| Styling       | Tailwind CSS 4, semantic CSS variables, tw-animate-css              |
| Accessible UI | reka-ui, class-variance-authority                                   |
| Charts        | ECharts 6, vue-echarts                                              |
| Globe         | COBE                                                                |
| Icons         | Iconify                                                             |
| Utilities     | VueUse, Day.js                                                      |
| Quality       | ESLint, compatibility fixtures, production browser smoke tests      |
| PWA           | Web App Manifest, Service Worker, navigation preload, offline shell |

## Development

```powershell
npm install
npm run lint
npm run type-check
npm run validate
npm run smoke:1.2.5
npm run smoke:1.3.2
npm run smoke:1.4.2
npm run build
npm audit --audit-level=high
npm audit --omit=dev --audit-level=high
```

The production build creates `dist/` and `komari-theme-leonetlab-build-v1.4.2.zip`. The installable ZIP contains one root `komari-theme.json`, one root `preview.png`, and the compiled `dist/` tree.

## Theme Market

- Repository: `https://github.com/LeonR-92/komari-theme-leonetlab`
- Preview: `https://raw.githubusercontent.com/LeonR-92/komari-theme-leonetlab/main/docs/preview.png`
- Package: the single ZIP asset attached to the latest GitHub Release

## Acknowledgments

LeoNetLab Observatory is derived from [Komari Emerald](https://github.com/Tokinx/komari-theme-emerald) by Tokinx and retains the original MIT attribution.

- [Komari](https://github.com/komari-monitor/komari)
- [Komari Emerald](https://github.com/Tokinx/komari-theme-emerald)
- [COBE](https://cobe.vercel.app/)
- [Vue](https://vuejs.org/)
- [Vite](https://vite.dev/)
- [ECharts](https://echarts.apache.org/)

## License

Released under the [MIT License](LICENSE). Copyright © 2026 LeoNetLab ([LeonR-92](https://github.com/LeonR-92)).
