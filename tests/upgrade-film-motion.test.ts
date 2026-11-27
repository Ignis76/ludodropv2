import test from 'node:test';
import assert from 'node:assert/strict';
import { drawUpgradeWheel } from '../src/engine.ts';
import { AWARD_TIME, FAST_RATE, FILM_DURATION, POSTER_FRAMES, UPGRADE_CUES, cameraAt, project, sectorPoint, transferFrame } from '../src/upgrade-film-motion.ts';

test('the four camera cuts separate the stake, target, multiplier and actual award', () => {
  const { runway, rotor, multiplier, delivery } = UPGRADE_CUES;
  for (const [cut, shot] of [[runway, 1], [rotor, 2], [AWARD_TIME, 3]]) {
    assert.equal(transferFrame(cut - 1 / 600).shot, shot - 1);
    assert.equal(transferFrame(cut).shot, shot);
  }
  assert.equal(transferFrame(0).phase, 'stake');
  assert.equal(transferFrame(runway).phase, 'target');
  assert.equal(transferFrame(runway + .5).target, 1);
  assert.equal(transferFrame(multiplier - .08).mint, 0);
  assert.equal(transferFrame(multiplier + .35).mint, 1);
  assert.equal(transferFrame(multiplier + .35).target, 0);
  const beforeHit = transferFrame(AWARD_TIME - .001);
  assert.equal(beforeHit.phase, 'target');
  assert.equal(beforeHit.lift + beforeHit.impulse, 0);
  assert.equal(transferFrame(AWARD_TIME).phase, 'award');
  assert.equal(transferFrame(AWARD_TIME + .055).impulse, 1);
  const held = transferFrame(AWARD_TIME + .65);
  assert.equal(held.lift, 1);
  assert.equal(held.label, 1);
  assert.equal(transferFrame(delivery).delivery, 0);
  assert.ok((delivery - AWARD_TIME) / FAST_RATE > 1.5);
  assert.equal(transferFrame(FILM_DURATION).delivery, 1);
  assert.equal(transferFrame(FILM_DURATION).background, 0);
});

test('camera overlays interpolate smoothly up to 144 Hz and hand off the prize only once', () => {
  const channels = ['contact', 'charge', 'target', 'mint', 'label', 'lift', 'delivery', 'impulse', 'background'] as const;
  let previous = transferFrame(0);
  for (let frame = 1; frame <= Math.ceil(FILM_DURATION * 144); frame++) {
    const pose = transferFrame(frame / 144);
    for (const key of channels) {
      assert.ok(pose[key] >= 0 && pose[key] <= 1, key);
      assert.ok(Math.abs(pose[key] - previous[key]) < .2, key);
    }
    for (const key of ['charge', 'lift', 'delivery'] as const) assert.ok(pose[key] >= previous[key], key);
    assert.ok(pose.background <= previous.background);
    previous = pose;
  }
});

test('camera registration stays on its own shot at each edit and on its authored frame for a poster', () => {
  const cuts = [0, UPGRADE_CUES.runway, UPGRADE_CUES.rotor, AWARD_TIME, FILM_DURATION];
  for (const [shot, frame] of POSTER_FRAMES.entries()) {
    const enter = cuts[shot], exit = cuts[shot + 1];
    assert.deepEqual(cameraAt(-5, shot), cameraAt(enter, shot));
    assert.deepEqual(cameraAt(30, shot), cameraAt(exit, shot));
    assert.deepEqual(cameraAt(enter, shot, true), cameraAt(frame / 60, shot));
    assert.deepEqual(cameraAt(exit, shot, true), cameraAt(frame / 60, shot));
    for (let t = enter; t < exit; t += 1 / 144) {
      const center = project(cameraAt(t, shot), 0, 0);
      assert.ok(Number.isFinite(center.x) && Number.isFinite(center.y));
    }
  }
  assert.ok(project(cameraAt(UPGRADE_CUES.runway - .001, 0), 0, 0).y < -1.2);
  const wide = project(cameraAt(UPGRADE_CUES.runway, 1), 0, 0);
  assert.ok(wide.y > .4 && wide.y < .55);
});

test('both edges and middle of a real golden landing stay on the filmed metal sector', () => {
  for (const turn of [.000001, .5, .999999]) {
    const samples = [turn, 0, .15];
    const { landing, goldHit } = drawUpgradeWheel(.5, () => samples.shift()!);
    assert.ok(goldHit);
    assert.ok(landing >= 171 && landing <= 189);
    for (let t = 0; t < UPGRADE_CUES.runway; t += 1 / 60) {
      const camera = cameraAt(t, 0);
      const mark = (angle: number) => {
        const { x, z } = sectorPoint(angle, 3.24);
        return project(camera, x, z);
      };
      const p = mark(landing);
      assert.ok(p.x >= mark(189).x && p.x <= mark(171).x);
      assert.ok(p.x > .24 && p.x < .79 && p.y > .35 && p.y < .85);
    }
  }
});
