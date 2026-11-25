import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { initialPlayer, openCases, sellItems, casePool, probabilities, upgrade, upgradeChance, maxUpgradeContribution, contract, generateMines, mineMultiplier, debit, credit, crashPoint, wheelSegments, wheelPalette, spinSkinWheel, wheelPrize, crashFlight, CASE_RETURN, closestUpgradeTargets, stakeCrashSkin, settleSkinCrash } from '../src/engine.ts';
import { cases } from '../src/data/cases.ts';
import { workshopCases } from '../src/data/workshop-cases.ts';
import { inspectionModel } from '../src/inspection-model.ts';
import type { Skin } from '../src/types.ts';
import { reelPosition, makeReel, OPENING_DURATION, OPENING_SETTLE_DURATION, START_INDEX, WINNER_INDEX } from '../src/opening.ts';

const skins = JSON.parse(readFileSync(new URL('../src/data/assets.json', import.meta.url), 'utf8')).skins as Skin[];
test('all cases have distinct local artwork, reachable drops and normalized odds', () => {
  assert.ok(cases.length >= 36);
  assert.ok(skins.length >= 900);
  assert.equal(new Set(cases.map(c => c.id)).size, cases.length);
  assert.equal(new Set(cases.map(c => c.image)).size, cases.length);
  assert.equal(new Set(skins.map(s => s.id)).size, skins.length);
  assert.equal(new Set(skins.map(s => s.marketHashName)).size, skins.length);
  assert.equal(new Set(skins.map(s => JSON.stringify([s.weapon, s.name]))).size, skins.length, 'wear variants cannot pad the catalogue');
  const obtainable = new Set<string>();
  const funded = { ...initialPlayer(skins), balance: 100_000 };
  for (const skin of skins) {
    assert.ok(existsSync(new URL(`../public${skin.image}`, import.meta.url)), skin.image);
    assert.ok(skin.price > 0);
  }
  for (const c of cases) {
    const pool = casePool(c, skins), odds = probabilities(pool, c.price, c.dropWeights);
    assert.equal(pool.length, Object.keys(c.dropWeights!).length);
    assert.ok(pool.length > 0, c.id);
    assert.ok(Math.abs(odds.reduce((a, b) => a + b, 0) - 1) < 1e-10);
    assert.ok(odds.every(p => p > 1 / 2 ** 32 && p <= 1));
    let threshold = 0;
    pool.forEach((skin, index) => {
      // Choose an actual 32-bit RNG value inside this displayed interval.
      const roll = Math.floor((threshold + odds[index] / 2) * 2 ** 32) / 2 ** 32;
      const award = openCases(funded, c, 1, skins, () => roll).rewards[0];
      assert.equal(award.skinId, skin.id, `${c.id} / ${skin.id}`);
      obtainable.add(award.skinId);
      threshold += odds[index];
    });
    if (c.goldOnly) assert.ok(pool.every(s => s.rarity === 'gold'));
    if (c.weapons) assert.ok(pool.every(s => c.weapons!.some(w => s.weapon.includes(w))));
    assert.ok(c.image && existsSync(new URL(`../public${c.image}`, import.meta.url)), c.image);
  }
  assert.equal(obtainable.size, skins.length);
});
test('every catalogue case has its own inspection and complete recordings for all playback modes', () => {
  const ids = new Set<string>();
  const posters = new Set<string>();
  const workshopIds = new Set(workshopCases.map(item => item.id));
  for (const item of cases) {
    const model = inspectionModel(item);
    if (item.containerKind === 'capsule' || item.containerKind === 'pin-pack') assert.equal(model.kind, item.containerKind);
    assert.ok(!ids.has(model.id), 'Shared opening for ' + item.id);
    ids.add(model.id);
    if (model.kind === 'souvenir' || workshopIds.has(item.id)) {
      assert.ok(existsSync(new URL(`../public/assets/unseal/models/${model.id}.glb`, import.meta.url)), item.id);
    }
    if (model.kind === 'series' && item.id !== 'copper') {
      const root = new URL('../public/assets/unseal/series/', import.meta.url);
      const scene = JSON.parse(readFileSync(new URL(model.id + '.gltf', root), 'utf8'));
      for (const asset of [...scene.buffers, ...scene.images]) assert.ok(existsSync(new URL(asset.uri, root)), asset.uri);
    }
    for (const suffix of ['-closed', '', '-fast', '-open']) {
      const file = new URL(`../public/assets/unseal/fallback/${model.id}${suffix}.webp`, import.meta.url);
      assert.ok(existsSync(file), file.pathname);
      if (suffix === '-closed') {
        const digest = createHash('sha256').update(readFileSync(file)).digest('hex');
        assert.ok(!posters.has(digest), 'Duplicate closed image for ' + item.id);
        posters.add(digest);
      }
    }
  }
  for (const [itemId, kind] of [['arcade','terminal'], ['headshot','xray'], ['original-ronin','compact'], ['original-contraband','bag']]) {
    assert.equal(inspectionModel(cases.find(item => item.id === itemId)!).kind, kind);
  }
});
test('workshop editions have distinct themed pools in the playable catalogue', () => {
  const signatures = new Set<string>();
  for (const edition of workshopCases) {
    const item = cases.find(c => c.id === edition.id);
    assert.ok(item, edition.id);
    const pool = casePool(item, skins);
    assert.ok(pool.length >= 12, item.id);
    assert.ok(pool.every(s => (s.kind ?? 'skin') === 'skin'));
    signatures.add(pool.map(s => s.id).sort().join(','));
  }
  assert.equal(signatures.size, workshopCases.length);
});
test('original cases have distinct curated pools and never fall back to unrelated skins', () => {
  const originals = cases.filter(c => c.tag === 'ORIGINALS');
  assert.equal(originals.length, 4);
  const sets = new Set<string>();
  for (const c of originals) {
    const pool = casePool(c, skins);
    assert.ok(pool.length >= 8 && pool.length < skins.length);
    assert.ok(pool.every(s => c.skinNames!.includes(s.name)));
    sets.add(pool.map(s => s.id).sort().join(','));
    const outcome = openCases(initialPlayer(skins), c, 5, skins, () => .999999);
    assert.ok(outcome.rewards.every(item => pool.some(s => s.id === item.skinId)));
  }
  assert.equal(sets.size, 4);
  const unavailable = { ...originals[0], skinNames: ['not-in-this-catalog'] };
  assert.deepEqual(casePool(unavailable, skins), []);
  assert.throws(() => openCases(initialPlayer(skins), unavailable, 1, skins));
});
test('batch opening deducts once, grants unique items, persists every reward', () => {
  for (const count of [1, 2, 3, 5]) {
    const before = initialPlayer(skins);
    const { state, rewards } = openCases(before, cases[0], count, skins, () => .5);
    assert.equal(state.balance, before.balance - cases[0].price * count);
    assert.equal(state.inventory.length, before.inventory.length + count);
    assert.equal(state.opened, count);
    assert.equal(new Set(rewards.map(r => r.uid)).size, count);
    assert.equal(state.history.length, 1);
    const recovered = JSON.parse(JSON.stringify(state));
    assert.ok(rewards.every(r => recovered.inventory.some((i: {uid: string}) => i.uid === r.uid)));
    assert.equal(before.inventory.length, 6);
  }
});
test('sticker capsules and pin packets award the displayed collectible family and preserve wearable starter items', () => {
  const profile = initialPlayer(skins);
  assert.ok(profile.inventory.every(i => (skins.find(s => s.id === i.skinId)?.kind ?? 'skin') === 'skin'));
  for (const [containerKind, itemKind] of [['capsule', 'sticker'], ['pin-pack', 'pin']] as const) {
    const containers = cases.filter(c => c.containerKind === containerKind);
    assert.ok(containers.length > 1);
    const available = new Set<string>();
    for (const container of containers) {
      const pool = casePool(container, skins);
      assert.ok(pool.length > 1);
      for (const collectible of pool) {
        assert.equal(collectible.kind, itemKind);
        assert.equal(collectible.wear, undefined);
        available.add(collectible.id);
      }
      const start = { ...profile, balance: 100_000 };
      const opened = openCases(start, container, 5, skins);
      assert.equal(opened.state.balance, start.balance - 5 * container.price);
      for (const { skinId, uid } of opened.rewards) {
        assert.ok(pool.some(s => s.id === skinId));
        assert.ok(opened.state.inventory.some(item => item.uid === uid && item.skinId === skinId));
      }
      const sold = sellItems(opened.state, opened.rewards.map(item => item.uid), skins);
      const total = opened.rewards.reduce((sum, i) => sum + pool.find(s => s.id === i.skinId)!.price, 0);
      assert.equal(sold.balance, opened.state.balance + total);
    }
    assert.deepEqual(available, new Set(skins.filter(s => s.kind === itemKind).map(s => s.id)));
  }
});
test('invalid opening and insufficient funds leave original balance intact', () => {
  const player = initialPlayer(skins), before = JSON.stringify(player);
  assert.throws(() => openCases(player, cases[0], 4, skins));
  assert.throws(() => openCases({ ...player, balance: 0 }, cases[0], 1, skins));
  assert.equal(JSON.stringify(player), before);
});
test('selling cannot duplicate a payout or use missing inventory items', () => {
  const player = initialPlayer(skins), item = player.inventory[0];
  const after = sellItems(player, [item.uid], skins);
  assert.equal(after.balance, player.balance + skins.find(s => s.id === item.skinId)!.price);
  assert.equal(after.inventory.length, player.inventory.length - 1);
  assert.throws(() => sellItems(after, [item.uid], skins));
  assert.throws(() => sellItems(player, [item.uid, item.uid], skins));
  assert.throws(() => sellItems(player, ['missing'], skins));
});
test('drop feed records case openings independently of inventory sales', () => {
  const original = initialPlayer(skins);
  assert.equal(original.drops.length, 0, 'starter skins are not fabricated drops');
  const opened = openCases(original, cases[0], 5, skins, () => .5);
  assert.equal(opened.state.drops.length, 5);
  assert.ok(opened.state.drops.every(d => d.caseName === cases[0].name));
  assert.deepEqual(opened.state.drops.map(d => d.uid), opened.rewards.map(r => r.uid));
  const sold = sellItems(opened.state, opened.rewards.map(r => r.uid), skins);
  assert.deepEqual(sold.drops, opened.state.drops);
  const restored = JSON.parse(JSON.stringify(sold));
  assert.deepEqual(restored.drops, opened.state.drops);
  let current = sold;
  for (let i = 0; i < 8; i++) current = openCases({ ...current, balance: 100000 }, cases[1], 5, skins, () => .5).state;
  assert.equal(current.drops.length, 30);
  assert.equal(current.drops[0].caseName, cases[1].name);
});
test('reels accelerate, cross every audible detent once, and settle inside the awarded card', () => {
  assert.ok(OPENING_DURATION + OPENING_SETTLE_DURATION >= 6000 && OPENING_DURATION + OPENING_SETTLE_DURATION <= 8000);
  const winner = skins[0];
  const row = makeReel(winner, skins.slice(1, 3), [.5, .5]);
  for (const landing of [.13, .5, .87]) {
    for (const step of [1000 / 144, 1000 / 60, 50]) {
      let cursor = START_INDEX;
      const ticks: number[] = [];
      for (let ms = 0; ms <= OPENING_DURATION + step; ms += step) {
        const next = Math.floor(reelPosition(ms / OPENING_DURATION, landing));
        assert.ok(next === cursor || next === cursor + 1, 'no missed or backward crossings');
        if (next !== cursor) ticks.push(ms);
        cursor = next;
      }
      assert.equal(ticks.length, WINNER_INDEX - START_INDEX);
      assert.equal(row[cursor].id, winner.id);
      assert.equal(reelPosition(1, landing), WINNER_INDEX + landing);
      const gaps = ticks.slice(1).map((time, i) => time - ticks[i]);
      assert.ok(ticks[0] > Math.min(...gaps), 'short acceleration');
      assert.ok(gaps.at(-1)! > Math.min(...gaps) * 5, 'long braking phase');
    }
  }
});
test('upgrade consumes the selected items in both outcomes and preserves the wallet', () => {
  const player = initialPlayer(skins), ids = player.inventory.slice(0, 2).map(i => i.uid), target = skins[0];
  const won = upgrade(player, ids, target, skins, () => 0);
  assert.equal(won.won, true);
  assert.equal(won.state.inventory.length, player.inventory.length - 1);
  assert.equal(won.state.inventory[0].skinId, target.id);
  assert.equal(won.state.balance, player.balance);
  const lost = upgrade(player, ids, target, skins, () => .999999);
  assert.equal(lost.won, false);
  assert.equal(lost.state.inventory.length, player.inventory.length - 2);
  assert.equal(lost.state.balance, player.balance);
  assert.ok(ids.every(id => !lost.state.inventory.some(i => i.uid === id)));
  assert.throws(() => upgrade(won.state, ids, target, skins));
  assert.equal(upgradeChance(100, 100), 0);
  assert.equal(upgradeChance(100, 101), .75);
  assert.equal(upgradeChance(100, 200), .45);
});
test('upgrade uses the inventory value for the displayed odds at any wallet balance', () => {
  const source = { ...skins[0], id: 'source', price: 100 };
  const target = { ...skins[1], id: 'target', price: 200 };
  const catalog = [source, target];
  const chance = upgradeChance(source.price, target.price);
  for (const balance of [0, 500_000]) {
    const player = { ...initialPlayer([source]), balance };
    const ids = [player.inventory[0].uid];
    for (const [draw, won] of [[chance - .000001, true], [chance, false]] as const) {
      const attempt = upgrade(player, ids, target, catalog, () => draw);
      assert.equal(attempt.won, won);
      assert.equal(attempt.state.balance, balance);
      assert.equal(attempt.state.history.length, 1);
      assert.equal(attempt.state.history[0].amount, 0);
      assert.deepEqual(attempt.state.inventory.map(item => item.skinId), won ? [target.id] : []);
    }
  }
});
test('optional upgrade credits boost the selected goal and settle once on either outcome', () => {
  const source = { ...skins[0], id: 'source', price: 19 };
  const target = { ...skins[1], id: 'target', price: 57 };
  const catalog = [source, target];
  const player = { ...initialPlayer([source]), balance: 40.25 };
  const ids = [player.inventory[0].uid];
  assert.equal(maxUpgradeContribution(19, 57, player.balance), 28.5);
  assert.equal(maxUpgradeContribution(19, 57, 1.27), 1.27);
  assert.equal(maxUpgradeContribution(19, 20, player.balance), 0);
  const before = structuredClone(player);
  const contribution = 10.25;
  const chance = upgradeChance(19 + contribution, 57);
  for (const [draw, won] of [[chance - .000001, true], [chance, false]] as const) {
    const result = upgrade(player, ids, target, catalog, () => draw, contribution);
    assert.equal(result.won, won);
    assert.equal(result.state.balance, 30);
    assert.deepEqual(result.state.history.map(entry => entry.amount), [-10.25]);
    assert.deepEqual(result.state.inventory.map(item => item.skinId), won ? [target.id] : []);
    assert.throws(() => upgrade(result.state, ids, target, catalog, () => draw, contribution));
  }
  const cap = maxUpgradeContribution(19, 57, player.balance);
  assert.ok(upgrade(player, ids, target, catalog, () => .749999, cap).won);
  assert.equal(upgrade(player, ids, target, catalog, () => .75, cap).won, false);
  for (const invalid of [NaN, Infinity, -1, .001, cap + .01]) {
    assert.throws(() => upgrade(player, ids, target, catalog, () => { throw new Error('draw'); }, invalid), /сумму/);
  }
  assert.throws(() => upgrade({ ...player, balance: 1 }, ids, target, catalog, () => 0, 1.01), /сумму/);
  assert.throws(() => upgrade(player, [], target, catalog, () => 0, 10), /предметы/);
  assert.deepEqual(player, before);
});
test('invalid upgrade items are rejected before the draw', () => {
  const source = { ...skins[0], id: 'source', price: 100 };
  const target = { ...skins[1], id: 'target', price: 200 };
  const player = initialPlayer([source]);
  const id = player.inventory[0].uid;
  let rolls = 0;
  const rng = () => { rolls++; return 0; };
  for (const ids of [[], [id, id], ['missing']]) {
    assert.throws(() => upgrade(player, ids, target, [source, target], rng));
  }
  assert.throws(() => upgrade(player, [id], source, [source, target], rng));
  assert.equal(rolls, 0);
  assert.equal(player.history.length, 0);
  assert.equal(player.inventory.length, 1);
});
test('contracts enforce limits, consume inputs, and produce a reward in range', () => {
  const player = initialPlayer(skins), ids = player.inventory.slice(0, 3).map(i => i.uid);
  const sum = player.inventory.slice(0, 3).reduce((sum, i) => sum + skins.find(s => s.id === i.skinId)!.price, 0);
  for (const r of [0, .25, .5, .75, .999999]) {
    const result = contract(player, ids, skins, () => r);
    const reward = skins.find(s => s.id === result.reward.skinId)!;
    assert.ok(reward.price >= sum * .25 && reward.price <= sum * 3);
    assert.equal(result.state.inventory.length, player.inventory.length - 2);
    assert.equal(result.state.balance, player.balance);
    assert.throws(() => contract(result.state, ids, skins));
  }
  assert.throws(() => contract(player, ids.slice(0, 2), skins));
  assert.throws(() => contract(player, [...ids, ids[0]], skins));
});
test('mine grids never repeat cells and cashout increases with risk', () => {
  for (const count of [1, 3, 5, 10]) {
    for (let run = 0; run < 30; run++) {
      const cells = generateMines(count);
      assert.equal(cells.length, count);
      assert.equal(new Set(cells).size, count);
      assert.ok(cells.every(c => c >= 0 && c < 25));
    }
    let previous = 1;
    for (let safe = 1; safe <= 25 - count; safe++) {
      const mult = mineMultiplier(safe, count);
      assert.ok(Number.isFinite(mult) && mult >= previous);
      previous = mult;
    }
  }
  assert.ok(mineMultiplier(3, 5) > mineMultiplier(3, 1));
  assert.equal(mineMultiplier(0, 3), 1);
});
test('bad coin amounts are rejected and crash / wheel outcomes are bounded', () => {
  const player = initialPlayer(skins);
  for (const n of [NaN, Infinity, -1, 0, 10001]) assert.throws(() => debit(player, n, 'test'));
  for (const n of [NaN, Infinity, -1]) assert.throws(() => credit(player, n, 'test'));
  assert.equal(crashPoint(() => 0), 1);
  assert.equal(crashPoint(() => .999999), 25);
  assert.equal(wheelSegments.length, 12);
  assert.ok(wheelSegments.every(n => n >= 1));
  assert.equal(wheelSegments.filter(n => n === 5).length, 1);
  for (let i = 0; i < 12; i++) {
    const rotation = 6 * 360 + 360 - (i * 30 + 15);
    const pointerSector = Math.floor(((360 - rotation % 360) % 360) / 30);
    assert.equal(pointerSector, i, 'visual wheel sector must match payout');
  }
});

