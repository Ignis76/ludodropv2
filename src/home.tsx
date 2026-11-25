import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ContainerCard } from './container-card';
import { useContainerFavorites } from './use-container-favorites';
import { Gem, LayoutGrid, Medal, Package, PackageOpen, Sticker, Wrench, type LucideIcon } from 'lucide-react';
import { ArrowRight, ChevronDown, Heart, Search, SlidersHorizontal, X } from 'lucide-react';
import type { Navigate } from './App';
import type { Case, ContainerKind } from './types';
import { cases } from './data/cases';
import { workshopCases } from './data/workshop-cases';
import { Coin, Empty, money } from './components';
import { skins, useStore } from './store';
import { casePool } from './engine';
import { inspectionModel } from './inspection-model';
import { OFFICE_PROMO_CODE, officePromoStatus } from './wallet-offer';

const featureArt = (name: string) => '/assets/cases/features/' + name + '.webp';
const frontRow = new Set([
  'case-broken-fang', 'night-port', 'foundry', 'neon', 'pelagic', 'original-asiimov', 'relay',
  'capsule-espionage', 'pins-series-2', 'original-contraband', 'polar-night',
  ...workshopCases.map(c => c.id),
  'case-cs20', 'capsule-chicken',
  'case-fracture', 'capsule-cs20', 'pins-series-1', 'capsule-poorly-drawn', 'capsule-skill-groups',
  'starter', 'pins-series-3', 'capsule-boardroom', 'redline', 'ak', 'arctic', 'sunset',
]);
const orderedCases = [...Array.from(frontRow).flatMap(id => cases.filter(c => c.id === id)), ...cases.filter(c => !frontRow.has(c.id))];
const workshopIds = new Set(cases.filter(item =>
  workshopCases.some(edition => edition.id === item.id) || item.image.startsWith('/assets/cases/collections/')
).map(item => item.id));
const categoryNames = { budget: 'Бюджетный кейс', collection: 'Коллекционный кейс', premium: 'Премиум-кейс' };
const collections = [
  { value: 'all', label: 'Все подборки' }, { value: 'collection', label: 'Коллекции' },
  { value: 'budget', label: 'Бюджетные' }, { value: 'premium', label: 'Премиум' },
];
type Shelf = 'premium' | 'capsule' | 'pin-pack' | 'workshop' | 'map' | 'special' | 'collection' | 'budget';
type Department = 'all' | 'favorites' | 'workshop' | 'premium' | 'special' | ContainerKind;
const departments: { value: Department; label: string; icon: LucideIcon }[] = [
  { value: 'all', label: 'Все', icon: LayoutGrid },
  { value: 'case', label: 'Кейсы', icon: Package },
  { value: 'premium', label: 'Дорогие', icon: Gem },
  { value: 'capsule', label: 'Наклейки', icon: Sticker },
  { value: 'pin-pack', label: 'Пины', icon: Medal },
  { value: 'special', label: 'Особые', icon: PackageOpen },
  { value: 'workshop', label: 'Мастерская', icon: Wrench },
];
const caseUnits: [string, string, string] = ['кейс', 'кейса', 'кейсов'];
const shelves: { id: Shelf; title: string; units: [string, string, string]; keywords: string }[] = [
  { id: 'workshop', title: 'Мастерская LudoDrop', units: caseUnits, keywords: 'мастерская авторские оружейные кейсы' },
  { id: 'premium', title: 'Дорогие кейсы', units: caseUnits, keywords: 'премиум дорогие оружейные кейсы' },
  { id: 'capsule', title: 'Капсулы с наклейками', units: ['капсула','капсулы','капсул'], keywords: 'капсулы наклейки стикеры' },
  { id: 'pin-pack', title: 'Коллекционные пины', units: ['пакет','пакета','пакетов'], keywords: 'пакеты пины значки' },
  { id: 'map', title: 'Коллекции карт CS2', units: caseUnits, keywords: 'карты сувенирные оружейные кейсы' },
  { id: 'special', title: 'Особые контейнеры', units: ['контейнер','контейнера','контейнеров'], keywords: 'особые контейнеры' },
  { id: 'collection', title: 'Тематические кейсы', units: caseUnits, keywords: 'коллекции тематические оружейные кейсы' },
  { id: 'budget', title: 'Бюджетные кейсы', units: caseUnits, keywords: 'дешевые дешёвые оружейные кейсы' },
];
const specialContainerIds = new Set(['original-contraband', 'arcade', 'headshot']);
function shelfFor(item: Case): Shelf {
  if (item.containerKind === 'capsule' || item.containerKind === 'pin-pack') return item.containerKind;
  if (specialContainerIds.has(item.id)) return 'special';
  if (item.price >= 1500) return 'premium';
  if (workshopIds.has(item.id)) return 'workshop';
  if (inspectionModel(item).kind === 'souvenir') return 'map';
  return item.category === 'budget' ? 'budget' : 'collection';
}
const catalogShelves = shelves.map(shelf => ({ ...shelf, items: orderedCases.filter(item => shelfFor(item) === shelf.id) }));
const collectibleContents = new Map(cases
  .filter(item => item.containerKind === 'capsule' || item.containerKind === 'pin-pack')
  .map(item => [item.id, casePool(item, skins).sort((a, b) => b.price - a.price)]));

