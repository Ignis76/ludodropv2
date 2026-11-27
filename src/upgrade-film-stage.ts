import type { Skin } from './types';

export type UpgradeSprite = {
  canvas: HTMLCanvasElement;
  angle: number;
  sourceWidth: number;
  sourceHeight: number;
  nativeCenterX: number;
  nativeCenterY: number;
  croppedWidth: number;
};

// Measure the visible silhouette once. Catalog thumbnails have different
// transparent margins, and knives are often photographed diagonally.
const defaultFraming = { width: 512, height: 384, angle: 0, viewBox: '0 0 512 384' };

function frameUpgradeSkin(image: HTMLImageElement, levelBlade: boolean) {
  const ratio = Math.min(1, 256 / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * ratio));
  const height = Math.max(1, Math.round(image.naturalHeight * ratio));
  const sample = document.createElement('canvas');
  sample.width = width;
  sample.height = height;
  const context = sample.getContext('2d', { willReadFrequently: true });
  if (!context) return defaultFraming;
  context.drawImage(image, 0, 0, width, height);
  const { data } = context.getImageData(0, 0, width, height);
  const outline: [number, number][] = [];
  let n = 0, sumX = 0, sumY = 0, xx = 0, yy = 0, xy = 0;
  for (let y = 0; y < height; y++) {
    let first = width, last = -1;
    for (let x = 0; x < width; x++) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha < 16) continue;
      first = Math.min(first, x);
      last = x;
      if (alpha < 128) continue;
      n++;
      sumX += x; sumY += y;
      xx += x * x; yy += y * y; xy += x * y;
    }
    if (last >= first) outline.push([first, y], [last, y]);
  }
  if (!n) return defaultFraming;
  xx -= sumX * sumX / n;
  yy -= sumY * sumY / n;
  xy -= sumX * sumY / n;
  const elongated = Math.hypot(xx - yy, 2 * xy) > 0.60 * (xx + yy);
  const axis = Math.atan2(2 * xy, xx - yy) * 90 / Math.PI;
  const angle = levelBlade && elongated ? Math.max(-51, Math.min(51, -axis - 5)) : 0;
  const cos = Math.cos(angle * Math.PI / 180), sin = Math.sin(angle * Math.PI / 180);
  const xs = outline.map(([x, y]) => x * cos - y * sin);
  const ys = outline.map(([x, y]) => x * sin + y * cos);
  const left = Math.min(...xs) - 2, top = Math.min(...ys) - 2;
  const viewBox = [left, top, Math.max(...xs) - left + 2, Math.max(...ys) - top + 2].join(' ');
  return { width, height, angle, viewBox };
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
    nativeCenterY: -cx * Math.sin(rad) + cy * Math.cos(rad), croppedWidth: wide };
}
