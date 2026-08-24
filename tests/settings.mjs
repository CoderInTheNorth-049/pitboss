import { launch, watchErrors, TEST_URL, sleep } from './helpers.mjs';

const browser = await launch();
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
const errors = watchErrors(page);

await page.goto(TEST_URL, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => {
  localStorage.removeItem('pitboss.settings.v1');
  return new Promise(res => {
    const req = indexedDB.deleteDatabase('pitboss');
    req.onsuccess = req.onerror = req.onblocked = () => res();
  });
});
await page.reload({ waitUntil: 'domcontentloaded' });
await sleep(3200);

// --- DEFAULTS RENDERED ---
let s = await page.evaluate(() => ({
  helpFirst: document.querySelector('#controls-help b')?.textContent,
  forwardKey: document.querySelector('.bind-key[data-action="forward"]')?.textContent?.trim(),
  guideRows: document.querySelectorAll('#drop-guide .guide-row').length
}));
console.log('DEFAULTS:', JSON.stringify(s));
if (s.helpFirst !== 'WASD' || s.forwardKey !== 'W') { console.log('FAIL: default bindings render'); process.exit(1); }
if (s.guideRows !== 8) { console.log(`FAIL: drop guide should show 8 entries, got ${s.guideRows}`); process.exit(1); }

// --- OPEN SETTINGS + REBIND FORWARD W -> E ---
await page.click('#btn-settings');
await sleep(200);
s = await page.evaluate(() => !document.getElementById('screen-settings').classList.contains('hidden'));
if (!s) { console.log('FAIL: settings screen did not open'); process.exit(1); }

await page.click('.bind-key[data-action="forward"]');
await sleep(150);
s = await page.evaluate(() =>
  document.querySelector('.bind-key[data-action="forward"]')?.textContent?.trim());
console.log('CAPTURE ARMED:', s);
if (s !== 'PRESS KEY…') { console.log('FAIL: capture did not arm'); process.exit(1); }

await page.keyboard.press('KeyE');
await sleep(250);
s = await page.evaluate(() => ({
  forwardKey: document.querySelector('.bind-key[data-action="forward"]')?.textContent?.trim(),
  helpFirst: document.querySelector('#controls-help b')?.textContent,
  stored: JSON.parse(localStorage.getItem('pitboss.settings.v1')).bindings.forward
}));
console.log('REBOUND FORWARD->E:', JSON.stringify(s));
if (s.forwardKey !== 'E' || s.helpFirst !== 'EASD' || s.stored !== 'KeyE') { console.log('FAIL: rebind'); process.exit(1); }

// --- CONFLICT SWAP: JUMP <- S SWAPS BACK TO SPACE ---
await page.click('.bind-key[data-action="jump"]');
await sleep(150);
await page.keyboard.press('KeyS');
await sleep(250);
s = await page.evaluate(() => ({
  jump: document.querySelector('.bind-key[data-action="jump"]')?.textContent?.trim(),
  back: document.querySelector('.bind-key[data-action="back"]')?.textContent?.trim()
}));
console.log('CONFLICT SWAP (jump<-S):', JSON.stringify(s));
if (s.jump !== 'S' || s.back !== 'SPACE') { console.log('FAIL: conflict swap'); process.exit(1); }

// --- REBIND RELOAD R -> T ---
await page.click('.bind-key[data-action="reload"]');
await sleep(150);
await page.keyboard.press('KeyT');
await sleep(250);
s = await page.evaluate(() => document.querySelector('.bind-key[data-action="reload"]')?.textContent?.trim());
console.log('REBIND RELOAD->T:', s);
if (s !== 'T') { console.log('FAIL: reload rebind'); process.exit(1); }

// --- ACCESSIBILITY SLIDERS PERSIST ---
await page.click('#tab-access');
await sleep(150);
await page.evaluate(() => {
  const el = document.getElementById('set-sens');
  el.value = '2';
  el.dispatchEvent(new Event('input'));
});
await page.click('#set-invert');
await sleep(250);
s = await page.evaluate(() => ({
  stored: JSON.parse(localStorage.getItem('pitboss.settings.v1')).access,
  sensVal: document.getElementById('sens-val').textContent
}));
console.log('ACCESS SET:', JSON.stringify(s));
if (s.stored.mouseSens !== 2 || s.stored.invertY !== true || s.sensVal !== '2.00×') { console.log('FAIL: accessibility persistence'); process.exit(1); }
await page.click('#btn-settings-back');

