import type { SyntheticEvent } from 'react';

type Crop = { inset: string; ratio: number };
const crops = new Map<string, Crop>();
let probe: CanvasRenderingContext2D | null | undefined;

// Catalog thumbnails include different transparent margins around rifles, pistols and collectibles.
function measureInk(image: HTMLImageElement): Crop | undefined {
  probe ??= document.createElement('canvas').getContext('2d', {willReadFrequently:true});
  if (!probe || !image.naturalWidth || !image.naturalHeight) return;
  const scale = 96 / Math.max(image.naturalWidth, image.naturalHeight);
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  probe.canvas.width = width;
  probe.canvas.height = height;
  probe.drawImage(image, 0, 0, width, height);
  const pixels = probe.getImageData(0, 0, width, height).data;
  let left = width, top = height, right = 0, bottom = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (pixels[(y * width + x) * 4 + 3] < 18) continue;
      left = Math.min(left, x); right = Math.max(right, x + 1);
      top = Math.min(top, y); bottom = Math.max(bottom, y + 1);
    }
  }
  if (left >= right || top >= bottom) return;
  left = Math.max(0, left - 2); right = Math.min(width, right + 2);
  top = Math.max(0, top - 2); bottom = Math.min(height, bottom + 2);
  const margins = [top / height, (width - right) / width, (height - bottom) / height, left / width];
  return { inset: 'inset(' + margins.map(m => (m * 100).toFixed(2) + '%').join(' ') + ')',
    ratio: image.naturalWidth / image.naturalHeight * ((right - left) / width) / ((bottom - top) / height) };
}

export function frameContractArt(event: SyntheticEvent<HTMLImageElement>) {
  if (!CSS.supports('object-view-box', 'inset(1%)')) return;
  const image = event.currentTarget;
  const src = image.currentSrc || image.src;
  let crop = crops.get(src);
  if (!crop) {
    crop = measureInk(image);
    if (!crop) return;
    crops.set(src, crop);
  }
  image.style.setProperty('object-view-box', crop.inset);
  image.dataset.artRatio = String(crop.ratio);
}