test('skin wheel consumes one item and awards a real skin on all twelve sectors, even at zero balance', () => {
  const player = { ...initialPlayer(skins), balance: 0 }, item = player.inventory[2];
  const stake = skins.find(s => s.id === item.skinId)!;
  assert.deepEqual([1, 2, 3, 5].map(n => wheelSegments.filter(s => s === n).length), [6, 3, 2, 1]);
  assert.equal(new Set(wheelSegments.map(n => wheelPalette[n].color)).size, 4);
  for (let index = 0; index < 12; index++) {
    const outcome = spinSkinWheel(player, item.uid, skins, () => (index + .5) / 12);
    assert.equal(outcome.index, index);
    assert.equal(outcome.multiplier, wheelSegments[index]);
    const change = Math.round((stake.price * outcome.multiplier - outcome.skin.price) * 100) / 100;
    assert.equal(outcome.state.balance, change);
    assert.equal(outcome.remainder, change);
    assert.equal(outcome.state.history[0].amount, change);
    assert.equal(outcome.skin.kind ?? 'skin', 'skin');
    assert.equal(outcome.state.inventory.length, player.inventory.length);
    assert.ok(!outcome.state.inventory.some(i => i.uid === item.uid));
    assert.equal(outcome.state.inventory[0].skinId, outcome.skin.id);
    assert.equal(outcome.skin.id, wheelPrize(stake, outcome.multiplier, skins).id);
    assert.ok(outcome.skin.price >= stake.price && outcome.skin.price <= stake.price * outcome.multiplier);
    assert.equal(outcome.state.history.length, 1);
    assert.throws(() => spinSkinWheel(outcome.state, item.uid, skins));
    if (outcome.multiplier === 1) assert.equal(outcome.skin.id, stake.id);
  }
  assert.throws(() => spinSkinWheel(player, 'missing', skins));
  assert.equal(player.inventory.length, 6);
});