const plural = new Intl.PluralRules('ru-RU');
function countNoun(n: number, forms: [string, string, string]) {
  const form = plural.select(n);
  return n + ' ' + forms[form === 'one' ? 0 : form === 'few' ? 1 : 2];
}
function CreditPromo({ onPromo }: { onPromo: () => void }) {
  const { player } = useStore();
  const status = officePromoStatus(player);
  const redeemed = status === 'redeemed';
  return <section className="credit-promo" data-status={status} aria-labelledby="credit-promo-title">
    <img className="credit-promo-art" src={featureArt('office-promo')} alt="" draggable={false} fetchPriority="high"/>
    <div className="credit-promo-copy">
      <h2 id="credit-promo-title">{redeemed ? 'Бонус получен' : <><strong>+20%</strong>{' '}к пополнению</>}</h2>
      <p>{redeemed ? 'Виртуальные кредиты уже зачислены на баланс.' : 'Один раз на профиль · Виртуальные кредиты'}</p>
      <div className="credit-promo-actions">
        <button type="button" onClick={onPromo}>
          {redeemed ? 'Открыть баланс' : status === 'active' ? 'Пополнить с бонусом' : 'Применить код'}
          <ArrowRight size={16} aria-hidden="true"/>
        </button>
        {status === 'available' && <span className="credit-promo-voucher">Промокод <code>{OFFICE_PROMO_CODE}</code></span>}
        {status === 'active' && <span className="credit-promo-applied">Код применён</span>}
      </div>
    </div>
  </section>;
}

