import assert from 'node:assert/strict';
import test from 'node:test';
import { renderUpgradeTicks } from '../src/audio.ts';
import { buildUpgradeSpin, UPGRADE_MARK_DEGREES } from '../src/upgrade-spin.ts';

function spin(chance: number, won: boolean, fast: boolean, samples: number[], suspense = true) {
  let i = 0;
  const result = buildUpgradeSpin(chance, won, fast, () => samples[i++], suspense);
  assert.equal(i, samples.length);
  return result;
}

const angle = (transform: string) => Number(transform.slice(7, -4));
const almost = (value: number, expected: number) => assert.ok(Math.abs(value - expected) < 1e-7);
const bezier = (easing: string) => easing.slice('cubic-bezier('.length, -1).split(',').map(Number);
const derivative = (t: number, a: number, b: number) =>
  3 * ((1 - t) ** 2 * a + 2 * (1 - t) * t * (b - a) + t * t * (1 - b));
const coordinate = (u: number, a: number, b: number) =>
  3 * a * u * (1 - u) ** 2 + 3 * b * u ** 2 * (1 - u) + u ** 3;

function easedTravel(time: number, easing: string) {
  if (easing === 'linear') return time;
  const [x1, y1, x2, y2] = bezier(easing);
  let low = 0, high = 1;
  for (let i = 0; i < 30; i++) {
    const t = (low + high) / 2;
    if (coordinate(t, x1, x2) < time) low = t;
    else high = t;
  }
  return coordinate((low + high) / 2, y1, y2);
}

test('suspense conceals the result through launch and cruise in both speeds', () => {
  for (const fast of [false, true]) {
    const samples = [.16, .72, .22, .95, .08];
    const win = spin(.10, true, fast, samples);
    const lose = spin(.75, false, fast, samples);
    assert.equal(win.duration, lose.duration);
    assert.ok(fast ? win.duration >= 900 && win.duration <= 1050 : win.duration >= 1450 && win.duration <= 1650);
    assert.deepEqual(win.keyframes.slice(0, 2), lose.keyframes.slice(0, 2));
    assert.equal(win.keyframes[2].offset, lose.keyframes[2].offset);
    assert.equal(win.keyframes[2].transform, lose.keyframes[2].transform);
    const earliestBrake = fast ? .16 : .18;
    assert.ok(win.keyframes[2].offset >= earliestBrake && win.keyframes[2].offset <= earliestBrake + .035);
    const alternate = spin(.10, true, fast, [.92, .15, .22, .02, .81]);
    assert.notEqual(win.keyframes[2].transform, alternate.keyframes[2].transform);
    assert.notEqual(win.keyframes[1].transform, alternate.keyframes[1].transform);
  }
});

test('both modes land across the entire result sector centered on six o’clock', () => {
  for (const suspense of [true, false]) for (const chance of [0, .001, .1, .75, 1]) for (const won of [false, true]) {
    const width = 360 * (won ? chance : 1 - chance);
    if (!width) continue;
    const start = 180 - 180 * chance + (won ? 0 : 360 * chance);
    const samples = [0, .5, .999999].map(draw => {
      const draws = suspense ? [.3, .8, draw, .4, .7] : [.3, .8, draw];
      const { landing, keyframes } = spin(chance, won, false, draws, suspense);
      almost(angle(keyframes.at(-1)!.transform), landing);
      return ((landing - start) % 360 + 360) % 360 / width;
    });
    assert.ok(samples[0] > 0 && samples[0] < .1);
    almost(samples[1], .5);
    assert.ok(samples[2] > .9 && samples[2] < 1);
  }
});

test('suspense spins stay forward and brake monotonically with continuous speed at each join', () => {
  for (const fast of [false, true]) for (const won of [false, true]) for (let i = 0; i < 53; i++) {
    const samples = [3, 13, 19, 29, 43].map(step => (i * step % 53) / 53);
    const { duration, keyframes: [launch, cruise, brake, approach, stop] } = spin(.1, won, fast, samples);
    const cruiseSpeed = (angle(brake.transform) - angle(cruise.transform)) / (brake.offset - cruise.offset);
    const [ax, ay, bx, by] = bezier(launch.easing!);
    const rampSpeed = angle(cruise.transform) / cruise.offset;
    almost(rampSpeed * ay / ax, 0);
    almost(rampSpeed * (1 - by) / (1 - bx), cruiseSpeed);
    assert.ok(angle(stop.transform) > 360);
    let previous = cruiseSpeed;
    for (const [from, to] of [[brake, approach], [approach, stop]]) {
      const [x1, y1, x2, y2] = bezier(from.easing!);
      const mean = (angle(to.transform) - angle(from.transform)) / (to.offset - from.offset);
      assert.ok(x1 > 0 && x1 <= x2 && x2 < 1);
      almost(mean * y1 / x1, previous);
      for (let j = 1; j <= 30; j++) {
        const t = j / 30;
        const speed = mean * derivative(t, y1, y2) / derivative(t, x1, x2);
        assert.ok(speed >= 0 && speed <= previous + 1e-7);
        previous = speed;
      }
    }
    almost(previous, 0);
    // Even a landing near the far edge of a sector must visibly slow in the first half.
    const brakeDistance = angle(approach.transform) - angle(brake.transform);
    const elapsed = (.4 - brake.offset) / (approach.offset - brake.offset);
    const speedAtFortyPercent = brakeDistance * (easedTravel(elapsed + .001, brake.easing) - easedTravel(elapsed - .001, brake.easing))
      / (.002 * (approach.offset - brake.offset));
    assert.ok(speedAtFortyPercent < .89 * cruiseSpeed);
    // Keep a visible final sweep but taper its acceleration to zero at the result.
    const tailMs = duration * (stop.offset - approach.offset);
    const tailDegrees = angle(stop.transform) - angle(approach.transform);
    almost(tailMs, fast ? 430 : 615);
    const [, y1, , y2] = bezier(approach.easing!);
    almost(y1, 1); almost(y2, 1);
    const remaining = (ms: number) => tailDegrees * (1 - easedTravel(1 - ms / tailMs, approach.easing!));
    assert.ok(remaining(100) > 1 && remaining(100) < 3);
    assert.ok(remaining(1000 / 60) < .025);
  }
});

