// При запущенном Vite: node scripts/render-inspection-fallback.mjs [night-port contraband ...]
// Для сборки нужны Playwright с Chromium и Python с Pillow. Пути можно задать через
// PLAYWRIGHT_PATH, EXECUTABLE_PATH и PYTHON. INSPECTION_URL меняет адрес Vite.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const base = process.env.INSPECTION_URL || 'http://127.0.0.1:5188';
const destination = process.env.OUTPUT_DIR ? resolve(process.env.OUTPUT_DIR) : fileURLToPath(new URL('../public/assets/unseal/fallback/', import.meta.url));
const encoder = fileURLToPath(new URL('./encode-inspection.py', import.meta.url));
const browser = await chromium.launch({ headless: true, executablePath: process.env.EXECUTABLE_PATH });
try {
  const page = await browser.newPage({ viewport: { width: 1024, height: 704 }, deviceScaleFactor: 1 });
  await page.route('**/__inspection_capture__', route => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><style>body{margin:0}canvas{display:block;width:100vw;height:100vh}</style><canvas></canvas>',
  }));
  await page.goto(new URL('/__inspection_capture__', base).href);
  const models = await page.evaluate(async () => {
    const { cases } = await import('/src/data/cases.ts');
    const { inspectionModel } = await import('/src/inspection-model.ts');
    const unique = new Map();
    for (const item of cases) {
      const { id, kind } = inspectionModel(item);
      if (!unique.has(id)) unique.set(id, { caseId: item.id, kind });
    }
    return Object.fromEntries(unique);
  });
  const requested = process.argv.slice(2);
  for (const id of requested.length ? requested : Object.keys(models)) {
    if (!Object.hasOwn(models, id)) throw new Error('Неизвестная модель: ' + id);
    const { caseId, kind } = models[id];
    const highCadence = ['hard', 'compact', 'series', 'souvenir', 'capsule'].includes(kind);
    const normalSteps = highCadence ? 126 : 48;
    const fastSteps = highCadence ? 35 : 14;
    // Both edits sample the actual rig at equal intervals in their own playback clock.
    const ticks = normalSteps * fastSteps;
    const normal = Array.from({ length: normalSteps + 1 }, (_, i) => i * fastSteps);
    const fast = Array.from({ length: fastSteps + 1 }, (_, i) =>
      highCadence ? i * normalSteps : Math.round(i * normalSteps / fastSteps) * fastSteps);
    const poses = [...new Set([...normal, ...fast])].sort((a, b) => a - b);
    const sequence = JSON.stringify([normal, fast].map(edit => edit.map(tick => poses.indexOf(tick))));
    await page.evaluate(async caseId => {
      const { cases } = await import('/src/data/cases.ts');
      const { createInspectionScene } = await import('/src/inspection-scene.ts');
      // A disposed WebGL context cannot be attached to the next model.
      const canvas = document.createElement('canvas');
      document.querySelector('canvas').replaceWith(canvas);
      const controller = new AbortController();
      const item = cases.find(item => item.id === caseId);
      const { inspectionModel } = await import('/src/inspection-model.ts');
      const model = inspectionModel(item);
      const framing = model.kind === 'compact' && !model.workshop ? 'bench' : 'studio';
      const scene = await createInspectionScene(canvas, item, controller.signal, framing);
      window.capturePose = progress => {
        scene.render(progress);
        return canvas.toDataURL('image/png').split(',')[1];
      };
      window.releaseProp = () => controller.abort();
    }, caseId);
    const frames = [];
    try {
      for (const tick of poses) {
        const png = Buffer.from(await page.evaluate(p => window.capturePose(p), tick / ticks), 'base64');
        const length = Buffer.alloc(4);
        length.writeUInt32BE(png.byteLength);
        frames.push(length, png);
      }
    } finally {
      await page.evaluate(() => window.releaseProp());
    }
    execFileSync(process.env.PYTHON || 'python', [encoder, destination, id, sequence], { input: Buffer.concat(frames), stdio: ['pipe', 'inherit', 'inherit'], windowsHide: true });
    console.log('Готово:', id);
  }
} finally {
  await browser.close();
}
