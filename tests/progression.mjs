import { launch, watchErrors, startRun, sleep, TEST_URL } from './helpers.mjs';

const browser = await launch();
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
const errors = watchErrors(page);

await startRun(page);
let s = await page.evaluate(() => window.__PITBOSS.debugState());
if (s.state !== 'playing') { console.log('FAIL: run start'); process.exit(1); }

// --- ARENA VARIANTS ---
for (const idx of [1, 2, 0]) {
  const name = await page.evaluate(i => window.__PITBOSS.debugSetArena(i), idx);
  s = await page.evaluate(() => window.__PITBOSS.debugState());
  console.log(`ARENA ${idx}:`, name, '| state arena:', s.arena);
  if (s.arena !== idx) { console.log('FAIL: arena layout state'); process.exit(1); }
}
// layout rebuild keeps combat working: place + shoot
await page.evaluate(() => window.__PITBOSS.debugSetArena(1));
await page.evaluate(() => window.__PITBOSS.debugGiveSpecial('railhand'));
const arenaShot = await page.evaluate(() => {
  const g = window.__PITBOSS;
  if (!g.debugPlaceEnemyClear()) return null;
  return g.debugFireAt('body');
});
if (!arenaShot || !arenaShot.fired) { console.log('FAIL: combat after arena rebuild'); process.exit(1); }
console.log('COMBAT AFTER REBUILD:', JSON.stringify(arenaShot));

// --- MYSTERY CRATE ---
await page.evaluate(() => window.__PITBOSS.debugSpawnMysteryHere());
await sleep(600);
s = await page.evaluate(() => ({
  ...window.__PITBOSS.debugCareer(),
  feed: [...document.querySelectorAll('.feed-item')].some(f => f.textContent.includes('MYSTERY CRATE'))
}));
console.log('MYSTERY CRATE:', JSON.stringify(s));
if (s.counters.cratesOpened < 1 || !s.feed) { console.log('FAIL: mystery crate'); process.exit(1); }

// --- FIRST BLOOD MILESTONE (kill any enemy) ---
let firstBlood = false;
for (let i = 0; i < 8 && !firstBlood; i++) {
  const r = await page.evaluate(() => {
    const g = window.__PITBOSS;
    if (!g.debugPlaceEnemyClear()) return null;
    return g.debugFireAt('head');
  });
  await sleep(150);
  const c = await page.evaluate(() => window.__PITBOSS.debugCareer());
  firstBlood = c.milestones.includes('firstblood');
}
console.log('FIRST BLOOD MILESTONE:', firstBlood);
if (!firstBlood) { console.log('FAIL: firstblood milestone'); process.exit(1); }

// --- CROUCH: eye lowers, returns on release ---
await page.keyboard.down('KeyC');
await sleep(450);
const crouchedEye = await page.evaluate(() => window.__PITBOSS['player'].eyeMul);
await page.keyboard.up('KeyC');
await sleep(450);
const standEye = await page.evaluate(() => window.__PITBOSS['player'].eyeMul);
console.log('CROUCH eyeMul:', crouchedEye.toFixed(2), '→ stand:', standEye.toFixed(2));
if (!(crouchedEye < 0.8) || !(standEye > 0.95)) { console.log('FAIL: crouch'); process.exit(1); }

// --- WAVE-5 MINI-BOSS ---
await page.evaluate(() => window.__PITBOSS.debugSpawnBoss());
await sleep(400);
s = await page.evaluate(() => ({
  ...window.__PITBOSS.debugState(),
  bossbarVisible: !document.getElementById('bossbar')?.classList.contains('hidden')
}));
console.log('BOSS SPAWNED:', JSON.stringify(s));
if (!s.boss || !s.bossbarVisible) { console.log('FAIL: boss spawn/bar'); process.exit(1); }

let bossDown = false;
for (let i = 0; i < 14 && !bossDown; i++) {
  const r = await page.evaluate(() => {
    const g = window.__PITBOSS;
    if (!g.debugPlaceEnemyClear()) return null;
    return g.debugFireAt('head');
  });
  await sleep(150);
  const st = await page.evaluate(() => window.__PITBOSS.debugState());
  if (!st.boss) bossDown = true;
}
s = await page.evaluate(() => ({
  ...window.__PITBOSS.debugState(),
  career: window.__PITBOSS.debugCareer()
}));
console.log('BOSS DOWN:', bossDown, '| bossKills:', s.career.counters.bossKills);
if (!bossDown || s.career.counters.bossKills < 1) { console.log('FAIL: boss kill'); process.exit(1); }

// --- DAILY RUN ---
await page.goto(TEST_URL, { waitUntil: 'domcontentloaded' });
await sleep(3200);
await page.click('#btn-daily');
await sleep(4200);
s = await page.evaluate(() => window.__PITBOSS.debugState());
console.log('DAILY RUN:', JSON.stringify(s));
if (s.state !== 'playing' || !s.daily) { console.log('FAIL: daily run start'); process.exit(1); }
const dailyArena = s.arena;
const dailyCareer = await page.evaluate(() => window.__PITBOSS.debugCareer());
if (!dailyCareer.milestones.includes('daily1')) { console.log('FAIL: daily1 milestone'); process.exit(1); }

// deterministic daily arena: second daily run must pick the same layout
await page.goto(TEST_URL, { waitUntil: 'domcontentloaded' });
await sleep(3200);
await page.click('#btn-daily');
await sleep(4200);
s = await page.evaluate(() => window.__PITBOSS.debugState());
console.log('DAILY RERUN ARENA (expect', dailyArena + '):', s.arena);
if (s.arena !== dailyArena) { console.log('FAIL: daily arena not deterministic'); process.exit(1); }

