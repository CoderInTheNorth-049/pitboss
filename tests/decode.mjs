import { launch, watchErrors, sleep, TEST_URL } from './helpers.mjs';

const browser = await launch();
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
const errors = watchErrors(page);

await page.goto(TEST_URL, { waitUntil: 'domcontentloaded' });
await sleep(3400);

const day = Math.floor(Date.now() / 86400000).toString(36);
const valid = `PB1-7-2a-1e-${day}`;
const old = `PB1-2-5-b-${(Math.floor(Date.now() / 86400000) - 3).toString(36)}`;

const decode = async code => {
  await page.evaluate(v => { document.getElementById('paste-code').value = v; }, code);
  await page.click('#btn-decode');
  await sleep(200);
  return page.evaluate(() => ({
    text: document.getElementById('decode-result')?.textContent,
    cls: document.getElementById('decode-result')?.className
  }));
};

const r1 = await decode(valid);
console.log('VALID:', JSON.stringify(r1));
if (!r1.text?.includes('Wave 7')) { console.log('FAIL: valid decode'); process.exit(1); }

const r2 = await decode(old);
console.log('OLD:', JSON.stringify(r2));
if (!r2.text?.includes('3d ago')) { console.log('FAIL: old decode'); process.exit(1); }

const r3 = await decode('GARBAGE-XX');
console.log('INVALID:', JSON.stringify(r3));
if (!r3.text?.includes('INVALID')) { console.log('FAIL: invalid handling'); process.exit(1); }

console.log('PAGE ERRORS:', errors.length);
console.log('DECODE PASS');
await browser.close();
