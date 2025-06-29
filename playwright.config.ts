import { defineConfig } from '@playwright/test';

const PORT = process.env.TEST_PORT || 64995;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 15000, // Increased from 5000 to 15000 (15 seconds)
  use: {
    baseURL: `http://localhost:${PORT}`,
  },
  webServer: {
    command: `npx serve . -l ${PORT}`,
    url: `http://localhost:${PORT}/tests/e2e/stimulus-stream-actions`,
    reuseExistingServer: !process.env.CI,
    timeout: 20000, // Increased from 10000 to 20000 (20 seconds)
  },
});
