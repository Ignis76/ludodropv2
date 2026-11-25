import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { ArrowLeft, ArrowRight, Backpack, Check, CircleDot, Coins, Diamond, PackageOpen, RotateCcw, ScanLine, ShieldCheck, Terminal, Ticket } from 'lucide-react';
import type { Navigate } from './App';
import { Coin, SkinCard, itemRarityName } from './components';
import { casePool, openCases, probabilities, sellItems } from './engine';
import { skinById, skins, useStore } from './store';
import type { Case, Item, Skin } from './types';
import { createReelTicks, playCaseOpening, playCaseReveal, playCaseStop, playCollectibleOpening, playDeviceScan, preloadCaseSounds, resumeCaseAudio, sound } from './audio';
import { CaseUnlock } from './case-unlock';
import { CaseTurntable } from './case-turntable';
import { CaseSceneryPicker } from './case-scenery-picker';
import { preferredCaseScenery, rememberCaseScenery } from './courtyard-poster';
import type { CaseScenery } from './courtyard-poster';
import { CourtyardAtmosphere } from './courtyard-atmosphere';
import type { CourtyardCaseSession } from './courtyard-case-session';
import { TerminalDraw } from './terminal-draw';
import { inspectionModel } from './inspection-model';
import { runVisibleTimeline } from './visible-timeline';
import { useReducedMotion } from './use-reduced-motion';
import type { UnlockPace } from './case-unlock';
import { OPENING_DURATION, OPENING_SETTLE_DURATION, REEL_WIDTH, START_INDEX, WINNER_INDEX, detentTimes, landingFraction, makeReel, reelKeyframes } from './opening';
import './opening.css';
import './collectible-result.css';

type Phase = 'idle' | 'unlocking' | 'terminal-draw' | 'rolling' | 'settling' | 'result';
type OpeningReward = Item & { usedWhileAway?: true };
type RewardOrigin = Pick<DOMRect, 'x' | 'y' | 'width' | 'height'>;
const openingCounts = [1, 2, 3, 5];
const grades = { blue: 0, purple: 1, pink: 2, red: 3, gold: 4 };
const wearLabels = { FT: 'После полевых испытаний', FN: 'Прямо с завода' };
const containerCopy = {
  case: { names: ['кейс','кейса','кейсов'], contents: 'Содержимое кейса', count: 'Количество кейсов', stage: 'Открытие кейса' },
  bag: { names: ['сумку','сумки','сумок'], contents: 'Содержимое сумки', count: 'Количество сумок', stage: 'Открытие сумки' },
  capsule: { names: ['капсулу','капсулы','капсул'], contents: 'Наклейки в капсуле', count: 'Количество капсул', stage: 'Открытие капсулы с наклейками' },
  'pin-pack': { names: ['пакет','пакета','пакетов'], contents: 'Пины в пакете', count: 'Количество пакетов', stage: 'Вскрытие пакета с пином' },
};

const ReelRow = memo(function ReelRow({ row }: { row: Skin[] }) {
  return <div className="roll-window">
    <span className="roll-needle" aria-hidden="true"><i/></span>
    <div className="roll-track" style={{ transform: `translate3d(${-(START_INDEX + .5) * REEL_WIDTH}px,0,0)` }} aria-hidden="true">
      {row.map((s, i) => <div className={`roll-item rarity-${s.rarity}${i === WINNER_INDEX ? ' winning-slot' : ''}`} data-skin-id={s.id} key={i}>
        <div className="roll-tile"><div className="roll-art"><img src={s.image} alt="" decoding="async" fetchPriority={i === WINNER_INDEX ? 'high' : undefined} draggable="false"
          onLoad={event => { event.currentTarget.parentElement?.setAttribute('data-ready', ''); }}/></div><span>{s.weapon}</span><strong>{s.name}</strong></div>
      </div>)}
    </div>
    <span className="roll-shutters" aria-hidden="true"/>
  </div>;
});

