import type { CSSProperties } from 'react';
import { Heart } from 'lucide-react';
import type { Case } from './types';
import { Coin, money } from './components';
import { prepareCourtyardPoster } from './courtyard-poster';
import './container-card.css';

export type ContainerCardProps = {
  item: Case;
  favorite: boolean;
  onToggleFavorite: () => void;
  onOpen: () => void;
  chance?: string;
};

const originalPreviews = new Map<string, Promise<string>>();

// New containers can use their source art until a compressed preview is prepared.
async function frameOriginal(source: string) {
  const original = new Image();
  original.src = source;
  await original.decode();
  const canvas = document.createElement('canvas');
  const ratio = Math.min(1, 720 / Math.max(original.naturalWidth, original.naturalHeight));
  canvas.width = Math.max(1, Math.round(original.naturalWidth * ratio));
  canvas.height = Math.max(1, Math.round(original.naturalHeight * ratio));
  const ctx = canvas.getContext('2d');
  if (!ctx) return source;
  ctx.drawImage(original, 0, 0, canvas.width, canvas.height);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let left = canvas.width, top = canvas.height, right = -1, bottom = -1;
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      if (pixels[(y * canvas.width + x) * 4 + 3] <= 27) continue;
      left = Math.min(left, x); right = Math.max(right, x);
      top = Math.min(top, y); bottom = y;
    }
  }
  if (right < left) return source;
  const w = right - left + 1, h = bottom - top + 1;
  const target = document.createElement('canvas');
  target.width = 576;
  target.height = 360;
  const scale = Math.min(target.width * .82 / w, target.height * .74 / h);
  const width = w * scale, height = h * scale;
  const out = target.getContext('2d');
  if (!out) return source;
  out.drawImage(canvas, left, top, w, h, (target.width - width) / 2, target.height * .865 - height, width, height);
  return target.toDataURL('image/webp', .91);
}

function loadOriginalPreview(image: HTMLImageElement, source: string) {
  if (image.dataset.original) return;
  image.dataset.original = 'pending';
  const preview = originalPreviews.get(source) ?? frameOriginal(source).catch(() => source);
  originalPreviews.set(source, preview);
  void preview.then(url => {
    if (!image.isConnected) return;
    image.dataset.original = url === source ? 'raw' : 'framed';
    image.src = url;
  });
}

export function ContainerCard({ item, favorite, onToggleFavorite, onOpen, chance }: ContainerCardProps) {
  const prepare = () => prepareCourtyardPoster(item);
  const chanceLabel = chance ? 'Шанс выпадения ' + chance : '';
  return <article className="container-card locker-tile" data-case={item.id}
    style={{ '--tile-color': item.color, '--tile-accent': item.accent ?? item.color } as CSSProperties}>
    <button type="button" className="locker-product" onFocus={prepare} onPointerEnter={prepare} onPointerDown={prepare}
      onClick={onOpen} aria-label={['Посмотреть ' + item.name, 'Цена ' + money(item.price), chanceLabel].filter(Boolean).join(', ')}>
      <span className="locker-image">
        <img className="locker-case" src={'/assets/cases/catalog/' + item.id + '.webp'} width="576" height="360" alt="" loading="lazy" draggable="false"
          onError={event => loadOriginalPreview(event.currentTarget, item.image)}/>
        {chance && <span className="locker-chance" title={chanceLabel}>Шанс {chance}</span>}
      </span>
      <span className="locker-plate">
        <span className="locker-name" title={item.name}>{item.name}</span>
        <span className="locker-price"><Coin value={item.price}/></span>
      </span>
    </button>
    <button type="button" className="locker-heart" aria-pressed={favorite}
      aria-label={(favorite ? 'Убрать из избранного ' : 'Добавить в избранное ') + item.name} onClick={onToggleFavorite}>
      <Heart size={16} fill={favorite ? 'currentColor' : 'none'} aria-hidden="true"/>
    </button>
  </article>;
}
