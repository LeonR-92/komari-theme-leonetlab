# LeoNetLab Observatory for Komari

与 LeoNetLab 个人站视觉统一的 Komari Monitor 监控主题。主题保留 Komari Emerald 的数据、图表、节点详情、WebSocket/HTTP 回退与响应式地球实现，重新设计了站点外壳、颜色、排版、节点卡片、加载动画和移动端布局。

## 兼容范围

- 已按 Komari `1.2.5-fix1` 的公开主题与 RPC 结构开发，并兼容该版本 `common:getNodes` 返回的节点数组。
- 对 Komari `1.2.7` 保持兼容；主题会把该版本 UUID 键控的节点对象与 1.2.5 的数组统一为同一种内部结构。该版本新增的访客审计 RPC 是可选能力，本主题不依赖它。
- 主题配置使用 `managed` 类型；服务器 1.0.5 及以上可用。

## 构建

需要 Node.js 20.19+ 或 22.12+。项目沿用上游 Bun 工作流，也可使用兼容的 npm 安装依赖后构建。

```powershell
bun install
bun run build
```

构建完成后会生成：

- `dist/`
- `komari-theme-leonetlab-build-v1.0.1.zip`

兼容性与构建检查：

```powershell
npm run validate
npm run smoke:1.2.5
```

`smoke:1.2.5` 会启动本地模拟接口并用无界面 Chrome/Edge 验证 1.2.5 数组节点响应能够实际渲染为节点卡片。

## 安装

1. 登录 Komari 管理后台。
2. 打开“设置”→“主题管理”。
3. 上传构建生成的 zip。
4. 选择 `LeoNetLab Observatory` 并刷新公开监控页。

也可以在 Komari 主题管理中使用仓库地址导入：

```text
https://github.com/fangleo5592-prog/komari-theme-leonetlab
```

主题清单会保留该仓库地址。后续版本发布到 GitHub Releases 后，可在 Komari 后台直接检查并拉取最新版本。

## 发布

推送到 `main` 时，GitHub Actions 会运行 lint、类型检查、双版本兼容验证、Komari 1.2.5 浏览器冒烟测试、生产构建和高危依赖审计。只有 `package.json` 版本发生变化时，工作流才会创建对应的 `vX.Y.Z` 标签和 GitHub Release，并上传唯一的 Komari 安装 ZIP。

请勿把 Token、密码、私密地址或其他秘密写进主题设置；Komari 的 `theme_settings` 属于公开数据。

## 致谢与许可

本项目基于 [Komari Emerald](https://github.com/Tokinx/komari-theme-emerald) 开发，原作者 Tokinx；底层监控系统为 [Komari Monitor](https://github.com/komari-monitor/komari)。代码继续遵循 MIT License，页脚保留 `Powered by Komari Monitor.` 与上游主题署名。
