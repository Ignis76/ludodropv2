import { readFileSync, writeFileSync } from 'node:fs';

// The game uses this checked-in snapshot and makes no market requests at runtime.
const raw = JSON.parse(readFileSync(new URL('../artifacts/market-prices-rub.json', import.meta.url), 'utf8'));
const supplement = JSON.parse(readFileSync(new URL('../artifacts/collectible-price-supplement.json', import.meta.url), 'utf8'));
const path = new URL('../src/data/assets.json', import.meta.url);
const assets = JSON.parse(readFileSync(path, 'utf8'));
const quotes = new Map(raw.items.map(item => [item.market_hash_name, item]));
const extraQuotes = new Map(supplement.items.map(item => [item.market_hash_name, item]));
const entries = assets.skins.map(skin => {
  const { marketHashName } = skin;
  const primaryQuote = quotes.get(marketHashName);
  const listing = primaryQuote ?? extraQuotes.get(marketHashName);
  if (!listing || !Number.isFinite(Number(listing.price)) || Number(listing.price) <= 0) throw new Error(`No price: ${marketHashName}`);
  skin.price = Math.round(Number(listing.price));
  return {
    skinId: skin.id, marketHashName, rub: Number(listing.price), coins: skin.price, listings: Number(listing.volume),
    ...(!primaryQuote && { source: supplement.source, timestamp: supplement.timestamp }),
  };
});
writeFileSync(path, JSON.stringify(assets, null, 2) + '\n');
writeFileSync(new URL('../src/data/price-snapshot.json', import.meta.url), JSON.stringify({
  source: 'https://market.csgo.com/api/v2/prices/RUB.json',
  timestamp: new Date(raw.time * 1000).toISOString(),
  currency: 'RUB', coinsPerRub: 1,
  method: 'Lowest listed price, rounded to whole RUB. Non-StatTrak, non-Souvenir weapon finishes. Collectibles and unpainted knives use exact wear-free hashes. The three supplemental Skinport rows identify their source and timestamp. Fixed demo snapshot, no live trading.',
  entries,
}, null, 2) + '\n');
console.log(`Saved ${entries.length} verified prices, including ${entries.filter(entry => entry.source).length} supplemental listings.`);
