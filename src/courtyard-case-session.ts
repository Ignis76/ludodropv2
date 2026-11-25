import type { Skin } from './types';

export interface CourtyardCaseSession {
  setVisible(visible: boolean): void;
  render(progress: number): void;
  setReadout(skins: readonly Skin[]): void;
  setInspectionAngle?(radians: number): void;
}
