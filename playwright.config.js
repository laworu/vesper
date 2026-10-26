import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir:'tests/browser',timeout:30000,workers:1,
  use:{baseURL:'http://127.0.0.1:4173',headless:true,launchOptions:{executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage']},trace:'retain-on-failure'},
  webServer:{command:'npm run dev',url:'http://127.0.0.1:4173',reuseExistingServer:!process.env.CI,timeout:30000},
  reporter:'list'
});
