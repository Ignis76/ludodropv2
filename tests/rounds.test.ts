import assert from 'node:assert/strict';
import test from 'node:test';
import { initialPlayer } from '../src/engine.ts';
import { advanceFlight, betOnWheel, collectMines, colors, nextFlightEvent, revealCell, sectors, settleWheel, startFlight, startMines, visibleWheelBet, WHEEL_RESULT, WHEEL_SPIN } from '../src/rounds.ts';
import type { Skin } from '../src/types.ts';

const wheelSkins: Skin[] = [
  { id:'stake', weapon:'USP-S', name:'Ставка', price:50.25, rarity:'blue', image:'' },
  { id:'double', weapon:'AWP', name:'Графит', price:100.50, rarity:'purple', image:'' },
  { id:'gold', weapon:'AK-47', name:'Золото', price:597.40, rarity:'red', image:'' },
  { id:'sticker', weapon:'Наклейка', name:'Тест', price:201, kind:'sticker', rarity:'blue', image:'' },
];

test('wheel skin stakes settle the displayed sector, item and exact change once after a reload', () => {
  const player = { ...initialPlayer(wheelSkins), balance:0 }, closesAt = 2000;
  const item = player.inventory.find(i => i.skinId === 'stake')!;
  for (const [i, color] of sectors.entries()) {
    const total = 50.25 * colors[color].factor;
    const prize = color === 'gold' ? wheelSkins[2] : wheelSkins[1];
    const change = Math.round((total - prize.price) * 100) / 100;
    const staked = betOnWheel(player, item.uid, wheelSkins, color, closesAt, 1000, () => (i + .5) / sectors.length, 105);
    assert.equal(staked.balance, 0);
    assert.ok(!staked.inventory.some(entry => entry.uid === item.uid));
    assert.throws(() => betOnWheel(staked, item.uid, wheelSkins, color, closesAt, 1001));
    assert.equal(settleWheel(staked, closesAt + WHEEL_SPIN - 1), staked);
    const restored = settleWheel(JSON.parse(JSON.stringify(staked)), closesAt + WHEEL_SPIN);
    assert.equal(restored.rouletteRounds?.[0].index, i);
    assert.equal(restored.rouletteRounds?.[0].previousAngle, 105);
    assert.equal(restored.rouletteRounds?.[0].payout, total);
    assert.equal(restored.inventory.length, player.inventory.length);
    assert.equal(restored.inventory[0].skinId, prize.id);
    assert.ok(!player.inventory.some(entry => entry.uid === restored.inventory[0].uid));
    assert.equal(restored.balance, change);
    assert.equal(restored.history[0].amount, change);
    assert.equal(settleWheel(restored), restored);
  }
  const loss = settleWheel(betOnWheel(player, item.uid, wheelSkins, 'red', closesAt, 1000, () => 0), closesAt + WHEEL_SPIN);
  assert.equal(loss.balance, player.balance);
  assert.equal(loss.inventory.length, player.inventory.length - 1);
  assert.equal(loss.rouletteRounds?.[0].payout, 0);
  assert.throws(() => betOnWheel(loss, item.uid, wheelSkins, 'red', closesAt + 10000, closesAt));
  assert.throws(() => betOnWheel(player, item.uid, wheelSkins, 'red', closesAt, closesAt));
  const sticker = { uid:'sticker-item', skinId:'sticker', obtained:1 };
  assert.throws(() => betOnWheel({ ...player, inventory:[sticker] }, sticker.uid, wheelSkins, 'red', closesAt, 1000));
});

test('returning to the wheel restores the stake, starting angle and full result window', () => {
  const player = initialPlayer(wheelSkins);
  const staked = betOnWheel(player, player.inventory[0].uid, wheelSkins, 'red', 2000, 1000, () => .1, 315);
  const restored = JSON.parse(JSON.stringify(staked));
  const stop = 2000 + WHEEL_SPIN;
  assert.equal(visibleWheelBet(restored, stop - 1)?.previousAngle, 315);
  const settled = settleWheel(restored, stop);
  assert.equal(visibleWheelBet(settled, stop), settled.rouletteRounds?.[0]);
  assert.equal(visibleWheelBet(settled, stop + WHEEL_RESULT - 1)?.skinStake?.skinId, 'stake');
  assert.equal(visibleWheelBet(settled, stop + WHEEL_RESULT), undefined);
});

test('a legacy wheel round still settles its original credit bet once', () => {
  const player = initialPlayer([]);
  const settled = settleWheel({ ...player, rouletteBet:{
    id:'legacy', amount:80, color:'red', index:1, closesAt:2000, settlesAt:2000 + WHEEL_SPIN,
  } }, 2000 + WHEEL_SPIN);
  assert.equal(settled.balance, player.balance + 320);
  assert.equal(settled.inventory.length, 0);
  assert.equal(settleWheel(settled), settled);
});

