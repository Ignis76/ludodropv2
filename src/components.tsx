import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { CSSProperties, ReactNode } from 'react';
import { ArrowLeft, Check, Coins, X } from 'lucide-react';
import type { Case, Skin } from './types';

const numberFormat = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });
export const money = (value: number) => numberFormat.format(value);
export const rarityNames = { blue: 'Армейское', purple: 'Запрещённое', pink: 'Засекреченное', red: 'Тайное', gold: 'Особое' };
export const collectibleRarityNames = { blue: 'Высшего класса', purple: 'Примечательного типа', pink: 'Экзотичного вида', red: 'Экстраординарного типа', gold: 'Особое' };
export function itemRarityName(skin: Skin) {
  return skin.kind === 'sticker' || skin.kind === 'pin' ? collectibleRarityNames[skin.rarity] : rarityNames[skin.rarity];
}
export const colorStyle = (color: string) => ({ '--case-color': color }) as CSSProperties;
export function Coin({ value, className = '' }: { value?: number; className?: string }) { return <span className={`coin ${className}`}>{value !== undefined && money(value)}<Coins size={14} strokeWidth={2.2} /></span>; }
export function PageTitle({ eyebrow, title, description, children, back }: { eyebrow: string; title: string; description: string; children?: ReactNode; back?: () => void }) {
  return <div className="page-title">{back && <button className="back-link" onClick={back}><ArrowLeft size={16} />Назад к кейсам</button>}<div className="eyebrow">{eyebrow}</div><div className="title-row"><div><h1>{title}</h1><p>{description}</p></div>{children}</div></div>;
}
export function SkinCard({ skin, selected, onClick, footer, compact = false }: { skin: Skin; selected?: boolean; onClick?: () => void; footer?: ReactNode; compact?: boolean }) {
  const content = <><div className="skin-top"><span className="rarity-dot" /><span>{itemRarityName(skin)}</span>{selected && <Check size={15} />}</div><img src={skin.image} alt={`${skin.weapon} | ${skin.name}`} loading="lazy" draggable="false" /><span className="weapon-name">{skin.weapon}{skin.wear && <small className="skin-wear" title={skin.wear === 'FN' ? 'Прямо с завода' : 'После полевых испытаний'}>{skin.wear}</small>}</span><strong>{skin.name}</strong><div className="skin-bottom"><Coin value={skin.price} />{footer}</div></>;
  const className = `skin-card rarity-${skin.rarity} ${selected ? 'selected' : ''} ${compact ? 'compact' : ''}`;
  return onClick ? <button className={className} data-item-kind={skin.kind} onClick={onClick} aria-pressed={selected}>{content}</button> : <div className={className} data-item-kind={skin.kind}>{content}</div>;
}
export function CaseArt({ item, hero = false }: { item: Case; hero?: boolean }) {
  return <div className={`case-art ${hero ? 'hero-art' : ''} ${item.image ? 'original-art' : ''}`} style={{ '--case-color': item.color } as CSSProperties} aria-hidden="true"><span className="case-aura"/><span className="case-floor"/><img className="case-render" src={item.image} alt="" draggable="false" loading={hero ? 'eager' : 'lazy'}/></div>;
}

export function Modal({ title, icon, children, onClose }: { title: string; icon?: ReactNode; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose); closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current();
      if (e.key === 'Tab') {
        const nodes = ref.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input, select, [tabindex="0"]');
        if (!nodes?.length) return;
        const first = nodes[0], last = nodes[nodes.length - 1];
        if (e.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && (document.activeElement === last || document.activeElement === ref.current)) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', key);
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', key); previous?.focus(); };
  }, []);
  return createPortal(<div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose(); }}><div className="modal" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}><div className="modal-head">{icon && <span className="dialog-symbol" aria-hidden="true">{icon}</span>}<h2>{title}</h2><button className="icon-button" aria-label="Закрыть" onClick={onClose}><X size={20}/></button></div>{children}</div></div>, document.querySelector('.client') || document.body);
}
export function Empty({ title, text, children }: { title: string; text: string; children?: ReactNode }) { return <div className="empty-state"><div className="empty-symbol">✧</div><h3>{title}</h3><p>{text}</p>{children}</div>; }

