import type { Case } from '../types';

// These Steam thumbnails have a 256px inventory icon centered on a 512px canvas.
const paddedCases = new Set([
  4233, 4281, 4288, 4403, 4471, 4548, 4695, 4717,
  4747, 4790, 4818, 4846, 4880, 4904, 7003, 7007,
]);

export function containerArt(item: Case): { src: string; scale: number } {
  if (item.id === 'knife') return { src: '/assets/unseal/fallback/knife-closed.webp', scale: 1.35 };
  const crate = item.image.match(/\/crate-(\d+)\.png$/)?.[1];
  return { src: item.image, scale: paddedCases.has(Number(crate)) ? 2 : 1 };
}

// These photographs are empty sets. The container itself is drawn separately.
const casesByBackdrop: Record<string, string[]> = {
  'features/dry-dock-dusk-small': ['night-port'],
  'features/freight-depot': ['dry-dock', 'rush', 'signal-flag'],
  'features/foundry-yard': ['foundry', 'copper', 'inferno'],
  'features/ancient-outpost': ['case-broken-fang', 'original-ronin', 'dragon', 'greenhouse'],
  'features/espionage-lab': ['neon', 'cyber', 'arcade'],
  'features/briefing-room': ['original-contraband', 'm4', 'headshot'],
  'features/relay-station': ['relay', 'sunset', 'awp'],
  'features/deep-station': ['pelagic', 'deep', 'toxic'],
  'features/loadout-room': ['starter', 'ak', 'knife'],
  'workshop-backdrops/aperture': ['aperture', 'spectrum', 'doppler', 'pink', 'original-graffiti'],
  'workshop-backdrops/polar-night': ['polar-night', 'arctic', 'ice', 'storm'],
  'workshop-backdrops/blackbird': ['blackbird', 'original-asiimov', 'redline', 'midnight', 'black'],
  'workshop-backdrops/salt-flat': ['salt-flat', 'eco'],
  'features/display-surface': ['sakura', 'hanami', 'gold'],
};
const backdropByCase = new Map(Object.entries(casesByBackdrop).flatMap(([backdrop, ids]) =>
  ids.map(id => [id, backdrop] as const)));
const defaultBackdrops = {
  case: 'features/equipment-room',
  capsule: 'features/espionage-lab',
  'pin-pack': 'features/relay-station',
};

export function containerBackdrop(item: Case): string {
  const backdrop = backdropByCase.get(item.id) ?? defaultBackdrops[item.containerKind ?? 'case'];
  return '/assets/cases/' + backdrop + '.webp';
}
