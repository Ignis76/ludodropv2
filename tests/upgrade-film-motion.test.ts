import test from 'node:test';
import assert from 'node:assert/strict';
import { drawUpgradeWheel } from '../src/engine.ts';
import { AWARD_TIME, FAST_RATE, FILM_DURATION, POSTER_FRAMES, UPGRADE_CUES, cameraAt, project, rimCenter, sectorPoint, transferFrame, unproject } from '../src/upgrade-film-motion.ts';
import { silhouetteOffset } from '../src/upgrade-film-stage.ts';

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
  const rim = project(cameraAt(UPGRADE_CUES.runway - .001, 0), 0, 0);
  assert.ok(rim.y < 0 && rim.y > -.65);
  const wide = project(cameraAt(UPGRADE_CUES.runway, 1), 0, 0);
  assert.ok(wide.y > .4 && wide.y < .55);
});

test('the lifting mat, its depth and both ends of the display stay inside the portrait crop', () => {
  const at = (time: number, x: number, z = 0, depth = 0) => project(cameraAt(time, 3), x, z, depth);
  const low = at(AWARD_TIME, 0), raised = at(AWARD_TIME + 1.35, 0);
  assert.ok(raised.y < low.y - .16);
  for (let t = AWARD_TIME; t < FILM_DURATION; t += 1 / 60) {
    const center = at(t, 0);
    assert.ok(center.y > .5 && center.y < .93);
    assert.ok(at(t, -.74).x > .075 && at(t, .74).x < .925);
    assert.ok(at(t, 0, 0, -.22).y > at(t, 0, 0, .22).y);
  }
  // The fully spread rank behind the bench fits both ends of the portrait frame too.
  assert.ok(at(6.36, -7.1, .85, 18.4).x > .075);
  assert.ok(at(6.36, 7.1, .85, 18.4).x < .925);
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

test('the displayed hub follows the midpoint of the visible wheel rim independently of the foreground platform', () => {
  for (const [time, shot] of [[2.08, 1], [2.65, 1], [3.28, 2], [4.42, 2], [6.36, 3], [7.03, 3]]) {
    const camera = cameraAt(time, shot);
    // On the last shot the coordinate origin is the raised mat on the near mezzanine.
    const z = shot === 3 ? 4.26 - (3.45 + .327 + .064) : 0;
    const depth = shot === 3 ? 4.2 - .395 + 14.15 : .51 - .395;
    const rim = Array.from({ length: 360 }, (_, angle) => {
      const point = sectorPoint(angle, 3.15);
      return project(camera, point.x, z + point.z, depth);
    });
    const center = rimCenter(camera);
    for (const axis of ['x', 'y'] as const) {
      const values = rim.map(p => p[axis]);
      assert.ok(Math.abs(center[axis] - (Math.min(...values) + Math.max(...values)) / 2) < .00035);
    }
    const support = unproject(camera, center.x, center.y, .05);
    const point = project(camera, support.x, support.z, .05);
    assert.ok(Math.hypot(point.x - center.x, point.y - center.y) < 1e-8);
  }
});

test('an asymmetric skin stays visually centred after rotation and scaling', () => {
  const outline = [{ x: -.48, y: -.09 }, { x: .31, y: -.26 }, { x: .41, y: -.15 }, { x: .25, y: .48 }, { x: .10, y: .39 }];
  for (const angle of [-.32, -.018, 0, .11]) for (const width of [87, 434]) {
    const height = width * .58, tilt = .91, offset = silhouetteOffset(outline, width, height, angle, tilt);
    const c = Math.cos(angle), s = Math.sin(angle);
    const xs = outline.map(p => 615 - offset.x + p.x * width * tilt * c - p.y * height * s);
    const ys = outline.map(p => 282 - offset.y + p.x * width * tilt * s + p.y * height * c);
    assert.ok(Math.abs((Math.max(...xs) + Math.min(...xs)) / 2 - 615) < 1e-9);
    assert.ok(Math.abs((Math.max(...ys) + Math.min(...ys)) / 2 - 282) < 1e-9);
  }
});
