# Komari Observatory

<p align="center">
  <a href="https://raw.githubusercontent.com/LeonR-92/komari-theme-leonetlab/main/docs/preview.png">
    <img src="https://raw.githubusercontent.com/LeonR-92/komari-theme-leonetlab/main/docs/preview.png" alt="Komari Observatory preview" width="100%">
  </a>
</p>

A responsive observatory theme for [Komari](https://github.com/komari-monitor/komari), derived from [Komari Emerald](https://github.com/Tokinx/komari-theme-emerald). It combines live node telemetry, a draggable COBE globe, Ping analytics, adaptive card and list views, light/dark modes, and installable PWA support.

Current release: `1.4.2-fix1` · Primary target: Komari `1.4.2`

## Features

- Compact responsive node cards with resource gauges, traffic, uptime, billing, expiry, and Ping quality
- Interactive globe and regional telemetry with pointer, touch, keyboard, and reduced-motion support
- Search reordering, card/list layouts, detailed charts, and a real-time Ping workspace
- Optional first-visit and visitor-scan animations with bounded lifecycle cleanup
- Managed branding, display, transport, finance, notice, filing, and background settings
- PWA installation, offline shell, and user-confirmed cache updates
- Legacy `Client[]` and modern UUID-keyed node response compatibility

## Installation

In **Komari → Settings → Theme management**, add this repository:

```text
https://github.com/LeonR-92/komari-theme-leonetlab
```

Komari imports the single ZIP asset from the latest GitHub Release. You can also download `komari-theme-leonetlab-build-v1.4.2-fix1.zip` and upload it manually, then select **Komari Observatory**.

## Configuration and privacy

All options are available through Komari managed theme settings. Blank branding fields inherit the Komari site configuration.

Theme settings are public. Never place passwords, API keys, node tokens, private endpoints, or personal data in them. The optional visitor panel uses public IP-geolocation providers; disable it when that lookup is not appropriate. The Service Worker does not cache RPC, API, WebSocket, visitor, exchange-rate, Ping-history, or user data.

## Compatibility

- Primary: Komari `1.4.2`
- Regression coverage: `1.2.5-fix1`, `1.2.5-fix2`, `1.2.6`, `1.2.7`, and `1.3.2`
- `src/utils/nodeResponse.ts` normalizes legacy arrays and UUID-keyed objects
- Modern Ping methods use a controlled `common:getRecords` fallback only for documented compatibility failures

## Development

```powershell
npm install
npm run lint
npm run type-check
npm run build
npm run validate
npm run smoke:1.2.5
npm run smoke:1.3.2
npm run smoke:1.4.2
npm run test:browsers
npm audit --audit-level=high
npm audit --omit=dev --audit-level=high
```

The build creates `komari-theme-leonetlab-build-v1.4.2-fix1.zip` with only the root manifest, root preview, and compiled `dist/` tree.

## Theme Market

- Unique short name: `LeoNetLab` (retained for existing market update compatibility)
- Preview: `https://raw.githubusercontent.com/LeonR-92/komari-theme-leonetlab/main/docs/preview.png`
- Package: the single ZIP asset attached to the latest Release

## Credits

Komari Observatory retains the original MIT attribution for Tokinx's [Komari Emerald](https://github.com/Tokinx/komari-theme-emerald). It also uses [Vue](https://vuejs.org/), [Vite](https://vite.dev/), [COBE](https://cobe.vercel.app/), and [ECharts](https://echarts.apache.org/).

Released under the [MIT License](LICENSE). Copyright © 2026 LeoNetLab ([LeonR-92](https://github.com/LeonR-92)).
