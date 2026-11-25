import { credit } from './engine.ts';
import type { Player } from './types.ts';

export const OFFICE_PROMO_CODE = 'OFFICE20';
export const WALLET_AMOUNTS = [10_000, 25_000, 500_000];

export function officePromoStatus(player: Player) {
  return player.office20 === 'active' || player.office20 === 'redeemed' ? player.office20 : 'available';
}

export function normalizePromoCode(code: string) {
  return code.trim().toUpperCase();
}

export function activateOfficePromo(player: Player, code: string): Player {
  if (normalizePromoCode(code) !== OFFICE_PROMO_CODE) throw new Error('Промокод не найден');
  const status = officePromoStatus(player);
  if (status === 'redeemed') throw new Error('Бонус по OFFICE20 уже получен');
  return status === 'active' ? player : { ...player, office20: 'active' };
}

export function walletBonus(amount: number) {
  return Math.round(amount * .2);
}

export function topUpWallet(player: Player, amount: number, code = '') {
  if (!WALLET_AMOUNTS.includes(amount)) throw new Error('Выбери доступную сумму пополнения');
  const pending = normalizePromoCode(code) ? activateOfficePromo(player, code) : player;
  const bonus = officePromoStatus(pending) === 'active' ? walletBonus(amount) : 0;
  const total = amount + bonus;
  const title = bonus
    ? `Пополнение ${amount.toLocaleString('ru-RU')} + ${bonus.toLocaleString('ru-RU')} по ${OFFICE_PROMO_CODE}`
    : 'Демо-пополнение';
  const state = credit(bonus ? { ...pending, office20: 'redeemed' } : pending, total, title);
  return { state, total, bonus };
}
