import puppeteer from 'puppeteer-core';

export const TEST_URL = process.env.TEST_URL ?? 'http://localhost:5199/';
export const CHROME = process.env.CHROME_PATH ?? '/usr/bin/google-chrome';

export async function launch() {
  return puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--window-size=1280,800']
  });
}

export function watchErrors(page) {
  const errors = [];
  page.on('pageerror', e => {
    errors.push(e.message);
    console.log('[PAGEERROR]', e.message);
  });
  return errors;
}

export async function startRun(page, { fresh = true } = {}) {
  await page.goto(TEST_URL, { waitUntil: 'domcontentloaded' });
  if (fresh) {
    await page.evaluate(() => new Promise(res => {
      const req = indexedDB.deleteDatabase('pitboss');
      req.onsuccess = req.onerror = req.onblocked = () => res();
    }));
    await page.reload({ waitUntil: 'domcontentloaded' });
  }
  await new Promise(r => setTimeout(r, 3200));
  await page.click('#btn-enter');
  await new Promise(r => setTimeout(r, 4200));
}

export const sleep = ms => new Promise(r => setTimeout(r, ms));
