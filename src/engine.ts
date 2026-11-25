import type { Case, Item, Player, Skin } from './types.ts';
import { readIdentity } from './player-identity.ts';
import { isWagerSkin, skinPayoutQuote } from './skin-wagers.ts';

export const random = () => crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
export const round = (n: number) => Math.round(n * 100) / 100;
export const uid = () => crypto.randomUUID();
export const makeItem = (skin: Skin): Item => ({ uid: uid(), skinId: skin.id, obtained: Date.now() });
export function initialPlayer(skins: Skin[]): Player {
  const starters = skins.filter(s => (s.kind ?? 'skin') === 'skin' && s.price <= 1000).sort((a, b) => a.price - b.price).slice(0, 6);
  return { version: 1, profile: readIdentity(), balance: 10000, inventory: starters.map(makeItem), drops: [], history: [], favorites: [], opened: 0, sound: true };
}
export function record(state: Player, title: string, amount: number): Player {
  return { ...state, history: [{ id: uid(), title, amount: round(amount), time: Date.now() }, ...state.history].slice(0, 80) };
}
export function debit(state: Player, amount: number, title: string): Player {
  if (!Number.isFinite(amount) || amount < 1 || amount > state.balance) throw new Error('Недостаточно монет или неверная сумма');
  return record({ ...state, balance: round(state.balance - amount) }, title, -amount);
}
export function credit(state: Player, amount: number, title: string): Player {
  if (!Number.isFinite(amount) || amount < 0) throw new Error('Неверная сумма');
  return record({ ...state, balance: round(state.balance + amount) }, title, amount);
}
export function casePool(c: Case, skins: Skin[]): Skin[] {
  const kind = c.containerKind === 'capsule' ? 'sticker' : c.containerKind === 'pin-pack' ? 'pin' : 'skin';
  let pool = skins.filter(s => (s.kind ?? 'skin') === kind);
  if (c.goldOnly) pool = pool.filter(s => s.rarity === 'gold');
  else if (!(c.containerKind && c.dropWeights)) pool = pool.filter(s => s.price >= c.price * .5 && s.price <= c.price * 200);
  if (c.weapons) pool = pool.filter(s => c.weapons!.some(w => s.weapon.includes(w)));
  if (c.skinNames) pool = pool.filter(s => c.skinNames!.includes(s.name));
  if (c.dropWeights) pool = pool.filter(s => Object.hasOwn(c.dropWeights!, s.id));
  return pool;
}
export const CASE_RETURN = .97;
export function probabilities(pool: Skin[], casePrice: number, table?: Case['dropWeights']): number[] {
  if (!pool.length || !Number.isFinite(casePrice) || casePrice <= 0 || pool.some(s => !Number.isFinite(s.price) || s.price <= 0)) throw new Error('Неверный состав кейса');
  if (table) {
    const weights = pool.map(skin => table[skin.id]);
    if (weights.some(weight => !Number.isFinite(weight) || weight <= 0)) throw new Error('Неверный вес предмета');
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    return weights.map(weight => weight / total);
  }
  const target = casePrice * CASE_RETURN;
  const minimum = Math.min(...pool.map(s => s.price)), maximum = Math.max(...pool.map(s => s.price));
  if (target <= minimum || target >= maximum) throw new Error('Стоимость кейса не соответствует его составу');
  // Give each listed item a reachable chance, including jackpots far from the case price.
  const inversePriceSum = pool.reduce((sum, skin) => sum + 1 / skin.price, 0);
  const rareOdds = pool.map(skin => 1 / (skin.price * inversePriceSum));
  const rareMean = pool.length / inversePriceSum;
  const feasibleMix = rareMean > target ? (target - minimum) / (rareMean - minimum) : (maximum - target) / (maximum - rareMean);
  const rareShare = Math.min(.035, feasibleMix / 2);
  const regularMean = (target - rareShare * rareMean) / (1 - rareShare);
  // Concentrate drops near the case price and calibrate their expected return.
  // A costly purple item cannot inherit the weight of an inexpensive purple item.
  const logs = pool.map(s => Math.log(s.price / casePrice));
  const distribution = (power: number) => {
    const values = logs.map(log => -.5 * (log / .38) ** 2 - power * log), max = Math.max(...values);
    const weights = values.map(value => Math.exp(Math.max(-700, value - max)));
    const sum = weights.reduce((a, b) => a + b, 0);
    return weights.map(w => w / sum);
  };
  let low = -32, high = 32;
  for (let i = 0; i < 90; i++) {
    const middle = (low + high) / 2, odds = distribution(middle);
    const expected = pool.reduce((sum, skin, index) => sum + skin.price * odds[index], 0);
    if (expected > regularMean) low = middle; else high = middle;
  }
  return distribution((low + high) / 2).map((p, i) => (1 - rareShare) * p + rareShare * rareOdds[i]);
}
export function weightedPick<T>(items: T[], weights: number[], rng = random): T {
  if (!items.length || weights.length !== items.length) throw new Error('Пустая коллекция');
  let threshold = rng() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < items.length; i++) { threshold -= weights[i]; if (threshold < 0) return items[i]; }
  return items[items.length - 1];
}
export function openCases(state: Player, c: Case, count: number, skins: Skin[], rng = random) {
  if (![1, 2, 3, 5].includes(count)) throw new Error('Выбери от 1 до 5 кейсов');
  const paid = debit(state, c.price * count, `${c.name} × ${count}`);
  const pool = casePool(c, skins), weights = probabilities(pool, c.price, c.dropWeights);
  const rewards = Array.from({ length: count }, () => makeItem(weightedPick(pool, weights, rng)));
  const drops = rewards.map(r => ({ uid: r.uid, skinId: r.skinId, caseName: c.name, time: r.obtained }));
  return { state: { ...paid, inventory: [...rewards, ...paid.inventory], drops: [...drops, ...(paid.drops || [])].slice(0, 30), opened: paid.opened + count }, rewards };
}
export function selectedItems(state: Player, ids: string[], skins: Skin[]): Skin[] {
  if (!ids.length || new Set(ids).size !== ids.length) throw new Error('Выбери предметы');
  return ids.map(id => {
    const item = state.inventory.find(i => i.uid === id);
    const skin = skins.find(s => s.id === item?.skinId);
    if (!item || !skin) throw new Error('Предмет уже использован');
    return skin;
  });
}
export function sellItems(state: Player, ids: string[], skins: Skin[]): Player {
  const value = selectedItems(state, ids, skins).reduce((sum, s) => sum + s.price, 0);
  return credit({ ...state, inventory: state.inventory.filter(i => !ids.includes(i.uid)) }, value, `Продажа предметов: ${ids.length}`);
}
const UPGRADE_RETURN_PERCENT = 90;
const MAX_UPGRADE_CHANCE_PERCENT = 75;
export function upgradeChance(input: number, target: number) {
  return target > input && input > 0 ? Math.min(MAX_UPGRADE_CHANCE_PERCENT / 100, input / target * (UPGRADE_RETURN_PERCENT / 100)) : 0;
}
export function maxUpgradeContribution(itemValue: number, targetValue: number, balance: number) {
  if (itemValue <= 0 || targetValue <= itemValue) return 0;
  const targetCents = Math.round(targetValue * 100);
  const stakeAtCap = Math.ceil(targetCents * MAX_UPGRADE_CHANCE_PERCENT / UPGRADE_RETURN_PERCENT);
  const extraCents = Math.min(targetCents - 1, stakeAtCap) - Math.round(itemValue * 100);
  return Math.max(0, Math.min(Math.round(balance * 100), extraCents)) / 100;
}
export function closestUpgradeTargets(input: number, value: number, skins: Skin[], query = '', by: 'chance' | 'multiple' = 'chance') {
  if (!Number.isFinite(input) || input <= 0 || !Number.isFinite(value)) return [];
  if (by === 'chance' ? value < .1 || value > MAX_UPGRADE_CHANCE_PERCENT : value <= 1) return [];
  const search = query.trim().toLowerCase();
  const distance = ({ skin, chance }: { skin: Skin; chance: number }) =>
    by === 'multiple' ? Math.abs(skin.price - input * value) : Math.abs(chance - value);
  return skins.filter(s => s.price > input && `${s.weapon} ${s.name}`.toLowerCase().includes(search))
    .map(skin => ({ skin, chance: upgradeChance(input, skin.price) * 100 }))
    .sort((a, b) => distance(a) - distance(b) || a.skin.price - b.skin.price || a.skin.id.localeCompare(b.skin.id));
}
export function stakeCrashSkin(state: Player, itemId: string, skins: Skin[]) {
  if (state.crashStake) throw new Error('Предыдущий раунд ещё не завершён');
  const skin = selectedItems(state, [itemId], skins)[0];
  if (!isWagerSkin(skin)) throw new Error('Выбери скин из инвентаря');
  const stake = { id: uid(), skinId: skin.id, value: skin.price, payoutMode: 'skin' as const };
  return { stake, state: record({ ...state, inventory: state.inventory.filter(i => i.uid !== itemId), crashStake: stake }, `Краш: ставка ${skin.weapon} | ${skin.name}`, 0) };
}
export function settleSkinCrash(state: Player, roundId: string, multiplier: number, skins: Skin[]): {
  state: Player; payout: number; rewardSkinId?: string; balanceRemainder?: number;
} {
  if (!state.crashStake || state.crashStake.id !== roundId) throw new Error('Этот раунд уже завершён');
  if (!Number.isFinite(multiplier) || multiplier !== 0 && (multiplier < 1 || multiplier > 25)) throw new Error('Неверный множитель');
  const { crashStake, ...rest } = state;
  if (!multiplier) return { payout: 0, state: record(rest, 'Краш: предмет потерян', 0) };
  const title = `Краш · вывод ×${multiplier.toFixed(2)}`;
  if (crashStake.payoutMode !== 'skin') {
    const payout = round(crashStake.value * multiplier);
    return { payout, state: credit(rest, payout, title) };
  }
  const { skin, total, remainder } = skinPayoutQuote(crashStake.value, multiplier, skins);
  const inventory = [makeItem(skin), ...rest.inventory];
  return {
    payout: total, rewardSkinId: skin.id, balanceRemainder: remainder,
    state: credit({ ...rest, inventory }, remainder, `${title} · ${skin.weapon} | ${skin.name}`),
  };
}
export function upgrade(state: Player, ids: string[], target: Skin, skins: Skin[], rng = random, contribution = 0) {
  const goal = skins.find(s => s.id === target.id);
  if (ids.length > 5 || !goal) throw new Error('Неверные предметы');
  const total = round(selectedItems(state, ids, skins).reduce((sum, s) => sum + s.price, 0));
  if (!Number.isFinite(contribution) || contribution < 0 || round(contribution) !== contribution ||
      contribution > maxUpgradeContribution(total, goal.price, state.balance)) {
    throw new Error('Проверь сумму с баланса для выбранной цели');
  }
  const chance = upgradeChance(round(total + contribution), goal.price);
  if (!chance) throw new Error('Цель должна быть дороже выбранных предметов');
  const won = rng() < chance;
  const reward = won ? makeItem(goal) : null;
  const inventory = state.inventory.filter(i => !ids.includes(i.uid));
  if (reward) inventory.unshift(reward);
  const title = won ? `Успешный апгрейд: ${goal.weapon}` : 'Апгрейд не удался';
  return { state: record({ ...state, inventory, balance: round(state.balance - contribution) }, title, contribution ? -contribution : 0), won, reward };
}
export function contract(state: Player, ids: string[], skins: Skin[], rng = random) {
  if (ids.length < 3 || ids.length > 10) throw new Error('Для контракта нужно от 3 до 10 предметов');
  const total = selectedItems(state, ids, skins).reduce((sum, s) => sum + s.price, 0);
  const pool = skins.filter(s => s.price >= total * .25 && s.price <= total * 3);
  if (!pool.length) throw new Error('Для этой суммы нет подходящих наград. Измени набор предметов');
  const reward = makeItem(weightedPick(pool, pool.map(s => 1 / s.price), rng));
  return { state: record({ ...state, inventory: [reward, ...state.inventory.filter(i => !ids.includes(i.uid))] }, 'Выполнен контракт', 0), reward };
}
export function mineMultiplier(safe: number, mines: number): number {
  if (!Number.isInteger(safe) || !Number.isInteger(mines) || mines < 1 || mines > 24 || safe < 1 || safe > 25 - mines) return 1;
  let odds = 1;
  for (let i = 0; i < safe; i++) odds *= (25 - mines - i) / (25 - i);
  return Math.floor(.96 / odds * 100) / 100;
}
export function generateMines(count: number, rng = random): number[] {
  const cells = Array.from({ length: 25 }, (_, i) => i);
  for (let i = cells.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [cells[i], cells[j]] = [cells[j], cells[i]]; }
  return cells.slice(0, count);
}
export const wheelSegments = [1, 2, 1, 3, 1, 2, 1, 5, 1, 3, 1, 2];
export const wheelPalette: Record<number, { name: string; color: string; ink: string }> = {
  1: { name: 'Чёрный', color: '#202126', ink: '#f3f0f2' },
  2: { name: 'Красный', color: '#d83b50', ink: '#fff3f4' },
  3: { name: 'Голубой', color: '#66ccff', ink: '#0d2739' },
  5: { name: 'Золотой', color: '#edbd63', ink: '#4b300c' },
};
function wheelPrizeQuote(stake: Skin, multiplier: number, skins: Skin[]) {
  const canonical = skins.find(s => s.id === stake.id);
  if (!canonical || !isWagerSkin(canonical) || !wheelSegments.includes(multiplier)) throw new Error('Неверный предмет или сектор');
  if (multiplier === 1) return { skin: canonical, remainder: 0 };
  return skinPayoutQuote(canonical.price, multiplier, skins);
}
export function wheelPrize(stake: Skin, multiplier: number, skins: Skin[]): Skin {
  return wheelPrizeQuote(stake, multiplier, skins).skin;
}
export function spinSkinWheel(state: Player, itemId: string, skins: Skin[], rng = random) {
  const stake = selectedItems(state, [itemId], skins)[0];
  const index = Math.floor(rng() * wheelSegments.length), multiplier = wheelSegments[index];
  const { skin, remainder } = wheelPrizeQuote(stake, multiplier, skins);
  const reward = makeItem(skin);
  const inventory = [reward, ...state.inventory.filter(i => i.uid !== itemId)];
  return { state: credit({ ...state, inventory }, remainder, `Колесо ×${multiplier} · ${skin.weapon} | ${skin.name}`), index, multiplier, reward, skin, remainder };
}
export const crashPoint = (rng = random) => Math.min(25, Math.max(1, Math.floor(.96 / (1 - rng()) * 100) / 100));
export function crashFlight(elapsedMs: number, point: number, autoAt = 0, cashedAt = 0, manual = false) {
  const actual = Math.exp(Math.max(0, elapsedMs) * .000165);
  const cashout = cashedAt || (autoAt >= 1.1 && autoAt < point && actual >= autoAt ? autoAt : manual && actual < point ? Math.floor(actual * 100) / 100 : 0);
  return { multiplier: Math.min(point, Math.floor(actual * 100) / 100), crashed: actual >= point, cashout };
}
