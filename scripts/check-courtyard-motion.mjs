// Run against the local site with Playwright and Chromium installed.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH || 'playwright');
const base = process.env.INSPECTION_URL || 'http://127.0.0.1:5188';
const browser = await chromium.launch({ executablePath: process.env.EXECUTABLE_PATH, args: ['--enable-unsafe-swiftshader'] });
try {
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 844 }, reducedMotion: 'no-preference' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.addInitScript(() => {
      window.summitDraws = 0;
      const gl = WebGL2RenderingContext.prototype;
      for (const name of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) {
        const issueDraw = gl[name];
        gl[name] = function (...args) {
          if (this.canvas.parentElement?.classList.contains('courtyard-atmosphere')) window.summitDraws++;
          return issueDraw.apply(this, args);
        };
      }
    });
    await page.goto(new URL('#case/black', base).href);
    const workshop = page.getByRole('radio', { name: 'Мастерская' });
    const summit = page.getByRole('radio', { name: 'Вершина' });
    assert.equal(await workshop.isChecked(), true);
    const room = page.locator('.courtyard-atmosphere[data-scenery="workshop"][data-painted]');
    await room.waitFor();
    assert.ok((await room.locator('.courtyard-entry-poster').getAttribute('src')).includes('/courtyard/black'));
    const turnInRoom = page.getByRole('button', { name: /Повернуть контейнер/ });
    await turnInRoom.press('ArrowRight');
    await page.waitForFunction(() => !!document.querySelector('.workshop-snow')?.style.getPropertyValue('--turned-window-mask'));
    await turnInRoom.press('Home');
    await summit.press('Space');
    const stage = page.locator('.courtyard-atmosphere[data-scenery="summit"][data-painted]');
    await stage.waitFor();
    assert.equal(await page.locator('.courtyard-atmosphere').count(), 1);
    assert.equal(await summit.isChecked(), true);
    await page.reload();
    await stage.waitFor();
    assert.equal(await summit.isChecked(), true);
    const snow = stage.locator('.summit-spindrift');
    await snow.waitFor();
    const firstFrame = await stage.locator('.courtyard-entry-poster').getAttribute('src');
    assert.ok(firstFrame?.includes('/summit/black-closed.webp'));
    await stage.locator('.courtyard-bench').evaluate(image => image.decode());
    const draws = await page.evaluate(async () => {
      const before = window.summitDraws;
      await new Promise(resolve => setTimeout(resolve, 800));
      return window.summitDraws - before;
    });
    assert.equal(draws, 0, 'A stationary summit kept rendering WebGL frames');
    assert.ok(await snow.evaluate(node => node.getAnimations({ subtree: true }).some(animation => animation.currentTime > 0)));

    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await snow.waitFor({ state: 'hidden' });
    await page.evaluate(() => window.scrollTo(0, 0));
    await snow.waitFor();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await snow.waitFor({ state: 'hidden' });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await snow.waitFor();
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await snow.waitFor({ state: 'hidden' });
    await page.evaluate(() => {
      delete document.hidden;
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await snow.waitFor();

    const turn = page.getByRole('button', { name: /Повернуть контейнер/ });
    const bounds = await turn.boundingBox();
    const x = bounds.x + bounds.width / 2, y = bounds.y + bounds.height / 2;
    const beforeTurn = await page.evaluate(() => window.summitDraws);
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + bounds.width / 4, y, { steps: 6 });
    await page.mouse.up();
    await page.waitForFunction(at => window.summitDraws > at, beforeTurn);
    for (const key of ['Home', 'ArrowRight']) {
      const at = await page.evaluate(() => window.summitDraws);
      await turn.press(key);
      await page.waitForFunction(prior => window.summitDraws > prior, at);
    }
    const before = await page.evaluate(() => window.summitDraws);
    await page.locator('.theatre-open').click();
    await page.waitForFunction(at => document.querySelector('.state-unlocking') && window.summitDraws > at, before);
    assert.equal(await snow.count(), 0, 'The idle weather layer remained while the case was opening');
    assert.equal(await turn.count(), 0, 'The closed case could still be rotated during its opening');
    assert.equal(await workshop.isDisabled(), true);
    await page.locator('.case-result').waitFor();
    assert.equal(await workshop.isEnabled(), true);
    await workshop.press('Space');
    await page.reload();
    await room.waitFor();
    assert.equal(await workshop.isChecked(), true);
    assert.deepEqual(errors, []);
    console.log(`${width}px: ${draws} idle WebGL draws in 800 ms; alpine wind, visibility, reduced motion and opening passed.`);
    await page.close();
  }
} finally {
  await browser.close();
}
