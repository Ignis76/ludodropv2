import * as T from 'three';

// The photographic shelf and its shadow receiver share a level contact area.
// Outside the case footprint the stone slopes away into the mountain valley.
export function buildCourtyard(scene: T.Scene, compact: boolean) {
  const geometry = new T.PlaneGeometry(19, 13, 32, 18);
  geometry.rotateX(-Math.PI / 2);
  const points = geometry.getAttribute('position');
  for (let i = 0; i < points.count; i++) {
    const x = points.getX(i), z = points.getZ(i);
    const shoulder = T.MathUtils.smoothstep(Math.hypot(x * .76, z), 2.22, 5.5);
    const relief = .10 * Math.sin(.95 * x + .73 * z) + .065 * Math.cos(1.45 * z - .64 * x);
    points.setY(i, shoulder * (relief - .17));
  }
  geometry.computeVertexNormals();
  const shade = new T.ShadowMaterial({
    color: 0x292c36, opacity: .46, depthWrite: true, fog: false,
  });
  const receiver = new T.Mesh(geometry, shade);
  receiver.name = 'Скальная полка — поверхность опоры';
  receiver.receiveShadow = true;
  receiver.renderOrder = -1;

  const sky = new T.HemisphereLight(0xe6e1ed, 0x87776c, 1.22);
  const sun = new T.DirectionalLight(0xffc996, 1.84);
  sun.position.set(-4.6, 8.8, 1.5);
  sun.castShadow = true;
  sun.shadow.mapSize.setScalar(compact ? 512 : 768);
  Object.assign(sun.shadow.camera, { left: -5.6, right: 5.6, top: 4.8, bottom: -4.8, near: .5, far: 24 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -.00017;
  sun.shadow.normalBias = .004;
  sun.shadow.radius = compact ? 5 : 7;
  const rim = new T.DirectionalLight(0xffd4ab, .56);
  rim.position.set(-4.8, 3.7, -3.8);
  const bounce = new T.DirectionalLight(0xcddeff, .54);
  bounce.position.set(2.2, 1.75, 4.3);

  const scenery = new T.Group();
  scenery.name = 'Гранитный гребень';
  scenery.add(receiver, sky, sun, rim, bounce);
  scene.add(scenery);
  return {
    ready: Promise.resolve(),
    update() {},
    dispose() {
      scenery.removeFromParent();
      sun.shadow.dispose();
      geometry.dispose();
      shade.dispose();
    },
  };
}
