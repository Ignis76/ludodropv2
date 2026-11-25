import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpCircle, Check, ChevronLeft, ChevronRight, Coins, X } from 'lucide-react';
import type { Navigate } from './App';
import { Coin, Empty, SkinCard, money } from './components';
import { SkinFilters, defaultFilters, matchesSkin } from './skin-filters';
import { sellItems } from './engine';
import { sound } from './audio';
import { skinById, skins, useStore } from './store';
import './inventory.css';

export { CasePage } from './case-opening';

const seenKey = 'ludodrop.inventory.seenAt';
const minimumPageSize = 12;
function lastVisit() {
  try { return Number(localStorage.getItem(seenKey)) || 0; }
  catch { return 0; }
}

function InventoryPagination({ page, pageSize, count, bottom = false, onChange }: {
  page: number; pageSize: number; count: number; bottom?: boolean; onChange: (page: number, fromBottom: boolean) => void;
}) {
  const pages = Math.ceil(count / pageSize);
  if (pages < 2) return null;
  const start = Math.max(2, Math.min(page - 1, pages - 3));
  const numbers = [1];
  for (let n = start; n <= Math.min(start + 2, pages - 1); n++) numbers.push(n);
  numbers.push(pages);
  return <nav className={'inventory-pagination inventory-pagination-' + (bottom ? 'bottom' : 'top')}
    aria-label={bottom ? 'Страницы инвентаря внизу' : 'Страницы инвентаря'}>
    <span className="inventory-range" aria-live={bottom ? 'off' : 'polite'}>{(page - 1) * pageSize + 1}–{Math.min(count, page * pageSize)} из {count}</span>
    <div className="inventory-page-controls">
      <button className="inventory-page-arrow" aria-label="Предыдущая страница" disabled={page === 1} onClick={() => onChange(page - 1, bottom)}><ChevronLeft size={16}/></button>
      {numbers.map((n, i) => <Fragment key={n}>
        {i > 0 && n - numbers[i - 1] > 1 && <span aria-hidden="true" className="inventory-page-gap">…</span>}
        <button aria-label={'Страница ' + n} aria-current={n === page ? 'page' : undefined} data-compact={pages <= 4 || n === 1 || n === page || n === pages}
          onClick={() => onChange(n, bottom)}>{n}</button>
      </Fragment>)}
      <button className="inventory-page-arrow" aria-label="Следующая страница" disabled={page === pages} onClick={() => onChange(page + 1, bottom)}><ChevronRight size={16}/></button>
    </div>
  </nav>;
}

