import process from 'node:process'
import { defineConfig, devices } from '@playwright/test'

const fixturePort = Number(process.env.PLAYWRIGHT_FIXTURE_PORT || 4179)
const useHeadedFirefox = process.env.PLAYWRIGHT_FIREFOX_HEADED === '1'

export default defineConfig({
  testDir: './tests/browser',
  outputDir: 'test-results',
  timeout: 30_000,
  expect: {
    timeout: 8_000,
  },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  // Keep GPU-backed Chromium, Gecko, and WebKit contexts mutually isolated.
  // Concurrent software renderers are unreliable on Windows headless runners.
  workers: 1,
  reporter: process.env.CI ? [['line'], ['html', { open: 'never' }]] : 'line',
  use: {
    baseURL: `http://127.0.0.1:${fixturePort}`,
    colorScheme: 'light',
    locale: 'zh-CN',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'off',
  },
  webServer: process.env.PLAYWRIGHT_REUSE_SERVER === '1'
    ? undefined
    : {
        command: 'node scripts/smoke-komari-1.2.5.mjs --komari-version=1.4.3',
        env: {
          SMOKE_EXTERNAL_DRIVER: '1',
          SMOKE_FIXTURE_PORT: String(fixturePort),
        },
        url: `http://127.0.0.1:${fixturePort}`,
        reuseExistingServer: false,
        timeout: 120_000,
      },
  projects: [
    {
      name: 'chromium-desktop',
      grepInvert: /compact viewports/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'firefox-desktop',
      grepInvert: /compact viewports/,
      // Some Windows graphics/security stacks crash Firefox content processes
      // only in headless mode. Headed mode remains opt-in for local recovery;
      // CI and other platforms keep the normal headless default.
      use: { ...devices['Desktop Firefox'], headless: !useHeadedFirefox, viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'webkit-desktop',
      grepInvert: /compact viewports/,
      use: { ...devices['Desktop Safari'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'chromium-mobile',
      use: { ...devices['Pixel 5'], viewport: { width: 390, height: 844 } },
    },
    {
      name: 'webkit-tablet',
      use: { ...devices['iPad (gen 7) landscape'], viewport: { width: 820, height: 768 } },
    },
  ],
})
