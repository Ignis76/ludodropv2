import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ScanLine } from 'lucide-react';
import { createReelTicks } from './audio';
import type { UnlockPace } from './case-unlock';
import { weightedPick } from './engine';
import { runVisibleTimeline } from './visible-timeline';
import type { Skin } from './types';
import './terminal-draw.css';

type Props = {
  rewards: readonly Skin[];
  pool: Skin[];
  odds: number[];
  pace: UnlockPace;
  onComplete: () => void;
};

type ScanFrame = { at: number; skin?: Skin; confirmed: number };

function prepareScan({ rewards, pool, odds, pace }: Omit<Props, 'onComplete'>) {
  if (pace === 'reduced') {
    return {
      frames: [{ at: 0, confirmed: 0 }, { at: 285, skin: rewards[0], confirmed: rewards.length }] as ScanFrame[],
      duration: 650,
    };
  }
  const fast = pace === 'fast';
  const turns = fast ? 5 : 20;
  const searchTime = fast ? 540 : 3450 - (rewards.length - 1) * 90;
  // Draw the candidates independently from the same distribution as the case.
  // Their display time gradually increases. The actual awards are supplied by the transaction.
  const frames: ScanFrame[] = Array.from({ length: turns }, (_, i) => {
    const t = i / turns;
    return { at: Math.round(searchTime * (.49 * t + .51 * t ** 3.8)), skin: weightedPick(pool, odds), confirmed: 0 };
  });
  for (const [i, skin] of rewards.entries()) {
    frames.push({ at: searchTime + i * (fast ? 55 : 160), skin, confirmed: i + 1 });
  }
  return { frames, duration: frames[frames.length - 1].at + (fast ? 215 : 700) };
}

export function TerminalDraw({ rewards, pool, odds, pace, onComplete }: Props) {
  const scan = useMemo(() => prepareScan({ rewards, pool, odds, pace }), [rewards, pool, odds, pace]);
  const [index, setIndex] = useState(-1);
  const complete = useRef(onComplete);
  complete.current = onComplete;

  useEffect(() => {
    // An image can recur in the scan. Request each URL only once and let the browser reuse it.
    const urls = new Set(scan.frames.flatMap(frame => frame.skin ? [frame.skin.image] : []));
    const pictures = new Map<string, HTMLImageElement>();
    const decoded = new Set<string>();
    const loading = Array.from(urls, src => {
      const image = new Image();
      pictures.set(src, image);
      image.src = src;
      return image.decode().then(() => { decoded.add(src); }, () => {});
    });
    const ticks = createReelTicks();
    let disposed = false, running = false, next = 0;
    let cancelScan = () => {};
    function start() {
      if (running || disposed) return;
      running = true;
      cancelWait();
      cancelScan = runVisibleTimeline(scan.duration, () => complete.current(), elapsed => {
        let current = -1;
        while (next < scan.frames.length && scan.frames[next].at <= elapsed) {
          const frame = scan.frames[next];
          if (!frame.skin || frame.confirmed || decoded.has(frame.skin.image)) current = next;
          next++;
        }
        if (current < 0) return;
        setIndex(current);
        if (current && pace !== 'reduced') ticks.play();
      });
    }
    setIndex(-1);
    const cancelWait = runVisibleTimeline(1800, start);
    void Promise.all(loading).then(start);
    return () => { disposed = true; cancelWait(); cancelScan(); ticks.stop(); pictures.clear(); };
  }, [scan, pace]);

  const frame: ScanFrame = scan.frames[index] || { at: 0, confirmed: 0 };
  const locked = frame.confirmed > 0;
  const completeBatch = frame.confirmed === rewards.length;
  const skin = frame.skin;
  const status = completeBatch ? 'Выдача подтверждена' : locked ? 'Запись результата' : index < 0 ? 'Подготовка сканера' : 'Идёт поиск';
  const progress = Math.round((index + 1) * 100 / scan.frames.length);
  return <section className="genesis-draw" aria-label="Розыгрыш терминала Genesis" data-pace={pace} data-locked={locked} data-confirmed={frame.confirmed}>
    <div className="genesis-console">
      <header className="genesis-console-head">
        <span className="genesis-wordmark"><span aria-hidden="true" className="genesis-symbol"/>GENESIS</span>
        <span className="genesis-status" role="status">{locked ? <Check size={14}/> : <i aria-hidden="true"/>}{status}</span>
      </header>
      <div className="genesis-main">
        <div className="genesis-scanner" aria-hidden="true">
          <div className="genesis-field"><i/><i/><i/><i/></div>
          {skin && <img key={skin.image} className="genesis-specimen" src={skin.image} alt="" draggable={false}/>}
          {!locked && pace !== 'reduced' && <div className="genesis-sweep"/>}
        </div>
        <div className="genesis-readout">
          <span className="genesis-field-label">{locked ? 'Предмет определён' : 'Перебор предметов'}</span>
          <div className="genesis-current" aria-hidden={!locked}>
            <span>{skin?.weapon || 'Загрузка'}</span><strong>{skin?.name || 'Сканирование'}</strong>
          </div>
          {rewards.length > 1 && <ol className="genesis-batch" aria-label="Очередь выдачи">
            {rewards.map((reward, i) => <li key={i} data-filled={i < frame.confirmed}>
              <span aria-hidden="true">{String(i + 1).padStart(2,'0')}</span>
              {i < frame.confirmed ? <><b>{reward.weapon} · {reward.name}</b><Check size={13} aria-hidden="true"/></> : <b>Ожидание</b>}
            </li>)}
          </ol>}
        </div>
      </div>
      <div className="genesis-console-foot">
        <ScanLine size={16} aria-hidden="true"/>
        <span className="genesis-meter" role="progressbar" aria-label="Ход розыгрыша" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
          <i style={{ width: progress + '%' }}/>
        </span>
        <span className="genesis-percent" aria-hidden="true">{progress}%</span>
      </div>
    </div>
  </section>;
}
