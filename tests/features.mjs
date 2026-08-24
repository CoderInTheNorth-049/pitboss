import { launch, watchErrors, startRun, sleep } from './helpers.mjs';

const browser = await launch();
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
const errors = watchErrors(page);

await startRun(page);

await page.evaluate(() => window.__PITBOSS.debugSetInvuln(true));

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

// --- PYROCLAST ---
await page.evaluate(() => window.__PITBOSS.debugGiveSpecial('pyroclast'));
await sleep(400);
s = await page.evaluate(() => ({
  ...window.__PITBOSS.debugState(),
  specialHud: !document.getElementById('special-wrap')?.classList.contains('hidden')
}));
console.log('PYROCLAST EQUIPPED:', JSON.stringify(s));
if (s.weapon !== 'pyroclast' || !s.specialHud) { console.log('FAIL: pyro equip'); process.exit(1); }
if (s.shieldT !== 0 || s.overdriveT !== 0) { console.log('FAIL: stray timers'); process.exit(1); }

await page.mouse.down(); await sleep(600); await page.mouse.up();
await sleep(300);
const fuelAfterFire = await page.evaluate(() => parseInt(document.getElementById('ammo-count')?.textContent ?? '100', 10));
console.log('PYRO FIRED, fuel left:', fuelAfterFire);
if (!(fuelAfterFire < 100)) { console.log('FAIL: pyro fuel did not drain'); process.exit(1); }

// --- SHIELD ---
await page.evaluate(() => {
  const g = window.__PITBOSS;
  g.debugSetHp(60);
  g.debugGiveShield(0.75);
});
await sleep(200);
s = await page.evaluate(() => ({
  ...window.__PITBOSS.debugState(),
  shieldHud: !document.getElementById('shield-wrap')?.classList.contains('hidden')
}));
console.log('SHIELD GIVEN:', JSON.stringify(s));
if (!(s.shieldFrac > 0) || !(s.shieldT > 0) || !s.shieldHud) { console.log('FAIL: shield active'); process.exit(1); }

await page.evaluate(() => window.__PITBOSS.debugPlayerHit(10));
await sleep(150);
s = await page.evaluate(() => window.__PITBOSS.debugState());
console.log('AFTER 10 DMG vs 75% SHIELD (expect 57):', JSON.stringify(s));
if (s.hp !== 57) { console.log('FAIL: shield absorb math'); process.exit(1); }
if (s.shieldBudget >= 120) { console.log('FAIL: shield budget not consumed'); process.exit(1); }

await page.evaluate(() => window.__PITBOSS.debugPlayerHit(40));
await sleep(150);
s = await page.evaluate(() => window.__PITBOSS.debugState());
console.log('AFTER 40 DMG vs shield (expect 47):', JSON.stringify(s));
if (s.hp !== 47) { console.log('FAIL: second shield absorb'); process.exit(1); }

// --- OVERDRIVE (free-fire while shield expires naturally) ---
await page.evaluate(() => window.__PITBOSS.debugGiveOverdrive());
await sleep(200);
s = await page.evaluate(() => ({
  ...window.__PITBOSS.debugState(),
  boostHud: !document.getElementById('boost-wrap')?.classList.contains('hidden')
}));
console.log('OVERDRIVE GIVEN:', JSON.stringify(s));
if (!(s.overdriveT > 0) || !s.boostHud) { console.log('FAIL: overdrive active'); process.exit(1); }

const ammoBeforeFree = await page.evaluate(() => document.getElementById('ammo-count')?.textContent);
await page.mouse.down(); await sleep(140); await page.mouse.up();
const ammoAfterFree = await page.evaluate(() => document.getElementById('ammo-count')?.textContent);
console.log('FREE-FIRE CHECK:', ammoBeforeFree, '→', ammoAfterFree);
if (ammoBeforeFree !== ammoAfterFree) { console.log('FAIL: overdrive should not consume ammo'); process.exit(1); }

await sleep(6500); // overdrive ends
s = await page.evaluate(() => ({
  ...window.__PITBOSS.debugState(),
  boostHud: !document.getElementById('boost-wrap')?.classList.contains('hidden')
}));
console.log('AFTER OVERDRIVE EXPIRY:', JSON.stringify(s));
if (s.overdriveT !== 0 || s.boostHud) { console.log('FAIL: overdrive expiry'); process.exit(1); }

// wait out shield duration (10s from grant; ~8s elapsed already)
for (let i = 0; i < 24; i++) {
  s = await page.evaluate(() => window.__PITBOSS.debugState());
  if (s.shieldT === 0 && s.shieldFrac === 0) break;
  await sleep(500);
}
s = await page.evaluate(() => ({
  ...window.__PITBOSS.debugState(),
  shieldHud: !document.getElementById('shield-wrap')?.classList.contains('hidden')
}));
console.log('AFTER SHIELD EXPIRY:', JSON.stringify(s));
if (s.shieldT !== 0 || s.shieldFrac !== 0 || s.shieldHud) { console.log('FAIL: shield expiry'); process.exit(1); }

// --- PYROCLAST SPECIAL EXPIRY (12s from equip, most already elapsed) ---
for (let i = 0; i < 30; i++) {
  s = await page.evaluate(() => ({
    ...window.__PITBOSS.debugState(),
    faded: [...document.querySelectorAll('.feed-item')].some(f => f.textContent.includes('SPECIAL FADED'))
  }));
  if (s.weapon === 'rifle' && s.faded) break;
  await sleep(500);
}
console.log('AFTER PYRO EXPIRY:', JSON.stringify(s));
if (s.weapon !== 'rifle' || !s.faded) { console.log('FAIL: pyro expiry'); process.exit(1); }

console.log('PAGE ERRORS:', errors.length);
console.log('FEATURES PASS');
await browser.close();
