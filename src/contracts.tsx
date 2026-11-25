import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { ArrowLeftRight, ArrowRight, Check, ChevronRight, Eraser, Layers, PenLine, Plus, RotateCcw, Undo2, X } from 'lucide-react';
import { ContractAward } from './contract-award';
import { ContractLoadout } from './contract-loadout';
import { frameContractArt } from './contract-art';
import { ContractSignature, type ContractSignatureHandle } from './contract-signature';
import { ExchangeMachine, exchangeDuration, prepareExchangeMotion, revealStart, scanStart } from './exchange-machine';
import { Coin, money } from './components';
import { playCaseStop, sound } from './audio';
import { contract } from './engine';
import { skinById, skins, useStore } from './store';
import type { Item, Skin } from './types';
import { useReducedMotion } from './use-reduced-motion';
import { runVisibleTimeline } from './visible-timeline';

type Phase = 'draft' | 'review' | 'intake' | 'scan' | 'unlock' | 'result';
type Receipt = { award: Item; stock: Item[] };
type Entry = { item: Item; skin: Skin };
const emptySlots = (): (string | null)[] => Array(10).fill(null);
const compactLayout = window.matchMedia('(max-width: 820px)');
const isCompact = () => compactLayout.matches;
const observeLayout = (notify: () => void) => {
  compactLayout.addEventListener('change', notify);
  return () => compactLayout.removeEventListener('change', notify);
};
const descriptions: Record<Phase, string> = {
  draft: 'От 3 до 10 предметов', review: 'Проверь предметы перед обменом',
  intake: 'Передаём предметы в сканер', scan: 'Сканируем предметы',
  unlock: 'Открываем отсек', result: 'Предмет добавлен в инвентарь',
};

function ItemSocket({ entry, index, disabled, onClick }: {
  entry: Entry | null; index: number; disabled: boolean; onClick: () => void;
}) {
  const name = entry && entry.skin.weapon + ' | ' + entry.skin.name;
  return <button type="button" className={'trade-socket' + (entry ? ' rarity-' + entry.skin.rarity : '')}
    data-loaded={!!entry} disabled={disabled} onClick={onClick}
    title={name ?? 'Выбрать предмет'} aria-label={name ? 'Убрать ' + name : 'Добавить предмет в ячейку ' + (index + 1)}>
    {entry ? <><img key={entry.item.uid} data-socket-id={entry.item.uid} src={entry.skin.image} onLoad={frameContractArt} alt="" draggable="false"/>
      <X className="trade-socket-remove" size={12} aria-hidden="true"/></> :
      <Plus size={16} strokeWidth={1.35} aria-hidden="true"/>}
  </button>;
}

