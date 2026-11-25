// Run against an existing dev or preview server with Playwright and Chromium installed.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH || 'playwright');
const base = process.env.INSPECTION_URL || 'http://127.0.0.1:5188';
const browser = await chromium.launch({ executablePath: process.env.EXECUTABLE_PATH });
const errors = [];
async function visit(route, setup) {
  const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
  page.on('pageerror', error => errors.push(error.message));
  if (setup) await setup(page);
  await page.goto(new URL('#' + route, base).href, { waitUntil: 'domcontentloaded' });
  return page;
}

try {
  const page = await visit('cases');
  const promo = page.getByRole('button', { name: 'Применить код', exact: true });
  await promo.click();
  const wallet = page.getByRole('dialog', { name: 'Виртуальный баланс' });
  await wallet.waitFor();
  await wallet.getByRole('status').getByText('OFFICE20', { exact: true }).waitFor();
  await page.keyboard.press('Escape');
  await wallet.waitFor({ state: 'detached' });
  assert(await page.getByRole('button', { name: 'Пополнить с бонусом' }).evaluate(button => button === document.activeElement));

  await page.getByRole('button', { name: /Посмотреть Asiimov, Цена/ }).click();
  await page.waitForURL(url => url.hash === '#case/original-asiimov');
  await page.locator('.case-detail .theatre-screen').waitFor();
  const sort = page.getByRole('combobox', { name: 'Сортировка содержимого' });
  await sort.selectOption('desc');
  assert.equal(await sort.inputValue(), 'desc');
  console.log('Promo wallet, catalogue navigation and case contents passed.');
  await page.close();

  const inventory = await visit('inventory');
  await inventory.waitForURL('**/#profile/inventory');
  await inventory.locator('#profile-inventory:focus').waitFor();
  const profile = inventory.getByRole('region', { name: 'Профиль игрока', exact: true });
  const search = inventory.getByRole('searchbox', { name: 'Поиск по инвентарю' });
  await profile.waitFor();
  const profileBox = await profile.boundingBox();
  const searchBox = await search.boundingBox();
  assert.ok(profileBox.y + profileBox.height <= searchBox.y, 'Profile should precede the inventory search');
  assert.equal(await inventory.getByRole('heading', { name: 'Инвентарь', exact: true }).count(), 0);
  assert.equal(await inventory.locator('.profile-inventory .armory-mount').count(), 0);
  const cards = inventory.locator('#inventory-items .skin-card');
  const count = await cards.count();
  assert.ok(count > 0);
  await cards.first().click();
  const actions = inventory.getByRole('complementary', { name: 'Действия с выбранными предметами' });
  await actions.getByRole('button', { name: 'В апгрейд' }).waitFor();
  await actions.getByRole('button', { name: 'Снять выбор предметов' }).click();
  await actions.waitFor({ state: 'hidden' });
  await search.fill('no-matching-inventory-item');
  await inventory.getByText('Ничего не найдено', { exact: true }).waitFor();
  await search.fill('');
  await cards.first().waitFor();
  assert.equal(await cards.count(), count);
  console.log('Inventory deep link, profile layout, search and selection passed.');
  await inventory.close();

  const library = await visit('skins');
  const mount = library.locator('.skin-library .armory-mount');
  const inspectedName = (await mount.getAttribute('aria-label')).replace(/^Посмотреть /, '');
  await mount.click();
  await library.getByRole('dialog', { name: inspectedName, exact: true }).waitFor();
  console.log('Featured item inspection passed in the skin catalogue.');
  await library.close();

  const paged = await visit('profile/inventory', page => page.setViewportSize({ width: 1720, height: 900 }));
  await paged.locator('#profile-inventory:focus').waitFor();
  const grid = paged.locator('#inventory-items');
  await grid.waitFor();
  await paged.evaluate(() => {
    const key = 'ludodrop.player.v1';
    const player = JSON.parse(localStorage.getItem(key));
    const starters = player.inventory;
    const now = Date.now();
    player.inventory = Array.from({ length: 49 }, (_, index) => ({
      ...starters[index % starters.length], uid: 'row-' + (index + 1), obtained: now - index,
    }));
    localStorage.setItem(key, JSON.stringify(player));
  });
  await paged.reload();
  const pager = paged.getByRole('navigation', { name: 'Страницы инвентаря', exact: true });
  async function checkInventoryRows(anchorIndex) {
    const columns = await grid.evaluate(element => getComputedStyle(element).gridTemplateColumns.split(/\s+/).length);
    const pageSize = Math.ceil(12 / columns) * columns;
    const first = Math.floor(anchorIndex / pageSize) * pageSize + 1;
    const last = first + pageSize - 1;
    const range = first + '–' + last + ' из 49';
    for (const bar of await paged.locator('.inventory-pagination').all()) {
      await bar.getByText(range, { exact: true }).waitFor();
    }
    const rows = await grid.locator('[data-item-uid]').evaluateAll(cards => {
      const rows = new Map();
      for (const card of cards) {
        if (!rows.has(card.offsetTop)) rows.set(card.offsetTop, []);
        rows.get(card.offsetTop).push(card.dataset.itemUid);
      }
      return [...rows.values()];
    });
    assert.deepEqual(rows.flat(), Array.from({ length: last - first + 1 }, (_, i) => 'row-' + (first + i)));
    assert.ok(rows.every(row => row.length === columns), 'Inventory page ends with an incomplete row');
    return { columns, pageSize };
  }
  const desktop = await checkInventoryRows(0);
  await pager.getByRole('button', { name: 'Следующая страница' }).click();
  const anchorIndex = desktop.pageSize;
  await checkInventoryRows(anchorIndex);
  await paged.setViewportSize({ width: 390, height: 844 });
  const mobile = await checkInventoryRows(anchorIndex);
  assert.ok(mobile.columns < desktop.columns, 'Inventory should reflow to fewer columns on a phone');
  assert.deepEqual(errors, []);
  console.log('Inventory pagination filled each row and kept the visible range on resize.');
} finally {
  await browser.close();
}
