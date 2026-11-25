import type { PlayerEmblem, PlayerIdentity } from './types.ts';

export const emblems: { id: PlayerEmblem; name: string }[] = [
  { id: 'nuke', name: 'Nuke' }, { id: 'ancient', name: 'Ancient' }, { id: 'dust2', name: 'Dust II' },
];
export const nicknameLimit = 24;
export function validNickname(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= nicknameLimit
    && !/[\p{Control}\u202a-\u202e\u2066-\u2069]/u.test(value);
}

export function readIdentity(saved?: unknown): PlayerIdentity {
  const data = (saved && typeof saved === 'object' ? saved : {}) as Partial<PlayerIdentity>;
  const id = typeof data.id === 'string' && /^LD-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/.test(data.id)
    ? data.id : 'LD-' + crypto.randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase().match(/.{4}/g)!.join('-');
  const nickname = validNickname(data.nickname) ? data.nickname.trim() : 'Игрок';
  const emblem = emblems.find(item => item.id === data.emblem)?.id ?? 'nuke';
  if (id === data.id && nickname === data.nickname && emblem === data.emblem) return data as PlayerIdentity;
  return { id, nickname, emblem };
}
