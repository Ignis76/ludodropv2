import { useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
import { Coin, itemRarityName, money } from './components';
import { frameContractArt } from './contract-art';
import { skinById } from './store';
import type { Item, Rarity, Skin } from './types';
import './contract-loadout.css';

type Props = {
  stock: Item[];
  selected: string[];
  onToggle: (item: Item) => void;
  disabled?: boolean;
};

type Entry = { item: Item; skin: Skin };
type Order = 'price-desc' | 'price-asc' | 'newest' | 'rarity' | 'name';
const rarityOrder: Record<Rarity, number> = { blue: 0, purple: 1, pink: 2, red: 3, gold: 4 };
const names = new Intl.Collator('ru', { sensitivity: 'base', numeric: true });
const plurals = new Intl.PluralRules('ru');
const nouns: Record<string, string> = { one: 'предмет', few: 'предмета', many: 'предметов' };
const pageSize = 6;

function compareItems(order: Order, a: Entry, b: Entry) {
  let difference = 0;
  if (order === 'price-desc') difference = b.skin.price - a.skin.price;
  if (order === 'price-asc') difference = a.skin.price - b.skin.price;
  if (order === 'newest') difference = b.item.obtained - a.item.obtained;
  if (order === 'rarity') difference = rarityOrder[b.skin.rarity] - rarityOrder[a.skin.rarity];
  return difference || names.compare(a.skin.weapon, b.skin.weapon) || names.compare(a.skin.name, b.skin.name);
}

function StockItem({ entry, checked, disabled, onToggle }: {
  entry: Entry; checked: boolean; disabled: boolean; onToggle: Props['onToggle'];
}) {
  const { skin, item } = entry;
  const name = skin.weapon + ' | ' + skin.name;
  const rarity = itemRarityName(skin);
  const detail = name + ' · ' + rarity + ' · ' + money(skin.price) + ' кр.';
  return <button type="button" className={'trade-stock-item rarity-' + skin.rarity} aria-pressed={checked}
    aria-label={(checked ? 'Убрать из контракта: ' : 'Добавить в контракт: ') + detail}
    title={detail} disabled={disabled} onClick={() => onToggle(item)}>
    <span className="trade-stock-picture"><img src={skin.image} onLoad={frameContractArt} alt="" draggable="false"/></span>
    <span className="trade-stock-check" aria-hidden="true"><Check size={13} strokeWidth={3}/></span>
    <span className="trade-stock-info">
      <span className="trade-stock-name"><b>{skin.weapon}</b><span>{skin.name}</span></span>
      <span className="trade-stock-details">
        <span className="trade-stock-rarity">{rarity}</span>
        <Coin value={skin.price}/>
      </span>
    </span>
  </button>;
}

export function ContractLoadout({ stock, selected, onToggle, disabled = false }: Props) {
  const [order, setOrder] = useState<Order>('price-desc');
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const entries = useMemo(() => stock.flatMap(item => {
    const skin = skinById.get(item.skinId);
    return skin ? [{ item, skin }] : [];
  }), [stock]);
  const matches = useMemo(() => {
    const terms = query.trim().toLocaleLowerCase('ru').split(/\s+/).filter(Boolean);
    return entries.filter(({ skin }) => {
      const text = (skin.weapon + ' ' + skin.name).toLocaleLowerCase('ru');
      return terms.every(term => text.includes(term));
    }).sort((a, b) => compareItems(order, a, b));
  }, [entries, query, order]);
  const pages = Math.ceil(matches.length / pageSize);
  const current = Math.max(0, Math.min(page, pages - 1));
  const visible = matches.slice(current * pageSize, (current + 1) * pageSize);
  const firstPage = Math.min(Math.max(0, current - 1), Math.max(0, pages - 4));
  function resetSearch() {
    setQuery('');
    setPage(0);
    input.current?.focus();
  }

  return <aside className="trade-stock" aria-labelledby="trade-stock-title">
    <header className="trade-stock-heading">
      <h2 id="trade-stock-title">Инвентарь</h2>
      <span aria-live="polite">{matches.length} {nouns[plurals.select(matches.length)] ?? 'предмета'}</span>
    </header>
    <div className="trade-stock-tools">
      <label className="trade-stock-search">
        <Search size={15} aria-hidden="true"/>
        <input type="search" aria-label="Поиск по инвентарю" placeholder="Поиск по инвентарю…" value={query}
          ref={input} disabled={disabled} onChange={event => { setQuery(event.target.value); setPage(0); }}
          onKeyDown={event => { if (event.key === 'Escape') resetSearch(); }}/>
      </label>
      {query && <button type="button" className="trade-stock-reset" aria-label="Сбросить поиск" disabled={disabled} onClick={resetSearch}><X size={13}/></button>}
      <label className="trade-stock-sort">
        <select aria-label="Сортировка предметов" disabled={disabled} value={order}
          onChange={event => { setOrder(event.target.value as Order); setPage(0); }}>
          <option value="price-desc">По цене ↓</option>
          <option value="price-asc">По цене ↑</option>
          <option value="newest">По дате</option>
          <option value="rarity">По редкости</option>
          <option value="name">По названию</option>
        </select>
        <ChevronDown size={13} aria-hidden="true"/>
      </label>
    </div>
    {visible.length > 0 ? <div className="trade-stock-grid" key={visible.map(entry => entry.item.uid).join('|')} role="group" aria-label="Предметы для обмена">
      {visible.map(entry => {
        const checked = selected.includes(entry.item.uid);
        return <StockItem key={entry.item.uid} entry={entry} checked={checked}
          disabled={disabled || (!checked && selected.length >= 10)} onToggle={onToggle}/>;
      })}
    </div> : <div className="trade-stock-empty">
      <p>{entries.length ? 'Предметы не найдены' : 'Инвентарь пуст'}</p>
      {entries.length ? <button type="button" onClick={resetSearch} disabled={disabled}>Сбросить поиск</button> : <a href="#cases">Открыть кейс</a>}
    </div>}
    {pages > 1 && <nav className="trade-stock-pages" aria-label="Страницы предметов">
      <button type="button" disabled={disabled || current === 0} aria-label="Предыдущая страница" onClick={() => setPage(current - 1)}><ChevronLeft size={16}/></button>
      {Array.from({ length: Math.min(pages, 4) }, (_, index) => {
        const target = firstPage + index;
        return <button key={target} type="button" disabled={disabled}
          aria-label={'Страница ' + (target + 1) + ' из ' + pages} aria-current={target === current ? 'page' : undefined}
          onClick={() => setPage(target)}>{target + 1}</button>;
      })}
      <button type="button" disabled={disabled || current >= pages - 1} aria-label="Следующая страница" onClick={() => setPage(current + 1)}><ChevronRight size={16}/></button>
    </nav>}
  </aside>;
}
