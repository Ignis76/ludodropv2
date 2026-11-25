import { useEffect, useRef } from 'react';
import { ArrowRight } from 'lucide-react';
import { Coin, itemRarityName } from './components';
import type { Skin } from './types';
import './contract-award.css';

export function ContractAward({ skin, count, total, onContinue }: { skin: Skin; count: number; total: number; onContinue: () => void }) {
  const next = useRef<HTMLButtonElement>(null);
  useEffect(() => { next.current?.focus({preventScroll:true}); }, []);
  return <section className={'trade-award rarity-' + skin.rarity} aria-label="Результат обмена">
    <div className="trade-award-summary">
      <div><span className="trade-award-rarity">{itemRarityName(skin)}</span>
        <p>{skin.weapon}</p><h2>{skin.name}</h2></div>
      <div className="trade-award-value"><span>Стоимость предмета</span><strong><Coin value={skin.price}/></strong></div>
    </div>
    <div className="trade-award-footer"><div className="trade-values">
      <div><span>Передано предметов</span><strong>{count}</strong></div>
      <div><span>На сумму</span><strong><Coin value={total}/></strong></div></div>
      <button type="button" className="trade-primary" onClick={onContinue} ref={next}>Новый контракт <ArrowRight size={17}/></button>
    </div>
  </section>;
}