export function ProfileInventory({ go }: { go: Navigate }) {
  const { player, update, toast } = useStore();
  const [filters, setFilters] = useState(defaultFilters);
  const [selected, setSelected] = useState<string[]>([]);
  const selectedIds = useMemo(() => new Set(selected), [selected]);
  const [pageSize, setPageSize] = useState(minimumPageSize);
  // Keep the same item in view while the grid gains or loses columns.
  const [anchorIndex, setAnchorIndex] = useState(0);
  const grid = useRef<HTMLDivElement>(null);
  const returnToGrid = useRef(false);
  const [seenAt] = useState(lastVisit);
  const owned = useMemo(() => player.inventory.map(item => ({ item, skin: skinById.get(item.skinId)! })), [player.inventory]);
  const ownedSkins = useMemo(() => owned.map(entry => entry.skin), [owned]);
  const items = useMemo(() => owned.filter(({ skin }) => matchesSkin(skin, filters))
    .sort((a, b) => filters.sort === 'asc' ? a.skin.price - b.skin.price : filters.sort === 'desc' ? b.skin.price - a.skin.price : b.item.obtained - a.item.obtained), [owned, filters]);
  const hasItems = items.length > 0;
  const pages = Math.max(1, Math.ceil(items.length / pageSize));
  const page = Math.min(pages, Math.floor(anchorIndex / pageSize) + 1);
  if (anchorIndex > Math.max(0, items.length - 1)) setAnchorIndex((page - 1) * pageSize);
  const pageItems = items.slice((page - 1) * pageSize, page * pageSize);
  const selection = owned.filter(({ item }) => selectedIds.has(item.uid));
  const selectedValue = selection.reduce((sum, { skin }) => sum + skin.price, 0);
  const pageSelected = pageItems.length > 0 && pageItems.every(({ item }) => selectedIds.has(item.uid));
  const firstAction = player.history.at(-1)?.time ?? Infinity;
  const highlightAfter = Math.max(seenAt, firstAction - 1);

  useEffect(() => {
    try { localStorage.setItem(seenKey, String(Date.now())); } catch { /* Keep inventory usable without persistent storage. */ }
  }, [owned]);

  useLayoutEffect(() => {
    const element = grid.current;
    if (!element) return;
    const fitRows = () => {
      const tracks = getComputedStyle(element).gridTemplateColumns;
      if (!tracks || tracks === 'none') return;
      const columns = tracks.split(/\s+/).length;
      setPageSize(columns * Math.ceil(minimumPageSize / columns));
    };
    fitRows();
    const observer = new ResizeObserver(fitRows);
    observer.observe(element);
    return () => observer.disconnect();
  }, [hasItems]);

  useLayoutEffect(() => {
    if (returnToGrid.current) {
      returnToGrid.current = false;
      grid.current?.focus({ preventScroll: true });
      grid.current?.scrollIntoView({ block: 'start', behavior: 'instant' });
    }
  }, [page]);

  function changePage(next: number, fromBottom: boolean) {
    if (next === page) return;
    returnToGrid.current = fromBottom;
    setAnchorIndex((next - 1) * pageSize);
  }
  function clearFilters() {
    setFilters(defaultFilters); setSelected([]); setAnchorIndex(0);
  }
  function togglePage() {
    const ids = pageItems.map(({ item }) => item.uid);
    setSelected(pageSelected ? selected.filter(id => !ids.includes(id)) : [...selected, ...ids.filter(id => !selectedIds.has(id))]);
  }
  function toggle(id: string) {
    setSelected(previous => previous.includes(id) ? previous.filter(uid => uid !== id) : [...previous, id]);
  }
  function sell() {
    if (!selection.length) return;
    if (update(p => sellItems(p, selection.map(entry => entry.item.uid), skins))) {
      sound('gem'); setSelected([]);
      // A sale can remove the last matching weapon from the list of available filters.
      if (filters.weapon && !owned.some(entry => entry.skin.weapon === filters.weapon && !selectedIds.has(entry.item.uid))) {
        setFilters({ ...filters, weapon: '' }); setAnchorIndex(0);
      }
      toast(`Продажа завершена · +${money(selectedValue)}`);
    }
  }

  return <section className="armory-page dossier-panel profile-inventory" id="profile-inventory" aria-label="Инвентарь" tabIndex={-1}>
    <div className="armory-workspace"><aside className="armory-index" aria-label="Фильтры инвентаря">
    <SkinFilters filters={filters} onChange={next => {
      if (next.kind !== filters.kind || next.query !== filters.query || next.weapon !== filters.weapon || next.rarity !== filters.rarity) setSelected([]);
      setFilters(next); setAnchorIndex(0);
    }} items={ownedSkins} inventory>
      <button className="armory-select-all" disabled={!items.length} onClick={togglePage}><Check size={15}/>{pages === 1 ? (pageSelected ? 'Снять выбор' : 'Выбрать все') : (pageSelected ? 'Снять выбор со страницы' : 'Выбрать страницу')}</button>
      {pages > 1 && pageSelected && selection.length < items.length && <button className="armory-select-all" onClick={() => setSelected(items.map(({ item }) => item.uid))}>Выбрать все {items.length}</button>}
    </SkinFilters></aside>
    <div className="armory-results">
    <InventoryPagination page={page} pageSize={pageSize} count={items.length} onChange={changePage}/>
    {items.length ? <div className="skin-grid armory-grid" id="inventory-items" role="group" aria-label={'Предметы инвентаря, страница ' + page} tabIndex={-1} ref={grid}>{pageItems.map(({ item, skin }) =>
      <div key={item.uid} data-item-uid={item.uid} className={item.obtained > highlightAfter ? 'armory-fresh' : undefined}>
        <SkinCard skin={skin} selected={selectedIds.has(item.uid)} onClick={() => toggle(item.uid)}/>
      </div>)}</div> : <Empty title={owned.length ? 'Ничего не найдено' : 'Инвентарь пуст'} text={owned.length ? 'Попробуй изменить поиск или фильтры.' : 'Открой кейс, чтобы получить предмет.'}>
      <button className="secondary-button" onClick={owned.length ? clearFilters : () => go('cases')}>{owned.length ? 'Сбросить фильтры' : 'К кейсам'}</button>
    </Empty>}
    <InventoryPagination page={page} pageSize={pageSize} count={items.length} onChange={changePage} bottom/>
    {selection.length > 0 && <aside className="armory-actions" aria-label="Действия с выбранными предметами">
      <span className="armory-summary" aria-live="polite">Выбрано <b>{selection.length}</b></span>
      <button className="armory-clear" onClick={() => setSelected([])} aria-label="Снять выбор предметов" title="Снять выбор"><X size={17}/></button>
      {selection.length === 1 && <button className="secondary-button armory-upgrade" onClick={() => go('upgrade', selection[0].item.uid)}><ArrowUpCircle size={16}/>В апгрейд</button>}
      <button className="primary-button armory-sale" onClick={sell}><Coins size={16}/>Продать за <Coin value={selectedValue}/></button>
    </aside>}
    </div></div>
  </section>;
}


