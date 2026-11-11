// Playwright smoke tests for the Reliability v2 shell and Link Review.
// Uses the Chrome that is already installed (channel "chrome"), so no browser download is needed.
// Run:  npm run test:e2e      (starts server.js on port 3100 by itself)
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: 'reliability/js/e2e',
  outputDir: 'node_modules/.cache/playwright-results',
  timeout: 30000,
  expect: { timeout: 7000 },
  reporter: 'list',
  workers: 1,
  use: {
    baseURL: 'http://localhost:3100',
    channel: 'chrome',
    viewport: { width: 1440, height: 900 },
  },
  webServer: {
    command: 'node server.js',
    url: 'http://localhost:3100/reliability-v2/',
    env: { PORT: '3100' },
    reuseExistingServer: true,
    timeout: 30000,
  },
});
