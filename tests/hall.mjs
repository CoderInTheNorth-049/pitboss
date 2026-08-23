import { launch, watchErrors, startRun, sleep } from './helpers.mjs';

const browser = await launch();
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
const errors = watchErrors(page);

await startRun(page);

// die once — should be NEW HIGH SCORE #1 on a fresh board
await page.evaluate(() => window.__PITBOSS.debugForceDeath());
await sleep(600);
const death1 = await page.evaluate(() => ({
  banner: document.getElementById('new-highscore')?.textContent,
  visible: !document.getElementById('new-highscore')?.classList.contains('hidden')
}));
console.log('DEATH 1 (fresh board):', JSON.stringify(death1));
if (death1.banner !== '★ NEW HIGH SCORE ★') { console.log('FAIL: rank 1 banner'); process.exit(1); }

// die again on next run with same wave (wave 1) — worse kills, should rank #2
await page.click('#btn-reenter');
for (let i = 0; i < 20; i++) {
  await sleep(500);
  const alive = await page.evaluate(() => window.__PITBOSS.debugState().alive);
  if (alive > 0) break;
}
await page.evaluate(() => { window.__PITBOSS.debugSetHp(1); window.__PITBOSS.debugForceDeath(); });
await sleep(600);
const death2 = await page.evaluate(() => document.getElementById('new-highscore')?.textContent);
console.log('DEATH 2 (same wave, fewer kills):', death2);
if (!death2?.includes('#2')) { console.log('FAIL: rank 2'); process.exit(1); }

// start screen shows the hall with 2 rows
await page.click('#btn-roster-death');
await sleep(400);
await page.click('#btn-roster-back');
await sleep(400);
const hall = await page.evaluate(() => ({
  rows: [...document.querySelectorAll('.hall-row')].map(r => r.textContent),
  bestLine: document.getElementById('best-line')?.textContent
}));
console.log('HALL:', JSON.stringify(hall, null, 1));
if (hall.rows.length !== 2 || !hall.bestLine.includes('WAVE 1')) { console.log('FAIL: hall render'); process.exit(1); }

// survives reload
await page.reload({ waitUntil: 'domcontentloaded' });
await sleep(3400);
const hallAfter = await page.evaluate(() => document.querySelectorAll('.hall-row').length);
console.log('HALL AFTER RELOAD:', hallAfter);
if (hallAfter !== 2) { console.log('FAIL: hall persistence'); process.exit(1); }

console.log('PAGE ERRORS:', errors.length);
console.log('HALL PASS');
await browser.close();