test('chance finder ranks actual available chances, including nearest non-exact matches', () => {
  const candidates = [2700, 3500, 1000, 90].map((price, index) => ({ ...skins[0], id: `candidate-${index}`, price }));
  const matches = closestUpgradeTargets(100, 3, candidates);
  assert.deepEqual(matches.map(m => m.skin.price), [2700, 3500, 1000]);
  assert.ok(Math.abs(matches[0].chance - 3.333333333333333) < 1e-10);
  for (const value of [45, 180, 499, 5000]) {
    const sorted = closestUpgradeTargets(value, 3, skins);
    assert.ok(sorted.every(t => t.skin.price > value && t.chance === upgradeChance(value, t.skin.price) * 100));
    for (let i = 1; i < sorted.length; i++) assert.ok(Math.abs(sorted[i].chance - 3) >= Math.abs(sorted[i-1].chance - 3));
  }
  assert.deepEqual(closestUpgradeTargets(0, 3, skins), []);
  for (const percent of [NaN, Infinity, -1, 0, 76]) assert.deepEqual(closestUpgradeTargets(100, percent, skins), []);
  assert.deepEqual(closestUpgradeTargets(100, 3, skins, 'NO SUCH SKIN'), []);
});
test('upgrade multipliers choose the nearest item price and report its actual chance', () => {
  const candidates = [90, 150, 270, 500, 1000].map(price => ({ ...skins[0], id: String(price), price }));
  for (const [multiple, nearest] of [[2, 150], [5, 500], [10, 1000]]) {
    const targets = closestUpgradeTargets(100, multiple, candidates, '', 'multiple');
    assert.equal(targets[0].skin.price, nearest);
    assert.equal(targets[0].chance, 100 * upgradeChance(100, nearest));
    assert.ok(targets.every(({ skin }) => skin.price > 100));
  }
  assert.equal(closestUpgradeTargets(100, 45, candidates)[0].skin.price, 270);
});
test('skin crash consumes exactly the selected item and accepts an empty coin balance', () => {
  const player = { ...initialPlayer(skins), balance: 0 };
  const item = player.inventory[2];
  const started = stakeCrashSkin(player, item.uid, skins);
  assert.equal(started.state.balance, 0);
  assert.equal(started.state.inventory.length, player.inventory.length - 1);
  assert.ok(!started.state.inventory.some(i => i.uid === item.uid));
  assert.equal(started.stake.value, skins.find(s => s.id === item.skinId)!.price);
  assert.throws(() => stakeCrashSkin(started.state, item.uid, skins));
  assert.throws(() => stakeCrashSkin(started.state, player.inventory[0].uid, skins));
  assert.throws(() => stakeCrashSkin(player, 'missing', skins));
  assert.equal(player.inventory.length, 6);
});
test('skin crash cashout is settled once and loss or reload cannot refund the wager', () => {
  const player = initialPlayer(skins);
  const started = stakeCrashSkin(player, player.inventory[0].uid, skins);
  const finished = settleSkinCrash(started.state, started.stake.id, 2, skins);
  assert.equal(finished.payout, started.stake.value * 2);
  const reward = skins.find(s => s.id === finished.rewardSkinId)!;
  assert.ok(reward);
  assert.equal(finished.state.inventory[0].skinId, reward.id);
  assert.equal(finished.state.balance, player.balance + finished.payout - reward.price);
  assert.equal(finished.state.inventory.length, player.inventory.length);
  assert.equal(finished.state.crashStake, undefined);
  assert.throws(() => settleSkinCrash(finished.state, started.stake.id, 2, skins));
  assert.throws(() => settleSkinCrash(started.state, 'wrong-round', 2, skins));
  const recovered = settleSkinCrash(JSON.parse(JSON.stringify(started.state)), started.stake.id, 0, skins);
  assert.equal(recovered.state.balance, player.balance);
  assert.equal(recovered.state.inventory.length, player.inventory.length - 1);
  assert.equal(recovered.state.crashStake, undefined);
  assert.equal(recovered.payout, 0);
  for (const multiplier of [NaN, Infinity, -.5, .5, 26]) assert.throws(() => settleSkinCrash(started.state, started.stake.id, multiplier, skins));
});

