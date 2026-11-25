type Easing = readonly [number, number, number, number];
type SpinPose = { offset: number; angle: number; easing?: Easing };

const launchEase: Easing = [1 / 3, 0, 2 / 3, 1 / 3];
// Starts at twice the mean speed and reaches rest with zero speed and acceleration.
const brakeEase: Easing = [.5, 1, .8, 1];
export const UPGRADE_MARK_DEGREES = 30;

function cubic(t: number, first: number, second: number) {
  const s = 1 - t;
  return 3 * s * s * t * first + 3 * s * t * t * second + t * t * t;
}

// WAAPI maps the Bezier's time coordinate to travel. Invert travel to find
// the moment the pointer crosses a mark, including the non-linear time axis.
function timeAtTravel(fraction: number, easing?: Easing) {
  if (!easing || fraction === 1) return fraction;
  let low = 0, high = 1;
  for (let i = 0; i < 22; i++) {
    const mid = (low + high) / 2;
    if (cubic(mid, easing[1], easing[3]) < fraction) low = mid;
    else high = mid;
  }
  return cubic((low + high) / 2, easing[0], easing[2]);
}

function spinTimeline(duration: number, poses: SpinPose[]) {
  const tickTimes: number[] = [];
  let nextTick = UPGRADE_MARK_DEGREES;
  for (let i = 1; i < poses.length; i++) {
    const start = poses[i - 1], end = poses[i];
    while (nextTick <= end.angle) {
      const travel = (nextTick - start.angle) / (end.angle - start.angle);
      const time = timeAtTravel(travel, start.easing);
      tickTimes.push(duration * (start.offset + (end.offset - start.offset) * time));
      nextTick += UPGRADE_MARK_DEGREES;
    }
  }
  const keyframes = poses.map(({ angle, offset, easing }) => ({
    offset, transform: `rotate(${angle}deg)`, easing: easing ? `cubic-bezier(${easing.join(',')})` : 'linear',
  }));
  return { duration, landing: poses[poses.length - 1].angle, keyframes, tickTimes };
}

export function buildUpgradeSpin(chance: number, won: boolean, fast: boolean, rng: () => number, suspense = true) {
  const sector = 360 * chance;
  const availableArc = won ? sector : 360 - sector;
  if (!Number.isFinite(chance) || chance < 0 || chance > 1 || availableArc === 0) {
    throw new RangeError('Невозможный сектор апгрейда');
  }

  const duration = Math.round(fast ? 900 + 150 * rng() : 1450 + 200 * rng());
  const accelerationEnd = suspense ? .055 + .045 * rng() : .035 + .03 * rng();
  const arcStart = 180 - sector / 2 + (won ? 0 : sector);
  const inset = Math.min(2, availableArc * .08);
  const target = arcStart + inset + (availableArc - 2 * inset) * rng();

  const launch: SpinPose = { offset: 0, angle: 0, easing: launchEase };
  if (!suspense) {
    const landing = (fast ? 2 : 3) * 360 + target % 360;
    // Match the launch's exit speed to the initial slope of the braking curve.
    const launchAngle = landing * accelerationEnd;
    return spinTimeline(duration, [
      launch,
      { offset: accelerationEnd, angle: launchAngle, easing: brakeEase },
      { offset: 1, angle: landing },
    ]);
  }

  const brakeStart = (fast ? .16 : .18) + .035 * rng();
  // Keep the last markings in motion for a readable, progressively slower sweep.
  const settleTime = (fast ? 430 : 615) / duration;
  const settleArc = fast ? 66 : 112;
  const settleStart = 1 - settleTime;
  const brakeSpan = settleStart - brakeStart;
  const settleSpeed = 2 * settleArc / settleTime;
  // More than a full turn of spare travel lets either outcome brake into the same final approach.
  const speed = settleSpeed + (800 + 75 * rng()) / brakeSpan;
  const launchAngle = speed * accelerationEnd / 2;
  const brakeAngle = launchAngle + speed * (brakeStart - accelerationEnd);

  const expectedStop = brakeAngle + brakeSpan * (speed + settleSpeed) / 2 + settleArc;
  const turns = Math.round((expectedStop - target) / 360);
  const landing = target + turns * 360;
  const settleAngle = landing - settleArc;
  const meanSpeed = (settleAngle - brakeAngle) / brakeSpan;
  // The intersection of the two velocity tangents is the control point of a quadratic
  // Bezier. Express it as a CSS cubic so both joins preserve angular velocity.
  const tangentTime = (meanSpeed - settleSpeed) / (speed - settleSpeed);
  const tangentTravel = tangentTime * speed / meanSpeed;
  const x1 = 2 * tangentTime / 3;
  const y1 = 2 * tangentTravel / 3;
  return spinTimeline(duration, [
    launch,
    { offset: accelerationEnd, angle: launchAngle },
    { offset: brakeStart, angle: brakeAngle, easing: [x1, y1, 1 / 3 + x1, 1 / 3 + y1] },
    { offset: settleStart, angle: settleAngle, easing: brakeEase },
    { offset: 1, angle: landing },
  ]);
}
