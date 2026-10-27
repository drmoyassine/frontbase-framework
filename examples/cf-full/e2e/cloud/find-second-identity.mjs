import { chromium } from '@playwright/test';
const origin = process.env.CLOUD_HOSTED_APP_ORIGIN;
const email = process.env.CLOUD_HOSTED_IDENTITY_EMAIL;
const password = process.env.CLOUD_HOSTED_PASSWORD;
if (!origin || !email || !password) throw new Error('Set CLOUD_HOSTED_APP_ORIGIN, CLOUD_HOSTED_IDENTITY_EMAIL and CLOUD_HOSTED_PASSWORD');
const browser = await chromium.launch();
const page = await browser.newPage();
try {
  const login = await page.request.post(`${origin}/api/auth/login`, { data: { email, password } });
  const me = await page.request.get(`${origin}/api/auth/me`);
  console.log(JSON.stringify({ login: login.status(), me: me.status() }));
} finally { await browser.close(); }
