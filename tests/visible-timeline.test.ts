import test from 'node:test';
import assert from 'node:assert/strict';
import { runVisibleTimeline } from '../src/visible-timeline.ts';

test('local presentation resumes from visible time after repeated hides and page freezing', t => {
  const page = Object.assign(new EventTarget(), { hidden: false });
  const view = new EventTarget();
  let clock = 0, next = 0, finishes = 0;
  const scheduled = new Map<number, () => void>();
  const frames: number[] = [], pauses: number[] = [];
  const schedule = (callback: () => void) => { scheduled.set(++next, callback); return next; };
  const cancel = (id: number) => scheduled.delete(id);
  const step = (ms: number) => {
    clock += ms;
    for (const [id, callback] of [...scheduled]) { scheduled.delete(id); callback(); }
  };
  t.mock.method(performance, 'now', () => clock);
  const globals = { document: page, window: Object.assign(view, { setTimeout: schedule }), requestAnimationFrame: schedule, cancelAnimationFrame: cancel };
  for (const [key, value] of Object.entries(globals)) {
    const original = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value });
    t.after(() => { if (original) Object.defineProperty(globalThis, key, original); else Reflect.deleteProperty(globalThis, key); });
  }
  t.mock.method(globalThis, 'clearTimeout', cancel);
  const stop = runVisibleTimeline(100, () => { finishes++; }, elapsed => frames.push(elapsed), at => pauses.push(at));
  let holdFinished = false;
  runVisibleTimeline(100, () => { holdFinished = true; });
  step(30);
  page.hidden = true;
  page.dispatchEvent(new Event('visibilitychange'));
  step(850);
  page.dispatchEvent(new Event('freeze'));
  page.hidden = false;
  page.dispatchEvent(new Event('visibilitychange'));
  step(850);
  assert.deepEqual(frames, [30]);
  assert.equal(holdFinished, false);
  page.dispatchEvent(new Event('resume'));
  step(20);
  view.dispatchEvent(new Event('pagehide'));
  step(1000);
  view.dispatchEvent(new Event('pageshow'));
  step(50);
  stop();
  step(500);
  assert.deepEqual(frames, [30, 50, 100]);
  assert.deepEqual(pauses, [30, 50]);
  assert.equal(finishes, 1);
  assert.equal(holdFinished, true);
  assert.equal(scheduled.size, 0);
});
