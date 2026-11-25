import type { PerspectiveCamera } from 'three';
import type { benchView } from './courtyard-poster';

// The live workbench and its transparent recordings share one fixed vertical field of view.
const framing = {
  standard: { aim: 1.53, pitch: .22, distance: 8.45 },
  flat: { aim: 1.08, pitch: .35, distance: 7.95 },
  small: { aim: .68, pitch: .22, distance: 4.25 },
};

export function setBenchCamera(camera: PerspectiveCamera, view: ReturnType<typeof benchView>) {
  const { aim, pitch, distance } = framing[view];
  camera.fov = 38;
  camera.position.set(0, aim + distance * Math.sin(pitch), distance * Math.cos(pitch));
  camera.lookAt(0, aim, 0);
  camera.updateProjectionMatrix();
}