test('all cases return 97 percent in expectation, with price-aware tail odds', () => {
  for (const c of cases) {
    const pool = casePool(c, skins), odds = probabilities(pool, c.price, c.dropWeights);
    const nearPrice = pool.reduce((sum, s, i) => sum + (s.price >= c.price * .65 && s.price <= c.price * 1.35 ? odds[i] : 0), 0);
    assert.ok(nearPrice > .5, `${c.id}: majority of drops should be near the opening price`);
    const expected = pool.reduce((sum, s, i) => sum + s.price * odds[i], 0);
    assert.ok(Math.abs(expected / c.price - CASE_RETURN) < 1e-9, c.id);
    for (let i = 0; i < pool.length; i++) {
      assert.ok(pool[i].price >= c.price * .5, `${c.id}: floor is half the opening price`);
      if (pool[i].price >= c.price * 50) assert.ok(odds[i] < .002, `${c.id}: expensive jackpots must be rare`);
    }
  }
  assert.throws(() => probabilities([], 100));
  assert.throws(() => probabilities([skins[0]], 100));
  assert.throws(() => probabilities(skins, NaN));
});

test('stored price snapshot matches every skin value and its specified wear', () => {
  const snapshot = JSON.parse(readFileSync(new URL('../src/data/price-snapshot.json', import.meta.url), 'utf8'));
  assert.equal(snapshot.entries.length, skins.length);
  for (const skin of skins) {
    const entry = snapshot.entries.find((e: {skinId:string}) => e.skinId === skin.id);
    assert.equal(skin.price, Math.round(entry.rub));
    assert.equal(skin.price, entry.coins);
    assert.equal(skin.marketHashName, entry.marketHashName);
    if (skin.kind === 'pin' || skin.kind === 'sticker') assert.equal(skin.wear, undefined);
    else if (skin.wear) assert.ok(['FN','FT'].includes(skin.wear));
    else assert.equal(skin.marketHashName, '★ ' + skin.weapon, 'only stock knives lack a wear grade');
  }
  const dragon = cases.find(c => c.id === 'dragon')!;
  assert.ok(casePool(dragon, skins).some(s => s.name === 'Dragon Lore'));
});

