import { useMemo, useState } from 'react';
import { ArmoryMount } from './armory-mount';
import { ContainerCard } from './container-card';
import { useContainerFavorites } from './use-container-favorites';
import { Coin, Empty, Modal, SkinCard, itemRarityName } from './components';
import { cases } from './data/cases';
import { casePool, probabilities } from './engine';
import { SkinFilters, defaultFilters, matchesSkin } from './skin-filters';
import { skinById, skins } from './store';
import type { Navigate } from './App';
import type { Case, Skin } from './types';
import './inventory.css';

const pageSize = 48;
const coverSkin = skins.find(skin => skin.weapon === 'AWP' && skin.name === 'Neo-Noir') ?? skins[0];
function caseIndex() {
  const index = new Map<string, { item: Case; chance: number }[]>();
  for (const item of [...cases].sort((a, b) => a.price - b.price)) {
    const pool = casePool(item, skins);
    const odds = probabilities(pool, item.price, item.dropWeights);
    pool.forEach((s, i) => {
      const entry = { item, chance: odds[i] };
      const containing = index.get(s.id);
      if (containing) containing.push(entry);
      else index.set(s.id, [entry]);
    });
  }
  return index;
}

export function SkinLibrary({ go, initialSkinId }: { go: Navigate; initialSkinId?: string }) {
  const { favorites, toggleFavorite } = useContainerFavorites();
  const [filters, setFilters] = useState(defaultFilters);
  const [limit, setLimit] = useState(pageSize);
  const [chosen, setChosen] = useState<Skin | null>(() => initialSkinId ? skinById.get(initialSkinId) ?? null : null);
  const index = useMemo(caseIndex, []);
  const matches = useMemo(() => skins.filter(s => matchesSkin(s, filters)).sort((a, b) => {
    if (filters.sort === 'asc') return a.price - b.price;
    if (filters.sort === 'desc') return b.price - a.price;
    return a.name.localeCompare(b.name, 'ru') || a.weapon.localeCompare(b.weapon, 'ru');
  }), [filters]);
  const containing = chosen ? index.get(chosen.id) || [] : [];
  return <div className="armory-page skin-library">
    <header className="armory-title library-cover">
      <div className="armory-intro"><h1>Каталог предметов</h1><p>Оружие, наклейки и пины с ценами и шансами выпадения.</p></div>
      <ArmoryMount skin={coverSkin} onInspect={setChosen}/>
    </header>
    <div className="armory-workspace"><aside className="armory-index" aria-label="Фильтры предметов">
    <SkinFilters filters={filters} onChange={next => { setFilters(next); setLimit(pageSize); }} items={skins}>
      <span className="library-count" aria-live="polite">{matches.length} из {skins.length}</span>
    </SkinFilters></aside>
    <div className="armory-results">
    {matches.length ? <><div className="skin-grid armory-grid">{matches.slice(0, limit).map(s =>
      <SkinCard skin={s} key={s.id} onClick={() => setChosen(s)}/>)}</div>
      {limit < matches.length && <div className="library-more"><button className="secondary-button" onClick={() => setLimit(n => n + pageSize)}>Показать ещё {Math.min(matches.length - limit, pageSize)}</button></div>}
    </> : <Empty title="Предметы не найдены" text="Попробуй другое название или измени фильтры."><button className="secondary-button" onClick={() => setFilters(defaultFilters)}>Сбросить фильтры</button></Empty>}
    </div></div>
    {chosen && <Modal title={`${chosen.weapon} | ${chosen.name}`} onClose={() => { if (initialSkinId) go('skins'); else setChosen(null); }}>
      <div className={`library-skin-preview rarity-${chosen.rarity}`}><img src={chosen.image} alt={`${chosen.weapon} | ${chosen.name}`}/><div><b>{itemRarityName(chosen)}</b>{chosen.wear && <span>{chosen.wear === 'FN' ? 'Прямо с завода' : 'После полевых испытаний'}</span>}<Coin value={chosen.price}/></div></div>
      <h3 className="library-case-heading">{chosen.kind === 'sticker' ? 'Капсулы с этой наклейкой' : chosen.kind === 'pin' ? 'Пакеты с этим пином' : 'Кейсы с этим скином'} <span>{containing.length}</span></h3>
      <div className="library-source-grid">{containing.map(({ item, chance }) =>
        <ContainerCard key={item.id} item={item} favorite={favorites.includes(item.id)}
          onToggleFavorite={() => toggleFavorite(item.id)} onOpen={() => go('case', item.id)}
          chance={`${chance < .00001 ? '<0,001' : (chance * 100).toLocaleString('ru-RU', { maximumFractionDigits: 3 })}%`}/>
      )}</div>
    </Modal>}
  </div>;
}
