import type { Skin } from './types';

type Point = { x: number; y: number };
export type UpgradeSprite = {
  canvas: HTMLCanvasElement; angle: number; sourceWidth: number; sourceHeight: number;
  nativeCenterX: number; nativeCenterY: number; croppedWidth: number;
  outline: Point[]; rests: Point[];
};

const rectangle = [{ x: -.5, y: -.5 }, { x: .5, y: -.5 }, { x: .5, y: .5 }, { x: -.5, y: .5 }];
const defaultFraming = {
  width: 512, height: 384, angle: 0, viewBox: '0 0 512 384', outline: rectangle,
  rests: [{ x: -.24, y: .48 }, { x: .24, y: .48 }],
};

// Centre the visible bounds after levelling a knife, camera roll and perspective foreshortening.
export function silhouetteOffset(outline: Point[], width: number, height: number, angle: number, tilt = 1) {
  const c = Math.cos(angle), s = Math.sin(angle);
  let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
  for (const p of outline) {
    const x = p.x * width * tilt, y = p.y * height;
    const u = x * c - y * s, v = x * s + y * c;
    left = Math.min(left, u); right = Math.max(right, u); top = Math.min(top, v); bottom = Math.max(bottom, v);
  }
  return { x: (left + right) / 2, y: (top + bottom) / 2 };
}

function frameUpgradeSkin(image: HTMLImageElement, levelBlade: boolean) {
  const ratio = Math.min(1, 320 / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * ratio));
  const height = Math.max(1, Math.round(image.naturalHeight * ratio));
  const sample = document.createElement('canvas');
  sample.width = width; sample.height = height;
  const context = sample.getContext('2d', { willReadFrequently: true });
  if (!context) return defaultFraming;
  context.drawImage(image, 0, 0, width, height);
  const { data } = context.getImageData(0, 0, width, height);
  const fringe: Point[] = [], solid: Point[] = [];
  let n = 0, sumX = 0, sumY = 0, xx = 0, yy = 0, xy = 0;
  for (let y = 0; y < height; y++) {
    let first = width, last = -1, start = width, end = -1;
    for (let x = 0; x < width; x++) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha < 16) continue;
      first = Math.min(first, x); last = x;
      if (alpha < 112) continue;
      start = Math.min(start, x); end = x;
      n++; sumX += x; sumY += y; xx += x*x; yy += y*y; xy += x*y;
    }
    if (last >= first) fringe.push({ x: first + .5, y: y + .5 }, { x: last + .5, y: y + .5 });
    if (end >= start) solid.push({ x: start + .5, y: y + .5 }, { x: end + .5, y: y + .5 });
  }
  if (!n) return defaultFraming;
  xx -= sumX * sumX / n; yy -= sumY * sumY / n; xy -= sumX * sumY / n;
  const elongated = Math.hypot(xx - yy, 2 * xy) > .60 * (xx + yy);
  const axis = Math.atan2(2 * xy, xx - yy) * 90 / Math.PI;
  const angle = levelBlade && elongated ? Math.max(-51, Math.min(51, -axis - 5)) : 0;
  const cos = Math.cos(angle * Math.PI / 180), sin = Math.sin(angle * Math.PI / 180);
  const xs = fringe.map(p => p.x * cos - p.y * sin), ys = fringe.map(p => p.x * sin + p.y * cos);
  const left = Math.min(...xs) - 2, top = Math.min(...ys) - 2;
  const wide = Math.max(...xs) - left + 2, high = Math.max(...ys) - top + 2;
  const normalize = (x: number, y: number) => ({
    x: (x*cos - y*sin - left) / wide - .5,
    y: (x*sin + y*cos - top) / high - .5,
  });
  const outline = solid.map(p => normalize(p.x, p.y));
  const columns = new Map<number, Point>();
  // Each adjustable rest meets real metal at the bottom of its column, including the gap under a barrel.
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (data[(y * width + x) * 4 + 3] < 112) continue;
    const p = normalize(x + .5, y + .5), key = Math.round((p.x + .5) * 96);
    if (p.y > (columns.get(key)?.y ?? -1)) columns.set(key, p);
  }
  const under = Array.from(columns.values());
  const rests = [-.245, .245].map(x => under.reduce((closest, p) => Math.abs(p.x - x) < Math.abs(closest.x - x) ? p : closest));
  return { width, height, angle, viewBox: [left, top, wide, high].join(' '), outline, rests };
}

export async function preparePrizeArt(skin: Skin) {
  const image = new Image();
  image.src = skin.image;
  await image.decode();
  let frame = { ...defaultFraming, width: image.naturalWidth, height: image.naturalHeight,
    viewBox: `0 0 ${image.naturalWidth} ${image.naturalHeight}` };
  const levelBlade = /knife|bayonet|karambit|daggers/i.test(skin.weapon);
  try { frame = frameUpgradeSkin(image, levelBlade); } catch { /* A remote catalog image can still be drawn. */ }
  const [x, y, wide, high] = frame.viewBox.split(' ').map(Number);
  const scale = Math.min(1000 / Math.max(wide, high), Math.max(1, image.naturalWidth / frame.width));
  const art = document.createElement('canvas');
  art.width = Math.ceil(wide * scale); art.height = Math.ceil(high * scale);
  const pen = art.getContext('2d');
  if (!pen) return;
  pen.scale(scale, scale); pen.translate(-x, -y); pen.rotate(frame.angle * Math.PI / 180);
  pen.imageSmoothingQuality = 'high';
  pen.drawImage(image, 0, 0, frame.width, frame.height);
  // Return the centre of the trimmed silhouette to its exact position in the catalogue thumbnail.
  const cx = x + wide / 2, cy = y + high / 2, rad = frame.angle * Math.PI / 180;
  return { canvas: art, angle: frame.angle, sourceWidth: frame.width, sourceHeight: frame.height,
    nativeCenterX: cx * Math.cos(rad) + cy * Math.sin(rad),
    nativeCenterY: -cx * Math.sin(rad) + cy * Math.cos(rad), croppedWidth: wide, outline: frame.outline, rests: frame.rests };
}
