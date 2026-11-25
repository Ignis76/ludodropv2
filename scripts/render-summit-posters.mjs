// Run against the Vite dev server. Examples: node scripts/render-summit-posters.mjs --resume
// node scripts/render-summit-posters.mjs plate:flat black capsule-espionage
import { mkdir, rename, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH || 'playwright');
const origin = process.env.INSPECTION_URL || 'http://127.0.0.1:5192';
const output = process.env.OUTPUT_DIR ? resolve(process.env.OUTPUT_DIR)
  : fileURLToPath(new URL('../public/assets/unseal/summit/', import.meta.url));
const resume = process.argv.includes('--resume');
const requested = [...new Set(process.argv.slice(2).filter(id => id !== '--resume'))];
const layouts = [
  { suffix: '', width: 1920, height: 480, pixelRatio: 2 },
  { suffix: '-mobile', width: 680, height: 330, pixelRatio: 3 },
];
const foreground = { suffix: '-closed', width: 800, height: 400, pixelRatio: 2 };
const harness = new URL('/__summit_posters__', origin).href;

async function capture(page, task) {
  const { model, width, height, pixelRatio, plate } = task;
  await page.setViewportSize({ width, height });
  return page.evaluate(async ({ model, width, height, pixelRatio, plate }) => {
    const [{ cases }, { createCourtyardRenderer }] = await Promise.all([
      import('/src/data/cases.ts'), import('/src/courtyard-renderer.ts'),
    ]);
    const item = cases.find(item => item.id === model);
    if (!item) throw new Error('Не найден контейнер ' + model);
    const canvas = document.createElement('canvas');
    document.body.replaceChildren(canvas);
    const engine = plate ? createCourtyardRenderer(canvas, item) : createCourtyardRenderer(canvas, item, true);
    try {
      engine.resize(width, height, pixelRatio);
      if (canvas.width !== width * pixelRatio || canvas.height !== height * pixelRatio) {
        throw new Error('Недоступно разрешение ' + width * pixelRatio + '×' + height * pixelRatio);
      }
      const session = await engine.loadCase(new AbortController().signal);
      session.setVisible(!plate);
      session.render(0);
      const image = plate ? engine.snapshot(1.6, 0, .91) : engine.snapshotCase(.94);
      if (!image.startsWith('data:image/webp;base64,')) throw new Error('Браузер не создал WebP');
      if (!plate) {
        // Detect an opaque stage or an empty foreground before replacing a valid export.
        const decoded = new Image();
        decoded.src = image;
        await decoded.decode();
        const sample = document.createElement('canvas');
        sample.width = 96;
        sample.height = 48;
        const ctx = sample.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(decoded, 0, 0, sample.width, sample.height);
        const rgba = ctx.getImageData(0, 0, sample.width, sample.height).data;
        if (rgba[3] > 0 || rgba[rgba.length - 1] > 0 ||
            !rgba.some((value, index) => index % 4 === 3 && value >= 160)) {
          throw new Error('Некорректная прозрачность закрытого контейнера ' + model);
        }
      }
      return image;
    } finally {
      engine.dispose();
    }
  }, { model, width, height, pixelRatio, plate });
}

const browser = await chromium.launch({
  executablePath: process.env.EXECUTABLE_PATH, args: ['--enable-unsafe-swiftshader'],
});
try {
  await mkdir(output, { recursive: true });
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  async function openHarness() {
    // Remove the route after navigation to allow Chromium to cache common models and textures.
    await page.route(harness, route => route.fulfill({
      contentType: 'text/html', body: '<!doctype html><style>*{margin:0}canvas{display:block}</style><body></body>',
    }), { times: 1 });
    await page.goto(harness);
  }
  await openHarness();
  const entries = await page.evaluate(async () => {
    const [{ cases }, { inspectionModel }, { benchView }] = await Promise.all([
      import('/src/data/cases.ts'), import('/src/inspection-model.ts'), import('/src/courtyard-poster.ts'),
    ]);
    return cases.map(item => {
      const model = inspectionModel(item);
      return { item: item.id, model: model.id, view: benchView(model.kind) };
    });
  });
  const tasks = new Map();
  const filenames = new Set();
  function register(key, model, stem, formats, plate) {
    const variants = formats.map(format => {
      const filename = stem + format.suffix + '.webp';
      if (filenames.has(filename)) throw new Error('Повтор имени файла ' + filename);
      filenames.add(filename);
      return { ...format, model, filename, plate };
    });
    tasks.set(key, variants);
  }
  for (const view of ['standard', 'flat', 'small']) {
    const entry = entries.find(entry => entry.view === view);
    if (!entry) throw new Error('Не найден ракурс ' + view);
    register('plate:' + view, entry.item, view, layouts, true);
  }
  for (const { item, model } of entries) {
    if (!tasks.has(model)) register(model, item, model, [foreground], false);
  }
  const selected = requested.length ? requested : [...tasks.keys()];
  for (const key of selected) {
    if (!tasks.has(key)) throw new Error('Неизвестная модель или фон ' + key);
  }
  for (const key of selected) {
    for (const task of tasks.get(key)) {
      const file = join(output, task.filename);
      if (resume && (await stat(file).catch(() => null))?.size > 0) continue;
      let data;
      try {
        data = await capture(page, task);
      } catch (error) {
        console.warn('Повтор захвата ' + task.filename, error.message);
        await openHarness();
        data = await capture(page, task);
      }
      const bytes = Buffer.from(data.slice(data.indexOf(',') + 1), 'base64');
      const temporary = file + '.' + process.pid + '.tmp';
      await writeFile(temporary, bytes);
      await rename(temporary, file);
      console.log(task.filename + ' ' + Math.round(bytes.length / 1024) + ' KiB');
    }
  }
} finally {
  await browser.close();
}
