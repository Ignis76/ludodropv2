import type { Skin } from './types';
import { random, weightedPick } from './engine.ts';

export const OPENING_DURATION = 6750;
export const OPENING_SETTLE_DURATION = 560;
export const REEL_WIDTH = 174;
export const START_INDEX = 5;
export const WINNER_INDEX = 42;
const LEAD_OUT = 7;

// The integral of a short acceleration, steady travel, then a long deceleration.
// Both joins preserve velocity. The reel reaches zero velocity at its final position.
const RAMP = .065;
const ENTRY_SPEED = .28; // Fraction of cruising speed at the transition from the opened case.
const BRAKE = .19;
const FALL = 2;
const rampDistance = (1 + ENTRY_SPEED) * RAMP / 2;
const cruiseDistance = BRAKE - RAMP;
const brakeDistance = (1 - BRAKE) / (FALL + 1);
const fullDistance = rampDistance + cruiseDistance + brakeDistance;

export function reelPosition(fraction: number, landing: number) {
  const t = Math.min(1, Math.max(0, fraction));
  const start = START_INDEX + .5;
  const finish = WINNER_INDEX + landing;
  if (t === 1) return finish;
  let travel: number;
  if (t < RAMP) travel = ENTRY_SPEED * t + (1 - ENTRY_SPEED) * t * t / (2 * RAMP);
  else if (t < BRAKE) travel = rampDistance + t - RAMP;
  else travel = rampDistance + cruiseDistance + brakeDistance * (1 - ((1 - t) / (1 - BRAKE)) ** (FALL + 1));
  return start + (finish - start) * travel / fullDistance;
}

// With evenly spaced Bézier control points on the time axis, these segments
// reproduce the quadratic acceleration and cubic braking in reelPosition exactly.
export function reelKeyframes(landing: number) {
  return [
    { offset: 0, easing: `cubic-bezier(.33333333,${2 * ENTRY_SPEED / (3 * (1 + ENTRY_SPEED))},.66666667,${1 - 2 / (3 * (1 + ENTRY_SPEED))})` },
    { offset: RAMP, easing: 'linear' },
    { offset: BRAKE, easing: 'cubic-bezier(.33333333,1,.66666667,1)' },
    { offset: 1, easing: 'linear' },
  ].map(frame => ({
    ...frame,
    transform: `translate3d(${-reelPosition(frame.offset, landing) * REEL_WIDTH}px,0,0)`,
  }));
}

export function detentTimes(landing: number) {
  const start = START_INDEX + .5;
  const span = WINNER_INDEX + landing - start;
  return Array.from({ length: WINNER_INDEX - START_INDEX }, (_, i) => {
    const distance = (START_INDEX + i + 1 - start) * fullDistance / span;
    let t: number;
    if (distance < rampDistance) {
      const speed = Math.sqrt(ENTRY_SPEED ** 2 + 2 * (1 - ENTRY_SPEED) * distance / RAMP);
      t = 2 * distance / (ENTRY_SPEED + speed);
    }
    else if (distance < rampDistance + cruiseDistance) t = RAMP + distance - rampDistance;
    else t = 1 - (1 - BRAKE) * ((fullDistance - distance) / brakeDistance) ** (1 / (FALL + 1));
    return t * OPENING_DURATION;
  });
}

export function makeReel(winner: Skin, pool: Skin[], weights: number[]) {
  return Array.from({ length: WINNER_INDEX + LEAD_OUT + 1 }, (_, i) =>
    i === WINNER_INDEX ? winner : weightedPick(pool, weights));
}

export const landingFraction = () => .13 + .74 * random();