// --- START RUN, MOVE WITH NEW BINDING ---
await page.click('#btn-enter');
await sleep(4500);
s = await page.evaluate(() => window.__PITBOSS.debugState());
console.log('RUN STARTED:', JSON.stringify(s));
if (s.state !== 'playing') { console.log('FAIL: run start'); process.exit(1); }
const zStart = s.playerPos[2];

await page.keyboard.down('KeyE');
await sleep(700);
await page.keyboard.up('KeyE');
await sleep(1600); // let friction kill all glide
const movedWithE = await page.evaluate(() => window.__PITBOSS.debugState().playerPos[2]);
console.log('Z AFTER HOLD E:', movedWithE, '(start', zStart + ')');
if (!(zStart - movedWithE > 1)) { console.log('FAIL: rebound forward key did not move player'); process.exit(1); }

await page.keyboard.down('KeyW');
await sleep(400);
await page.keyboard.up('KeyW');
await sleep(1600);
const zAfterW = await page.evaluate(() => window.__PITBOSS.debugState().playerPos[2]);
console.log('DRIFT WITH OLD W:', Math.abs(zAfterW - movedWithE).toFixed(3));
if (Math.abs(zAfterW - movedWithE) > 0.25) { console.log('FAIL: old key should do nothing'); process.exit(1); }

// --- IN-GAME ACTION VIA REBOUND RELOAD KEY (T) ---
await page.mouse.down(); await sleep(80); await page.mouse.up();
await sleep(200);
const ammoAfterShot = parseInt(await page.evaluate(() => document.getElementById('ammo-count')?.textContent ?? '-1'), 10);
await page.keyboard.press('KeyT');
await sleep(1700); // reload takes 1.15s
const ammoReloaded = parseInt(await page.evaluate(() => document.getElementById('ammo-count')?.textContent ?? '-1'), 10);
console.log('RELOAD VIA T:', ammoAfterShot, '→', ammoReloaded);
if (ammoAfterShot !== 29) { console.log('FAIL: expected one shot fired (29)'); process.exit(1); }
if (ammoReloaded !== 30) { console.log('FAIL: rebound reload key did not reload'); process.exit(1); }

// --- PERSISTENCE ACROSS RELOAD ---
await page.reload({ waitUntil: 'domcontentloaded' });
await sleep(3200);
await page.click('#btn-settings');
await sleep(250);
s = await page.evaluate(() => ({
  forwardKey: document.querySelector('.bind-key[data-action="forward"]')?.textContent?.trim(),
  reloadKey: document.querySelector('.bind-key[data-action="reload"]')?.textContent?.trim(),
  sensVal: document.getElementById('sens-val').textContent,
  invertChecked: document.getElementById('set-invert').checked,
  helpFirst: document.querySelector('#controls-help b')?.textContent
}));
console.log('AFTER RELOAD:', JSON.stringify(s));
if (s.forwardKey !== 'E' || s.reloadKey !== 'T' || s.sensVal !== '2.00×' || !s.invertChecked || !s.helpFirst.startsWith('EAS')) { console.log('FAIL: settings did not survive reload'); process.exit(1); }

// --- RESET TO DEFAULTS ---
await page.click('#tab-controls');
await sleep(150);
await page.click('#btn-binds-reset');
await sleep(250);
s = await page.evaluate(() => ({
  forwardKey: document.querySelector('.bind-key[data-action="forward"]')?.textContent?.trim(),
  jumpKey: document.querySelector('.bind-key[data-action="jump"]')?.textContent?.trim(),
  reloadKey: document.querySelector('.bind-key[data-action="reload"]')?.textContent?.trim(),
  stored: JSON.parse(localStorage.getItem('pitboss.settings.v1')).bindings.forward
}));
console.log('RESET:', JSON.stringify(s));
if (s.forwardKey !== 'W' || s.jumpKey !== 'SPACE' || s.reloadKey !== 'R' || s.stored !== 'KeyW') { console.log('FAIL: reset to defaults'); process.exit(1); }

console.log('PAGE ERRORS:', errors.length);
console.log('SETTINGS PASS');
await browser.close();