test('classic spins start braking early and visibly settle toward the real result', () => {
  for (const fast of [false, true]) for (const won of [true, false]) for (const draw of [0, .5, .99999]) {
    const { duration, keyframes: [launch, brake, stop] } = spin(.1, won, fast, [draw, draw, draw], false);
    assert.ok(fast ? duration >= 900 && duration <= 1050 : duration >= 1450 && duration <= 1650);
    assert.ok(brake.offset >= .035 && brake.offset <= .065);
    const launchAngle = angle(brake.transform);
    const brakeDistance = angle(stop.transform) - launchAngle;
    const [ax, ay, bx, by] = bezier(launch.easing!);
    const [x1, y1, x2, y2] = bezier(brake.easing!);
    const meanBrakeSpeed = brakeDistance / (1 - brake.offset);
    const peakSpeed = launchAngle / brake.offset * (1 - by) / (1 - bx);
    almost(ay / ax, 0);
    almost(meanBrakeSpeed * y1 / x1, peakSpeed);
    let previous = peakSpeed;
    for (let j = 1; j <= 30; j++) {
      const t = j / 30;
      const speed = meanBrakeSpeed * derivative(t, y1, y2) / derivative(t, x1, x2);
      assert.ok(speed >= 0 && speed < previous);
      previous = speed;
    }
    almost(previous, 0);
    almost(y1, 1); almost(y2, 1);
    const brakeMs = duration * (1 - brake.offset);
    const remaining = (ms: number) => brakeDistance * (1 - easedTravel(1 - ms / brakeMs, brake.easing!));
    assert.ok(remaining(150) > 3 && remaining(150) < 22);
    assert.ok(remaining(1000 / 60) < .04);
  }
});

test('the pointer crosses each of the twelve major marks once, including during its final approach', () => {
  assert.equal(360 / UPGRADE_MARK_DEGREES, 12);
  for (const fast of [true, false]) for (const suspense of [true, false]) {
    const { duration, keyframes, tickTimes, landing } = buildUpgradeSpin(.22, false, fast, () => .62, suspense);
    assert.equal(tickTimes.length, Math.floor(landing / UPGRADE_MARK_DEGREES));
    tickTimes.forEach((ms, i) => {
      assert.ok(ms > (tickTimes[i - 1] ?? 0) && ms <= duration);
      const endIndex = keyframes.findIndex(f => f.offset >= ms / duration);
      const start = keyframes[endIndex - 1], end = keyframes[endIndex];
      const time = (ms / duration - start.offset) / (end.offset - start.offset);
      const travel = easedTravel(time, start.easing);
      const position = angle(start.transform) + (angle(end.transform) - angle(start.transform)) * travel;
      assert.ok(Math.abs(position - UPGRADE_MARK_DEGREES * (i + 1)) < .001);
    });
    const last = tickTimes.slice(-4);
    assert.ok(last[3] - last[2] > last[2] - last[1] && last[2] - last[1] > last[1] - last[0]);
  }
});

test('rendered audio peaks at every mark and only plays a landing tick when the pointer reaches one', () => {
  const hz = 48000;
  const createBuffer = (numberOfChannels: number, length: number, sampleRate: number) => {
    const data = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
    return { sampleRate, numberOfChannels, length, getChannelData: (index: number) => data[index] } as AudioBuffer;
  };
  const context = { createBuffer } as BaseAudioContext;
  const cue = createBuffer(2, hz, hz);
  // The loud part of the cue is several milliseconds into the edit.
  for (let ch = 0; ch < cue.numberOfChannels; ch++) cue.getChannelData(ch)[Math.round(.0985 * hz)] = 1;

  for (const draw of [.5, .42]) for (const fast of [true, false]) for (const suspense of [true, false]) {
    const { tickTimes, duration, landing } = buildUpgradeSpin(.3, true, fast, () => draw, suspense);
    const samples = renderUpgradeTicks(context, cue, tickTimes, duration);
    const expected = tickTimes.map(t => Math.round(t * hz / 1000));
    assert.equal(landing % UPGRADE_MARK_DEGREES === 0, draw === .5);
    for (let channel = 0; channel < samples.numberOfChannels; channel++) {
      const actual: number[] = [];
      samples.getChannelData(channel).forEach((value, frame) => { if (value > 0) actual.push(frame); });
      assert.deepEqual(actual, expected);
    }
  }
});
