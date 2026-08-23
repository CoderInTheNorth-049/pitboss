import { launch, watchErrors, startRun, sleep, TEST_URL } from './helpers.mjs';

const browser = await launch();
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
const errors = watchErrors(page);

await page.goto(TEST_URL, { waitUntil: 'domcontentloaded' });
await page.evaluateOnNewDocument(() => {
  HTMLCanvasElement.prototype.requestPointerLock = function () {
    return Promise.reject(new DOMException('denied', 'NotAllowedError'));
  };
});
await page.reload({ waitUntil: 'domcontentloaded' });
await sleep(3400);
await page.click('#btn-enter');
await sleep(6000);

const s = await page.evaluate(() => window.__PITBOSS.debugState());
console.log('LOCK-DENIED STILL PLAYS:', JSON.stringify(s));
if (s.state !== 'playing') { console.log('FAIL: lock denial broke game'); process.exit(1); }

console.log('PAGE ERRORS:', errors.length);
console.log('REGRESSION PASS');
await browser.close();
