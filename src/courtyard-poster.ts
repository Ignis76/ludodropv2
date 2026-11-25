import { inspectionModel } from './inspection-model';
import type { Case } from './types';

export const COURTYARD_COMPACT_WIDTH = 700;
export function benchView(kind: ReturnType<typeof inspectionModel>['kind']) {
  if (kind === 'capsule' || kind === 'pin-pack') return 'small';
  if (kind === 'terminal' || kind === 'souvenir' || kind === 'bag') return 'flat';
  return 'standard';
}

export type CaseScenery = 'workshop' | 'summit';
const preferenceKey = 'ludodrop.case-scenery.v1';
let temporaryChoice: CaseScenery | undefined;

export function preferredCaseScenery(): CaseScenery {
  if (temporaryChoice) return temporaryChoice;
  try { return localStorage.getItem(preferenceKey) === 'summit' ? 'summit' : 'workshop'; }
  catch { return 'workshop'; }
}

export function rememberCaseScenery(choice: CaseScenery) {
  try {
    localStorage.setItem(preferenceKey, choice);
    temporaryChoice = undefined;
  } catch { temporaryChoice = choice; }
}

export function sceneryImages(item: Case, scenery: CaseScenery, compact: boolean) {
  const model = inspectionModel(item);
  const view = benchView(model.kind);
  const suffix = compact ? '-mobile' : '';
  if (scenery === 'summit') return {
    poster: '/assets/unseal/summit/' + model.id + '-closed.webp',
    plate: '/assets/unseal/summit/' + view + suffix + '.webp',
  };
  const entry = '/assets/unseal/courtyard/' + model.id + suffix;
  return {
    poster: entry + '.webp',
    plate: '/assets/unseal/courtyard/bench' + (view === 'standard' ? '' : '-' + view) + suffix + '.webp',
    windowMask: entry + '-window.png',
  };
}

let preview: HTMLImageElement[] = [];
export function prepareCourtyardPoster(item: Case) {
  const { poster, plate } = sceneryImages(item, preferredCaseScenery(), window.innerWidth < COURTYARD_COMPACT_WIDTH);
  const sources = [poster, plate];
  preview = sources.map(src => {
    const cached = preview.find(image => image.getAttribute('src') === src);
    if (cached) return cached;
    const image = new Image();
    image.decoding = 'async';
    image.src = src;
    return image;
  });
}
