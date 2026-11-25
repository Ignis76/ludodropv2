import assert from 'node:assert/strict';
import test from 'node:test';
import { detentTimes, OPENING_DURATION, REEL_WIDTH, reelKeyframes, reelPosition, START_INDEX, WINNER_INDEX } from '../src/opening.ts';

function cubic(t: number, first: number, second: number) {
  return 3 * (1 - t) ** 2 * t * first + 3 * (1 - t) * t ** 2 * second + t ** 3;
}

test('the compositor passes a tile edge exactly when its detent is scheduled', () => {
  for (const landing of [.13, .5, .87]) {
    const firstFrame = reelPosition((1000 / 60) / OPENING_DURATION, landing);
    assert.ok((firstFrame - reelPosition(0, landing)) * REEL_WIDTH >= 1, 'The first frame must visibly move');
    const frames = reelKeyframes(landing);
    const positions = frames.map(frame => -Number(frame.transform.match(/translate3d\(([-.\d]+)px/)![1]) / REEL_WIDTH);
    for (let i = 0; i < frames.length - 1; i++) {
      const from = frames[i], to = frames[i + 1];
      const controls = from.easing.match(/cubic-bezier\((.*)\)/)?.[1].split(',').map(Number);
      for (const t of [.05, .25, .5, .75, .95]) {
        const x = controls ? cubic(t, controls[0], controls[2]) : t;
        const y = controls ? cubic(t, controls[1], controls[3]) : t;
        const progress = from.offset + x * (to.offset - from.offset);
        const actual = positions[i] + y * (positions[i + 1] - positions[i]);
        assert.ok(Math.abs(actual - reelPosition(progress, landing)) < .000001);
      }
    }
    const times = detentTimes(landing);
    assert.equal(times.length, WINNER_INDEX - START_INDEX);
    times.forEach((time, i) => assert.ok(Math.abs(reelPosition(time / OPENING_DURATION, landing) - (START_INDEX + i + 1)) < .000001));
  }
});
