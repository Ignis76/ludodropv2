import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cases } from '../src/data/cases.ts';
import { inspectionModel } from '../src/inspection-model.ts';
import { recordingMotionEnd } from '../src/recording-frames.ts';

// WebP's ANMF duration is a little-endian uint24 at byte 12 of its payload.
function frameDurations(file: URL) {
  const data = readFileSync(file);
  assert.equal(data.toString('ascii', 8, 12), 'WEBP');
  const durations: number[] = [];
  for (let pos = 12; pos + 8 <= data.length;) {
    const size = data.readUInt32LE(pos + 4);
    assert.ok(pos + 8 + size <= data.length, file.pathname);
    if (data.toString('ascii', pos, pos + 4) === 'ANMF') durations.push(data.readUIntLE(pos + 20, 3));
    pos += 8 + size + size % 2;
  }
  return durations;
}

test('ordinary case and capsule recordings preserve the opening clock and display motion at 60 fps', () => {
  for (const item of cases) {
    const { kind, id } = inspectionModel(item);
    if (!['series', 'hard', 'compact', 'souvenir', 'capsule'].includes(kind)) continue;
    for (const fast of [false, true]) {
      const file = new URL(`../public/assets/unseal/fallback/${id}${fast ? '-fast' : ''}.webp`, import.meta.url);
      const frames = frameDurations(file);
      assert.equal(frames.reduce((a, b) => a + b, 0), fast ? 680 : 2420, file.pathname);
      // The encoder combines identical poses while a latch is at rest and during the holds.
      const atCadence = frames.filter(ms => ms === 16 || ms === 17).length;
      assert.ok(atCadence >= (fast ? 27 : 96), file.pathname);
    }
  }
});

test('the normal reel can start after the last distinct frame of each recording', () => {
  for (const id of ['case-cs20', 'neon-compact', 'sunset']) {
    const file = new URL(`../public/assets/unseal/fallback/${id}.webp`, import.meta.url);
    const frames = frameDurations(file);
    const finalFrameStarts = frames.slice(0, -1).reduce((sum, ms) => sum + ms, 0);
    const transition = recordingMotionEnd(readFileSync(file));
    assert.ok(transition !== undefined && transition > finalFrameStarts && transition <= finalFrameStarts + 17, id);
  }
});
