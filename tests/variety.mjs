import { launch, watchErrors, startRun, sleep } from './helpers.mjs';

const browser = await launch();
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
const errors = watchErrors(page);

await startRun(page);
let s = await page.evaluate(() => window.__PITBOSS.debugState());
console.log('RUN STARTED:', JSON.stringify(s));
if (s.state !== 'playing') { console.log('FAIL: run start'); process.exit(1); }

// --- GLASS CANNON: incoming damage doubled ---
await page.evaluate(() => {
  const g = window.__PITBOSS;
  g.debugForceMutator('glasscannon');
  g.debugSetHp(100);
  g.debugPlayerHit(10);
});
await sleep(150);
s = await page.evaluate(() => window.__PITBOSS.debugState());
console.log('GLASS CANNON 10 DMG (expect 80):', s.hp);
if (s.hp !== 80) { console.log('FAIL: glass cannon incoming mult'); process.exit(1); }
if (s.mutator !== 'glasscannon') { console.log('FAIL: mutator state'); process.exit(1); }

const chipVisible = await page.evaluate(() =>
  !document.getElementById('mutator-chip')?.classList.contains('hidden'));
if (!chipVisible) { console.log('FAIL: mutator chip hidden'); process.exit(1); }

await page.evaluate(() => { const g = window.__PITBOSS; g.debugClearMutator(); g.debugPlayerHit(10); });
await sleep(150);
s = await page.evaluate(() => window.__PITBOSS.debugState());
console.log('CLEARED 10 DMG (expect 70):', s.hp);
if (s.hp !== 70) { console.log('FAIL: mutator clear should restore damage'); process.exit(1); }

// --- LOW GRAVITY: motor gravity scaled ---
await page.evaluate(() => window.__PITBOSS.debugForceMutator('lowgrav'));
await sleep(300);
const grav = await page.evaluate(() => window.__PITBOSS['player']['motor'].gravity);
console.log('LOW GRAV motor.gravity (expect ~12.6):', grav.toFixed(2));
if (Math.abs(grav - 21 * 0.6) > 0.01) { console.log('FAIL: low gravity'); process.exit(1); }

// --- SWARM: quota doubled ---
await page.evaluate(() => window.__PITBOSS.debugForceMutator('swarm'));
const quota = await page.evaluate(() => window.__PITBOSS.debugQuotaPreview());
console.log('SWARM quota wave', s.wave, '(expect 2x base):', quota);
if (quota !== 10) { console.log('FAIL: swarm quota'); process.exit(1); }

// --- DARK ZONE: fog density ---
await page.evaluate(() => window.__PITBOSS.debugForceMutator('darkzone'));
await sleep(100);
const fog = await page.evaluate(() => window.__PITBOSS['scene'].fog.density);
console.log('DARK ZONE fog (expect 0.05):', fog);
if (Math.abs(fog - 0.05) > 0.001) { console.log('FAIL: dark zone fog'); process.exit(1); }
await page.evaluate(() => window.__PITBOSS.debugClearMutator());
await sleep(100);
const fogBase = await page.evaluate(() => window.__PITBOSS['scene'].fog.density);
if (Math.abs(fogBase - 0.016) > 0.001) { console.log('FAIL: fog restore'); process.exit(1); }

// --- BOONS: mag size + vitality stacking ---
await page.evaluate(() => window.__PITBOSS.debugGiveBoon('mag'));
let mag = await page.evaluate(() => window.__PITBOSS.debugWeaponMag());
console.log('MAG BOON (expect 38):', mag);
if (mag !== 38) { console.log('FAIL: mag boon'); process.exit(1); }
await page.evaluate(() => window.__PITBOSS.debugGiveBoon('mag'));
mag = await page.evaluate(() => window.__PITBOSS.debugWeaponMag());
console.log('MAG BOON x2 (expect 45):', mag);
if (mag !== 45) { console.log('FAIL: mag boon stacking'); process.exit(1); }

await page.evaluate(() => window.__PITBOSS.debugGiveBoon('vitality'));
s = await page.evaluate(() => window.__PITBOSS.debugState());
console.log('VITALITY maxHp (expect 120):', s.maxHp, '| boons:', JSON.stringify(s.boons));
if (s.maxHp !== 120) { console.log('FAIL: vitality boon'); process.exit(1); }
const magEntry = s.boons.find(b => b.id === 'mag');
if (!magEntry || magEntry.stacks !== 2 || s.boons.length !== 2) { console.log('FAIL: boon entries'); process.exit(1); }

