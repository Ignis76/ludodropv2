import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Drop, HistoryEntry, Player, Skin } from './types';
import assets from './data/assets.json';
import { initialPlayer, settleSkinCrash } from './engine';
import { setAudioEnabled } from './audio';
import { readIdentity } from './player-identity';
import { advanceFlight, nextFlightEvent, settleWheel } from './rounds';

export const skins = assets.skins as Skin[];
export const skinById = new Map(skins.map(s => [s.id, s]));
export const STORAGE_KEY = 'ludodrop.player.v1';
const validTime = (time: number) => Number.isFinite(time) && Number.isFinite(new Date(time).getTime());
function readSave() {
  try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
}
function persistInitial(player: Player) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(player)); } catch { /* Local play remains available when storage is disabled. */ }
  return player;
}
function load(): Player {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (saved?.version === 1 && Number.isFinite(saved.balance) && saved.balance >= 0 && Array.isArray(saved.inventory) && Array.isArray(saved.history) && Array.isArray(saved.favorites) && Number.isFinite(saved.opened)) {
      delete saved.lastBonus;
      const seen = new Set<string>();
      saved.inventory = saved.inventory.filter((i: { uid: string; skinId: string }) => { if (!i || typeof i.uid !== 'string' || seen.has(i.uid) || !skinById.has(i.skinId)) return false; seen.add(i.uid); return true; });
      saved.drops = Array.isArray(saved.drops) ? saved.drops.filter((d: Drop) => d && typeof d.uid === 'string' && skinById.has(d.skinId) && typeof d.caseName === 'string' && validTime(d.time)).slice(0, 30) : [];
      saved.history = saved.history.filter((entry: HistoryEntry) => entry && typeof entry.id === 'string' && typeof entry.title === 'string' && Number.isFinite(entry.amount) && validTime(entry.time)).slice(0, 80);
      // Older saves only retained the stake. New rounds retain their original flight clock.
      const profile = readIdentity(saved.profile);
      const identified = profile === saved.profile ? saved : { ...saved, profile };
      const migrated = identified.crashStake && !identified.activeCrash ? settleSkinCrash(identified, identified.crashStake.id, 0, skins).state : identified;
      const recovered = advanceFlight(settleWheel(migrated), skins);
      return recovered === saved ? saved : persistInitial(recovered);
    }
  } catch { /* A damaged or unavailable save falls back to a fresh local profile. */ }
  return persistInitial(initialPlayer(skins));
}
type Store = {
  player: Player;
  update: (fn: (current: Player) => Player) => boolean;
  walletUpdate: (fn: (current: Player) => Player) => Promise<boolean>;
  busy: boolean;
  setBusy: (busy: boolean) => void;
  toast: (text: string, kind?: 'success' | 'error') => () => void;
};
const Context = createContext<Store>(null!);
export const useStore = () => useContext(Context);
export function StoreProvider({ children }: { children: ReactNode }) {
  const knownSave = useRef<string | null>(null);
  const [player, setPlayer] = useState(() => {
    const initial = load();
    knownSave.current = readSave();
    return initial;
  });
  const current = useRef(player);
  const [busy, setBusy] = useState(false);
  const [notification, setNotification] = useState<{ text: string; kind: string; key: number } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  setAudioEnabled(player.sound);
  const toast = (text: string, kind = 'success') => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    const notice = { text, kind, key: Date.now() };
    const dismiss = () => setNotification(current => current === notice ? null : current);
    setNotification(notice);
    toastTimer.current = setTimeout(dismiss, 4200);
    return dismiss;
  };
  const refresh = useCallback(() => {
    const saved = readSave();
    if (!saved || saved === knownSave.current) return current.current;
    const latest = load();
    knownSave.current = readSave();
    current.current = latest;
    setPlayer(latest);
    return latest;
  }, []);
  useEffect(() => {
    const changed = (e: StorageEvent) => { if (e.key === STORAGE_KEY) refresh(); };
    window.addEventListener('storage', changed);
    return () => window.removeEventListener('storage', changed);
  }, [refresh]);
  const update = (fn: (current: Player) => Player, persistPromo = false) => {
    try {
      const before = refresh();
      const next = fn(before);
      if (next === before) return true;
      const serialized = JSON.stringify(next);
      try {
        localStorage.setItem(STORAGE_KEY, serialized);
        knownSave.current = serialized;
      } catch {
        if (persistPromo && next.office20 !== before.office20) throw new Error('Не удалось сохранить бонус. Попробуй ещё раз.');
        toast('Хранилище браузера недоступно. Прогресс сохранится только до закрытия страницы', 'error');
      }
      current.current = next;
      setPlayer(next);
      return true;
    } catch (error) { toast(error instanceof Error ? error.message : 'Не удалось выполнить действие', 'error'); return false; }
  };
  const walletUpdate = async (fn: (current: Player) => Player) => {
    const apply = () => update(fn, true);
    return navigator.locks ? navigator.locks.request(STORAGE_KEY + '.wallet', apply) : apply();
  };
  useEffect(() => {
    const eventAt = Math.min(player.rouletteBet?.settlesAt ?? Infinity, player.activeCrash ? nextFlightEvent(player.activeCrash) : Infinity);
    if (!Number.isFinite(eventAt)) return;
    const settle = () => {
      if (Date.now() >= eventAt) update(p => advanceFlight(settleWheel(p), skins));
    };
    const timer = setTimeout(settle, Math.max(0, eventAt - Date.now()) + 10);
    window.addEventListener('pageshow', settle);
    document.addEventListener('visibilitychange', settle);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('pageshow', settle);
      document.removeEventListener('visibilitychange', settle);
    };
  }, [player.rouletteBet, player.activeCrash]);
  return <Context.Provider value={{ player, update, walletUpdate, busy, setBusy, toast }}>{children}{notification && <div className={`toast ${notification.kind}`} role="status" key={notification.key}><span>{notification.kind === 'error' ? '!' : '✓'}</span>{notification.text}<button aria-label="Закрыть уведомление" onClick={() => setNotification(null)}>×</button></div>}</Context.Provider>;
}
