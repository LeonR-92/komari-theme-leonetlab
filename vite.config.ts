import type { Plugin } from 'vite'
import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { relative, resolve } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

import vueDevTools from 'vite-plugin-vue-devtools'

const require = createRequire(import.meta.url)
const fs = require('node:fs')
const archiver = require('archiver')
const packageJson = require('./package.json')

const themeVersion = packageJson.themeVersion ?? packageJson.version
const PRECACHE_ASSET_PATTERN = /\.(?:css|js)$/
const WINDOWS_PATH_SEPARATOR_PATTERN = /\\/g
const SW_PRECACHE_PLACEHOLDER_PATTERN = /const PRECACHE_ASSETS = \/\* __LNL_PRECACHE_ASSETS__ \*\/ \[\]/

function getCommitHash(): string {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim()
  }
  catch {
    return `v${themeVersion}`
  }
}

function shouldIgnoreRollupWarning(warning: { code?: string, id?: string }): boolean {
  return warning.code === 'INVALID_ANNOTATION'
    && warning.id?.includes('/node_modules/@vueuse/core/dist/index.js') === true
}

/**
 * Vite 插件：构建后打包 Komari 主题 Zip
 * theme.zip
 * ├── komari-theme.json
 * ├── preview.png
 * └── dist/
 */
function komariThemeZip(): Plugin {
  return {
    name: 'komari-theme-zip',
    apply: 'build',
    closeBundle: async () => {
      const zipFileName = `komari-theme-leonetlab-build-v${themeVersion}.zip`
      const distDir = resolve(__dirname, 'dist')
      const themeJsonPath = resolve(__dirname, 'komari-theme.json')
      const previewPath = resolve(__dirname, 'docs/preview.png')
      const outputPath = resolve(__dirname, zipFileName)

      if (!existsSync(distDir)) {
        console.log('[komari-theme-zip] dist directory not found, skipping zip creation')
        return
      }

      const swPath = resolve(distDir, 'sw.js')
      const assetRoot = resolve(distDir, 'assets')
      if (existsSync(swPath) && existsSync(assetRoot)) {
        const assetFiles: string[] = []
        const collectAssets = (directory: string) => {
          for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
            const entryPath = resolve(directory, entry.name)
            if (entry.isDirectory())
              collectAssets(entryPath)
            else if (PRECACHE_ASSET_PATTERN.test(entry.name))
              assetFiles.push(`/${relative(distDir, entryPath).replace(WINDOWS_PATH_SEPARATOR_PATTERN, '/')}`)
          }
        }
        collectAssets(assetRoot)
        const swSource = fs.readFileSync(swPath, 'utf8')
          .replace(
            SW_PRECACHE_PLACEHOLDER_PATTERN,
            `const PRECACHE_ASSETS = /* __LNL_PRECACHE_ASSETS__ */ ${JSON.stringify(assetFiles.sort())}`,
          )
        fs.writeFileSync(swPath, swSource)
      }

      const output = fs.createWriteStream(outputPath)
      const archive = archiver('zip', { zlib: { level: 9 } })

      return new Promise((resolve, reject) => {
        output.on('close', () => {
          const sizeMB = (archive.pointer() / 1024 / 1024).toFixed(2)
          console.log(`[komari-theme-zip] Created ${zipFileName} (${sizeMB} MB)`)
          resolve(undefined)
        })

        archive.on('error', (err: Error) => {
          console.error('[komari-theme-zip] Error:', err)
          reject(err)
        })

        archive.pipe(output)

        if (existsSync(themeJsonPath)) {
          archive.file(themeJsonPath, { name: 'komari-theme.json' })
        }

        if (existsSync(previewPath)) {
          archive.file(previewPath, { name: 'preview.png' })
        }

        archive.directory(distDir, 'dist')

        archive.finalize()
      })
    },
  }
}

export default defineConfig({
  define: {
    __BUILD_VERSION__: JSON.stringify(themeVersion),
    __BUILD_GIT_HASH__: JSON.stringify(getCommitHash()),
  },
  plugins: [
    vue(),
    vueDevTools(),
    tailwindcss(),
    komariThemeZip(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: '0.0.0.0',
  },
  build: {
    target: ['chrome111', 'edge111', 'firefox114', 'safari16.4'],
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      onwarn(warning, defaultHandler) {
        if (shouldIgnoreRollupWarning(warning))
          return
        defaultHandler(warning)
      },
      output: {
        manualChunks: {
          'vue-vendor': ['vue', 'vue-router', 'pinia'],
          'echarts': ['echarts', 'vue-echarts'],
          'reka-ui': ['reka-ui'],
          'vueuse': ['@vueuse/core'],
        },
      },
    },
  },
})
