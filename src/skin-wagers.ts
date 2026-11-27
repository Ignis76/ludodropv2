import type { Skin } from './types.ts';

export function isWagerSkin(skin: Skin) {
  return (skin.kind ?? 'skin') === 'skin' && Number.isFinite(skin.price) && skin.price > 0;
}

export function skinPayoutQuote(baseValue: number, multiplier: number, skins: Skin[], options: { allowCollectibleFallback?: boolean } = {}) {
  const cents = Math.round(baseValue * multiplier * 100);
  if (!(baseValue > 0 && multiplier > 0 && Number.isSafeInteger(cents))) throw new Error('Неверная стоимость выигрыша');
  const total = cents / 100;
  let wearable: Skin | undefined;
  let collectible: Skin | undefined;
  for (const skin of skins) {
    if (!(skin.price > 0 && skin.price <= total)) continue;
    if (isWagerSkin(skin)) {
      if (!wearable || skin.price > wearable.price) wearable = skin;
    } else if (options.allowCollectibleFallback && (!collectible || skin.price > collectible.price)) {
      collectible = skin;
    }
  }
  const best = wearable ?? collectible;
  if (!best) throw new Error('В каталоге нет скина в пределах выигрыша');
  return { skin: best, total, remainder: (cents - Math.round(best.price * 100)) / 100 };
}
