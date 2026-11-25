import assert from 'node:assert/strict';
import test from 'node:test';
import { initialPlayer } from '../src/engine.ts';
import { activateOfficePromo, OFFICE_PROMO_CODE, officePromoStatus, topUpWallet, WALLET_AMOUNTS } from '../src/wallet-offer.ts';

test('an older profile can activate, leave the wallet, reload, and use the offer once', () => {
  const original = initialPlayer([]);
  assert.equal(officePromoStatus(original), 'available');
  const active = activateOfficePromo(original, '  oFFiCe20 ');
  assert.equal(officePromoStatus(active), 'active');
  assert.equal(active.balance, original.balance);
  assert.deepEqual(active.history, []);
  assert.equal(activateOfficePromo(active, OFFICE_PROMO_CODE), active);
  const saved = JSON.parse(JSON.stringify(active));
  const first = topUpWallet(saved, 500_000);
  assert.equal(first.bonus, 100_000);
  assert.equal(first.total, 600_000);
  assert.equal(first.state.balance, original.balance + first.total);
  assert.equal(first.state.history[0].amount, first.total);
  assert.match(first.state.history[0].title, /OFFICE20/);
  assert.equal(officePromoStatus(first.state), 'redeemed');
  const reloaded = JSON.parse(JSON.stringify(first.state));
  assert.throws(() => activateOfficePromo(reloaded, OFFICE_PROMO_CODE), /уже получен/);
  assert.throws(() => topUpWallet(reloaded, 10_000, OFFICE_PROMO_CODE), /уже получен/);
  const normal = topUpWallet(reloaded, 10_000);
  assert.equal(normal.bonus, 0);
  assert.equal(normal.state.balance, first.state.balance + 10_000);
  assert.equal(officePromoStatus(normal.state), 'redeemed');
});

test('valid code can be applied in the top-up transaction and invalid inputs leave the offer intact', () => {
  const original = initialPlayer([]);
  for (const amount of WALLET_AMOUNTS) {
    const { state, bonus, total } = topUpWallet(original, amount, ' office20 ');
    assert.equal(bonus, amount / 5);
    assert.equal(total, amount + bonus);
    assert.equal(state.history.length, 1);
    assert.equal(officePromoStatus(original), 'available');
  }
  const active = activateOfficePromo(original, OFFICE_PROMO_CODE);
  for (const amount of [-1, 0, 5_000, NaN, Infinity]) {
    assert.throws(() => topUpWallet(active, amount), /сумму/);
  }
  assert.throws(() => topUpWallet(original, 10_000, 'office21'), /не найден/);
  assert.equal(officePromoStatus(active), 'active');
  assert.equal(active.balance, original.balance);
  assert.deepEqual(active.history, []);
  assert.equal(topUpWallet(original, 25_000, '  ').total, 25_000);
});
