// Generate the original workshop photographs and depth masks for its idle window weather.
// Start the dev server, then run node scripts/render-courtyard-posters.mjs [--resume] [black bench ...].
import { mkdir, rename, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH || 'playwright');
const url = new URL('/__workshop_capture__', process.env.INSPECTION_URL || 'http://127.0.0.1:5192').href;
const output = process.env.OUTPUT_DIR ? resolve(process.env.OUTPUT_DIR)
  : fileURLToPath(new URL('../public/assets/unseal/courtyard/', import.meta.url));
const benches = { bench: 'black', 'bench-flat': 'arcade', 'bench-small': 'capsule-espionage' };
const formats = [
  { suffix: '', width: 1920, height: 480, ratio: 2.25 },
  { suffix: '-mobile', width: 680, height: 330, ratio: 3 },
];
const requested = process.argv.slice(2).filter(id => id !== '--resume');
const resume = process.argv.includes('--resume');
async function exists(file) { return (await stat(file).catch(() => null))?.size > 0; }
async function save(file, data, format) {
  const prefix = 'data:image/' + format + ';base64,';
  if (!data.startsWith(prefix)) throw new Error('Could not capture ' + file);
  const temp = file + '.' + process.pid + '.tmp';
  await writeFile(temp, Buffer.from(data.slice(prefix.length), 'base64'));
  await rename(temp, file);
}

const browser = await chromium.launch({ executablePath: process.env.EXECUTABLE_PATH, args: ['--enable-unsafe-swiftshader'] });
try {
  await mkdir(output, { recursive: true });
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  await page.route(url, route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><body></body>' }));
  await page.goto(url);
  const models = await page.evaluate(async () => {
    const { cases } = await import('/src/data/cases.ts');
    const { inspectionModel } = await import('/src/inspection-model.ts');
    return [...new Set(cases.map(item => inspectionModel(item).id))];
  });
  const ids = [...models, ...Object.keys(benches)];
  for (const id of requested.length ? requested : ids) {
    if (!ids.includes(id)) throw new Error('Unknown model or camera view: ' + id);
    const bench = benches[id];
    for (const { suffix, width, height, ratio } of formats) {
      const base = join(output, id + suffix);
      if (resume && await exists(base + '.webp') && (bench || await exists(base + '-window.png'))) continue;
      await page.setViewportSize({ width, height });
      const result = await page.evaluate(async ({ id, bench, width, height, ratio }) => {
        const [{ cases }, { inspectionModel }, { createWorkshopRenderer }] = await Promise.all([
          import('/src/data/cases.ts'), import('/src/inspection-model.ts'), import('/src/workshop-renderer.ts'),
        ]);
        const item = cases.find(item => bench ? item.id === bench : inspectionModel(item).id === id);
        const canvas = document.createElement('canvas');
        document.body.replaceChildren(canvas);
        const scene = createWorkshopRenderer(canvas, item);
        try {
          scene.resize(width, height, ratio);
          const session = await scene.loadCase(new AbortController().signal);
          session.setVisible(!bench);
          session.render(0);
          return { photo: scene.snapshot(1.6, 0, .91), mask: bench ? undefined : scene.snapshotWindowMask() };
        } finally { scene.dispose(); }
      }, { id, bench, width, height, ratio });
      await save(base + '.webp', result.photo, 'webp');
      if (result.mask) await save(base + '-window.png', result.mask, 'png');
      console.log(id + suffix);
    }
  }
} finally { await browser.close(); }