export function ContractsPage() {
  const { player, update, setBusy } = useStore();
  const [phase, setPhase] = useState<Phase>('draft');
  const [slots, setSlots] = useState(emptySlots);
  const [inspected, setInspected] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [hasInk, setHasInk] = useState(false);
  const [drawOnPanel, setDrawOnPanel] = useState(false);
  const desiredSlot = useRef<number | null>(null);
  const signature = useRef<ContractSignatureHandle>(null);
  const signatureLine = useRef<HTMLDivElement>(null);
  const drawer = useRef<HTMLDialogElement>(null);
  const rail = useRef<HTMLDivElement>(null);
  const desk = useRef<HTMLElement>(null);
  const progress = useRef<HTMLSpanElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const reviewButton = useRef<HTMLButtonElement>(null);
  const locked = useRef(false);
  const reviewedIds = useRef<string[]>([]);
  const revealed = useRef(false);
  const compact = useSyncExternalStore(observeLayout, isCompact);
  const reducedMotion = useReducedMotion();
  const running = phase === 'intake' || phase === 'scan' || phase === 'unlock';
  const editable = phase === 'draft', complete = phase === 'result';
  const stock = receipt?.stock ?? player.inventory;
  const byId = useMemo(() => new Map(stock.map(item => [item.uid, item])), [stock]);
  const rack = useMemo(() => slots.map(uid => {
    const item = uid && byId.get(uid);
    const skin = item && skinById.get(item.skinId);
    return item && skin ? { item, skin } : null;
  }), [byId, slots]);
  const chosen = useMemo(() => rack.filter((item): item is Entry => !!item), [rack]);
  const selected = useMemo(() => chosen.map(({item}) => item.uid), [chosen]);
  const inspectedEntry = chosen.find(({item}) => item.uid === inspected) ?? chosen.at(-1);
  const preview = inspectedEntry?.skin ?? (stock[0] && skinById.get(stock[0].skinId));
  const total = chosen.reduce((value, entry) => value + entry.skin.price, 0);
  const reward = receipt ? skinById.get(receipt.award.skinId) : undefined;

  function revealSound() {
    if (revealed.current) return;
    revealed.current = true;
    if (!document.hidden) sound('win');
  }
  const finish = useCallback(() => {
    if (!locked.current) return;
    locked.current = false;
    revealSound();
    setPhase('result');
    setBusy(false);
  }, [setBusy]);

  useLayoutEffect(() => {
    if (!running || !desk.current) return;
    if (reducedMotion) { finish(); return; }
    const motion = prepareExchangeMotion(desk.current);
    let stage: Phase = 'intake';
    const cancel = runVisibleTimeline(exchangeDuration, finish, elapsed => {
      motion.seek(elapsed);
      if (progress.current) progress.current.style.transform = 'scaleX(' + elapsed / exchangeDuration + ')';
      const next = elapsed < scanStart ? 'intake' : elapsed < revealStart ? 'scan' : 'unlock';
      if (next !== stage) {
        stage = next;
        setPhase(next);
        if (next === 'scan') playCaseStop();
      }
      if (elapsed >= revealStart + 235) revealSound();
    });
    return () => { cancel(); motion.dispose(); };
  }, [running, reducedMotion, finish]);

  function showInventory(index: number | null = null) {
    if (!editable) return;
    desiredSlot.current = index;
    if (compact) {
      if (drawer.current && !drawer.current.open) drawer.current.showModal();
    } else {
      const inventory = rail.current;
      const target = inventory?.querySelector<HTMLElement>('button[aria-pressed=false]:not(:disabled)')
        ?? inventory?.querySelector<HTMLElement>('input[type=search],a');
      target?.focus({preventScroll:true});
      target?.scrollIntoView({block:'nearest', behavior:reducedMotion ? 'instant' : 'smooth'});
    }
  }

  function toggle(item: Item) {
    if (!editable || locked.current) return;
    const target = desiredSlot.current;
    desiredSlot.current = null;
    setInspected(item.uid);
    setSlots(current => {
      const next = current.map(uid => uid && byId.has(uid) ? uid : null);
      const existing = next.indexOf(item.uid);
      const at = existing >= 0 ? existing : target !== null && next[target] === null ? target : next.indexOf(null);
      if (at < 0) return current;
      next[at] = existing >= 0 ? null : item.uid;
      return next;
    });
    sound('click');
  }
  function review() {
    if (!editable || chosen.length < 3 || locked.current) return;
    reviewedIds.current = selected;
    setDrawOnPanel(false);
    setPhase('review');
  }
  function cancelReview() {
    setPhase('draft');
    requestAnimationFrame(() => reviewButton.current?.focus({preventScroll:true}));
  }
  useEffect(() => {
    if (phase === 'review') {
      if (reviewedIds.current.some(uid => !byId.has(uid))) { cancelReview(); return; }
      cancelButton.current?.focus({preventScroll:true});
    }
    if (phase === 'intake' && desk.current) {
      const rect = desk.current.querySelector('.trade-scanner')!.getBoundingClientRect();
      const mastBottom = document.querySelector('.masthead')?.getBoundingClientRect().bottom ?? 0;
      if (rect.top < Math.max(0, mastBottom)) desk.current.scrollIntoView({block:'start', behavior:'instant'});
    }
  }, [phase, byId]);

  function submit() {
    if (phase !== 'review' || locked.current) return;
    locked.current = true;
    let exchanged: Receipt | undefined;
    const saved = update(current => {
      const result = contract(current, reviewedIds.current, skins);
      exchanged = { award:result.reward, stock:current.inventory };
      return result.state;
    });
    if (!saved || !exchanged) { locked.current = false; cancelReview(); return; }
    const image = new Image();
    image.src = skinById.get(exchanged.award.skinId)!.image;
    revealed.current = false;
    setReceipt(exchanged);
    setBusy(true);
    setPhase('intake');
    sound('click');
  }
  function startAgain() {
    if (locked.current) return;
    setReceipt(null);
    setSlots(emptySlots());
    setInspected(null);
    setHasInk(false);
    setDrawOnPanel(false);
    desiredSlot.current = null;
    setPhase('draft');
    requestAnimationFrame(() => title.current?.focus({preventScroll:true}));
  }

  const loadout = <ContractLoadout stock={complete ? player.inventory : stock} selected={complete ? [] : selected} disabled={!editable} onToggle={toggle}/>;
  return <section className="exchange-scene contract-workbench" data-phase={phase} aria-label="Контракт обмена">
    <article className="trade-desk" ref={desk} onKeyDown={event => {
      if (event.key === 'Escape') { if (phase === 'review') cancelReview(); else setDrawOnPanel(false); }
    }}>
      <header className="trade-heading">
        <span className="trade-heading-icon" aria-hidden="true">{complete ? <Check/> : <ArrowLeftRight/>}</span>
        <div><h1 ref={title} tabIndex={-1}>{complete ? 'Обмен выполнен' : 'Контракт обмена'}</h1>
          <p role="status">{descriptions[phase]}</p></div>
      </header>
      <ExchangeMachine phase={phase} preview={preview} reward={reward} empty={!chosen.length} onPick={() => showInventory()}/>
      {running && <div className="trade-transfers" aria-hidden="true">
        {[...chosen.filter(entry => entry !== inspectedEntry), ...(inspectedEntry ? [inspectedEntry] : [])].map(({item, skin}) =>
          <img key={item.uid} data-transfer-id={item.uid} src={skin.image} onLoad={frameContractArt} alt="" draggable="false"/>)}
      </div>}
      {complete && reward ? <ContractAward skin={reward} count={chosen.length} total={total} onContinue={startAgain}/> : <>
        <div className="trade-form" data-drawing={drawOnPanel}>
          <section className="trade-rack" aria-labelledby="trade-rack-title">
            <header className="trade-rack-heading">
              <h2 id="trade-rack-title">Предметы обмена</h2>
              <span className="trade-count" aria-live="polite" aria-label={'Выбрано предметов: ' + chosen.length + ' из 10'}>{chosen.length} <span>/ 10</span></span>
              {chosen.length > 0 && <button type="button" className="trade-tool trade-reset" aria-label="Очистить ячейки" title="Очистить ячейки"
                disabled={!editable} onClick={() => { setSlots(emptySlots()); setInspected(null); desiredSlot.current = null; }}><RotateCcw size={14}/></button>}
              {compact && <button type="button" className="trade-tool trade-open-stock" aria-label="Открыть инвентарь" disabled={!editable} onClick={() => showInventory()}><Layers size={16}/></button>}
            </header>
            <div className="trade-slots" role="group" aria-label="Ячейки обмена">
              {rack.map((entry,index) => <ItemSocket key={index} entry={entry} index={index} disabled={!editable}
                onClick={() => entry ? toggle(entry.item) : showInventory(index)}/>)}
            </div>
          </section>
          <section className="trade-sign" aria-labelledby="trade-sign-title">
            <div className="trade-sign-heading">
              <h2 id="trade-sign-title">Подпись</h2>
              <div className="trade-pen-tools">
                <button type="button" className="trade-tool" disabled={!editable} aria-pressed={drawOnPanel} aria-label="Рисовать по всей панели" title="Рисовать по всей панели" onClick={() => setDrawOnPanel(active => !active)}><PenLine size={15}/></button>
                <button type="button" className="trade-tool" disabled={!editable || !hasInk} aria-label="Отменить штрих" title="Отменить штрих" onClick={() => signature.current?.undo()}><Undo2 size={15}/></button>
                <button type="button" className="trade-tool" disabled={!editable || !hasInk} aria-label="Стереть рисунок" title="Стереть рисунок" onClick={() => signature.current?.clear()}><Eraser size={15}/></button>
              </div>
            </div>
            <div className="trade-pad" ref={signatureLine}>{!hasInk && <span>Распишись здесь</span>}</div>
          </section>
          <ContractSignature ref={signature} disabled={!editable} wholeSheet={drawOnPanel} signatureLine={signatureLine} onInkChange={setHasInk}/>
        </div>
          <div className="trade-rail">
            {phase === 'review' ? <>
              <div className="trade-confirm"><strong>Подтвердить обмен?</strong><span>Выбранные предметы будут списаны.</span></div>
              <div className="trade-buttons"><button type="button" className="trade-secondary" ref={cancelButton} onClick={cancelReview}>Назад</button>
                <button type="button" className="trade-primary" onClick={submit}>Подтвердить <Check size={17}/></button></div>
            </> : <>
              <div className="trade-values"><div><span>Общая стоимость</span><strong><Coin value={total}/></strong></div>
                <div><span>Диапазон обмена</span><strong>{total ? <>{money(total * .25)} – <Coin value={total * 3}/></> : '—'}</strong></div></div>
              {running ? <button type="button" className="trade-secondary" onClick={finish}>Показать результат <ChevronRight size={16}/></button> :
                <button type="button" className="trade-primary" ref={reviewButton} disabled={chosen.length < 3} onClick={review}>Обменять предметы <ArrowRight size={17}/></button>}
            </>}
            {running && <div className="trade-progress" aria-hidden="true"><span ref={progress}/></div>}
          </div>
        </>}
    </article>
    {compact ? <dialog ref={drawer} className="trade-drawer" aria-label="Инвентарь для обмена"
      onClick={event => { if (event.target === event.currentTarget) drawer.current?.close(); }}>
      <div className="trade-drawer-body">
        <button type="button" className="trade-tool trade-drawer-close" aria-label="Закрыть инвентарь" onClick={() => drawer.current?.close()}><X size={19}/></button>
        {loadout}
        <button type="button" className="trade-primary trade-drawer-done" onClick={() => drawer.current?.close()}>К контракту <span>{chosen.length} / 10</span><Check size={16}/></button>
      </div>
    </dialog> : <div className="trade-inventory-panel" ref={rail}>{loadout}</div>}
  </section>;
}
