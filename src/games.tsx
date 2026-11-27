import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, ArrowUpRight, Bomb, Check, Diamond, Gem, Info, Plus, RotateCcw, Search, ShieldCheck, Shuffle, Target, Wallet } from 'lucide-react';
import type { Item, MineRound, Skin } from './types';
import type { Navigate } from './App';
import { Coin, Empty, SkinCard, money } from './components';
import { skinById, skins, useStore } from './store';
import { GOLD_UPGRADE, mineMultiplier, random, round, upgrade, upgradeChance, upgradeWheelSectors, closestUpgradeTargets, maxUpgradeContribution, type GoldUpgradePayout } from './engine';
import { startMines, collectMines, revealCell } from './rounds';
import { isWagerSkin, skinPayoutQuote } from './skin-wagers';
import { createUpgradeSpinPlayback, getAudioVolume, playGoldUpgradeAward, sound } from './audio';
import { UpgradeCinematic } from './upgrade-cinematic';
import { useReducedMotion } from './use-reduced-motion';
import { buildUpgradeSpin, UPGRADE_MARK_DEGREES } from './upgrade-spin';

type GameMode = 'crash' | 'wheel' | 'mines';
type TargetRequest = { by: 'chance'; value: string } | { by: 'multiple'; value: number };
type UpgradeAttempt = {
  inputs: Skin[]; inventory: Item[]; target: Skin; contribution: number; limit: number;
  landing: number; goldZone: boolean; goldPayout: GoldUpgradePayout | null;
};
function formatUpgradePercent(percent: number) {
  return percent > 0 && percent < .01 ? '<0,01' : money(percent);
}
function useSpinPreference(key: string, defaultValue: boolean) {
  const [value, setValue] = useState(() => {
    try {
      const saved = localStorage.getItem(key);
      return saved === '1' || (saved !== '0' && defaultValue);
    } catch { return defaultValue; }
  });
  function change(enabled: boolean) {
    setValue(enabled);
    try { localStorage.setItem(key, enabled ? '1' : '0'); }
    catch { /* The preference still applies for this visit. */ }
  }
  return [value, change] as const;
}

const modeSpecs = {
  crash: { artwork: 'skin-bb633c21fc25', facts: [['Ставка', '1 предмет'], ['Вывод', 'Ручной / авто']] },
  wheel: { artwork: 'skin-e7fd9a1907bb', facts: [['Секторы', '12'], ['Множители', '×2 – ×12']] },
  mines: { artwork: 'skin-b14c9f234bc5', facts: [['Поле', '5 × 5'], ['Число мин', '1–10']] },
};

