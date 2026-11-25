import { ScanLine } from 'lucide-react';
import { frameContractArt } from './contract-art';
import type { Skin } from './types';
import './exchange-machine.css';

export const exchangeTiming = { intake: 1220, scan: 1090, unlock: 790 };
export const scanStart = exchangeTiming.intake;
export const revealStart = scanStart + exchangeTiming.scan;
export const exchangeDuration = revealStart + exchangeTiming.unlock;
type Stage = 'draft' | 'review' | 'intake' | 'scan' | 'unlock' | 'result';

export function ExchangeMachine({ phase, preview, reward, empty, onPick }: {
  phase: Stage; preview?: Skin; reward?: Skin; empty: boolean; onPick: () => void;
}) {
  const showingReward = !!reward && (phase === 'unlock' || phase === 'result');
  const skin = showingReward ? reward : preview;
  return <div className={'trade-scanner' + (skin ? ' rarity-' + skin.rarity : '')} data-reward={showingReward} data-empty={empty}>
    <div className="scanner-field">
      <div className="scanner-lightwell" aria-hidden="true"/>
      <div className="scanner-guides" aria-hidden="true"><i/><i/><i/><i/></div>
      <div className="scanner-plane">
        <div className="scanner-item">
          {skin && <img key={(showingReward ? 'out-' : 'in-') + skin.id} src={skin.image} onLoad={frameContractArt}
            alt={showingReward ? skin.weapon + ' | ' + skin.name : ''} draggable="false"/>}
        </div>
      </div>
      <div className="scanner-shutter top" aria-hidden="true"/>
      <div className="scanner-shutter bottom" aria-hidden="true"/>
      <div className="scanner-beam" aria-hidden="true"><i/></div>
      {empty && phase === 'draft' && <button type="button" className="scanner-pick" onClick={onPick}>
        <ScanLine size={15}/> Выбрать предметы
      </button>}
    </div>
  </div>;
}

