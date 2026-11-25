// Run against an existing dev or preview server with Playwright and Chromium installed.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH || 'playwright');
const base = process.env.INSPECTION_URL || 'http://127.0.0.1:5188';
const browser = await chromium.launch({ executablePath: process.env.EXECUTABLE_PATH });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'no-preference' });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const player = () => page.evaluate(() => JSON.parse(localStorage.getItem('ludodrop.player.v1')));
const track = page.locator('.roll-track');
const position = () => track.evaluate(node => node.getAnimations()[0].currentTime);

async function checkReadyHandoff() {
  const warm = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: 'no-preference' });
  try {
    await warm.addInitScript(() => {
      const decode = HTMLImageElement.prototype.decode;
      HTMLImageElement.prototype.decode = function () {
        // A tile halfway down the strip must not hold up the first visible tiles.
        if (this.closest('.roll-item:nth-child(25)')) return new Promise(() => {});
        return decode.call(this);
      };
    });
    await warm.goto(new URL('#case/case-cs20', base).href);
    const artwork = warm.locator('.theatre-contents .skin-card img');
    await artwork.first().waitFor({ state: 'attached' });
    await artwork.evaluateAll(images => Promise.all(images.map(image => {
      image.loading = 'eager';
      return image.decode();
    })));
    await warm.locator('.theatre-open').click();
    const handoff = await warm.waitForFunction(() => {
      const bank = document.querySelector('.state-rolling .roll-bank');
      if (!bank) return;
      const track = bank.querySelector('.roll-track');
      return {
        visible: !bank.hidden && getComputedStyle(track).visibility === 'visible',
        playing: track.getAnimations().some(animation => animation.playState === 'running'),
        waiting: !!bank.querySelector('.roll-buffer'),
      };
    });
    assert.deepEqual(await handoff.jsonValue(), { visible: true, playing: true, waiting: false });
  } finally {
    await warm.close();
  }
}

let releaseImages;
const delayed = new Promise(resolve => { releaseImages = resolve; });
try {
  await page.addInitScript(() => {
    window.setTabHidden = hidden => {
      if (hidden) Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      else delete document.hidden;
      document.dispatchEvent(new Event('visibilitychange'));
    };
  });
  await page.route('**/assets/skins/**', async route => { await delayed; await route.continue(); });
  await page.goto(new URL('#case/case-cs20', base).href, { waitUntil: 'domcontentloaded' });
  const open = page.locator('.theatre-open');
  await open.waitFor();
  const before = await player();
  const price = Number((await open.locator('.coin').textContent()).replace(/\s/g, ''));
  await open.click();
  await page.locator('.state-unlocking .inspection-preview').waitFor();
  assert.equal(await page.locator('.roll-bank').isVisible(), false, 'Reel appeared while the case was opening');
  await page.locator('.roll-buffer').waitFor();
  assert.equal(await page.locator('.roll-window').isVisible(), false, 'Stationary tiles appeared while their images were loading');
  assert.equal(await track.evaluate(node => node.getAnimations()[0].playState), 'paused');
  assert.equal(await position(), 0);
  releaseImages();
  await page.waitForFunction(() => document.querySelector('.roll-track').getAnimations()[0].currentTime > 100);
  assert.ok(await track.isVisible(), 'Moving reel was hidden');
  assert.ok(await page.locator('.winning-slot img').evaluate(image => image.complete && image.naturalWidth > 0));

  await page.evaluate(() => window.setTabHidden(true));
  const paused = await position();
  await page.waitForTimeout(240);
  assert.equal(await position(), paused, 'Reel moved while the tab was hidden');
  await page.evaluate(() => window.setTabHidden(false));
  await page.waitForFunction(t => document.querySelector('.roll-track').getAnimations()[0].currentTime > t, paused);
  await page.setViewportSize({ width: 960, height: 540 });

  const landing = await page.waitForFunction(() => {
    const row = document.querySelector('.state-settling .roll-window');
    if (!row) return;
    const slot = row.querySelector('.winning-slot');
    const bounds = slot.getBoundingClientRect();
    const needle = row.querySelector('.roll-needle').getBoundingClientRect();
    const x = needle.left + needle.width / 2;
    window.setTabHidden(true);
    return { id: slot.dataset.skinId, aligned: x > bounds.left && x < bounds.right };
  }, undefined, { timeout: 15000 });
  const winner = await landing.jsonValue();
  assert.ok(winner.aligned, 'Stopping position missed the winning tile');
  await page.waitForTimeout(750);
  assert.equal(await page.locator('.state-settling').count(), 1, 'Result was revealed in the background');
  await page.evaluate(() => window.setTabHidden(false));
  const prize = page.locator('.state-result .reward-display[data-art="ready"]');
  await prize.waitFor();
  assert.equal(await prize.getAttribute('data-skin-id'), winner.id);
  const after = await player();
  const awards = after.inventory.filter(item => !before.inventory.some(owned => owned.uid === item.uid));
  assert.deepEqual(awards.map(item => item.skinId), [winner.id]);
  assert.equal(after.opened, before.opened + 1);
  assert.equal(after.history.length, before.history.length + 1);
  assert.equal(after.balance, before.balance - price);
  const repeat = page.locator('.case-result').getByRole('button', {name: /Ещё раз/});
  assert.equal(await open.count(), 1, 'Two purchase buttons are present at the result');
  await page.locator('.theatre-fast').click();
  await repeat.click();
  await page.locator('.state-unlocking').waitFor();
  await repeat.waitFor();
  const next = await player();
  assert.equal(next.opened, after.opened + 1);
  assert.equal(next.balance, after.balance - price);
  assert.equal(next.inventory.length, after.inventory.length + 1);
  assert.deepEqual(errors, []);
  await checkReadyHandoff();
  console.log('Opening and repeat passed with one paid award per action.');
} finally {
  releaseImages();
  await page.unrouteAll({ behavior: 'wait' });
  await browser.close();
}
