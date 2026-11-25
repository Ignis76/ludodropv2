import { useEffect, useRef, useState } from 'react';
import { Check, Plus, ShieldCheck, Wallet } from 'lucide-react';
import { sound } from './audio';
import { Coin, Modal, money } from './components';
import { useStore } from './store';
import { activateOfficePromo, normalizePromoCode, OFFICE_PROMO_CODE, officePromoStatus, topUpWallet, WALLET_AMOUNTS, walletBonus } from './wallet-offer';
import './wallet.css';

export function WalletDialog({ initialCode = '', onClose }: { initialCode?: string; onClose: () => void }) {
  const { player, walletUpdate, toast } = useStore();
  const [code, setCode] = useState(initialCode);
  const [invalid, setInvalid] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const processing = useRef(false);
  const appliedInitial = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const status = officePromoStatus(player);
  const entered = normalizePromoCode(code);
  const hasBonus = status === 'active' || (status === 'available' && entered === OFFICE_PROMO_CODE);

  useEffect(() => {
    if (appliedInitial.current || status !== 'available' || normalizePromoCode(initialCode) !== OFFICE_PROMO_CODE) return;
    appliedInitial.current = true;
    void walletUpdate(p => activateOfficePromo(p, initialCode));
  }, [initialCode, status, walletUpdate]);

  const invalidCode = () => { setInvalid(true); input.current?.focus(); };
  const applyCode = () => {
    if (entered !== OFFICE_PROMO_CODE) { invalidCode(); return; }
    void walletUpdate(p => activateOfficePromo(p, entered));
  };
  const topUp = async (amount: number) => {
    if (processing.current) return;
    if (status === 'available' && entered && entered !== OFFICE_PROMO_CODE) { invalidCode(); return; }
    processing.current = true;
    setSubmitting(true);
    let actualBonus = 0;
    try {
      const ok = await walletUpdate(p => {
        const receipt = topUpWallet(p, amount, hasBonus ? OFFICE_PROMO_CODE : '');
        actualBonus = receipt.bonus;
        return receipt.state;
      });
      if (!ok) return;
      sound('win');
      toast(actualBonus
        ? `Зачислено ${money(amount + actualBonus)}: ${money(amount)} + ${money(actualBonus)} по ${OFFICE_PROMO_CODE}`
        : `Добавлено ${money(amount)} кредитов`);
      onClose();
    } finally {
      processing.current = false;
      setSubmitting(false);
    }
  };

  return <Modal icon={<Wallet/>} title="Виртуальный баланс" onClose={onClose}>
    <div className="wallet-total"><span>Доступно кредитов</span><Coin value={player.balance}/></div>
    {status === 'available' ? <form className="wallet-promo" onSubmit={e => { e.preventDefault(); applyCode(); }}>
      <label htmlFor="wallet-promo-code">Промокод</label>
      <div className="wallet-promo-input">
        <input id="wallet-promo-code" ref={input} type="text" value={code} onChange={e => { setCode(e.target.value); setInvalid(false); }}
          placeholder="Введи код" autoComplete="off" autoCapitalize="characters" spellCheck={false}
          aria-invalid={invalid || undefined} aria-describedby={invalid ? 'wallet-promo-error' : undefined}/>
        <button className="secondary-button" type="submit" disabled={!entered || submitting}>Применить</button>
      </div>
      {invalid && <p id="wallet-promo-error" role="alert">Промокод не найден. Проверь код или очисти поле.</p>}
    </form> : <div className="wallet-promo-state" role="status">
      <Check size={17}/><div><strong>{OFFICE_PROMO_CODE}</strong>
        <span>{status === 'active' ? '+20% к следующему пополнению' : 'Бонус уже получен'}</span></div>
    </div>}
    <h3 className="wallet-caption">Бесплатное пополнение</h3>
    <div className="wallet-options">{WALLET_AMOUNTS.map(amount => (
      <button type="button" className="secondary-button wallet-option" key={amount} disabled={submitting} onClick={() => void topUp(amount)}
        aria-label={`Пополнить на ${money(amount)} кредитов${hasBonus ? ', бонус ' + money(walletBonus(amount)) : ''}`}>
        <span><Plus size={14}/><Coin value={amount}/></span>
        {hasBonus && <small><span>Бонус </span>+{money(walletBonus(amount))}</small>}
      </button>
    ))}</div>
    <div className="info-box"><ShieldCheck size={18}/>Прогресс сохраняется в этом браузере.</div>
  </Modal>;
}
