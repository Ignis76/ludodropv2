import { isWagerSkin, skinPayoutQuote } from './skin-wagers.ts';
import type { CrashRound, Player, RouletteBet, RouletteColor, RouletteResult, Skin } from './types.ts';
import { crashFlight, crashPoint, credit, generateMines, makeItem, mineMultiplier, random, record, round, settleSkinCrash, stakeCrashSkin, uid } from './engine.ts';

export const sectors: RouletteColor[] = [
  'graphite', 'red', 'graphite', 'blue', 'graphite', 'red',
  'graphite', 'gold', 'graphite', 'blue', 'graphite', 'red',
];
export const colors = {
  graphite: { name: 'Графит', paint: '#4b5561', factor: 2 },
  red: { name: 'Алый', paint: '#c74d5e', factor: 4 },
  blue: { name: 'Синий', paint: '#527cc2', factor: 6 },
  gold: { name: 'Золото', paint: '#d6a24e', factor: 12 },
} as const;
export const BET_WINDOW = 15000;
export const WHEEL_SPIN = 4300;
export const WHEEL_RESULT = 5500;

export function visibleWheelBet(player: Player, now = Date.now()) {
  const last = player.rouletteRounds?.[0];
  return player.rouletteBet ?? (last && now < last.settlesAt + WHEEL_RESULT ? last : undefined);
}

export function betOnWheel(player: Player, itemId: string, skins: Skin[], color: RouletteColor, closesAt: number, now = Date.now(), rng = random, previousAngle?: number): Player {
  if (player.rouletteBet || now >= closesAt) throw new Error('Приём ставок завершён');
  const item = player.inventory.find(entry => entry.uid === itemId);
  const stake = skins.find(skin => skin.id === item?.skinId);
  if (!item || !stake || !isWagerSkin(stake)) throw new Error('Выбери доступный скин из инвентаря');
  const prize = skinPayoutQuote(stake.price, colors[color].factor, skins);
  const bet: RouletteBet = {
    id: uid(), color, amount: stake.price, index: Math.floor(rng() * sectors.length),
    skinStake: { skinId: stake.id, prizeSkinId: prize.skin.id, prizeValue: prize.skin.price, remainder: prize.remainder },
    previousAngle, closesAt, settlesAt: closesAt + WHEEL_SPIN,
  };
  return record({ ...player, rouletteBet: bet, inventory: player.inventory.filter(entry => entry.uid !== itemId) },
    `Рулетка · ставка ${stake.weapon} | ${stake.name} на ${colors[color].name.toLowerCase()}`, 0);
}

export function settleWheel(player: Player, now = Date.now()): Player {
  const bet = player.rouletteBet;
  if (!bet || now < bet.settlesAt) return player;
  const color = sectors[bet.index];
  const payout = color === bet.color ? round(bet.amount * colors[color].factor) : 0;
  const result: RouletteResult = { ...bet, payout };
  const next = { ...player, rouletteBet: undefined, rouletteRounds: [result, ...(player.rouletteRounds || [])].slice(0, 12) };
  const title = `Рулетка · ${colors[color].name.toLowerCase()}`;
  if (bet.skinStake && payout) {
    const prize = { skinId: bet.skinStake.prizeSkinId, uid: uid(), obtained: now };
    return credit({ ...next, inventory: [prize, ...next.inventory] }, bet.skinStake.remainder, `${title} · скин в инвентаре`);
  }
  // Older saved bets were paid in credits and finish in their original currency.
  return payout ? credit(next, payout, title) : record(next, title, 0);
}

export function startMines(player: Player, itemId: string, count: number, skins: Skin[]): Player {
  if (player.mineRound) throw new Error('Раунд уже начался');
  if (![1, 3, 5, 10].includes(count)) throw new Error('Выберите количество мин');
  const item = player.inventory.find(i => i.uid === itemId);
  const skin = item && skins.find(s => s.id === item.skinId);
  if (!skin || !isWagerSkin(skin)) throw new Error('Выбери доступный скин из инвентаря');
  const inventory = player.inventory.filter(i => i.uid !== itemId);
  const mineRound = { id: uid(), amount: skin.price, skinId: skin.id, mines: generateMines(count), revealed: [] };
  return record({ ...player, inventory, mineRound }, `Мины · ставка: ${skin.weapon} | ${skin.name}`, 0);
}

export function collectMines(player: Player, skins: Skin[]): Player {
  const game = player.mineRound;
  if (!game?.revealed.length) throw new Error('Сначала откройте безопасную ячейку');
  const multiplier = mineMultiplier(game.revealed.length, game.mines.length);
  const next = { ...player, mineRound: undefined };
  // Credit stakes saved before skin betting keep their original payout.
  if (!game.skinId) return credit(next, round(game.amount * multiplier), 'Мины · выигрыш');
  const { skin, remainder } = skinPayoutQuote(game.amount, multiplier, skins);
  const inventory = [makeItem(skin), ...next.inventory];
  return credit({ ...next, inventory }, remainder, `Мины ×${multiplier.toFixed(2)} · ${skin.weapon} | ${skin.name}`);
}

export function revealCell(player: Player, cell: number, skins: Skin[]): Player {
  const game = player.mineRound;
  if (!game || !Number.isInteger(cell) || cell < 0 || cell > 24 || game.revealed.includes(cell)) {
    throw new Error('Ячейка недоступна');
  }
  if (game.mines.includes(cell)) return record({ ...player, mineRound: undefined }, 'Мины · попадание на мину', 0);
  const mineRound = { ...game, revealed: [...game.revealed, cell] };
  const next = { ...player, mineRound };
  return mineRound.revealed.length === 25 - mineRound.mines.length ? collectMines(next, skins) : next;
}

export function startFlight(player: Player, item: string, skins: Skin[], autoAt: number, now = Date.now(), rng = random): Player {
  if (player.activeCrash) throw new Error('Полёт ещё продолжается');
  if (autoAt !== 0 && (!Number.isFinite(autoAt) || autoAt < 1.1 || autoAt > 24)) throw new Error('Автовывод доступен от ×1,1 до ×24');
  const { state, stake } = stakeCrashSkin(player, item, skins);
  return { ...state, activeCrash: { ...stake, startedAt: now, point: crashPoint(rng), autoAt, cashedAt: 0, payout: 0 } };
}

export function nextFlightEvent(flight: CrashRound) {
  const next = !flight.cashedAt && flight.autoAt >= 1.1 && flight.autoAt < flight.point ? flight.autoAt : flight.point;
  return flight.startedAt + Math.ceil(Math.log(next) / .000165);
}

export function advanceFlight(player: Player, skins: Skin[], now = Date.now(), manual = false): Player {
  const flight = player.activeCrash;
  if (!flight) return player;
  const timeline = crashFlight(now - flight.startedAt, flight.point, flight.autoAt, flight.cashedAt, manual);
  let next = player, activeCrash = flight;
  if (timeline.cashout && !flight.cashedAt) {
    const paid = settleSkinCrash(player, flight.id, timeline.cashout, skins);
    activeCrash = { ...flight, cashedAt: timeline.cashout, payout: paid.payout, rewardSkinId: paid.rewardSkinId, balanceRemainder: paid.balanceRemainder };
    next = { ...paid.state, activeCrash };
  }
  if (!timeline.crashed) return next;
  if (!activeCrash.cashedAt) next = settleSkinCrash(next, flight.id, 0, skins).state;
  return { ...next, activeCrash: undefined, lastCrash: activeCrash, crashRounds: [flight.point, ...(next.crashRounds || [])].slice(0, 8) };
}