function ReelScene({ reels, landing, active, onStop }: { reels: Skin[][]; landing: number; active: boolean; onStop: (landed: boolean) => void }) {
  const scene = useRef<HTMLDivElement>(null);
  const stop = useRef(onStop);
  const play = useRef<(() => void) | null>(null);
  const [prepared, setPrepared] = useState(0);
  const [art, setArt] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const ready = reels.length > 0 && (active || prepared === reels.length);
  const running = active && art === 'ready';
  stop.current = onStop;
  useEffect(() => {
    if (active || prepared === reels.length) return;
    const next = () => setPrepared(prepared + 1);
    if (typeof requestIdleCallback === 'function') {
      const id = requestIdleCallback(next, { timeout: 140 });
      return () => cancelIdleCallback(id);
    }
    const id = setTimeout(next, 40);
    return () => clearTimeout(id);
  }, [prepared, active, reels.length]);

  useEffect(() => {
    const bank = scene.current;
    if (!ready || !bank) return;
    let cancelled = false;
    // Decode the mounted winners and the first viewport while the lid is still moving.
    // A slow decorative tile elsewhere on the strip must not delay the reveal.
    const winners = Array.from(bank.querySelectorAll<HTMLImageElement>('.winning-slot img'));
    const preloadRadius = Math.ceil((bank.parentElement?.clientWidth ?? window.innerWidth) / (2 * REEL_WIDTH)) + 1;
    for (const track of bank.querySelectorAll('.roll-track')) {
      const images = Array.from(track.querySelectorAll<HTMLImageElement>('.roll-art img'));
      for (const image of images.slice(Math.max(0, START_INDEX - preloadRadius), START_INDEX + preloadRadius + 1)) {
        void image.decode().catch(() => {});
      }
    }
    void Promise.all(winners.map(image => image.decode())).then(() => {
      const decoded = winners.length === reels.length && winners.every(image => image.complete && image.naturalWidth > 0);
      if (!cancelled) setArt(decoded ? 'ready' : 'unavailable');
    }, () => { if (!cancelled) setArt('unavailable'); });
    return () => { cancelled = true; };
  }, [ready, reels]);
  useEffect(() => {
    if (!active || art !== 'loading') return;
    return runVisibleTimeline(6000, () => setArt('unavailable'));
  }, [active, art]);
  useEffect(() => {
    // Present the saved reward even when its texture is broken or the request never returns.
    if (active && art === 'unavailable') return runVisibleTimeline(0, () => stop.current(false));
  }, [active, art]);

  useLayoutEffect(() => {
    if (!ready) return;
    const ticks = createReelTicks();
    const tracks = Array.from(scene.current!.querySelectorAll<HTMLElement>('.roll-track'));
    const needles = Array.from(scene.current!.querySelectorAll<HTMLElement>('.roll-needle i'));
    const motion = reelKeyframes(landing);
    const times = detentTimes(landing);
    const needleFrame = (time: number, angle: number) => ({
      offset: time / OPENING_DURATION, transform: `rotate(${angle}deg)`, easing: 'ease-out',
    });
    const kicks = [needleFrame(0, 0)];
    times.forEach((time, i) => {
      const duration = Math.min(125, (times[i + 1] ?? OPENING_DURATION) - time - 1);
      kicks.push(needleFrame(time, 0), needleFrame(time + duration * .19, -15),
        needleFrame(time + duration * .66, 4), needleFrame(time + duration, 0));
    });
    kicks.push(needleFrame(OPENING_DURATION, 0));
    const timing: KeyframeAnimationOptions = { duration: OPENING_DURATION, fill: 'forwards' };
    const animations = [...tracks.map(track => track.animate(motion, timing)), ...needles.map(needle => needle.animate(kicks, timing))];
    const lead = animations[0];
    animations.forEach(animation => animation.pause());
    let finished = false;
    let generation = 0;
    const finish = () => {
      if (finished || document.hidden) return;
      finished = true;
      ticks.stop();
      stop.current(true);
    };
    const syncVisibility = () => {
      if (finished) return;
      const current = ++generation;
      ticks.stop();
      if (lead.playState === 'finished') { finish(); return; }
      if (document.hidden) {
        // A compositor pause can remain pending until the next paint in a background tab.
        const elapsed = lead.currentTime;
        animations.forEach(animation => { animation.pause(); animation.currentTime = elapsed; });
        return;
      }
      animations.forEach(animation => animation.play());
      void lead.ready.then(() => {
        if (generation === current && !finished) ticks.schedule(times, Number(lead.currentTime));
      }).catch(() => {});
    };
    lead.onfinish = finish;
    play.current = () => {
      document.addEventListener('visibilitychange', syncVisibility);
      syncVisibility();
    };
    return () => {
      finished = true;
      play.current = null;
      document.removeEventListener('visibilitychange', syncVisibility);
      lead.onfinish = null;
      animations.forEach(animation => animation.cancel());
      ticks.stop();
    };
  }, [ready, landing]);
  useLayoutEffect(() => {
    if (running) play.current?.();
  }, [running]);
  return <div className={`roll-bank ${reels.length > 1 ? 'roll-bank-multiple' : ''}`} ref={scene} hidden={!active} aria-label="Лента открытия" aria-busy={active && !running || undefined} style={{ '--slot-width': `${REEL_WIDTH}px`, '--landing-left': `${landing * REEL_WIDTH}px` } as CSSProperties}>
    {(active ? reels : reels.slice(0, prepared)).map((row, i) => <ReelRow key={i} row={row}/>)}
    {active && !running && <span className="roll-buffer" role="status"><span className="loading-spinner"/>Загрузка предметов…</span>}
  </div>;
}