test('mines stake one skin, restore progress, and award the displayed skin and change once', () => {
  const stake: Skin = { id:'mine-stake', weapon:'MP9', name:'Ставка', rarity:'blue', price:100, image:'' };
  const reward = { ...stake, id:'mine-prize', price:115.55 };
  const pin = { ...stake, id:'mine-pin', kind:'pin' as const, price:119.99 };
  const skins = [stake, reward, pin];
  const player = { ...initialPlayer(skins), balance:0 };
  const uid = player.inventory[0].uid;
  assert.throws(() => startMines(player, 'missing', 5, skins));
  const pinItem = { uid:'pin', skinId:pin.id, obtained:0 };
  assert.throws(() => startMines({ ...player, inventory:[pinItem] }, pinItem.uid, 5, skins));
  const bet = startMines(player, uid, 5, skins);
  assert.equal(bet.balance, 0);
  assert.equal(bet.mineRound!.skinId, stake.id);
  assert.deepEqual(bet.inventory, player.inventory.slice(1));
  assert.throws(() => startMines(bet, uid, 3, skins));
  assert.throws(() => collectMines(bet, skins));
  const safe = Array.from({ length: 25 }, (_, i) => i).filter(i => !bet.mineRound!.mines.includes(i));
  const first = revealCell(bet, safe[0], skins);
  assert.throws(() => revealCell(first, safe[0], skins));
  const restored = JSON.parse(JSON.stringify(first));
  const won = collectMines(restored, skins);
  assert.equal(won.balance, 4.45);
  assert.equal(won.history[0].amount, 4.45);
  assert.equal(won.history.length, 2);
  assert.equal(won.inventory[0].skinId, reward.id);
  assert.notEqual(won.inventory[0].uid, uid);
  assert.deepEqual(won.inventory.slice(1), bet.inventory);
  assert.throws(() => collectMines(won, skins));
  const exact = collectMines(restored, [stake, { ...reward, price:120 }]);
  assert.equal(exact.balance, 0);
  assert.equal(exact.inventory[0].skinId, reward.id);
  let all = first;
  for (const cell of safe.slice(1)) all = revealCell(all, cell, skins);
  assert.equal(all.mineRound, undefined);
  assert.equal(all.inventory.length, player.inventory.length);
  assert.equal(all.history.length, 2);
  assert.ok(all.balance > 4.45);
  assert.throws(() => collectMines(all, skins));
  const loss = revealCell(bet, bet.mineRound!.mines[0], skins);
  assert.equal(loss.balance, 0);
  assert.equal(loss.mineRound, undefined);
  assert.deepEqual(loss.inventory, bet.inventory);
  assert.throws(() => revealCell(loss, safe[0], skins));
});

test('a saved mine round with a credit stake settles under its original terms', () => {
  const player = { ...initialPlayer([]), balance:9900, mineRound:{
    id:'legacy', amount:100, mines:[0, 1, 2, 3, 4], revealed:[5],
  } };
  const settled = collectMines(player, []);
  assert.equal(settled.balance, 10020);
  assert.deepEqual(settled.inventory, []);
  assert.throws(() => collectMines(settled, []));
});

test('restored crash flight keeps its point, pays an earlier auto threshold and records the fall once', () => {
  const skin: Skin = { id:'test', weapon:'USP-S', name:'Тест', price:100, rarity:'blue', image:'' };
  const player = initialPlayer([skin]), start = 1000;
  const begun = startFlight(player, player.inventory[0].uid, [skin], 2, start, () => .76);
  const flight = begun.activeCrash!;
  assert.equal(flight.point, 4);
  assert.equal(begun.inventory.length, 0);
  const catalog = [skin, { ...skin, id:'prize', price:197.75 }, { ...skin, id:'too-high', price:200.01 }];
  assert.equal(advanceFlight(begun, catalog, start + 2000), begun);
  const restored = JSON.parse(JSON.stringify(begun));
  const cashed = advanceFlight(restored, catalog, nextFlightEvent(flight));
  assert.equal(cashed.balance, player.balance + 2.25);
  assert.equal(cashed.activeCrash?.rewardSkinId, 'prize');
  assert.equal(cashed.inventory[0].skinId, 'prize');
  assert.equal(cashed.history[0].amount, 2.25);
  assert.equal(cashed.activeCrash!.cashedAt, 2);
  assert.throws(() => startFlight(cashed, player.inventory[0].uid, [skin], 0));
  assert.equal(advanceFlight(cashed, catalog, nextFlightEvent(flight) + 50, true), cashed);
  const after = advanceFlight(cashed, catalog, nextFlightEvent(cashed.activeCrash!));
  assert.equal(after.activeCrash, undefined);
  assert.equal(after.lastCrash!.payout, 200);
  assert.deepEqual(after.crashRounds, [4]);
  assert.equal(advanceFlight(after, catalog), after);
  const slept = advanceFlight(restored, catalog, start + 20000);
  assert.equal(slept.balance, after.balance);
  assert.equal(slept.inventory.length, 1);
  assert.deepEqual(slept.crashRounds, [4]);

  const manual = advanceFlight(restored, catalog, start + 50, true);
  assert.equal(manual.activeCrash?.rewardSkinId, skin.id);
  assert.equal(manual.activeCrash?.balanceRemainder, 0);
  assert.equal(manual.balance, player.balance);
  assert.notEqual(manual.inventory[0].uid, player.inventory[0].uid);

  const legacy = JSON.parse(JSON.stringify(begun));
  delete legacy.crashStake.payoutMode;
  delete legacy.activeCrash.payoutMode;
  const oldCashout = advanceFlight(legacy, catalog, start + 20000);
  assert.equal(oldCashout.balance, player.balance + 200);
  assert.equal(oldCashout.inventory.length, 0);
});