// --- DRAFT UI: pick + skip ---
await page.evaluate(() => { const g = window.__PITBOSS; g.debugSetHp(50); g.debugOpenDraft(); });
await sleep(300);
s = await page.evaluate(() => ({
  state: window.__PITBOSS.debugState().state,
  cards: document.querySelectorAll('#boon-cards .boon-card').length
}));
console.log('DRAFT OPEN:', JSON.stringify(s));
if (s.state !== 'draft' || s.cards !== 3) { console.log('FAIL: draft open/cards'); process.exit(1); }

const boonCountBefore = await page.evaluate(() => window.__PITBOSS.debugState().boons.length);
await page.click('#boon-cards .boon-card:nth-child(1)');
await sleep(300);
s = await page.evaluate(() => ({
  ...window.__PITBOSS.debugState(),
  draftHidden: document.getElementById('screen-draft').classList.contains('hidden')
}));
console.log('BOON PICKED:', JSON.stringify(s));
if (s.state !== 'playing' || !s.draftHidden) { console.log('FAIL: draft pick flow'); process.exit(1); }
if (s.boons.length !== boonCountBefore + 1) { console.log('FAIL: boon not applied'); process.exit(1); }

await page.evaluate(() => { const g = window.__PITBOSS; g.debugSetHp(50); g.debugOpenDraft(); });
await sleep(300);
await page.click('#btn-draft-skip');
await sleep(300);
s = await page.evaluate(() => window.__PITBOSS.debugState());
console.log('DRAFT SKIPPED HP (expect 75):', s.hp);
if (s.hp !== 75) { console.log('FAIL: draft skip heal'); process.exit(1); }

// --- VAMPIRE: kill heals +10 ---
await page.evaluate(() => {
  const g = window.__PITBOSS;
  g.debugSetHp(50);
  g.debugForceMutator('vampire');
  g.debugGiveSpecial('railhand');
});
await sleep(200);
let healed = false;
for (let i = 0; i < 4 && !healed; i++) {
  const r = await page.evaluate(() => {
    const g = window.__PITBOSS;
    if (!g.debugPlaceEnemyClear()) return null;
    return g.debugFireAt('head');
  });
  await sleep(150);
  s = await page.evaluate(() => window.__PITBOSS.debugState());
  if (r && r.killed && s.hp === 60) healed = true;
}
console.log('VAMPIRE KILL HEAL:', JSON.stringify(s));
if (!healed) { console.log('FAIL: vampire heal on kill'); process.exit(1); }

// --- DETERMINISM: same seed -> same mutator sequence ---
const seqA = await page.evaluate(() => window.__PITBOSS.debugMutatorSequence(12345, 10));
const seqB = await page.evaluate(() => window.__PITBOSS.debugMutatorSequence(12345, 10));
const seqC = await page.evaluate(() => window.__PITBOSS.debugMutatorSequence(777, 10));
const seqD = await page.evaluate(() => window.__PITBOSS.debugMutatorSequence(999, 10));
console.log('SEQ(12345):', JSON.stringify(seqA));
console.log('SEQ(777):  ', JSON.stringify(seqC));
if (JSON.stringify(seqA) !== JSON.stringify(seqB)) { console.log('FAIL: seeded sequence not deterministic'); process.exit(1); }
if (JSON.stringify(seqC) === JSON.stringify(seqD) && JSON.stringify(seqA) === JSON.stringify(seqC)) { console.log('FAIL: seeds produce identical sequences'); process.exit(1); }

// --- START PAGE AWARENESS (fresh load) ---
await page.goto('http://localhost:5199/', { waitUntil: 'domcontentloaded' });
await sleep(3200);
s = await page.evaluate(() => ({
  chips: document.querySelectorAll('#mutator-chips .mchip').length,
  rvTitle: document.querySelector('.rv-title')?.textContent ?? ''
}));
console.log('START PAGE VARIETY INFO:', JSON.stringify(s));
if (s.chips !== 7 || !s.rvTitle.includes('EVERY RUN FIGHTS DIFFERENT')) { console.log('FAIL: start page variety info'); process.exit(1); }

console.log('PAGE ERRORS:', errors.length);
console.log('VARIETY PASS');
await browser.close();