function Reward({ skin, status, from, fresh, index }: { skin: Skin; status?: string; from?: RewardOrigin; fresh: boolean; index: number }) {
  const picture = useRef<HTMLImageElement>(null);
  const [art, setArt] = useState<'loading' | 'ready' | 'failed'>('loading');
  const collectible = skin.kind === 'pin' || skin.kind === 'sticker';
  useLayoutEffect(() => {
    const image = picture.current;
    if (image?.complete && image.naturalWidth) setArt('ready');
  }, [skin.image]);
  useLayoutEffect(() => {
    const image = picture.current;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (!image || !from || art !== 'ready' || preference.matches) return;
    const mount = image.closest<HTMLElement>('.specimen-mount');
    const target = (mount ?? image).getBoundingClientRect();
    if (!target.width || !target.height) return;
    const dx = from.x - window.scrollX + from.width / 2 - target.x - target.width / 2;
    const dy = from.y - window.scrollY + from.height / 2 - target.y - target.height / 2;
    // Both images use object-fit: contain. Scale the visible artwork rather than the letterbox.
    const aspect = image.naturalWidth / image.naturalHeight || 1.5;
    const scale = Math.min(from.width, from.height * aspect) / Math.min(target.width, target.height * aspect);
    const move = (mount ?? image).animate([
      { transform: `translate(${dx}px, ${dy}px) scale(${scale})` },
      { transform: 'translate(0,0) scale(1)' },
    ], { duration: 650, easing: 'cubic-bezier(.23,.74,.19,1)' });
    const sync = () => {
      if (move.playState === 'finished') return;
      if (document.hidden) {
        const elapsed = move.currentTime;
        move.pause();
        move.currentTime = elapsed;
      } else move.play();
    };
    const respectMotion = () => { if (preference.matches) move.finish(); };
    if (document.hidden) move.pause();
    document.addEventListener('visibilitychange', sync);
    preference.addEventListener('change', respectMotion);
    return () => { document.removeEventListener('visibilitychange', sync); preference.removeEventListener('change', respectMotion); move.cancel(); };
  }, [from, art]);
  const photo = <img ref={picture} src={skin.image} alt={`${skin.weapon} | ${skin.name}`} draggable="false"
    onLoad={() => setArt('ready')} onError={() => setArt('failed')}/>;
  return <article className={`reward-display rarity-${skin.rarity}`} data-skin-id={skin.id} data-item-kind={skin.kind} data-art={art} data-fresh={fresh || undefined}>
    <div className={`reward-art ${from ? 'from-reel' : ''}`}>
      {collectible ? <div className="specimen-mount" data-reveal={fresh && art === 'ready' || undefined} style={{ '--stagger': index * 65 + 'ms', '--specimen-mask': `url("${skin.image}")` } as CSSProperties}>
        <div className="specimen-board">
          <span className="specimen-reverse" aria-hidden="true"/>
          <div className="specimen-face"><div className="specimen-print">{photo}{(skin.kind === 'pin' || /\((?:Holo|Foil|Lenticular|Glitter|Gold)\)/i.test(skin.marketHashName ?? '')) && <i className="specimen-glint" aria-hidden="true"/>}</div></div>
        </div>
      </div> : <><span className="reward-podium" aria-hidden="true"/>{photo}</>}
      {art !== 'ready' && <span className="reward-art-status" role="status">{art === 'loading' ? 'Загрузка изображения…' : 'Изображение недоступно'}</span>}
    </div>
    <div className="reward-details">
      <span className="reward-grade">{skin.rarity === 'gold' ? <Diamond size={14}/> : <i/>}{itemRarityName(skin)}</span>
      <span className="reward-model">{skin.weapon}</span>
      <h3>{skin.name}</h3>
      {skin.wear && <span className="reward-wear">{wearLabels[skin.wear]}</span>}
      <strong className="reward-value"><Coin value={skin.price}/>{status && <small>{status}</small>}</strong>
    </div>
  </article>;
}