export function GameHeader({ mode, title, description }: { mode: GameMode; title: string; description: string }) {
  const { artwork, facts } = modeSpecs[mode];
  const skin = skinById.get(artwork);
  return <header className="field-game-header">
    <div className="field-game-lead">
      <h1>{title}</h1>
      <p>{description}</p>
    </div>
    <dl className="game-specs">{facts.map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    {skin && <figure className="game-print">
      <img className="game-cover-item" src={skin.image} alt="" draggable="false"/>
      <figcaption><span>{skin.weapon}</span> {skin.name}</figcaption>
    </figure>}
  </header>;
}

export function InventoryPicker({ selected, onToggle, disabled, inventory, max, go }: { selected: string[]; onToggle: (item: Item) => void; disabled?: boolean; inventory?: Item[]; max: number; go: Navigate }) {
  const { player } = useStore();
  const [search, setSearch] = useState('');
  const stock = inventory ?? player.inventory;
  const items = stock.filter(i => { const s = skinById.get(i.skinId)!; return `${s.weapon} ${s.name}`.toLowerCase().includes(search.toLowerCase()); });
  const selectedValue = stock.filter(i => selected.includes(i.uid)).reduce((sum, i) => sum + (skinById.get(i.skinId)?.price || 0), 0);
  return <section className={`picker-panel ${disabled ? 'picker-disabled' : ''}`}><div className="picker-title"><h3>Твои предметы <span className="total-pill">{selected.length}/{max}</span></h3><label className="search-field"><Search size={14}/><input aria-label="Найти предмет в инвентаре" placeholder="Найти предмет" value={search} onChange={e => setSearch(e.target.value)}/></label></div><div className="picker-selection-summary"><span>{selected.length ? `Выбрано предметов: ${selected.length}` : `Выбери ${max === 1 ? "один предмет" : `до ${max} предметов`}`}</span><Coin value={selectedValue}/></div>{items.length ? <div className="picker-grid">{items.map(i => <SkinCard key={i.uid} skin={skinById.get(i.skinId)!} selected={selected.includes(i.uid)} onClick={() => { if (!disabled) { sound('click'); onToggle(i); } }} compact/>)}</div> : <Empty title="Предметы не найдены" text={search ? 'Попробуй другое название.' : 'Открой контейнер, чтобы пополнить инвентарь.'}><button className="secondary-button" onClick={() => go('cases')}>Открыть кейсы<ArrowRight size={15}/></button></Empty>}</section>;
}
export function UpgradePage({ go, initialItemId }: { go: Navigate; initialItemId?: string }) {
  const { player, update, setBusy, toast } = useStore();
  const [selected, setSelected] = useState<string[]>(() => player.inventory.some(i => i.uid === initialItemId) ? [initialItemId!] : []), [targetId, setTargetId] = useState('');
  const [search, setSearch] = useState('');
  const [targetRequest, setTargetRequest] = useState<TargetRequest>({ by: 'chance', value: '30' });
  const [creditStake, setCreditStake] = useState(0);
  const [fast, changeFast] = useSpinPreference('ludodrop.upgrade.fast.v1', false);
  const [suspense, changeSuspense] = useSpinPreference('ludodrop.upgrade.suspense.v1', true);
  const [phase, setPhase] = useState<'idle' | 'rolling' | 'cinematic' | 'receiving' | 'win' | 'lose' | 'gold'>('idle');
  const [attempt, setAttempt] = useState<UpgradeAttempt | null>(null);
  const [goldAppeared, setGoldAppeared] = useState(false);
  const stage = useRef<HTMLElement | null>(null);
  const needle = useRef<HTMLDivElement>(null);
  const spin = useRef<{ animation: Animation; duration: number; playback: ReturnType<typeof createUpgradeSpinPlayback>; finish: () => void } | null>(null);
  const dismissResult = useRef<(() => void) | null>(null);
  const afterFilm = useRef<(() => void) | null>(null);
  const returnFocusAfterFilm = useRef(false);
  const pickers = useRef<HTMLDivElement>(null);
  const locked = useRef(false);
  const reducedMotion = useReducedMotion();
  const showingFilm = phase === 'cinematic' || phase === 'receiving';
  const presenting = phase === 'rolling' || showingFilm;
  const settled = phase !== 'idle' && !presenting;
  const prepareGoldReceipt = useCallback(() => {
    setPhase(current => current === 'cinematic' ? 'receiving' : current);
  }, []);
  const finishFilm = useCallback(() => {
    const complete = afterFilm.current;
    if (!complete) return;
    afterFilm.current = null;
    returnFocusAfterFilm.current = true;
    complete();
  }, []);
  useLayoutEffect(() => {
    if (!settled) return;
    locked.current = false;
    if (returnFocusAfterFilm.current) {
      stage.current?.querySelector<HTMLButtonElement>('.upgrade-action > button')?.focus({ preventScroll:true });
      returnFocusAfterFilm.current = false;
    }
  }, [settled]);
  useEffect(() => {
    const active = spin.current;
    if (phase !== 'rolling' || !attempt?.goldZone || !active) return;
    let frame: number;
    const revealZone = () => {
      if (Number(active.animation.currentTime) >= active.duration * .24 && !document.hidden) setGoldAppeared(true);
      else frame = requestAnimationFrame(revealZone);
    };
    frame = requestAnimationFrame(revealZone);
    return () => cancelAnimationFrame(frame);
  }, [phase, attempt]);
  useEffect(() => {
    if (reducedMotion) { spin.current?.finish(); finishFilm(); }
  }, [reducedMotion, finishFilm]);
  useEffect(() => {
    function syncSpin() {
      const active = spin.current;
      if (!active) return;
      const { animation, playback, finish } = active;
      if (document.hidden) {
        playback.pause();
      } else if (matchMedia('(prefers-reduced-motion: reduce)').matches || animation.effect?.getComputedTiming().progress === 1) {
        finish();
      } else {
        playback.play();
      }
    }
    document.addEventListener('visibilitychange', syncSpin);
    return () => {
      document.removeEventListener('visibilitychange', syncSpin);
      spin.current?.playback.cancel();
      spin.current = null;
    };
  }, []);
  const selectedSkins = selected.map(id => player.inventory.find(i => i.uid === id)).filter(Boolean).map(i => skinById.get(i!.skinId)!);
  const requested = targetRequest.by === 'chance' ? targetRequest.value : String(round(100 * upgradeChance(1, targetRequest.value)));
  const percent = Number(requested.replace(',', '.'));
  const validPercent = Number.isFinite(percent) && percent >= .1 && percent <= 75;
  const inputs = phase !== 'idle' && attempt ? attempt.inputs : selectedSkins;
  const itemValue = round(inputs.reduce((sum, skin) => sum + skin.price, 0));
  const targetValue = targetRequest.by === 'chance' ? percent : targetRequest.value;
  const targets = useMemo(() => closestUpgradeTargets(itemValue, targetValue, skins, search, targetRequest.by), [itemValue, targetValue, search, targetRequest.by]);
  const pickedTarget = targets.find(t => t.skin.id === targetId)?.skin || targets[0]?.skin;
  const target = phase !== 'idle' && attempt ? attempt.target : pickedTarget;
  const maxContribution = attempt?.limit ?? maxUpgradeContribution(itemValue, target?.price ?? 0, player.balance);
  const contribution = attempt?.contribution ?? Math.min(creditStake, maxContribution);
  const total = round(itemValue + contribution);
  const chance = upgradeChance(total, target?.price ?? 0);
  const reset = useCallback(() => {
    if (locked.current) return;
    dismissResult.current?.();
    dismissResult.current = null;
    needle.current?.style.removeProperty('transform');
    setPhase('idle'); setAttempt(null); setCreditStake(0); setGoldAppeared(false);
  }, []);
  const pickedTargetId = pickedTarget?.id;
  const targetCards = useMemo(() => targets.map(({ skin, chance: actual }, index) => (
    <SkinCard key={skin.id} skin={skin} selected={pickedTargetId === skin.id} compact
      footer={<span className="target-chance" title="Шанс без доплаты">{index === 0 && <Target size={11}/>} {formatUpgradePercent(actual)}%</span>}
      onClick={() => { if (!locked.current) { reset(); setTargetId(skin.id); sound('click'); } }}/>
  )), [targets, pickedTargetId, reset]);
  function changeTargetRequest(request: TargetRequest, nextTargetId = '') {
    if (locked.current) return;
    reset(); setTargetRequest(request); setTargetId(nextTargetId);
  }
  function shuffleTarget() {
    if (locked.current || !selectedSkins.length) return;
    const choices = targets.filter(entry => entry.skin.id !== pickedTargetId);
    if (!choices.length) return;
    const next = choices[Math.floor(random() * choices.length)];
    changeTargetRequest({ by: 'chance', value: String(Math.max(.1, round(next.chance))).replace('.', ',') }, next.skin.id);
  }
  const roll = () => {
    if (locked.current || !target || !chance || !validPercent) return;
    locked.current = true;
    const snapshot = { inputs: selectedSkins, inventory: player.inventory, target, contribution, limit: maxContribution };
    let outcome: ReturnType<typeof upgrade> | undefined;
    if (!update(p => { outcome = upgrade(p, selected, target, skins, random, contribution); return outcome.state; }) || !outcome) { locked.current = false; return; }
    const { won, landing, goldZone, goldPayout } = outcome;
    setAttempt({ ...snapshot, landing, goldZone, goldPayout }); setGoldAppeared(false);
    setPhase('rolling'); setBusy(true); sound('start');
    if (goldPayout) {
      const prizeArt = new Image();
      prizeArt.src = goldPayout.skin.image;
    }
    if (stage.current && (window.innerWidth <= 760 || stage.current.getBoundingClientRect().top < 0)) {
      stage.current.scrollIntoView({ behavior: fast || reducedMotion ? 'instant' : 'smooth', block: 'start' });
    }
    const motion = buildUpgradeSpin(landing, fast, random, suspense);
    const pointer = needle.current;
    let finished = false;
    const finish = () => {
      if (finished || !locked.current || (spin.current && document.hidden)) return;
      finished = true;
      if (pointer) pointer.style.transform = `rotate(${landing}deg)`;
      if (spin.current) {
        spin.current.playback.complete();
      }
      spin.current = null;
      const showResult = (withSound: boolean) => {
        setPhase(goldPayout ? 'gold' : won ? 'win' : 'lose');
        setSelected([]); setBusy(false);
        if (withSound && !document.hidden) {
          if (goldPayout) playGoldUpgradeAward();
          else sound(won ? 'win' : 'lose');
        }
        const message = goldPayout ? `Золотой дроп ×${goldPayout.multiplier} · ${goldPayout.skin.weapon} | ${goldPayout.skin.name}` :
          won ? 'Апгрейд удался! Новый предмет в инвентаре' : 'Апгрейд не удался. Можно выбрать новую цель';
        dismissResult.current = toast(message, won ? 'success' : 'error');
      };
      if (goldPayout && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
        afterFilm.current = () => showResult(false);
        setPhase('cinematic');
      } else {
        showResult(true);
      }
    };
    if (matchMedia('(prefers-reduced-motion: reduce)').matches || !pointer?.animate) {
      finish();
      return;
    }
    try {
      const animation = pointer.animate(motion.keyframes, { duration: motion.duration, easing: 'linear', fill: 'both' });
      const playback = createUpgradeSpinPlayback(animation, motion.tickTimes, motion.duration);
      spin.current = { animation, duration: motion.duration, playback, finish };
      animation.onfinish = finish;
      if (document.hidden) playback.pause();
      else playback.play();
    } catch {
      finish();
    }
  };
  const showGold = attempt?.goldZone && (goldAppeared || showingFilm || settled);
  const goldPrize = phase === 'gold' || phase === 'receiving' ? attempt?.goldPayout : null;
  const shownTarget = goldPrize?.skin ?? target;
  const { goldArc, ordinaryArc } = upgradeWheelSectors(chance, Boolean(showGold));
  const percentText = formatUpgradePercent(100 * (showGold ? GOLD_UPGRADE.hitChance : chance));
  const readoutLabel = goldPrize ? 'Золотой дроп' : phase === 'win' ? 'Попадание' : phase === 'lose' ? 'Промах'
    : showGold ? 'Шанс на золото' : 'Шанс успеха';
  const spokenResult = goldPrize ? `${readoutLabel} ×${goldPrize.multiplier}` : settled ? readoutLabel : `${readoutLabel} ${percentText}%`;
  return <div className="mode-page upgrade-page">
    <section ref={stage} aria-label="Апгрейд" className={`upgrade-stage chamber-${phase}`}>
      {presenting && attempt?.goldPayout && !reducedMotion && <UpgradeCinematic
        active={showingFilm} fast={fast} volume={player.sound ? getAudioVolume() : 0}
        inputs={attempt.inputs} contribution={attempt.contribution} landing={attempt.landing}
        target={attempt.target} payout={attempt.goldPayout} onDelivery={prepareGoldReceipt} onFinish={finishFilm}/>}
      <div className={`upgrade-slot source-slot ${inputs[0] ? `rarity-${inputs[0].rarity}` : ''}`}>
        <span className="slot-label"><span className="slot-bulb"/>Твоя ставка<span>{inputs.length}/5</span></span>
        {inputs.length ? <><div className="upgrade-item-art">{inputs.slice(0, 3).map((skin, i) => <img src={skin.image} alt={skin.name} key={i}/>)}</div><span className="upgrade-weapon">{inputs.length === 1 ? inputs[0].weapon : 'Комплект предметов'}</span><h3>{inputs.length === 1 ? inputs[0].name : `Предметов: ${inputs.length}`}</h3><Coin value={total}/></> : <><div className="slot-placeholder"><Plus size={32}/></div><h3>Твои предметы</h3><button className="choose-loadout" onClick={() => {
          const picker = pickers.current?.querySelector<HTMLElement>('.picker-panel');
          picker?.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
          picker?.querySelector<HTMLElement>('.skin-card, input')?.focus({ preventScroll: true });
        }}>Выбрать предметы</button></>}
      </div>
      <div className="upgrade-dial-column">
        <div className={`probability-dial ${phase === 'receiving' ? 'gold' : phase}`} style={{ '--upgrade-mark-step': `${UPGRADE_MARK_DEGREES}deg`, '--gold-arc': `${360 * GOLD_UPGRADE.wheelShare}deg` } as React.CSSProperties}
          role="img" aria-label={`${spokenResult}${showGold ? '. Золотая зона внизу колеса' : ''}`}>
          <div className="probability-ticks"/>
          <div className="probability-band" style={{ '--upgrade-arc': `${ordinaryArc + goldArc}deg` } as React.CSSProperties}/>
          {showGold && <div className="upgrade-gold-sector" aria-hidden="true"/>}
          <div className="probability-readout"><span>{readoutLabel}</span>
            <strong>{goldPrize ? <>×{goldPrize.multiplier}</> : phase === 'win' ? <Check size={49}/> : phase === 'lose' ? <RotateCcw size={41}/> : <>{percentText}<small>%</small></>}</strong>
          </div>
          <div ref={needle} className="probability-needle"><i/></div>
        </div>
        <div className={'probability-legend' + (showGold ? ' gold-legend' : '')} role="status">
          {showGold ? <><Diamond size={13} aria-hidden="true"/>Золотая зона</> : <><i/>Выигрышный сектор</>}
        </div>
      </div>
      <div className={`upgrade-slot target-slot ${shownTarget ? `rarity-${shownTarget.rarity}` : ''}`}>
        <span className="slot-label"><span className="slot-bulb"/>{goldPrize ? 'Твой выигрыш' : 'Твоя цель'}{shownTarget && total > 0 && <b title={goldPrize && target ? `От цены цели «${target.weapon} | ${target.name}» (${money(target.price)})` : undefined}>×{goldPrize ? goldPrize.multiplier : (shownTarget.price / total).toFixed(1)}</b>}</span>
        {shownTarget ? <>
          <div className="upgrade-item-art">
            <img key={goldPrize ? 'gold-' + shownTarget.id : shownTarget.id} src={shownTarget.image} alt={shownTarget.name}/>
            {goldPrize && <span className="upgrade-gold-sparks" aria-hidden="true">{Array.from({ length: 12 }, (_, i) =>
              <i key={i} style={{ '--ray-angle': `${i * 30 + 12}deg`, '--ray-distance': `${39 + (i % 3) * 15}px`, '--ray-delay': `${(i % 4) * 32}ms` } as React.CSSProperties}/>)}</span>}
          </div>
          <span className="upgrade-weapon">{shownTarget.weapon}</span><h3>{shownTarget.name}</h3><Coin value={shownTarget.price}/>
          {goldPrize && goldPrize.remainder > 0 && <span className="upgrade-gold-remainder">+<Coin value={goldPrize.remainder}/> на баланс</span>}
        </> : <><div className="slot-placeholder"><Target size={34}/></div><h3>На что меняем?</h3><p>Укажи желаемый шанс.<br/>Подберём подходящие предметы.</p></>}
      </div>
      <div className="upgrade-action">
        {settled ? <button className="primary-button" onClick={reset}><RotateCcw size={19}/>Новый апгрейд</button> : <button className="primary-button" onClick={roll} disabled={presenting || !chance || !selected.length || !validPercent}><ArrowUpRight size={21}/>{presenting ? 'Апгрейд в процессе…' : 'Запустить апгрейд'}</button>}
        <div className="upgrade-spin-options" role="group" aria-label="Настройки прокрутки">
          <label className="upgrade-spin-switch" title="После быстрого вращения стрелка плавно проходит последние деления. В обычном режиме торможение начинается раньше.">
            <input id="upgrade-suspense" type="checkbox" role="switch" checked={suspense} disabled={presenting} onChange={e => changeSuspense(e.currentTarget.checked)}/>
            Азартная прокрутка
          </label>
          <label className="upgrade-spin-switch" title="Ускорить анимацию апгрейда">
            <input id="upgrade-fast" type="checkbox" role="switch" checked={fast} disabled={presenting} onChange={e => changeFast(e.currentTarget.checked)}/>
            Быстро
          </label>
        </div>
      </div>
    </section>
    <div className="two-pickers" ref={pickers}>
      <InventoryPicker selected={selected} inventory={presenting ? attempt?.inventory : undefined} disabled={presenting} max={5} go={go} onToggle={i => { reset(); setTargetId(''); setSelected(prev => prev.includes(i.uid) ? prev.filter(id => id !== i.uid) : prev.length < 5 ? [...prev, i.uid] : prev); }}/>
      <section className="picker-panel target-panel">
        <div className="picker-title upgrade-target-toolbar">
          <div className="upgrade-target-title">
            <h3>Подбор по шансу</h3>
            <label className="upgrade-custom-chance" title="Свой процент">
              <input id="desired-chance" aria-label="Желаемый шанс" inputMode="decimal" autoComplete="off" value={requested}
                onChange={e => changeTargetRequest({ by: 'chance', value: e.target.value })} disabled={presenting}
                aria-invalid={!validPercent} aria-describedby={!validPercent ? 'upgrade-chance-error' : undefined}/><span>%</span>
            </label>
          </div>
          <div className="upgrade-contribution" style={{ '--credit-fill': `${maxContribution ? contribution / maxContribution * 100 : 0}%` } as React.CSSProperties}>
            <div className="upgrade-credit-heading">
              <label htmlFor="upgrade-credits" title="Добавить с баланса"><Wallet size={16} aria-hidden="true"/>С баланса</label>
              <span className="upgrade-credit-amount"><Coin value={contribution}/></span>
            </div>
            <div className="upgrade-credit-control">
              <div className="upgrade-credit-slider">
                <span className="upgrade-credit-rail" aria-hidden="true"/>
                <input id="upgrade-credits" type="range" aria-label="Добавить с баланса" min={0} max={maxContribution} step={0.01} value={contribution}
                  disabled={phase !== 'idle' || !maxContribution} aria-describedby={itemValue > 0 ? 'upgrade-credit-limit' : undefined}
                  aria-valuetext={`${money(contribution)} из ${money(maxContribution)} кредитов`}
                  onChange={e => setCreditStake(e.currentTarget.valueAsNumber)}/>
              </div>
              <div className="upgrade-credit-scale" id="upgrade-credit-limit">
                {maxContribution > 0 ? <>
                  <span>0</span>
                  <span>Макс. {money(maxContribution)}</span>
                </> : itemValue > 0 && (!target ? 'Выбери цель' : !player.balance ? 'Баланс пуст' : 'Достигнут предел шанса')}
              </div>
            </div>
          </div>
          <label className="search-field"><Search size={15}/><input placeholder="Найти скин" aria-label="Поиск цели апгрейда" value={search} disabled={presenting} onChange={e => { reset(); setTargetId(''); setSearch(e.target.value); }}/></label>
          <div className="upgrade-target-presets" role="group" aria-label="Быстрый подбор цели">
            {[2, 5, 10].map(multiple => <button key={multiple} type="button" disabled={presenting}
              aria-pressed={targetRequest.by === 'multiple' && targetRequest.value === multiple} title={`Цена цели ≈ ${multiple} × стоимость ставки`}
              onClick={() => changeTargetRequest({ by: 'multiple', value: multiple })}>×{multiple}</button>)}
            {[30, 50, 75].map(n => <button key={n} type="button" disabled={presenting}
              aria-pressed={targetRequest.by === 'chance' && percent === n} title={`Подобрать цель с шансом около ${n}%`}
              onClick={() => changeTargetRequest({ by: 'chance', value: String(n) })}>{n}%</button>)}
            <button type="button" aria-label="Случайная цель" title="Случайная цель" disabled={presenting || !selectedSkins.length || targets.length < 2} onClick={shuffleTarget}><Shuffle size={17} aria-hidden="true"/></button>
          </div>
        </div>
        {!validPercent && <p className="upgrade-chance-error" id="upgrade-chance-error" role="status">Введи шанс от 0,1% до 75%.</p>}
        <div className="picker-grid" inert={presenting}>{targetCards}</div>
        {validPercent && !targets.length && <Empty title={total ? 'Цели не найдены' : 'Сначала выбери предмет'} text={total ? 'Измени запрос или выбери другую ставку.' : 'Выбери скин из своего инвентаря для подбора цели.'}/>}
      </section>
    </div>
  </div>;
}

export function GameRules({ children }: { children: React.ReactNode }) { return <div className="game-rules"><Info size={17}/><p>{children}</p></div>; }

export function MinesPage({ go }: { go: Navigate }) {
  const { player, update, toast } = useStore();
  const active = player.mineRound;
  const [selected, setSelected] = useState('');
  const [minesCount, setMinesCount] = useState(active?.mines.length ?? 3);
  const [result, setResult] = useState<{ round: MineRound; hit: number | null } | null>(null);
  const board = useRef<HTMLElement>(null);
  const inventoryPanel = useRef<HTMLDivElement>(null);
  const startButton = useRef<HTMLButtonElement>(null);
  const stock = useMemo(() => player.inventory.filter(item => {
    const skin = skinById.get(item.skinId);
    return skin && isWagerSkin(skin);
  }), [player.inventory]);
  const chosen = stock.find(i => i.uid === selected);
  const stakeSkinId = active?.skinId ?? chosen?.skinId;
  const stakeSkin = stakeSkinId ? skinById.get(stakeSkinId) : undefined;
  const game = active || result?.round;
  const phase = active ? 'active' : result ? result.hit === null ? 'win' : 'lose' : 'idle';
  const count = game?.mines.length ?? minesCount;
  const revealed = game?.revealed ?? [];
  const multiplier = mineMultiplier(revealed.length, count);
  const quote = game?.skinId && revealed.length > 0 && phase !== 'lose'
    ? skinPayoutQuote(game.amount, multiplier, skins) : undefined;
  const legacyPayout = game && !game.skinId ? round(game.amount * multiplier) : 0;

  const start = () => {
    if (!chosen || !update(p => startMines(p, chosen.uid, minesCount, skins))) return;
    setSelected('');
    setResult(null);
    sound('start');
    if (window.innerWidth <= 760) board.current?.scrollIntoView({ behavior: 'instant', block: 'start' });
  };
  const collect = () => {
    if (!active || !update(p => collectMines(p, skins))) return;
    setResult({ round: active, hit: null });
    sound('win');
  };
  const reveal = (cell: number) => {
    if (!active || !update(p => revealCell(p, cell, skins))) return;
    if (active.mines.includes(cell)) {
      setResult({ round: active, hit: cell });
      sound('lose');
    } else if (active.revealed.length + 1 === 25 - count) {
      setResult({ round: { ...active, revealed: [...active.revealed, cell] }, hit: null });
      sound('win');
    } else {
      sound('gem');
    }
  };
  const cashButton = <button className="primary-button full-button" disabled={!revealed.length} onClick={collect}>
    {active?.skinId ? 'Забрать скин' : <>Забрать <Coin value={legacyPayout}/></>}
  </button>;
  return <div className="mode-page mines-page">
    <GameHeader mode="mines" title="Мины" description="Поставь скин и открывай алмазы. Чем больше алмазов найдёшь, тем выше стоимость скина, который можно забрать."/>
    <div className="game-layout"><aside className="game-controls"><div className="control-heading"><Diamond size={20}/><h3>Параметры раунда</h3></div>
      {active && !active.skinId ? <div className="mine-stake-legacy">Ставка раунда <Coin value={active.amount}/></div> :
        <button type="button" className="mine-stake-slot" disabled={!!active}
          aria-label={active ? undefined : stakeSkin ? 'Изменить скин для ставки' : 'Выбрать скин для ставки'}
          onClick={() => {
            inventoryPanel.current?.scrollIntoView({ block:'start', behavior:'instant' });
            inventoryPanel.current?.querySelector<HTMLElement>('.skin-card, .empty-state button')?.focus({ preventScroll:true });
          }}>
          {stakeSkin ? <img src={stakeSkin.image} alt=""/> : <Plus size={24}/>}
          <span><small>Скин для ставки</small><strong>{stakeSkin ? `${stakeSkin.weapon} | ${stakeSkin.name}` : 'Выбрать из инвентаря'}</strong>
            {stakeSkin && <Coin value={stakeSkin.price}/>}</span>
        </button>}
      <div className="mine-selector"><label>Количество мин</label><div>{[1,3,5,10].map(n => <button className={count === n ? 'active' : ''} disabled={!!active} key={n} onClick={() => { setMinesCount(n); setResult(null); }} aria-pressed={count === n}><Bomb size={14}/>{n}</button>)}</div></div>
      <div className="round-values"><div><span>Текущий множитель</span><strong>×{multiplier.toFixed(2)}</strong></div><div><span>Следующий алмаз</span><strong>×{mineMultiplier(Math.min(revealed.length + 1, 25 - count), count).toFixed(2)}</strong></div></div>
      {active ? cashButton : <button ref={startButton} className="primary-button full-button" disabled={!chosen} onClick={start}><Diamond size={18}/>Начать игру</button>}
      <GameRules>{active && !active.skinId ? 'Этот раунд начат со ставкой в кредитах. Выигрыш поступит на баланс.' :
        'После первого алмаза можно забрать скин в инвентарь. Остаток от суммы выигрыша поступит на баланс. Попадёшь на мину — потеряешь ставку.'}</GameRules>
    </aside>
    <section ref={board} className={'mines-board game-board ' + phase}>
      <div className="board-topline"><span><Diamond size={15}/>Алмазы · {25 - count}</span><span><Bomb size={15}/>Мины · {count}</span></div>
      <div className="mine-grid" key={game?.id ?? 'idle'}>{Array.from({ length:25 }, (_, i) => {
        const shown = revealed.includes(i), over = !!result && !active, bomb = game?.mines.includes(i);
        const label = shown || over ? bomb ? 'мина' : 'алмаз' : 'закрыта';
        const coordinate = 'ABCDE'[Math.floor(i / 5)] + (i % 5 + 1);
        return <button key={i} className={'mine-cell ' + [shown && 'revealed', over && bomb && 'bomb', over && result?.hit === i && 'hit', over && !shown && 'dimmed'].filter(Boolean).join(' ')} aria-label={'Ячейка ' + coordinate + ', ' + label} disabled={!active || shown} onClick={() => reveal(i)}>
          <span className={'mine-tile ' + (shown || over ? 'open' : '')} aria-hidden="true">
            <span className="mine-cover"><small>{coordinate}</small><i/></span>
            <span className="mine-core">{over && bomb ? <Bomb size={28}/> : <Gem size={30}/>}</span>
          </span>
        </button>;
      })}</div>
      <div className="board-status" aria-live="polite">{phase === 'idle' ? 'Выбери скин и начни игру' : phase === 'active' ? 'Открыто алмазов · ' + revealed.length : phase === 'win' ? <><Check size={18}/>{quote ? 'Скин получен' : <>Выигрыш <Coin value={legacyPayout}/></>}</> : <><Bomb size={18}/>Попадание на мину</>}</div>
      {quote && <div className="mine-prize-strip" aria-live="polite">
        <img src={quote.skin.image} alt=""/>
        <span><small>{phase === 'win' ? 'В инвентаре' : 'Доступен к выводу'}</small>
          <strong>{quote.skin.weapon} | {quote.skin.name}</strong>
          {quote.remainder > 0 && <span className="mine-remainder">+<Coin value={quote.remainder}/> на баланс</span>}
        </span>
        <Coin value={quote.skin.price}/>
      </div>}
      {active && <div className="mine-mobile-payout">{cashButton}</div>}
    </section></div>
    <button className="text-button" onClick={() => toast('Шанс первого алмаза — ' + ((25 - count) * 4) + '%. Множитель равен 0,96 / вероятность открыть выбранное число безопасных ячеек.')}><ShieldCheck size={15}/>Как считается множитель</button>
    {!active && <div className="mine-inventory-picker" ref={inventoryPanel}>
      <InventoryPicker max={1} selected={chosen ? [chosen.uid] : []} inventory={stock} go={go} onToggle={item => {
        setResult(null);
        setSelected(chosen?.uid === item.uid ? '' : item.uid);
        if (chosen?.uid !== item.uid && window.innerWidth <= 760) startButton.current?.scrollIntoView({ block:'center', behavior:'instant' });
      }}/>
    </div>}
  </div>;
}
