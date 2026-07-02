import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './tests/e2e',
    timeout: 120000,
    expect: { timeout: 15000 },
    fullyParallel: false,
    workers: 1,
    reporter: 'line',
    use: {
        baseURL: 'http://127.0.0.1:4173',
        headless: true,
        launchOptions: process.env.CI ? {} : { channel: 'chrome' },
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure'
    },
    webServer: {
        command: 'python -m http.server 4173 -d dist',
        url: 'http://127.0.0.1:4173',
        reuseExistingServer: !process.env.CI,
        timeout: 30000
    }
});
