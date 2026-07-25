# LeoNetLab Observatory

A theme for Komari, based on Komari Emerald.

![LeoNetLab Observatory preview](docs/preview.png)

A cinematic global network observatory for Komari Monitor: a live dot-matrix data ocean, an instrument-grade interface, and a single continuous 3D globe from first visit to dashboard.

## Highlights

- **Single-instance globe handoff** — one cobe engine travels from the intro cover to the dashboard via Vue Teleport; canvas, WebGL context, rotation phase and drag state never reset.
- **Dual color modes** — dark green academic instrument palette and a calm light mode, with system (Beijing time), light, or dark defaults.
- **PWA support** — runtime manifest, offline fallback page, and a conservative Service Worker that never caches Komari APIs or live node responses.
- **Mobile performance** — static background frame, capped globe DPR and frame rate, deferred chart animation, and scroll-fixed background layers.
- **Broad compatibility** — Komari `1.2.5-fix1`, `1.2.5-fix2`, `1.2.6`, `1.2.7`, and `1.3.x`, with metric-RPC fallback to `common:getRecords`.

## Install

**From GitHub Release (recommended)**

1. In Komari, open **Settings → Theme management**.
2. Add or update the theme from the repository: `https://github.com/LeonR-92/komari-theme-leonetlab`.
3. Komari resolves the latest GitHub Release and imports its first ZIP asset.

**Manual ZIP upload**

1. Download `komari-theme-leonetlab-build-v1.3.0.zip` from the [latest Release](https://github.com/LeonR-92/komari-theme-leonetlab/releases/latest).
2. Upload the ZIP in Komari theme management and select **LeoNetLab Observatory**.

## Configuration

All settings are optional managed theme settings; blank brand fields fall back to the Komari site configuration.

- Branding: display name, short name, logo URL, header subtitle, live-status label.
- Copy: home eyebrow/title/description, intro eyebrow/subtitle, footer eyebrow.
- Data: refresh interval, WebSocket/HTTP realtime transport.
- Home: default card/list view, default color mode, globe mode, visitor info card.

## Compatibility

- Node responses are normalized for both `1.2.5-fix1` arrays and `1.2.5-fix2`/`1.2.7` UUID-keyed objects.
- Ping charts prefer `public:queryMetrics` / `public:getPingMetricStats` when available and fall back to `common:getRecords` on method-not-found or uninitialized metric store errors.
- Theme configuration uses the managed settings type; Komari server 1.0.5 or newer is required.

## Development

```powershell
npm install
npm run lint
npm run type-check
npm run validate
npm run smoke:1.2.5
npm run build
```

The build emits `dist/` and `komari-theme-leonetlab-build-v1.3.0.zip` with a root `komari-theme.json` and `preview.png`.

## Acknowledgments & License

Based on [Komari Emerald](https://github.com/Tokinx/komari-theme-emerald) by Tokinx (MIT License). Released under the MIT License, © 2026 LeoNetLab ([LeonR-92](https://github.com/LeonR-92)).

`CHANGELOG.md` is a historical archive through v1.2.9. Later changes are published in [GitHub Releases](https://github.com/LeonR-92/komari-theme-leonetlab/releases).