/** The scanner, shutters and real inventory thumbnails are sampled on the same visible-time clock. */
export function prepareExchangeMotion(desk: HTMLElement) {
  const animations: Animation[] = [];
  function track(target: Element, keyframes: Keyframe[], duration: number, delay = 0) {
    const animation = target.animate(keyframes, { duration, delay, fill: 'both' });
    animation.pause();
    animation.currentTime = 0;
    animations.push(animation);
  }

  const plane = desk.querySelector<HTMLElement>('.scanner-plane')!;
  const layer = desk.querySelector<HTMLElement>('.trade-transfers')!;
  const socketImages = new Map(Array.from(desk.querySelectorAll<HTMLImageElement>('img[data-socket-id]'),
    image => [image.dataset.socketId, image]));
  const flights = Array.from(layer.querySelectorAll<HTMLImageElement>('img[data-transfer-id]'));
  const flightTime = 660;
  const smooth = 'cubic-bezier(.32,0,.18,1)';
  function fitFlights() {
    const origin = layer.getBoundingClientRect(), end = plane.getBoundingClientRect();
    if (!end.width || !end.height) return;
    for (const image of flights) {
      const source = socketImages.get(image.dataset.transferId);
      if (!source) continue;
      const start = source.getBoundingClientRect();
      const ratio = Number(source.dataset.artRatio) || source.naturalWidth / source.naturalHeight || 1;
      const scale = Math.min(start.width / ratio, start.height) / Math.min(end.width / ratio, end.height);
      const x = start.x + start.width / 2 - (end.x + end.width / 2);
      const y = start.y + start.height / 2 - (end.y + end.height / 2);
      Object.assign(image.style, { left: (end.x - origin.x) + 'px', top: (end.y - origin.y) + 'px',
        width: end.width + 'px', height: end.height + 'px' });
      image.style.setProperty('--flight-start', 'translate(' + x + 'px,' + y + 'px) scale(' + scale + ')');
      image.style.setProperty('--flight-arc', 'translate(' + x * .5 + 'px,' + (y * .43 - 19) + 'px) scale(' + (scale + .2) + ')');
    }
  }
  fitFlights();
  const resize = new ResizeObserver(fitFlights);
  resize.observe(desk);
  resize.observe(plane);
  desk.addEventListener('load', fitFlights, true);

  for (const [index, image] of flights.entries()) {
    const delay = (scanStart - flightTime) * index / Math.max(1, flights.length - 1);
    const last = index === flights.length - 1;
    const arriving = last ? 'scale(1)' : 'scale(.64)';
    track(image, [
      { offset: 0, transform: 'var(--flight-start)', opacity: 0 },
      { offset: .09, transform: 'var(--flight-start)', opacity: 1, easing: 'ease-in' },
      { offset: .45, transform: 'var(--flight-arc)', opacity: 1, easing: smooth },
      { offset: .88, transform: arriving, opacity: last ? 1 : .78 },
      { offset: 1, transform: last ? arriving : 'scale(.48)', opacity: 0 },
    ], flightTime, delay);
    const source = socketImages.get(image.dataset.transferId);
    if (source) track(source, [{opacity: 1}, {opacity: 0}], 78, delay);
  }

  const at = (elapsed: number) => elapsed / exchangeDuration;
  track(desk.querySelector('.scanner-item')!, [
    {offset: 0, opacity: 1, transform: 'none'}, {offset: at(165), opacity: 0},
    {offset: at(scanStart - 80), opacity: 0}, {offset: at(scanStart), opacity: 1, transform: 'none'},
    {offset: at(revealStart - 35), opacity: 1, transform: 'none'},
    {offset: at(revealStart + 40), opacity: 1, transform: 'translateY(9px) scale(.91)', easing: smooth},
    {offset: 1, opacity: 1, transform: 'none'},
  ], exchangeDuration);
  track(desk.querySelector('.scanner-guides')!, [
    {offset: 0, transform: 'none', opacity: .8},
    {offset: at(scanStart - 160), transform: 'none', opacity: .55, easing: smooth},
    {offset: at(scanStart + 170), transform: 'scale(.88,.94)', opacity: 1},
    {offset: at(revealStart + 90), transform: 'scale(.88,.94)', opacity: 1, easing: smooth},
    {offset: 1, transform: 'none', opacity: .8},
  ], exchangeDuration);
  track(desk.querySelector('.scanner-beam')!, [
    {offset: 0, transform: 'translateY(52%)', opacity: .46},
    {offset: at(200), transform: 'translateY(52%)', opacity: 0},
    {offset: at(scanStart), transform: 'translateY(6%)', opacity: 0},
    {offset: at(scanStart + 115), transform: 'translateY(9%)', opacity: 1, easing: 'ease-in-out'},
    {offset: at(revealStart - 210), transform: 'translateY(93%)', opacity: 1},
    {offset: at(revealStart - 60), transform: 'translateY(96%)', opacity: 0}, {offset: 1, opacity: 0},
  ], exchangeDuration);
  for (const shutter of desk.querySelectorAll('.scanner-shutter')) {
    const open = shutter.classList.contains('top') ? 'translateY(-101%)' : 'translateY(101%)';
    track(shutter, [
      {offset: 0, transform: open}, {offset: at(revealStart - 330), transform: open, easing: smooth},
      {offset: at(revealStart - 35), transform: 'translateY(0)'},
      {offset: at(revealStart + 90), transform: 'translateY(0)', easing: 'cubic-bezier(.4,0,.13,1)'},
      {offset: at(exchangeDuration - 65), transform: open}, {offset: 1, transform: open},
    ], exchangeDuration);
  }
  return {
    seek(elapsed: number) { for (const animation of animations) animation.currentTime = elapsed; },
    dispose() {
      resize.disconnect();
      desk.removeEventListener('load', fitFlights, true);
      for (const animation of animations) animation.cancel();
    },
  };
}
