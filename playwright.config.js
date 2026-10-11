/**
 * Playwright E2E Configuration
 * 33 assertions covering title menu, settings, KB/touch, P0 trio
 */

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:8091',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'Desktop Chrome',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'], viewport: { width: 667, height: 375 } },
    },
  ],
  webServer: {
    command: 'python serve_dev.py 8091',
    url: 'http://localhost:8091',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
  expect: {
    toHaveScreenshot: { maxDiffPixels: 100 },
  },
});