export function CasePage({ item, go }: { item: Case; go: Navigate }) {
  const { player, update, setBusy } = useStore();
  const reducedMotion = useReducedMotion();
  const model = inspectionModel(item);
  const terminal = model.kind === 'terminal', xray = model.kind === 'xray';
  const device = terminal || xray;
  const keepScene = device || model.kind === 'bag' || model.kind === 'capsule' || model.kind === 'pin-pack';
  const words = containerCopy[model.kind === 'bag' ? 'bag' : item.containerKind ?? 'case'];
  const ActionIcon = terminal ? Terminal : xray ? ScanLine : model.kind === 'bag' ? Backpack : model.kind === 'capsule' ? CircleDot : model.kind === 'pin-pack' ? Ticket : PackageOpen;
  const pending = player.pendingOpening?.caseId === item.id ? player.pendingOpening : undefined;
  const [rewards, setRewards] = useState<OpeningReward[]>(() => {
    if (!Array.isArray(pending?.itemIds)) return [];
    return pending.itemIds.flatMap<OpeningReward>(uid => {
      const owned = player.inventory.find(i => i.uid === uid);
      if (owned) return [owned];
      const drop = player.drops.find(d => d.uid === uid);
      return drop ? [{ uid, skinId: drop.skinId, obtained: drop.time, usedWhileAway: true }] : [];
    });
  });
  const [phase, setPhase] = useState<Phase>(rewards.length ? 'result' : 'idle');
  const [scenery, setScenery] = useState(preferredCaseScenery);
  const [sceneSession, setSceneSession] = useState<CourtyardCaseSession | null>(null);
  const [posterFailed, setPosterFailed] = useState(false);
  const showContainer = phase === 'idle' || phase === 'unlocking';
  const readout = useMemo(() => rewards.map(r => skinById.get(r.skinId)!), [rewards]);
  const [count, setCount] = useState(() => {
    const quantity = pending?.itemIds?.length ?? 1;
    return openingCounts.includes(quantity) ? quantity : 1;
  });
  const [fast, setFast] = useState(false);
  const openLabel = 'Открыть ' + (count === 1 ? words.names[0] : count + ' ' + words.names[count === 5 ? 2 : 1]);
  const [pace, setPace] = useState<UnlockPace>('normal');
  const [reels, setReels] = useState<Skin[][]>([]);
  const [landing, setLanding] = useState(.5);
  const [sort, setSort] = useState('chance');
  const pool = useMemo(() => casePool(item, skins), [item]);
  const odds = useMemo(() => probabilities(pool, item.price, item.dropWeights), [pool, item]);
  const sorted = useMemo(() => pool.map((skin, i) => ({ skin, chance: odds[i] })).sort((a, b) =>
    sort === 'chance' ? b.chance - a.chance : sort === 'asc' ? a.skin.price - b.skin.price : b.skin.price - a.skin.price), [pool, odds, sort]);
  const contentCards = useMemo(() => sorted.map(({ skin, chance }) =>
    <SkinCard key={skin.id} skin={skin} footer={<span className="odds" aria-label={`Шанс выпадения: ${(chance * 100).toLocaleString('ru-RU', { maximumFractionDigits: 3 })}%`} title={`Вероятность выпадения: ${(chance * 100).toPrecision(4)}%`}>{chance < .00001 ? '<0,001' : (chance * 100).toLocaleString('ru-RU', { maximumFractionDigits: chance < .01 ? 3 : 2 })}%</span>}/>), [sorted]);
  const locked = useRef(false);
  const stage = useRef<HTMLElement>(null);
  const origins = useRef<(RewardOrigin | undefined)[]>([]);
  const freshReveal = useRef(false);
  const cancelSettle = useRef<(() => void) | undefined>(undefined);
  const stopAudio = useRef<(() => void) | undefined>(undefined);
  const price = count * item.price;
  const opening = phase !== 'idle' && phase !== 'result';
  const remaining = rewards.filter(r => player.inventory.some(i => i.uid === r.uid));
  const sum = (items: Item[]) => items.reduce((total, reward) => total + skinById.get(reward.skinId)!.price, 0);
  const hasGold = rewards.some(r => skinById.get(r.skinId)!.rarity === 'gold');

  useLayoutEffect(() => {
    if (phase !== 'unlocking' || !stage.current) return;
    const rect = stage.current.getBoundingClientRect();
    const bar = Math.max(0, document.querySelector('.masthead')?.getBoundingClientRect().bottom ?? 0);
    if (rect.top < bar || rect.top > window.innerHeight * .3) {
      stage.current.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    }
  }, [phase]);

  useEffect(() => {
    void preloadCaseSounds();
    return () => { cancelSettle.current?.(); stopAudio.current?.(); setBusy(false); };
  }, [item, setBusy]);
  useEffect(() => {
    if (pending && (phase === 'result' || phase === 'idle')) {
      update(p => p.pendingOpening === pending ? { ...p, pendingOpening: undefined } : p);
    }
  }, [phase, pending, update]);

  useLayoutEffect(() => {
    const theatre = stage.current;
    if (!theatre || phase === 'idle') return;
    const sync = () => {
      theatre.toggleAttribute('data-presentation-paused', document.hidden);
      if (document.hidden) stopAudio.current?.();
    };
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => {
      theatre.removeAttribute('data-presentation-paused');
      document.removeEventListener('visibilitychange', sync);
    };
  }, [phase]);

  function chooseScenery(next: CaseScenery) {
    if (next === scenery || opening || locked.current) return;
    rememberCaseScenery(next);
    setSceneSession(null);
    setPosterFailed(false);
    setScenery(next);
  }

  function reveal(awards: Item[], fromReel = false) {
    if (!locked.current) return;
    const slots = fromReel ? stage.current?.querySelectorAll<HTMLElement>('.winning-slot') : undefined;
    origins.current = awards.map((award, index) => {
      const slot = slots?.[index];
      const image = slot?.querySelector('img');
      if (!image?.naturalWidth || slot?.dataset.skinId !== award.skinId) return;
      const { x, y, width, height } = image.getBoundingClientRect();
      return { x: x + window.scrollX, y: y + window.scrollY, width, height };
    });
    freshReveal.current = true;
    const best = awards.map(r => skinById.get(r.skinId)!).reduce((a, b) => grades[a.rarity] > grades[b.rarity] ? a : b);
    stopAudio.current?.();
    stopAudio.current = playCaseReveal(best.rarity);
    setPhase('result'); setBusy(false); locked.current = false;
  }
  function stopReel(landed: boolean) {
    if (!landed) { reveal(rewards); return; }
    setPhase('settling');
    stopAudio.current?.();
    stopAudio.current = playCaseStop();
    cancelSettle.current?.();
    cancelSettle.current = runVisibleTimeline(OPENING_SETTLE_DURATION, () => reveal(rewards, true));
  }
  useLayoutEffect(() => {
    if (!opening || !reducedMotion || pace === 'reduced') return;
    setPace('reduced');
    if (phase === 'rolling' || phase === 'settling') {
      cancelSettle.current?.();
      if (document.hidden) cancelSettle.current = runVisibleTimeline(0, () => reveal(rewards));
      else reveal(rewards);
    }
  }, [reducedMotion, opening, pace, phase, rewards]);
  function finishUnlock() {
    if (terminal) {
      stopAudio.current?.();
      setPhase('terminal-draw');
    } else if (pace === 'normal' && !xray) {
      setPhase('rolling');
    } else {
      reveal(rewards);
    }
  }
  function playUnlockCue() {
    const normal = pace === 'normal';
    switch (model.kind) {
      case 'terminal': case 'xray': return playDeviceScan(model.kind, normal ? 1.82 : .42);
      case 'bag': return;
      case 'capsule': case 'pin-pack': return playCollectibleOpening(model.kind, normal ? 1.40 : .36);
      default: return playCaseOpening();
    }
  }
  function open() {
    if (locked.current) return;
    locked.current = true;
    let awards: Item[] = [];
    const saved = update(p => {
      const result = openCases(p, item, count, skins);
      awards = result.rewards;
      return { ...result.state, pendingOpening: { caseId: item.id, itemIds: awards.map(r => r.uid) } };
    });
    if (!saved) { locked.current = false; return; }
    origins.current = [];
    freshReveal.current = false;
    stopAudio.current?.(); cancelSettle.current?.();
    resumeCaseAudio();
    setRewards(awards); setBusy(true);
    const speed = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'reduced' : fast ? 'fast' : 'normal';
    setPace(speed);
    if (speed === 'normal' && !device) {
      setLanding(landingFraction());
      setReels(awards.map(r => makeReel(skinById.get(r.skinId)!, pool, odds)));
    }
    setPhase('unlocking');
  }
  function sell() {
    if (!remaining.length) return;
    if (update(p => sellItems(p, remaining.map(r => r.uid), skins))) {
      sound('gem');
    }
  }

  const repeat = phase === 'result';
  const canAfford = player.balance >= price;
  const actionLabel = terminal ? 'Запустить терминал' : xray ? 'Сканировать упаковку' : openLabel;
  const openButton = <button type="button" className="primary-button theatre-open" disabled={opening || !canAfford} title={repeat && !canAfford ? 'Недостаточно кредитов для повторного открытия' : undefined} onClick={open}>
    {opening ? <><span className="loading-spinner"/>{terminal ? 'Обработка запроса…' : xray ? 'Сканируем…' : 'Открываем…'}</> : repeat ? <><RotateCcw size={18}/>Ещё раз</> : <>
      {canAfford ? <>{actionLabel}<Coin value={price}/><ArrowRight size={17} aria-hidden="true"/></> : <>Нужно ещё <Coin value={price - player.balance}/></>}
    </>}
  </button>;

  return <div className="case-detail">
    <h1 className="case-page-name">{item.name}</h1>
    <section ref={stage} className={`case-theatre state-${phase}${phase === 'result' && hasGold ? ' theatre-gold' : ''}`} data-container={model.kind} style={{ '--case-color': item.color } as CSSProperties} aria-label={terminal ? 'Терминал Genesis' : xray ? 'Сканер X-Ray' : words.stage}>
      <div className="theatre-screen" data-entry-poster={posterFailed ? undefined : ''}>
      <div className="case-stage-nav">
        <button type="button" className="theatre-back" onClick={() => go('cases')} aria-label="К каталогу" title="К каталогу"><ArrowLeft size={19} aria-hidden="true"/></button>
        {phase === 'idle' && <CaseSceneryPicker value={scenery} onChange={chooseScenery}/>}
      </div>
      <CourtyardAtmosphere key={scenery} scenery={scenery} item={item} opening={phase === 'unlocking'} onSession={setSceneSession} onPosterFailedChange={setPosterFailed}/>
      {phase === 'idle' && sceneSession?.setInspectionAngle &&
        <CaseTurntable name={item.name} onTurn={sceneSession.setInspectionAngle}/>}
      {(keepScene || showContainer) && <div className="theatre-preview inspection-preview" hidden={!showContainer}>
        <CaseUnlock item={item} session={sceneSession} shown={showContainer && (phase === 'unlocking' || !!sceneSession || posterFailed)} active={phase === 'unlocking'} pace={phase === 'idle' ? (fast ? 'fast' : 'normal') : pace} readout={readout}
          onLatch={() => { stopAudio.current = playUnlockCue(); }}
          onOpened={finishUnlock}/>
      </div>}
      {phase === 'terminal-draw' && <TerminalDraw rewards={readout} pool={pool} odds={odds} pace={pace} onComplete={() => reveal(rewards)}/>}
      {pace === 'normal' && !device && (phase === 'unlocking' || phase === 'rolling' || phase === 'settling') &&
        <ReelScene reels={reels} landing={landing} active={phase !== 'unlocking'} onStop={stopReel}/>}
      {phase === 'result' && <section className={`case-result ${rewards.length === 1 ? 'single-result' : 'batch-result'}`} aria-label="Результат открытия" aria-live="polite">
        <header className="result-caption">{device ? <ActionIcon size={18}/> : hasGold ? <Diamond size={18}/> : <Check size={17}/>}<h2>{terminal ? 'Терминал Genesis · выдача завершена' : xray ? 'Результат сканирования X-Ray' : hasGold ? 'Особый дроп' : rewards.length === 1 ? 'Полученный предмет' : 'Полученные предметы'}</h2></header>
        <div className="rewards-line">{rewards.map((r, index) => <Reward key={r.uid} skin={skinById.get(r.skinId)!} status={r.usedWhileAway ? 'Вне инвентаря' : remaining.some(i => i.uid === r.uid) ? undefined : 'Продано'} from={origins.current[index]} fresh={freshReveal.current} index={index}/>)}</div>
        {rewards.length > 1 && <p className="batch-total">Общая стоимость <Coin value={sum(rewards)}/></p>}
        <div className="theatre-reward-actions">
          {openButton}
          <button className="secondary-button" disabled={!remaining.length} onClick={sell}><Coins size={17}/>{remaining.length ? <>Продать за <Coin value={sum(remaining)}/></> : rewards.every(r => r.usedWhileAway) ? 'Вне инвентаря' : 'Продано'}</button>
        </div>
      </section>}
      </div>
      <div className="case-dock">
        <div className="theatre-controls">
          <div className="case-quantity">
            <span aria-hidden="true">Количество</span>
            <div className="theatre-count" role="group" aria-label={terminal ? 'Количество запросов' : xray ? 'Количество упаковок' : words.count}>{openingCounts.map(n => <button key={n} aria-pressed={count === n} disabled={opening} onClick={() => setCount(n)}>×{n}</button>)}</div>
          </div>
          <label className="theatre-fast"><input type="checkbox" checked={fast} disabled={opening} onChange={e => setFast(e.target.checked)}/><span className="speed-switch" aria-hidden="true"/>Быстро</label>
          {!repeat && openButton}
        </div>
      </div>
    </section>
    <div className="theatre-content-heading"><div><h2>{terminal ? 'Предметы терминала' : xray ? 'Содержимое упаковки' : words.contents}</h2><span>{pool.length}</span></div><label><select aria-label="Сортировка содержимого" value={sort} onChange={e => setSort(e.target.value)}><option value="chance">По вероятности</option><option value="desc">Сначала дороже</option><option value="asc">Сначала дешевле</option></select></label></div>
    <div className="skin-grid theatre-contents">{contentCards}</div>
    <p className="theatre-odds-note"><ShieldCheck size={15}/>Каждое открытие использует показанные шансы. Средняя стоимость дропа составляет 97% цены открытия.</p>
  </div>;
}