// --- DAILY SHARE CODE (PB2) + DECODE ---
await page.evaluate(() => window.__PITBOSS.debugForceDeath());
await sleep(800);
s = await page.evaluate(() => ({
  code: document.getElementById('share-code')?.value ?? '',
  deathVisible: !document.getElementById('screen-death')?.classList.contains('hidden')
}));
console.log('DAILY SHARE CODE:', s.code);
if (!s.code.startsWith('PB2-') || !s.code.endsWith('-d')) { console.log('FAIL: PB2 daily code'); process.exit(1); }

await page.goto(TEST_URL, { waitUntil: 'domcontentloaded' });
await sleep(3200);
await page.evaluate(code => {
  const el = document.getElementById('paste-code');
  el.value = code;
  document.getElementById('btn-decode').click();
}, s.code);
await sleep(300);
const decoded = await page.evaluate(() => document.getElementById('decode-result')?.textContent ?? '');
console.log('DECODED:', decoded);
if (!decoded.includes('DAILY')) { console.log('FAIL: decode should mention DAILY'); process.exit(1); }

// --- CAREER CODE EXPORT/IMPORT (portable progress + settings) ---
// tweak a setting so we can prove settings ride the code
await page.evaluate(() => window.__PITBOSS.settings.setAccess({ mouseSens: 1.5 }));
const careerCode = await page.evaluate(() => window.__PITBOSS.debugCareerCode());
console.log('CAREER CODE:', careerCode.slice(0, 40) + '…');
if (!careerCode.startsWith('PBC2-')) { console.log('FAIL: career code should be PBC2'); process.exit(1); }

// simulate new browser: wipe career + settings, reload, import
await page.evaluate(() => {
  localStorage.removeItem('pitboss.career.v1');
  localStorage.removeItem('pitboss.settings.v1');
});
await page.reload({ waitUntil: 'domcontentloaded' });
await sleep(3200);
await page.evaluate(code => {
  const el = document.getElementById('career-code-input');
  el.value = code;
  document.getElementById('btn-career-import').click();
}, careerCode);
await sleep(300);
s = await page.evaluate(() => ({
  result: document.getElementById('career-result')?.textContent ?? '',
  unlocked: document.querySelectorAll('#milestone-list .ms-chip.unlocked').length,
  sens: window.__PITBOSS.settings.access.mouseSens,
  crouchBind: window.__PITBOSS.settings.bindings.crouch
}));
console.log('CAREER IMPORT:', JSON.stringify(s));
if (!s.result.includes('+ SETTINGS') || s.unlocked < 2) { console.log('FAIL: career import'); process.exit(1); }
if (s.sens !== 1.5 || s.crouchBind !== 'KeyC') { console.log('FAIL: settings did not ride the code'); process.exit(1); }

// invalid code rejected
await page.evaluate(() => {
  const el = document.getElementById('career-code-input');
  el.value = 'PBC1-1-5-0-0-0-0-0-0-0-bogus';
  document.getElementById('btn-career-import').click();
});
await sleep(200);
s = await page.evaluate(() => document.getElementById('career-result')?.textContent ?? '');
if (!s.includes('INVALID')) { console.log('FAIL: invalid career code rejected'); process.exit(1); }

// copy my career code (fills the box at minimum)
await page.click('#btn-career-copy');
await sleep(400);
s = await page.evaluate(() => ({
  input: document.getElementById('career-code-input')?.value ?? '',
  result: document.getElementById('career-result')?.textContent ?? ''
}));
console.log('CAREER COPY:', s.result, '| box has code:', s.input.startsWith('PBC2-'));
if (!s.input.startsWith('PBC2-') || !s.result) { console.log('FAIL: career copy'); process.exit(1); }

// muzzle style highlights immediately on selection (bossdown unlocked VOID earlier)
await page.evaluate(() => {
  document.getElementById('btn-settings').click();
  document.getElementById('tab-style').click();
});
await sleep(250);
await page.evaluate(() => {
  const btns = [...document.querySelectorAll('#muzzle-options .muzzle-btn')];
  btns.find(b => b.textContent.includes('VOID'))?.click();
});
await sleep(250);
s = await page.evaluate(() => {
  const active = document.querySelector('#muzzle-options .muzzle-btn.active');
  return { activeLabel: active?.textContent ?? '', stored: JSON.parse(localStorage.getItem('pitboss.settings.v1')).access.muzzle };
});
console.log('MUZZLE SELECTED:', JSON.stringify(s));
if (!s.activeLabel.includes('VOID') || s.stored !== 'void') { console.log('FAIL: muzzle highlight not immediate'); process.exit(1); }
await page.evaluate(() => document.getElementById('btn-settings-back').click());
await sleep(200);

// start screen scrolls (no clipped content): title and career row both reachable
s = await page.evaluate(() => {
  const el = document.getElementById('screen-start');
  return { scrollable: el.scrollHeight > el.clientHeight, overflowY: getComputedStyle(el).overflowY };
});
console.log('START SCREEN SCROLL:', JSON.stringify(s));
if (s.overflowY !== 'auto') { console.log('FAIL: start screen not scrollable'); process.exit(1); }

console.log('PAGE ERRORS:', errors.length);
console.log('PROGRESSION PASS');
await browser.close();
