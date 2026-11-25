import type { Skin } from './types.ts';

export function isWagerSkin(skin: Skin) {
  return (skin.kind ?? 'skin') === 'skin' && Number.isFinite(skin.price) && skin.price > 0;
}

export function skinPayoutQuote(stakeValue: number, multiplier: number, skins: Skin[]) {
  const cents = Math.round(stakeValue * multiplier * 100);
  if (!(stakeValue > 0 && multiplier > 0 && Number.isSafeInteger(cents))) throw new Error('Неверная стоимость выигрыша');
  const total = cents / 100;
  let best: Skin | undefined;
  for (const skin of skins) {
    if (!isWagerSkin(skin)) continue;
    if (skin.price <= total && (!best || skin.price > best.price)) best = skin;
  }
  if (!best) throw new Error('В каталоге нет скина в пределах выигрыша');
  return { skin: best, total, remainder: (cents - Math.round(best.price * 100)) / 100 };
}
