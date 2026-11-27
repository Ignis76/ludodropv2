import cameras from './data/upgrade-optics.json' with { type: 'json' };

export const FILM_DURATION = 474 / 60;
export const FAST_RATE = 1.32;
export const UPGRADE_CUES = {
  runway: 68 / 60, rotor: 172 / 60, multiplier: 3.28, award: 284 / 60, delivery: 7.04,
} as const;
export const AWARD_TIME = UPGRADE_CUES.award;
export const POSTER_FRAMES = [14, 126, 224, 377] as const;
export const POSTER_URLS = [
  '/assets/upgrade-film/contact.webp?cut=inspection', '/assets/upgrade-film/runway.webp?cut=inspection',
  '/assets/upgrade-film/rotor.webp?cut=inspection', '/assets/upgrade-film/crown.webp?cut=inspection',
];

export function easeBetween(start: number, end: number, time: number) {
  const x = Math.min(1, Math.max(0, (time - start) / (end - start)));
  return x * x * (3 - 2 * x);
}

export function transferFrame(time: number) {
  const { runway, rotor, multiplier, award, delivery } = UPGRADE_CUES;
  const shot = time < runway ? 0 : time < rotor ? 1 : time < award ? 2 : 3;
  const phase = shot === 0 ? 'stake' : shot === 3 ? 'award' : 'target';
  const release = easeBetween(delivery, FILM_DURATION - .035, time);
  const label = phase === 'stake' ? 1 - easeBetween(runway - .19, runway, time)
    : phase === 'target' ? easeBetween(runway, runway + .27, time) * (1 - easeBetween(award - .25, award, time))
    : easeBetween(award + .23, award + .61, time);
  return {
    shot, phase, label,
    contact: 1 - easeBetween(runway - .14, runway, time),
    charge: easeBetween(.15, runway + .02, time),
    target: easeBetween(runway + .08, runway + .47, time) * (1 - easeBetween(rotor + .13, multiplier + .04, time)),
    mint: easeBetween(multiplier - .08, multiplier + .23, time) * (1 - easeBetween(award - .16, award + .04, time)),
    lift: easeBetween(award, award + .56, time),
    impulse: easeBetween(award, award + .055, time) * (1 - easeBetween(award + .055, award + .64, time)),
    delivery: release,
    background: 1 - easeBetween(delivery + .12, FILM_DURATION - .04, time),
  };
}

// First three cameras track the rotor. The last tracks the moving surface of the display.
export function cameraAt(time: number, shot: number, poster = false) {
  const track = cameras[shot];
  const first = track[0][0], last = track[track.length - 1][0];
  const frame = poster ? POSTER_FRAMES[shot] : Math.max(first, Math.min(last, time * 60));
  const i = Math.max(0, Math.min(track.length - 2, Math.floor((frame - first) / 5)));
  const a = track[i], b = track[i + 1], mix = (frame - a[0]) / (b[0] - a[0]);
  return a.slice(1).map((value, j) => value + (b[j + 1] - value) * mix);
}

export function project(matrix: number[], x: number, z: number, depth = 0) {
  const w = 1 + matrix[6] * x + matrix[7] * z + matrix[10] * depth;
  return { x: (matrix[0] + matrix[2] * x + matrix[4] * z + matrix[8] * depth) / w,
    y: (matrix[1] + matrix[3] * x + matrix[5] * z + matrix[9] * depth) / w };
}

export function rimCenter(matrix: number[]) {
  // The midpoint of the photographed ellipse includes the perspective shift on oblique shots.
  return { x: matrix[11], y: matrix[12] };
}

export function unproject(matrix: number[], u: number, v: number, depth = 0) {
  const a = matrix[2] - u * matrix[6], b = matrix[4] - u * matrix[7];
  const c = matrix[3] - v * matrix[6], d = matrix[5] - v * matrix[7];
  const w = 1 + matrix[10] * depth;
  const x = u * w - matrix[0] - matrix[8] * depth, y = v * w - matrix[1] - matrix[9] * depth;
  const det = a * d - b * c;
  return { x: (x * d - b * y) / det, z: (a * y - x * c) / det };
}

export function sectorPoint(angle: number, radius: number) {
  const rad = angle * Math.PI / 180;
  return { x: Math.sin(rad) * radius, z: Math.cos(rad) * radius };
}