test('cashout does not stop a crash flight or reveal the future crash early', () => {
  const timeAt = (mult: number) => Math.log(mult) / .000165;
  const manual = crashFlight(timeAt(1.55), 3, 0, 0, true);
  assert.ok(manual.cashout >= 1.54 && manual.cashout <= 1.55);
  assert.equal(manual.crashed, false);
  const later = crashFlight(timeAt(2.5), 3, 0, manual.cashout);
  assert.ok(later.multiplier >= 2.49);
  assert.equal(later.cashout, manual.cashout);
  assert.equal(later.crashed, false);
  const end = crashFlight(timeAt(4), 3, 0, manual.cashout);
  assert.equal(end.crashed, true);
  assert.equal(end.multiplier, 3);
  assert.equal(end.cashout, manual.cashout);
  assert.equal(crashFlight(timeAt(4), 3, 0, 0, true).cashout, 0, 'late manual cashout loses');
  assert.equal(crashFlight(timeAt(4), 3, 2).cashout, 2, 'auto threshold crossed before crash is settled after a delayed frame');
  assert.equal(crashFlight(timeAt(4), 3, 3).cashout, 0, 'crash wins a tie');
  assert.equal(crashFlight(0, 1, 0, 0, true).crashed, true);
  assert.equal(crashFlight(0, 1, 0, 0, true).cashout, 0);
});
