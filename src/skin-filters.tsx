import { ChevronDown, Search } from 'lucide-react';
import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { collectibleRarityNames, rarityNames } from './components';
import type { ItemKind, Skin } from './types';

type KindFilter = ItemKind | 'all';
const kinds: { id: KindFilter; label: string }[] = [
  { id: 'all', label: 'Все' }, { id: 'skin', label: 'Скины' },
  { id: 'sticker', label: 'Наклейки' }, { id: 'pin', label: 'Пины' },
];
const rarityColors = { blue: 'Синяя', purple: 'Фиолетовая', pink: 'Розовая', red: 'Красная', gold: 'Золотая' };
export const defaultFilters = { kind: 'all' as KindFilter, query: '', weapon: '', rarity: '', sort: 'default' };
export type SkinFilter = typeof defaultFilters;
const searchText = (value: string) => value.toLowerCase().replace(/[|\s]+/g, ' ').trim();
export function matchesSkin(skin: Skin, filters: SkinFilter) {
  if (filters.kind !== 'all' && filters.kind !== (skin.kind ?? 'skin')) return false;
  if ((filters.weapon && skin.weapon !== filters.weapon) || (filters.rarity && skin.rarity !== filters.rarity)) return false;
  const query = searchText(filters.query);
  return !query || searchText(`${skin.weapon} ${skin.name}`).includes(query) || searchText(skin.marketHashName ?? '').includes(query);
}

export function SkinFilters({ filters, onChange, items, inventory = false, children }: {
  filters: SkinFilter;
  onChange: (values: SkinFilter) => void;
  items: Skin[];
  inventory?: boolean;
  children?: ReactNode;
}) {
  const { counts, weapons } = useMemo(() => {
    const counts = { all: items.length, skin: 0, sticker: 0, pin: 0 };
    const weapons = new Set<string>();
    for (const item of items) {
      const kind = item.kind ?? 'skin';
      counts[kind]++;
      if (kind === 'skin') weapons.add(item.weapon);
    }
    return { counts, weapons: [...weapons].sort((a, b) => a.localeCompare(b, 'ru')) };
  }, [items]);
  const collectibles = filters.kind === 'pin' || filters.kind === 'sticker';
  const grades = filters.kind === 'all' ? rarityColors : collectibles ? collectibleRarityNames : rarityNames;
  const change = (key: 'query' | 'weapon' | 'rarity' | 'sort', value: string) => onChange({ ...filters, [key]: value });
  return <>
    <div className="armory-kinds" role="group" aria-label="Тип предмета">{kinds.map(kind =>
      <button key={kind.id} aria-pressed={kind.id === filters.kind} onClick={() => onChange({ ...filters, kind: kind.id, weapon: '' })}>
        {kind.label} <span>{counts[kind.id]}</span>
      </button>
    )}</div>
    <div className="armory-tools">
      <label className="armory-search"><Search size={16}/><input type="search" placeholder="Найти предмет" aria-label={inventory ? 'Поиск по инвентарю' : 'Поиск по каталогу предметов'} value={filters.query} onChange={e => change('query', e.target.value)}/></label>
      {!collectibles && <label className="armory-select"><select aria-label="Оружие" value={filters.weapon} onChange={e => change('weapon', e.target.value)}><option value="">Любое оружие</option>{weapons.map(w => <option key={w}>{w}</option>)}</select><ChevronDown size={14}/></label>}
      <label className="armory-select"><select aria-label="Редкость" value={filters.rarity} onChange={e => change('rarity', e.target.value)}><option value="">Любая редкость</option>{Object.entries(grades).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select><ChevronDown size={14}/></label>
      <label className="armory-select"><select aria-label={inventory ? 'Сортировка инвентаря' : 'Сортировка предметов'} value={filters.sort} onChange={e => change('sort', e.target.value)}><option value="default">{inventory ? 'Сначала новые' : 'По названию'}</option><option value="asc">Сначала дешевле</option><option value="desc">Сначала дороже</option></select><ChevronDown size={14}/></label>
      {children}
    </div>
  </>;
}
