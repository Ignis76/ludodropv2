import assert from 'node:assert/strict';
import test from 'node:test';
import { drawUpgradeWheel, initialPlayer, upgrade, upgradeWheelSectors } from '../src/engine.ts';
import { skinPayoutQuote } from '../src/skin-wagers.ts';
import type { Skin } from '../src/types.ts';

function draws(...samples: number[]) {
  return () => {
    const value = samples.shift();
    assert.notEqual(value, undefined, 'unexpected extra draw');
    return value!;
  };
}

test('gold appears on 2% of spins and wins 60% of appearances regardless of the displayed ordinary chance', () => {
  for (const chance of [.001, .05, .1, .3, .5, .75]) {
    let appearances = 0, jackpots = 0;
    for (let i = 0; i < 100; i++) {
      for (let j = 0; j < 100; j++) {
        const result = drawUpgradeWheel(chance, draws(.99, i / 100, j / 100));
        if (result.goldZone) appearances++;
        if (result.goldHit) jackpots++;
      }
    }
    assert.equal(appearances, 200);
    assert.equal(jackpots, 120);
  }
});

test('ordinary odds and needle positions agree with the painted sectors, including both sides of gold', () => {
  for (const chance of [.001, .025, .05, .1, .3, .5, .75]) {
    for (const [event, bonus] of [[.02, 0], [.019999, .6], [.019999, .599999]]) {
      let wins = 0;
      for (let i = 0; i < 10000; i++) {
        const turn = (i + .5) / 10000;
        const result = drawUpgradeWheel(chance, draws(turn, event, bonus));
        const { goldArc, ordinaryArc, start } = upgradeWheelSectors(chance, result.goldZone);
        const inGold = goldArc > 0 && result.landing >= 171 && result.landing < 189;
        const inWinningArc = result.landing >= start && result.landing < start + ordinaryArc + goldArc;
        assert.equal(result.goldHit, inGold);
        assert.equal(result.won, inWinningArc);
        if (result.won) wins++;
      }
      assert.equal(wins, event < .02 && bonus < .6 ? 10000 : chance * 10000);
    }
    for (const turn of [0, chance / 2, chance, 1 - 1 / 4294967296]) {
      const regular = drawUpgradeWheel(chance, draws(turn, 0, .6));
      assert.equal(regular.won, turn < chance);
      assert.ok(regular.landing < 171 || regular.landing >= 189);
      const jackpot = drawUpgradeWheel(chance, draws(turn, 0, 0));
      assert.ok(jackpot.landing >= 171 && jackpot.landing < 189);
    }
  }
});

const skin = (id: string, price: number): Skin => ({ id, name:id, weapon:'AWP', price, image:'', rarity:'blue' });
const inputs = [skin('first', 30), skin('second', 50)];
const goal = skin('requested', 1000);
const prizes = [skin('three', 2981.35), skin('four', 3989.50), skin('five', 4879.75), skin('six', 5999.90)];
const catalog: Skin[] = [...inputs, goal, ...prizes, skin('too-expensive', 6000.01), { ...skin('sticker', 4999), kind:'sticker' }];

test('each quarter of the bonus draw pays ×3, ×4, ×5 or ×6 of the catalogue target price in one exchange', () => {
  const player = initialPlayer(inputs);
  const ids = player.inventory.map(i => i.uid);
  for (const [sample, multiplier] of [
    [0, 3], [.249999, 3], [.25, 4], [.499999, 4], [.5, 5], [.749999, 5], [.75, 6], [.999999, 6],
  ] as const) {
    const prize = prizes[multiplier - 3];
    const total = goal.price * multiplier;
    const remainder = (total * 100 - Math.round(prize.price * 100)) / 100;
    const hit = upgrade(player, ids, { ...goal, price: 90 }, catalog, draws(.5, .019, .59999, sample), 20);
    assert.equal(hit.landing, 180);
    assert.ok(hit.won && hit.goldHit);
    assert.deepEqual(hit.goldPayout, { skin: prize, multiplier, total, remainder });
    assert.deepEqual(hit.state.inventory.map(i => i.skinId), [prize.id]);
    assert.equal(hit.state.balance, player.balance - 20 + remainder);
    assert.equal(hit.state.history.length, 1);
    assert.ok(hit.state.history[0].title.includes(`×${multiplier} ·`));
    assert.equal(hit.state.history[0].amount, Math.round((remainder - 20) * 100) / 100);
    assert.throws(() => upgrade(hit.state, ids, goal, catalog, draws(), 20), /уже использован/);
  }
  const exact = skin('exact', 4000);
  const paid = upgrade(player, ids, goal, [...catalog, exact], draws(.045, 0, 0, .25), 20);
  const withoutCredits = upgrade(player, ids, goal, [...catalog, exact], draws(.036, 0, 0, .25));
  assert.deepEqual(paid.goldPayout, { skin: exact, multiplier: 4, total: 4000, remainder: 0 });
  assert.deepEqual(withoutCredits.goldPayout, paid.goldPayout);
  assert.equal(paid.state.balance, player.balance - 20);
});

test('on a rare spin the arrow can win the ordinary target or miss, and a non-rare stop at six is ordinary', () => {
  const player = initialPlayer(inputs), ids = player.inventory.map(i => i.uid);
  for (const [turn, event, won] of [[.008, .019, true], [.65, .019, false], [.045, .02, true]] as const) {
    const result = upgrade(player, ids, goal, catalog, draws(turn, event, .6), 20);
    assert.equal(result.goldZone, event < .02);
    assert.equal(result.goldPayout, null);
    assert.equal(result.won, won);
    assert.deepEqual(result.state.inventory.map(i => i.skinId), won ? [goal.id] : []);
    assert.equal(result.state.balance, player.balance - 20);
  }
  const expensiveGoal = skin('expensive', 10000);
  const extra = upgrade(player, ids, expensiveGoal, [...catalog, expensiveGoal], draws(.99, 0, 0, 0), 20);
  assert.ok(extra.goldHit && extra.won && extra.goldPayout);
  assert.equal(extra.goldPayout.total, 30000);
});

test('a low-priced sticker target still pays the exact bonus when no wearable fits the budget', () => {
  const sticker = (id: string, price: number): Skin => ({ ...skin(id, price), kind: 'sticker' });
  const source = sticker('input', 2), target = sticker('target', 3), prize = sticker('prize', 7);
  const pool = [source, target, prize, sticker('too-expensive', 10), skin('wearable', 19)];
  const player = { ...initialPlayer([]), inventory: [{ uid: 'item', skinId: source.id, obtained: 0 }] };
  const hit = upgrade(player, ['item'], target, pool, draws(.3, 0, 0, 0));
  assert.deepEqual(hit.goldPayout, { skin: prize, multiplier: 3, total: 9, remainder: 2 });
  assert.equal(hit.state.balance, player.balance + 2);
  assert.deepEqual(hit.state.inventory.map(i => i.skinId), [prize.id]);
  assert.throws(() => skinPayoutQuote(target.price, 3, pool), /нет скина/);
});
