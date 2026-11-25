import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Star, X } from 'lucide-react';
import { skinById, skins, useStore } from './store';
import type { Navigate } from './App';
import type { Skin } from './types';
import { itemRarityName } from './components';
import { useReducedMotion } from './use-reduced-motion';
import './loot-live.css';

type Entry = { key: string; skin: Skin; own?: boolean };
type FocusedSlot = { entry: Entry; index: number };
const bufferSize = 24;
const ranked = skins.filter(s => (s.kind ?? 'skin') === 'skin').sort((a, b) => b.price - a.price);
const topWeapons = ranked.filter(s => s.rarity !== 'gold').slice(0, 64);
const topSpecials = ranked.filter(s => s.rarity === 'gold').slice(0, 56);
const everyday = ranked.filter(s => s.price <= 1200 && (s.rarity === 'blue' || s.rarity === 'purple'));

function sample(entries: Entry[], roll: number, pick: number) {
  const pool = roll < .45 ? topWeapons : roll < .84 ? topSpecials : everyday;
  const recent = new Set(entries.map(entry => entry.skin.id));
  const available = pool.filter(skin => !recent.has(skin.id));
  const choices = available.length ? available : pool;
  return choices[Math.floor(pick * choices.length)];
}

function seedFeed(own: Entry[]) {
  const entries = own.slice(0, 3);
  while (entries.length < bufferSize) {
    entries.push({ key: 'initial-' + entries.length, skin: sample(entries, Math.random(), Math.random()) });
  }
  return entries;
}

function Slot({ entry: { skin, own }, go, onFocus, hidden }: { entry: Entry; go: Navigate; onFocus: () => void; hidden: boolean }) {
  const title = skin.weapon + ' | ' + skin.name;
  return <button type="button" className={'drop-card rarity-' + skin.rarity} onFocus={onFocus} onClick={() => go('skins', skin.id)}
    aria-label={own ? 'Ваш дроп · ' + title : title} aria-description={itemRarityName(skin)} aria-hidden={hidden || undefined} tabIndex={hidden ? -1 : 0} title={title}>
    <span className="drop-card-preview"><img src={skin.image} alt="" draggable="false"/></span>
    <span className="drop-card-name"><small>{skin.weapon}</small><strong>{skin.name}</strong></span>
    {own && <Star className="drop-own-star" size={11} fill="currentColor" aria-hidden="true"/>}
  </button>;
}

