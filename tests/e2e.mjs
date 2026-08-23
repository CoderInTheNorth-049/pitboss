import { launch, watchErrors, startRun, sleep } from './helpers.mjs';

const browser = await launch();
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
const errors = watchErrors(page);

await startRun(page);

let s = await page.evaluate(() => window.__PITBOSS.debugState());
console.log('COMBAT:', JSON.stringify(s));
if (s.state !== 'playing' || s.alive < 1) { console.log('FAIL: no active combat'); process.exit(1); }

const died = await page.evaluate(() => window.__PITBOSS.debugForceDeath());
await sleep(600);
const death = await page.evaluate(() => ({
  deathVisible: !document.getElementById('screen-death')?.classList.contains('hidden'),
  killerName: document.getElementById('killer-name')?.textContent,
  promo: document.getElementById('killer-promo')?.textContent,
  share: document.getElementById('share-code')?.value
}));
console.log('DEATH:', died, JSON.stringify(death));
if (!died || !death.deathVisible || !death.share?.startsWith('PB1-')) { console.log('FAIL: death flow'); process.exit(1); }

await page.click('#btn-reenter');
await sleep(1500);
s = await page.evaluate(() => window.__PITBOSS.debugState());
console.log('REENTERED:', JSON.stringify(s));
if (s.state !== 'playing') { console.log('FAIL: reenter'); process.exit(1); }

await page.reload({ waitUntil: 'domcontentloaded' });
await sleep(3400);
await page.click('#btn-roster');
await sleep(500);
const killerFirstName = death.killerName.split(',')[0];
const roster = await page.evaluate(name => ({
  visible: !document.getElementById('screen-roster')?.classList.contains('hidden'),
  rows: document.querySelectorAll('.rival-row').length,
  killerPersisted: [...document.querySelectorAll('.rival-name')].some(n => n.textContent === name)
}), killerFirstName);
console.log('ROSTER AFTER RELOAD:', JSON.stringify(roster));
if (!roster.visible || roster.rows < 1 || !roster.killerPersisted) { console.log('FAIL: roster persistence'); process.exit(1); }

console.log('PAGE ERRORS:', errors.length);
console.log(errors.length === 0 ? 'E2E PASS' : 'E2E PASS WITH CONSOLE ERRORS');
await browser.close();
