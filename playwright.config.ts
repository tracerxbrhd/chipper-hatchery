import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/ui', timeout: 45000, fullyParallel: true,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: 'http://127.0.0.1:5173', viewport: { width: 390, height: 844 }, trace: 'retain-on-failure' },
  webServer: [
    { command: 'node scripts/dev-server.mjs', url: 'http://127.0.0.1:5173', reuseExistingServer: !process.env.CI },
    { command: 'npx vite preview --host 127.0.0.1 --port 4173 --strictPort', url: 'http://127.0.0.1:4173', reuseExistingServer: !process.env.CI },
  ],
});