export function LootStrip({ go }: { go: Navigate }) {
  const { player, busy } = useStore();
  const hiddenIds = busy ? player.pendingOpening?.itemIds : undefined;
  const own = useMemo(() => [...player.drops].sort((a, b) => b.time - a.time).flatMap(drop => {
    const skin = skinById.get(drop.skinId);
    return skin && (skin.kind ?? 'skin') === 'skin' && !hiddenIds?.includes(drop.uid)
      ? [{ key: drop.uid, skin, own: true }] : [];
  }), [player.drops, hiddenIds]);
  const [entries, setEntries] = useState(() => seedFeed(own));
  const [focused, setFocused] = useState<FocusedSlot | null>(null);
  const [slots, setSlots] = useState(8);
  const [compact, setCompact] = useState(() => matchMedia('(max-width: 850px)').matches);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawer = useRef<HTMLDialogElement>(null);
  const rail = useRef<HTMLElement>(null);
  const feedWindow = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const sequence = useRef(0);
  const seen = useRef(new Set(own.map(entry => entry.key)));
  const lastHead = useRef(entries[0].key);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const fresh = own.filter(entry => !seen.current.has(entry.key));
    seen.current = new Set(own.map(entry => entry.key));
    if (fresh.length) setEntries(current => [...fresh, ...current].slice(0, bufferSize));
  }, [own]);

  useEffect(() => {
    const media = matchMedia('(max-width: 850px)');
    const resize = () => {
      setCompact(media.matches);
      setFocused(null);
      if (!media.matches) setDrawerOpen(false);
    };
    media.addEventListener('change', resize);
    return () => media.removeEventListener('change', resize);
  }, []);

  useLayoutEffect(() => {
    const panel = drawer.current;
    if (!panel || !drawerOpen) return;
    panel.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
      if (panel.open) panel.close();
    };
  }, [compact, drawerOpen]);

  useLayoutEffect(() => {
    const panel = rail.current;
    if (!panel) return;
    let frame = 0;
    let previousTop: number | undefined;
    const fitHeight = () => {
      frame = 0;
      const top = panel.getBoundingClientRect().top;
      if (top !== previousTop) {
        previousTop = top;
        panel.style.setProperty('--rail-viewport-top', top + 'px');
      }
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(fitHeight);
    };
    fitHeight();
    const observer = new ResizeObserver(schedule);
    if (panel.parentElement) observer.observe(panel.parentElement);
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, [compact]);

  useLayoutEffect(() => {
    const node = feedWindow.current;
    if (!node || (compact && !drawerOpen)) return;
    const slotHeight = compact ? 70 : 72;
    const fit = () => setSlots(Math.max(2, Math.min(bufferSize - 1, Math.floor(node.clientHeight / slotHeight))));
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(node);
    return () => observer.disconnect();
  }, [compact, drawerOpen]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      const key = 'sample-' + sequence.current++;
      const roll = Math.random(), pick = Math.random();
      setEntries(current => [{ key, skin: sample(current, roll, pick) }, ...current].slice(0, bufferSize));
    }, 500);
    return () => window.clearInterval(timer);
  }, []);

  useLayoutEffect(() => {
    const previous = lastHead.current;
    lastHead.current = entries[0].key;
    const node = track.current;
    if (!node || !node.clientHeight || focused || reducedMotion || entries[1]?.key !== previous) return;
    const [first, second] = node.children;
    const stride = second.getBoundingClientRect().top - first.getBoundingClientRect().top;
    const motion = node.animate([{ transform: `translateY(${-stride}px)` }, { transform: 'none' }],
      { duration: 240, easing: 'cubic-bezier(.25,.7,.25,1)' });
    return () => motion.cancel();
  }, [entries, focused, reducedMotion]);

  const closeDrawer = () => drawer.current?.close();
  const visit: Navigate = (route, id) => { if (compact) closeDrawer(); go(route, id); };
  // Keep the focused button in its slot, even after it leaves the rolling buffer.
  const visible = focused ? entries.filter(entry => entry.key !== focused.entry.key).slice(0, slots) : entries.slice(0, slots + 1);
  if (focused) visible.splice(Math.min(focused.index, slots - 1), 0, focused.entry);
  const panel = <div ref={feedWindow} className="drop-window">
    <div ref={track} className="drop-track" aria-live="off" style={{ '--slots': slots } as CSSProperties}
      onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) setFocused(null); }}>
      {visible.map((entry, index) => <Slot key={entry.key} entry={entry} hidden={index >= slots} go={visit}
        onFocus={() => setFocused({ entry, index })}/>)}
    </div>
  </div>;
  return compact ? <>
    <button type="button" className={'drop-launcher rarity-' + entries[0].skin.rarity} aria-label="Открыть ленту дропа" aria-haspopup="dialog"
      aria-controls="drop-drawer" aria-expanded={drawerOpen} onClick={() => setDrawerOpen(true)}>
      <img src={entries[0].skin.image} alt="" draggable="false"/>
    </button>
    <dialog id="drop-drawer" ref={drawer} className="drop-drawer" aria-label="Лайв-лента скинов"
      onClose={() => { setDrawerOpen(false); setFocused(null); }}
      onClick={e => {
        if (e.target !== e.currentTarget) return;
        const bounds = e.currentTarget.getBoundingClientRect();
        if (e.clientX < bounds.left || e.clientX > bounds.right || e.clientY < bounds.top || e.clientY > bounds.bottom) closeDrawer();
      }}>
      {drawerOpen && <>
        <button type="button" className="drop-close" onClick={closeDrawer} aria-label="Закрыть ленту дропа" autoFocus><X size={19} aria-hidden="true"/></button>
        {panel}
      </>}
    </dialog>
  </> : <aside ref={rail} className="drop-rail" aria-label="Лайв-лента скинов">{panel}</aside>;
}
