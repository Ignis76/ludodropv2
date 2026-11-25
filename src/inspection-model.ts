import type { Case } from './types';

export const SOUVENIR_OPEN_POSE = .85;
export const COMPACT_OPEN_POSE = .94;

const souvenir = new Set(['sunset', 'cyber', 'toxic', 'inferno', 'ice', 'sakura', 'deep', 'storm']);
const compact = new Set(['arctic', 'neon', 'original-ronin', 'gold']);
const workshop = new Map<string, 'hard' | 'compact' | 'souvenir'>([
  ['foundry','hard'], ['relay','compact'], ['pelagic','hard'], ['aperture','compact'],
  ['salt-flat','souvenir'], ['signal-flag','souvenir'], ['polar-night','compact'], ['blackbird','hard'],
]);

export function inspectionModel(item: Case) {
  const shell = workshop.get(item.id);
  if (shell) return { kind: shell, id: item.id, workshop: true } as const;
  if (item.containerKind === 'capsule') return { kind: 'capsule', id: item.id } as const;
  if (item.containerKind === 'pin-pack') return { kind: 'pin-pack', id: item.id } as const;
  if (item.id === 'arcade') return { kind: 'terminal', id: item.id } as const;
  if (item.id === 'headshot') return { kind: 'xray', id: item.id } as const;
  if (souvenir.has(item.id)) return { kind: 'souvenir', id: item.id } as const;
  const custom = item.image?.match(/\/collections\/([\w-]+)\.webp$/)?.[1];
  if (custom) {
    const id = item.id === 'hanami' ? item.id : custom;
    if (custom === 'contraband') return { kind: 'bag', id } as const;
    if (compact.has(item.id)) return { kind: 'compact', id: custom + '-compact' } as const;
    return { kind: 'hard', id } as const;
  }
  return { kind: 'series', id: item.id } as const;
}
