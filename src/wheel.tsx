import { useEffect, useMemo, useRef, useState } from 'react';
import { Disc3, Layers, Timer } from 'lucide-react';
import type { CSSProperties } from 'react';
import type { Navigate } from './App';
import type { RouletteColor } from './types';
import { Coin, money } from './components';
import { GameRules, GameHeader, InventoryPicker } from './games';
import { skinById, skins, useStore } from './store';
import { isWagerSkin, skinPayoutQuote } from './skin-wagers';
import { random } from './engine';
import { betOnWheel, BET_WINDOW, colors, sectors, visibleWheelBet, WHEEL_RESULT, WHEEL_SPIN } from './rounds';
import { sound } from './audio';

const sectorNames = Object.keys(colors) as RouletteColor[];
const segmentSize = 360 / sectors.length;
const paint = 'conic-gradient(' + sectors.map((c, i) => colors[c].paint + ' ' + i * segmentSize + 'deg ' + (i + 1) * segmentSize + 'deg').join(',') + ')';
const restingAngle = (index: number) => 360 - (index + .5) * segmentSize;
const newRound = (previousAngle: number) => ({
  closesAt: Date.now() + BET_WINDOW,
  index: Math.floor(random() * sectors.length),
  previousAngle,
});

export function WheelPage({ go }: { go: Navigate }) {
  const { player, update } = useStore();
  const last = player.rouletteRounds?.[0];
  const restoredBet = visibleWheelBet(player);
  const [round, setRound] = useState(() => {
    const previousAngle = last ? restingAngle(last.index) : 0;
    return restoredBet ? { closesAt: restoredBet.closesAt, index: restoredBet.index, previousAngle: restoredBet.previousAngle ?? previousAngle } : newRound(previousAngle);
  });
  const [clock, setClock] = useState(Date.now);
  const [selected, setSelected] = useState('');
  const [picked, setPicked] = useState<RouletteColor>(restoredBet?.color ?? 'graphite');
  const [observed, setObserved] = useState<{ closesAt: number; index: number }[]>([]);
  const disc = useRef<HTMLDivElement>(null);
  const pointer = useRef<HTMLDivElement>(null);
  const board = useRef<HTMLElement>(null);
  const inventoryPanel = useRef<HTMLDivElement>(null);
  const controls = useRef<HTMLElement>(null);
  const phase = clock < round.closesAt ? 'betting' : clock < round.closesAt + WHEEL_SPIN ? 'rolling' : 'result';
  const lastPhase = useRef(phase);
  const pending = player.rouletteBet;
  const latest = player.rouletteRounds?.find(r => r.closesAt === round.closesAt);
  const wager = pending ?? latest;
  const inventory = useMemo(() => player.inventory.filter(item => {
    const skin = skinById.get(item.skinId);
    return skin && isWagerSkin(skin);
  }), [player.inventory]);
  const stake = wager?.skinStake ? skinById.get(wager.skinStake.skinId) : skinById.get(inventory.find(item => item.uid === selected)?.skinId ?? '');
  const quote = useMemo(() => stake && !wager ? skinPayoutQuote(stake.price, colors[picked].factor, skins) : undefined, [stake, picked, wager]);
  const prize = wager?.skinStake ? skinById.get(wager.skinStake.prizeSkinId) : quote?.skin;
  const remainder = wager?.skinStake?.remainder ?? quote?.remainder ?? 0;
  const landedColor = sectors[round.index];
  const remaining = Math.max(0, Math.ceil((round.closesAt - clock) / 1000));
  const participated = useRef(false);
  participated.current = !!pending;
  const history = [...(player.rouletteRounds || []), ...observed]
    .sort((a, b) => b.closesAt - a.closesAt)
    .filter((r, i, all) => i === all.findIndex(x => x.closesAt === r.closesAt))
    .slice(0, 8);

  useEffect(() => {
    const sync = () => setClock(Date.now());
    const timer = setInterval(sync, 100);
    document.addEventListener('visibilitychange', sync);
    window.addEventListener('pageshow', sync);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', sync); window.removeEventListener('pageshow', sync); };
  }, []);
  useEffect(() => {
    const element = disc.current;
    if (!element) return;
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const stopTime = round.closesAt + WHEEL_SPIN;
    const landing = restingAngle(round.index);
    let startTime = round.closesAt, from = round.previousAngle, to = 5 * 360 + landing;
    let turn: Animation;
    let frame = 0, lastBoundary: number | undefined;
    let timer: ReturnType<typeof setTimeout>;
    let impulse: Animation | undefined;
    const angle = () => from + (to - from) * (turn.effect?.getComputedTiming().progress ?? 0);
    const ratchet = () => {
      const boundary = Math.floor(angle() / segmentSize);
      if (lastBoundary !== undefined && boundary !== lastBoundary) {
        impulse?.cancel();
        impulse = pointer.current?.animate([{ rotate: '-7deg' }, { rotate:'0deg' }], { duration: 105, easing:'ease-out' });
        if (participated.current) sound('tick');
      }
      lastBoundary = boundary;
      if (Date.now() < stopTime) frame = requestAnimationFrame(ratchet);
    };
    const sync = () => {
      clearTimeout(timer); cancelAnimationFrame(frame); impulse?.cancel(); lastBoundary = undefined;
      if (document.hidden) return;
      turn.startTime = Number(document.timeline.currentTime ?? performance.now()) + startTime - Date.now();
      if (!media.matches && Date.now() < stopTime) timer = setTimeout(ratchet, Math.max(0, startTime - Date.now()));
    };
    const animate = () => {
      turn = element.animate([{ transform: `rotate(${from}deg)` }, { transform: `rotate(${to}deg)` }], {
        duration: Math.max(1, stopTime - startTime),
        easing: media.matches ? 'steps(1, end)' : 'cubic-bezier(.13,.7,.15,1)', fill: 'both',
      });
      sync();
    };
    const changeMotion = () => {
      const now = Date.now();
      if (now >= stopTime) return;
      // Start the replacement animation at the exact displayed pose and keep the same deadline.
      from = angle() % 360;
      startTime = Math.max(now, round.closesAt);
      const remainingTurns = Math.floor(5 * (stopTime - startTime) / WHEEL_SPIN);
      to = from + remainingTurns * 360 + (landing - from + 360) % 360;
      turn.cancel();
      animate();
    };
    animate();
    media.addEventListener('change', changeMotion);
    document.addEventListener('visibilitychange', sync);
    window.addEventListener('pageshow', sync);
    return () => {
      media.removeEventListener('change', changeMotion);
      document.removeEventListener('visibilitychange', sync);
      window.removeEventListener('pageshow', sync);
      clearTimeout(timer); cancelAnimationFrame(frame); impulse?.cancel(); turn.cancel();
    };
  }, [round]);
  useEffect(() => {
    if (lastPhase.current === phase) return;
    lastPhase.current = phase;
    if (phase === 'rolling' && !document.hidden) sound('start');
    if (phase === 'result') {
      if (!pending && !latest) setObserved(previous => [{ closesAt: round.closesAt, index: round.index }, ...previous].slice(0, 8));
      if (!document.hidden) sound((latest || pending)?.color === landedColor ? 'win' : 'click');
    }
  }, [phase]);
  useEffect(() => {
    const handle = setTimeout(() => setRound(newRound(restingAngle(round.index))), Math.max(0, round.closesAt + WHEEL_SPIN + WHEEL_RESULT - Date.now()));
    return () => clearTimeout(handle);
  }, [round]);

  const place = () => {
    const ok = update(p => betOnWheel(p, selected, skins, picked, round.closesAt, Date.now(), () => (round.index + .5) / sectors.length, round.previousAngle));
    if (ok) {
      setSelected('');
      sound('click');
      if (window.innerWidth <= 760) board.current?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
    }
  };
  const locked = phase !== 'betting' || !!pending;
  const inventoryPicker = useMemo(() => <InventoryPicker max={1} selected={selected ? [selected] : []} go={go} inventory={inventory}
    disabled={locked} onToggle={item => {
      setSelected(item.uid === selected ? '' : item.uid);
      if (item.uid !== selected) {
        controls.current?.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
        controls.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus({ preventScroll: true });
      }
    }}/>, [go, selected, inventory, locked]);
  let receipt = 'Ставки закрыты';
  if (phase === 'result') {
    receipt = latest ? 'Ставка проиграла' : 'Скоро следующий раунд';
    if (latest?.payout) {
      receipt = latest.skinStake && prize ? `${prize.weapon} | ${prize.name} в инвентаре` : `+${money(latest.payout)} кредитов на балансе`;
      if (remainder) receipt += ` · +${money(remainder)} на баланс`;
    }
  } else if (pending) {
    const name = stake ? `${stake.weapon} | ${stake.name}` : `${money(pending.amount)} кредитов`;
    receipt = `${name} · ×${colors[pending.color].factor}`;
  }
  return <div className="mode-page wheel-page">
    <GameHeader mode="wheel" title="Рулетка" description="Выбери скин из инвентаря и поставь его на цвет. Если указатель остановится на твоём секторе, выигранный скин появится в инвентаре."/>
    <div className="game-layout color-wheel-layout">
      <aside ref={controls} className="game-controls wheel-controls">
        <div className="control-heading"><Timer size={20}/><h3>{phase === 'betting' ? 'Приём ставок' : phase === 'rolling' ? 'Колесо вращается' : 'Раунд завершён'}</h3><strong className="roulette-countdown">{phase === 'betting' ? '0:' + String(remaining).padStart(2,'0') : '0:00'}</strong></div>
        <button type="button" className="wheel-skin-slot" disabled={locked} onClick={() => {
          inventoryPanel.current?.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
          inventoryPanel.current?.querySelector<HTMLElement>('.skin-card, .empty-state button')?.focus({ preventScroll: true });
        }}>
          {stake ? <img src={stake.image} alt=""/> : <Layers size={23}/>}
          <span><small>Твоя ставка</small><strong>{stake ? stake.weapon + ' | ' + stake.name : wager ? money(wager.amount) + ' кредитов' : 'Выбрать скин'}</strong></span>
          {stake && <Coin value={stake.price}/>}
        </button>
        <fieldset className="roulette-options" disabled={locked}><legend>Цвет сектора</legend>
          {sectorNames.map(c => <button type="button" key={c} aria-pressed={c === picked} onClick={() => setPicked(c)} style={{ '--sector-color': colors[c].paint } as CSSProperties}>
            <i/><span>{colors[c].name}</span><b>×{colors[c].factor}</b><small>{sectors.filter(s => s === c).length} / 12</small>
          </button>)}
        </fieldset>
        {prize && <div className="wheel-skin-offer"><div className="wheel-skin-slot wheel-skin-prize"><img src={prize.image} alt=""/><span><small>Скин при выигрыше</small><strong>{prize.weapon} | {prize.name}</strong></span><Coin value={wager?.skinStake?.prizeValue ?? prize.price}/></div>
          {remainder > 0 && <p>Остаток на баланс <strong>+<Coin value={remainder}/></strong></p>}</div>}
        <button className="primary-button full-button" disabled={locked || !stake} onClick={place}><Disc3 size={18}/>{pending ? 'Ставка принята' : phase === 'betting' ? 'Поставить скин' : 'Приём ставок завершён'}</button>
        <GameRules>Каждый из 12 секторов равновероятен. Стоимость ставки умножается на коэффициент цвета. Ты получаешь скин в пределах выигрыша, а разницу — на баланс. При проигрыше скин сгорает.</GameRules>
      </aside>
      <section ref={board} className={'wheel-board game-board color-wheel ' + phase} style={{ '--winner-light': phase === 'result' ? colors[landedColor].paint : 'transparent' } as CSSProperties}>
        <div className="board-topline"><span>Игровое колесо</span><span>12 секторов</span></div>
        <div className="wheel-container"><div className="wheel-halo"/><div className="wheel-pointer" ref={pointer}><span/></div><div className="wheel-outer">
          <div className="wheel-disc" ref={disc} role="img" aria-label="Колесо с двенадцатью цветными секторами" style={{ background: paint }}>
            {sectors.map((c, i) => <div key={i} className={'wheel-sector ' + (phase === 'result' && round.index === i ? 'is-winner' : '')} style={{ transform: 'rotate(' + (i + .5) * segmentSize + 'deg)', '--sector-ink': c === 'gold' ? '#382810' : '#fff' } as CSSProperties}><b>×{colors[c].factor}</b></div>)}
          </div>
          <div className="wheel-center" style={{ '--time-left': Math.max(0, Math.min(100, (round.closesAt - clock) / BET_WINDOW * 100)) + '%' } as CSSProperties}>
            <span>{phase === 'betting' ? 'До старта' : phase === 'result' ? 'Сектор' : 'Вращение'}</span>
            <strong>{phase === 'betting' ? '0:' + String(remaining).padStart(2,'0') : phase === 'result' ? '×' + colors[landedColor].factor : <Disc3 size={28}/>}</strong>
          </div>
        </div></div>
        {(phase !== 'betting' || pending) && <div className={'color-wheel-result ' + (phase === 'result' ? 'has-result' : '')} role="status" style={{ '--result-color': phase === 'result' ? colors[landedColor].paint : 'transparent' } as CSSProperties}>
          {phase === 'result' && latest?.payout && prize ? <img className="wheel-won-skin" src={prize.image} alt=""/> : <Disc3 size={22}/>}
          <div><strong>{phase === 'result' ? colors[landedColor].name + ' · ×' + colors[landedColor].factor : phase === 'rolling' ? 'Колесо вращается' : pending ? 'Ставка на ' + colors[pending.color].name.toLowerCase() : 'Выбери цвет'}</strong>
          <span>{receipt}</span></div>
        </div>}
        <div className="wheel-history" aria-label="История рулетки"><span>Последние раунды</span>{history.length ? history.map(r => {
          const c = colors[sectors[r.index]];
          return <span key={r.closesAt} className="wheel-history-chip" title={c.name} style={{ '--sector-color': c.paint } as CSSProperties}>×{c.factor}</span>;
        }) : <small>Пока нет результатов</small>}</div>
      </section>
    </div>
    <div className="crash-inventory wheel-inventory" ref={inventoryPanel} inert={locked}>{inventoryPicker}</div>
  </div>;
}
