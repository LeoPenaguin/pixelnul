// End-to-end tests: real Go server (Redis database 14, reserved for tests) and real Vite front,
// on their own ports so they do not clash with the dev servers.
import { defineConfig, devices } from '@playwright/test'

const API_PORT = 3017
const WEB_PORT = 5183

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  reporter: 'list',
  // Reduced motion: camera moves are instant, hence deterministic.
  use: { baseURL: `http://localhost:${String(WEB_PORT)}`, trace: 'retain-on-failure', reducedMotion: 'reduce' },
  globalSetup: './e2e/accounts.ts', // the player and admin accounts
  projects: [
    { name: 'desktop', use: devices['Desktop Chrome'], testIgnore: /mobile\.spec/ },
    // Touch screen: the keyboard tests make no sense there.
    { name: 'mobile', use: devices['Pixel 7'], testIgnore: /desktop\.spec/ },
  ],
  webServer: [
    {
      command: 'go run .',
      cwd: '../server',
      url: `http://localhost:${String(API_PORT)}/api/config`,
      // Sign-in on with a fake Google client (never called: accounts.ts writes the sessions), Discord off.
      // Set, they win over server/.env.
      env: {
        ADDR: `:${String(API_PORT)}`,
        REDIS_URL: 'redis://localhost:6379/14',
        GOOGLE_CLIENT_ID: 'e2e',
        GOOGLE_CLIENT_SECRET: 'e2e',
        DISCORD_CLIENT_ID: '',
        ADMIN_IDS: 'e2eadmin',
      },
    },
    {
      command: `pnpm exec vite --port ${String(WEB_PORT)} --strictPort`,
      url: `http://localhost:${String(WEB_PORT)}`,
      env: { API_PORT: String(API_PORT) },
    },
  ],
})
