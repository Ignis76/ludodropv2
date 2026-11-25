import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Plus, Target, Zap } from 'lucide-react';
import type { Navigate } from './App';

import { Coin } from './components';
import { InventoryPicker, GameRules, GameHeader } from './games';
import { skinById, skins, useStore } from './store';
import { crashFlight, round } from './engine';
import { isWagerSkin, skinPayoutQuote } from './skin-wagers';
import { advanceFlight, startFlight } from './rounds';
import { sound } from './audio';
import { useReducedMotion } from './use-reduced-motion';

export function CrashPage({ go }: { go: Navigate }) {
  const { player, update } = useStore();
  const active = player.activeCrash;
  const [selected, setSelected] = useState('');
  const [showLast, setShowLast] = useState(true);
  const [auto, setAuto] = useState(!!active?.autoAt), [autoAt, setAutoAt] = useState(String(active?.autoAt || 2));
  const [clock, setClock] = useState(Date.now);
  const reducedMotion = useReducedMotion();
  const board = useRef<HTMLElement | null>(null);
  const inventoryPanel = useRef<HTMLDivElement>(null);
  const displayedRound = active || (showLast ? player.lastCrash : undefined);
  const cashedAt = displayedRound?.cashedAt || 0, payout = displayedRound?.payout || 0;
  const phase = active ? 'active' : displayedRound ? cashedAt ? 'win' : 'lose' : 'idle';
  const multiplier = active ? crashFlight(clock - active.startedAt, active.point).multiplier : displayedRound?.point || 1;
  const rounds = player.crashRounds || [];
  const previous = useRef(active);
  useEffect(() => {
    const was = previous.current;
    previous.current = active;
    if (!was || was.cashedAt || document.hidden) return;
    if (active?.cashedAt || (!active && player.lastCrash?.id === was.id && player.lastCrash.cashedAt)) sound('win');
    else if (!active) sound('lose');
  }, [active, player.lastCrash]);

  useEffect(() => {
    if (!active) return;
    const sync = () => setClock(Date.now());
    sync();
    if (reducedMotion) {
      const timer = setInterval(sync, 100);
      return () => clearInterval(timer);
    }
    let frame: number;
    const tick = () => { sync(); frame = requestAnimationFrame(tick); };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active?.id, reducedMotion]);

  const item = player.inventory.find(i => i.uid === selected);
  const chosen = item ? skinById.get(item.skinId) : undefined;
  const stake = displayedRound ? skinById.get(displayedRound.skinId) : chosen;
  const reward = displayedRound?.rewardSkinId ? skinById.get(displayedRound.rewardSkinId) : undefined;
  const displayed = reward ?? stake;
  const liveQuote = useMemo(() => active?.payoutMode === 'skin' && !active.cashedAt
    ? skinPayoutQuote(active.value, multiplier, skins) : undefined, [active, multiplier]);
  const availableSkins = useMemo(() => player.inventory.filter(item => {
    const skin = skinById.get(item.skinId);
    return skin && isWagerSkin(skin);
  }), [player.inventory]);
  function chooseStake() {
    inventoryPanel.current?.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    inventoryPanel.current?.querySelector<HTMLElement>('.skin-card, .empty-state button')?.focus({ preventScroll: true });
  }
  const start = () => {
    if (!chosen) return;
    const autoValue = auto ? Number(autoAt.replace(',', '.')) || NaN : 0;
    if (!update(p => startFlight(p, selected, skins, autoValue))) return;
    setSelected(''); setShowLast(true); setClock(Date.now()); sound('start');
    if (window.innerWidth <= 760) board.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
  };
  const finalTime = Math.log(displayedRound?.point ?? 1) / .165;
  const elapsed = !active ? finalTime : reducedMotion ? 0 : Math.min(finalTime, Math.max(0, (clock - active.startedAt) / 1000));
  const graphMax = Math.max(2.5, Math.exp(elapsed * .165) * 1.14);
  const duration = Math.max(8, elapsed + 2);
  const points = Array.from({length:61}, (_,i) => {
    const time = elapsed * i / 60;
    return `${48 + time / duration * 650},${300 - (Math.exp(time * .165) - 1) / (graphMax - 1) * 255}`;
  });
  const curve = 'M' + points.join(' L');
  const tip = points[points.length - 1].split(',').map(Number);
  const cashX = cashedAt ? 48 + Math.log(cashedAt) / .165 / duration * 650 : 0;
  const cashY = cashedAt ? 300 - (cashedAt - 1) / (graphMax - 1) * 255 : 0;
  const cashoutButton = <button className={`primary-button full-button ${cashedAt ? 'cashed-button' : ''}`} disabled={!!cashedAt} onClick={() => update(p => advanceFlight(p, skins, Date.now(), true))}>{cashedAt ? <><Check size={18}/>{reward ? 'Скин получен' : 'Выведено'}</> : liveQuote ? 'Забрать скин' : <>Забрать <Coin value={round(multiplier * (active?.value || 0))}/></>}</button>;
  const inventoryPicker = useMemo(() => <InventoryPicker max={1} inventory={availableSkins} selected={selected ? [selected] : []} disabled={phase === 'active'} go={go} onToggle={i => {
    setSelected(previous => previous === i.uid ? '' : i.uid);
    setShowLast(false);
  }}/>, [availableSkins, go, phase, selected]);

  return <div className="mode-page crash-page">
    <GameHeader mode="crash" title="Краш" description="Поставь скин и забери выигрыш до падения множителя. Выигранный скин попадёт в инвентарь, остаток — на баланс."/>
    <div className="game-layout crash-layout">
      <aside className="game-controls crash-controls">
        <div className="control-heading"><Zap size={20}/><h3>{reward ? 'Твой выигрыш' : 'Твоя ставка'}</h3></div>
        <div className={`crash-stake ${displayed ? `rarity-${displayed.rarity}` : ''}`}>
          {displayed ? <><span className="eyebrow">{reward ? 'Полученный скин' : cashedAt ? 'Стоимость выведена' : phase === 'active' ? 'Ставка принята' : 'Твой предмет'}</span><img src={displayed.image} alt={`${displayed.weapon} | ${displayed.name}`}/><span>{displayed.weapon}{displayed.wear && ' / ' + displayed.wear}</span><strong>{displayed.name}</strong><Coin value={displayed.price}/></> :
            <button className="select-crash-item" onClick={chooseStake}><span className="stake-placeholder"><Plus size={30}/></span>Выбрать предмет для ставки</button>}
        </div>
        <label className="auto-label"><input type="checkbox" checked={auto} disabled={phase === 'active'} onChange={e => setAuto(e.target.checked)}/><span className={`switch ${auto ? 'on' : ''}`}/>Автовывод</label>
        <div className="bet-input auto-input"><span>×</span><input type="number" min="1.1" max="24" step="0.1" aria-label="Множитель автовывода" disabled={!auto || phase === 'active'} value={autoAt} onChange={e => setAutoAt(e.target.value)}/><Target size={17}/></div>
        <div className="round-values">
          <div><span>{cashedAt ? `Выведено на ×${cashedAt.toFixed(2)}` : phase === 'active' ? 'Сейчас можно забрать' : 'Выплата раунда'}</span><strong><Coin value={cashedAt ? payout : phase === 'active' ? round((active?.value || 0) * multiplier) : 0}/></strong></div>
          {liveQuote && <div className="crash-quote-skin"><span>Скин при выводе</span><strong>{liveQuote.skin.weapon} | {liveQuote.skin.name}</strong></div>}
          {(liveQuote?.remainder ?? displayedRound?.balanceRemainder ?? 0) > 0 && <div><span>Остаток на баланс</span><strong><Coin value={liveQuote?.remainder ?? displayedRound?.balanceRemainder}/></strong></div>}
        </div>
        {phase === 'active' ? cashoutButton : <button className="primary-button full-button" disabled={!chosen} onClick={start}><Zap size={18}/>{chosen ? 'Поставить предмет' : 'Выбери предмет ниже'}</button>}
        <GameRules>Множитель на момент вывода определяет сумму выигрыша. Ты получишь самый дорогой скин в пределах этой суммы и разницу в кредитах. Если самолёт упадёт до вывода, ставка сгорит. Настроенный автовывод работает и при закрытой странице.</GameRules>
      </aside>
      <section ref={board} className={`crash-board game-board flight-board ${phase}`}>
        <div className="board-topline"><span><span className="signal-indicator"/>{phase === 'active' ? 'В полёте' : phase === 'idle' ? 'Ожидание старта' : 'Краш'}</span>{!!displayedRound?.autoAt && <span>Автовывод · ×{displayedRound.autoAt.toFixed(2)}</span>}</div>
        <div className="flight-stage">
          <div className="crash-graph" role="img" aria-label={`График полёта, множитель ${multiplier.toFixed(2)}`}>
            <svg viewBox="0 0 740 350"><defs>
              <linearGradient id="crash-area" x1="0" y1="0" x2="0" y2="1"><stop stopColor="currentColor" stopOpacity=".33"/><stop offset="1" stopColor="currentColor" stopOpacity=".015"/></linearGradient>
              <pattern id="flight-grid" width="26" height="25" patternUnits="userSpaceOnUse"><path d="M26 0H0V25" fill="none" stroke="#b7bfab" strokeOpacity=".12" strokeWidth="1"/></pattern>
              <radialGradient id="flight-beacon"><stop stopColor="currentColor" stopOpacity=".65"/><stop offset=".45" stopColor="currentColor" stopOpacity=".19"/><stop offset="1" stopColor="currentColor" stopOpacity="0"/></radialGradient>
            </defs>
              <rect x="48" y="30" width="662" height="270" fill="url(#flight-grid)"/>
              {[0,1,2,3].map(i => <g key={i}><path d={`M48 ${300-i*85}H710`} stroke="#ffffff0e"/><text x="8" y={304-i*85}>{(1+(graphMax-1)*i/3).toFixed(1)}×</text></g>)}
              {[0,1,2,3,4].map(i => <text key={i} x={48+i*162.5} y="332">{Math.round(duration*i/4)}с</text>)}
              {(!active || !reducedMotion) && <g>
                <path d={`${curve} L${tip[0]} 300 L48 300Z`} fill="url(#crash-area)"/>
                <path d={curve} fill="none" stroke="currentColor" strokeWidth="12" opacity=".12" strokeLinecap="round"/>
                <path d={curve} fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round"/>
                {phase !== 'idle' && <path d={`M48 ${tip[1]}H710`} stroke="currentColor" strokeOpacity=".4" strokeDasharray="3 8"/>}
                <g transform={`translate(${tip[0]},${tip[1]})`}><circle r="32" fill="url(#flight-beacon)"/>
                  <circle className="flight-ripple" r="13" fill="none" stroke="currentColor" opacity=".55"/>
                  <circle r="5" fill="#fff2cf" stroke="currentColor" strokeWidth="2"/>
                </g>
                {!!cashedAt && <g className="payout-marker">
                  <path d={`M${cashX} ${cashY}V300`} fill="none" stroke="#e3b96f" strokeDasharray="4 5"/>
                  <circle cx={cashX} cy={cashY} r="4" fill="#f4cc85"/>
                  <text x={cashX + 9} y={cashY - 10}>Вывод ×{cashedAt.toFixed(2)}</text>
                </g>}
              </g>}
            </svg>
          </div>
          <div className="flight-readout">
            <span className="flight-label">{phase === 'active' ? 'Текущий множитель' : phase === 'idle' ? 'Стартовый множитель' : 'Точка падения'}</span>
            <strong className="flight-multiplier">{multiplier.toFixed(2)}<i>×</i></strong>
            {!!cashedAt && <div className="flight-receipt" role="status"><span><Check size={16}/>Твой вывод / ×{cashedAt.toFixed(2)}</span>
              {reward ? <><strong>{reward.weapon} | {reward.name}</strong>{!!displayedRound?.balanceRemainder && <span>+<Coin value={displayedRound.balanceRemainder}/> на баланс</span>}</> :
                <><Coin value={payout}/><small>Начислено на баланс</small></>}
            </div>}
          </div>
        </div>
        <div className="flight-telemetry"><div><span>Время полёта</span><b>{elapsed.toFixed(1)}<small> сек</small></b></div><div><span>Твоя ставка</span><b><Coin value={stake?.price || 0}/></b></div><div><span>Статус ставки</span><b className={cashedAt ? "telemetry-paid" : ""}>{cashedAt ? "Выведена" : phase === "active" ? "В полёте" : phase === "lose" ? "Потеряна" : "До старта"}</b></div></div><div className="crash-history"><span>История раундов</span>{rounds.length ? rounds.map((r, i) => <span className={`crash-chip ${r >= 2 ? 'good' : ''}`} key={i}>×{r.toFixed(2)}</span>) : <span className="muted">Результат появится после падения</span>}</div>
      </section>
    </div>
    <div className="crash-inventory" ref={inventoryPanel}>{inventoryPicker}</div>
    {phase === 'active' && createPortal(<div className="mode-page crash-mobile-cashout">{cashoutButton}</div>, document.body)}
  </div>;
}
