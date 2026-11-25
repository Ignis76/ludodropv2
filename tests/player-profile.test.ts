import assert from 'node:assert/strict';
import test from 'node:test';
import { readIdentity, validNickname } from '../src/player-identity.ts';

test('local player identities survive reloads and repair individual damaged fields', () => {
  const profile = readIdentity();
  assert.match(profile.id, /^LD-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$/);
  assert.notEqual(readIdentity().id, profile.id);
  const edited = { ...profile, nickname: 'Капитан', emblem: 'dust2' };
  assert.equal(readIdentity(edited), edited);
  assert.deepEqual(readIdentity({ ...edited, nickname: '  Капитан  ' }), edited);
  assert.deepEqual(readIdentity({ ...edited, emblem: 'unknown' }), { ...edited, emblem: 'nuke' });
  assert.deepEqual(readIdentity({ ...edited, nickname: '  ' }), { ...edited, nickname: 'Игрок' });
  assert.equal(readIdentity({ ...edited, id: null }).nickname, edited.nickname);
  assert.equal(validNickname('a'.repeat(25)), false);
  assert.equal(validNickname('a\nb'), false);
});
