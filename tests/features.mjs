import { launch, watchErrors, startRun, sleep } from './helpers.mjs';

const browser = await launch();
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
const errors = watchErrors(page);

await startRun(page);

let s = await page.evaluate(() => window.__PITBOSS.debugState());
console.log('WAVE1 (vial spawned):', JSON.stringify(s));
if (s.pickups < 1) { console.log('FAIL: no vial spawned'); process.exit(1); }

await page.evaluate(() => { const g = window.__PITBOSS; g.debugSetHp(40); g.debugSpawnHealHere(); });
await sleep(700);
s = await page.evaluate(() => window.__PITBOSS.debugState());
console.log('AFTER HEAL (40→70?):', JSON.stringify(s));
if (s.hp !== 70) { console.log('FAIL: heal'); process.exit(1); }

await page.evaluate(() => window.__PITBOSS.debugGiveSpecial('railhand'));
await sleep(400);
s = await page.evaluate(() => ({
  ...window.__PITBOSS.debugState(),
  specialHud: !document.getElementById('special-wrap')?.classList.contains('hidden')
}));
console.log('RAILHAND:', JSON.stringify(s));
if (s.weapon !== 'railhand' || !s.specialHud) { console.log('FAIL: equip'); process.exit(1); }

await page.mouse.down(); await sleep(120); await page.mouse.up();
await sleep(400);
const ammo = await page.evaluate(() => document.getElementById('ammo-count')?.textContent);
console.log('RAIL FIRED, ammo:', ammo);
if (ammo !== '5') { console.log('FAIL: fire'); process.exit(1); }

await sleep(13000);
s = await page.evaluate(() => ({
  ...window.__PITBOSS.debugState(),
  faded: [...document.querySelectorAll('.feed-item')].some(f => f.textContent.includes('SPECIAL FADED'))
}));
console.log('AFTER EXPIRY:', JSON.stringify(s));
if (s.weapon !== 'rifle' || !s.faded) { console.log('FAIL: expiry'); process.exit(1); }

console.log('PAGE ERRORS:', errors.length);
console.log('FEATURES PASS');
await browser.close();