function productLabel(item: Case) {
  if (item.id === 'original-contraband') return 'Тактическая сумка';
  if (workshopIds.has(item.id)) return 'Кейс мастерской';
  if (item.containerKind === 'capsule') return 'Капсула с наклейками';
  if (item.containerKind === 'pin-pack') return 'Пакет с пином';
  if (item.containerKind === 'case') return 'Оружейный кейс';
  if (item.id === 'arcade') return 'Терминал Genesis';
  if (item.id === 'headshot') return 'Упаковка X-Ray';
  return categoryNames[item.category];
}
function CatalogShelf({ shelf, items, children }: { shelf: typeof catalogShelves[number]; items: Case[]; children: ReactNode }) {
  const collectible = collectibleContents.has(items[0].id);
  const premium = shelf.id === 'premium';
  const prices = items.map(item => item.price);
  const minPrice = Math.min(...prices), maxPrice = Math.max(...prices);
  const rewards = items.flatMap(item => collectibleContents.get(item.id) ?? []);
  const rewardCount = new Set(rewards.map(skin => skin.id)).size;
  return <section className="locker-shelf" data-shelf={shelf.id} aria-labelledby={'shelf-' + shelf.id}>
    <header className="locker-shelf-cover">
      <div className="locker-shelf-intro"><h2 id={'shelf-' + shelf.id}>{shelf.title}</h2>
        {shelf.id === 'map' && <span className="locker-series-portrait" title="Гейб Ньюэлл на GDC 2010 · Official GDC"><img src={featureArt('gabe-gdc-2010')} width="30" height="30" loading="lazy" alt="Гейб Ньюэлл"/></span>}
        <p>{countNoun(items.length, shelf.units)}{' '}<i aria-hidden="true"/>{' '}{collectible ?
          countNoun(rewardCount, shelf.id === 'capsule' ? ['наклейка','наклейки','наклеек'] : ['пин','пина','пинов']) :
          <span>{minPrice === maxPrice ? <Coin value={minPrice}/> : premium ? <>{money(minPrice)} – <Coin value={maxPrice}/></> : <>от <Coin value={minPrice}/></>}</span>}</p></div>
    </header>
    <div className="locker-grid">{children}</div>
  </section>;
}
export function Home({ go, onPromo }: { go: Navigate; onPromo: () => void }) {
  const { favorites, toggleFavorite } = useContainerFavorites();
  const catalog = useRef<HTMLElement>(null);
  const filterMenu = useRef<HTMLDetailsElement>(null);
  const [department, setDepartment] = useState<Department>('all');
  const [category, setCategory] = useState('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('default');
  useEffect(() => {
    function closeOutside(event: PointerEvent) {
      const menu = filterMenu.current;
      if (menu?.open && !menu.contains(event.target as Node)) menu.open = false;
    }
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, []);
  const search = query.trim().toLocaleLowerCase('ru');
  const visibleShelves = catalogShelves.map(shelf => {
    const items = shelf.items.filter(item => {
      const inDepartment = department === 'all' || department === shelf.id
        || (department === 'case' && (item.containerKind ?? 'case') === 'case' && shelf.id !== 'special')
        || (department === 'favorites' && favorites.includes(item.id));
      const text = [item.name, item.subtitle, productLabel(item), shelf.title, shelf.keywords].join(' ').toLocaleLowerCase('ru');
      return inDepartment && (category === 'all' || item.category === category) && text.includes(search);
    });
    if (sort === 'asc') items.sort((a, b) => a.price - b.price);
    else if (sort === 'desc' || shelf.id === 'premium') items.sort((a, b) => b.price - a.price);
    return { shelf, items };
  }).filter(({ items }) => items.length > 0);
  const count = visibleShelves.reduce((total, { items }) => total + items.length, 0);
  function selectFamily(type: Department) {
    setDepartment(type); setCategory('all');
  }
  function reset() {
    selectFamily('all'); setQuery(''); setSort('default');
    catalog.current?.focus({ preventScroll: true });
  }
  return <div className="case-lobby arsenal-home">
    <CreditPromo onPromo={onPromo}/>
    <section className="locker-catalog" id="catalog" aria-labelledby="catalog-title" ref={catalog} tabIndex={-1}>
      <div className="locker-catalog-head">
        <div className="locker-catalog-title"><h1 id="catalog-title">Каталог кейсов</h1><span title="Количество контейнеров" aria-live="polite">{count}</span></div>
        <div className="locker-search"><Search size={16}/><input type="search" aria-label="Поиск контейнеров" placeholder="Поиск контейнеров" value={query}
          onKeyDown={e => { if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }}
          onChange={e => setQuery(e.target.value)}/>{query && <button onClick={() => setQuery('')} aria-label="Очистить поиск"><X size={14}/></button>}</div>
        <details className="locker-filter" ref={filterMenu} onKeyDown={e => {
          if (e.key === 'Escape') {
            e.currentTarget.open = false;
            e.currentTarget.querySelector('summary')?.focus();
          }
        }}><summary aria-label="Фильтры и сортировка" title="Фильтры и сортировка"><SlidersHorizontal size={16}/><span>Фильтры</span><ChevronDown size={13}/>{(category !== 'all' || sort !== 'default') && <i/>}</summary>
          <div className="locker-filter-menu"><label>Подборка<div><select value={category} onChange={e => setCategory(e.target.value)} aria-label="Подборка">{collections.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}</select><ChevronDown size={14}/></div></label>
            <label>Порядок внутри разделов<div><select value={sort} onChange={e => setSort(e.target.value)} aria-label="Сортировка контейнеров"><option value="default">По умолчанию</option><option value="asc">Сначала дешевле</option><option value="desc">Сначала дороже</option></select><ChevronDown size={14}/></div></label>
          </div>
        </details>
        <button type="button" className="locker-favorites" aria-label="Избранное" title="Избранное"
          aria-pressed={department === 'favorites'} onClick={() => selectFamily(department === 'favorites' ? 'all' : 'favorites')}>
          <Heart size={17} fill={department === 'favorites' ? 'currentColor' : 'none'}/><span>Избранное</span>
        </button>
        <div className="locker-tabs" role="group" aria-label="Тип контейнера">{departments.map(({value, label, icon: Icon}) =>
          <button type="button" key={value} aria-pressed={department === value} onClick={() => selectFamily(value)}>
            <Icon size={17} strokeWidth={1.65} aria-hidden="true"/><span>{label}</span>
          </button>)}</div>
      </div>
      {count ? <div className="locker-shelves">{visibleShelves.map(({ shelf, items }) =>
        <CatalogShelf key={shelf.id} shelf={shelf} items={items}>{items.map(c => <ContainerCard key={c.id} item={c} favorite={favorites.includes(c.id)} onToggleFavorite={() => toggleFavorite(c.id)} onOpen={() => go('case', c.id)}/>)}</CatalogShelf>
      )}</div> :
        <Empty title={department === 'favorites' && !favorites.length ? 'Избранное пока пусто' : 'Контейнеры не найдены'} text={department === 'favorites' && !favorites.length ? 'Нажми на сердце у кейса, капсулы или пакета.' : 'Попробуй другое название или сбрось фильтры.'}><button className="secondary-button" onClick={reset}>Все контейнеры</button></Empty>}
    </section>
  </div>;
}
