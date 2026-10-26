import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
const executablePath=process.env.CHROMIUM_PATH||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined);
export default defineConfig({
  testDir:'tests/browser',timeout:30000,workers:1,
  use:{baseURL:'http://127.0.0.1:4173',headless:true,launchOptions:{executablePath,args:['--no-sandbox','--disable-dev-shm-usage']},trace:'retain-on-failure'},
  webServer:{command:'npm run dev',url:'http://127.0.0.1:4173',reuseExistingServer:!process.env.CI,timeout:30000},
  reporter:'list'
});
