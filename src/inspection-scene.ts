import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createBag } from './bag-model';
import { createHardCase } from './hard-case-model';
import { createCompactCase } from './compact-case-model';
import { createTerminal } from './terminal-model';
import { createXRay } from './xray-model';
import { createSeriesCase } from './series-case-model';
import { createCapsule, createPinPack } from './collectible-model';
import { inspectionModel, SOUVENIR_OPEN_POSE } from './inspection-model';
import { benchView } from './courtyard-poster';
import { setBenchCamera } from './courtyard-camera';
import type { Case, Skin } from './types';

type Prop = { root: T.Group; update: (progress: number) => void; setReadout?: (skins: readonly Skin[]) => void; dispose: () => void };
const ease = (value: number, from: number, to: number) => T.MathUtils.smoothstep(value, from, to);

function releaseImported(root: T.Object3D) {
  const materials = new Set<T.Material>(), textures = new Set<T.Texture>();
  root.traverse(child => {
    if (!(child instanceof T.Mesh)) return;
    child.geometry.dispose();
    if (child instanceof T.SkinnedMesh) child.skeleton.dispose();
    for (const material of Array.isArray(child.material) ? child.material : [child.material]) materials.add(material);
  });
  for (const material of materials) {
    for (const value of Object.values(material)) if (value instanceof T.Texture) textures.add(value);
    material.dispose();
  }
  for (const texture of textures) {
    texture.dispose();
    const pixels = texture.source.data;
    if (typeof ImageBitmap !== 'undefined' && pixels instanceof ImageBitmap) pixels.close();
  }
}

async function loadHingedModel(item: Case, signal: AbortSignal): Promise<Prop> {
  const spec = inspectionModel(item);
  const path = '/assets/unseal/models/' + spec.id + '.glb';
  const response = await fetch(path, { signal });
  if (!response.ok) throw new Error('Model unavailable');
  const gltf = await new GLTFLoader().parseAsync(await response.arrayBuffer(), '/assets/unseal/models/');
  const asset = gltf.scene;
  if (signal.aborted) { releaseImported(asset); throw new DOMException('Cancelled', 'AbortError'); }
  const root = new T.Group();
  root.add(asset);
  if ('workshop' in spec) {
    const mixer = new T.AnimationMixer(asset);
    const clip = gltf.animations.find(animation => animation.name === 'open')!;
    const action = mixer.clipAction(clip);
    action.setLoop(T.LoopOnce, 1); action.clampWhenFinished = true; action.play();
    return {
      root,
      update(p) { action.paused = false; mixer.setTime(p * clip.duration); },
      dispose() { mixer.stopAllAction(); mixer.uncacheRoot(asset); releaseImported(asset); },
    };
  }
  // The game packages stand on their long edge in inventory icons. Lay them flat on the bench.
  asset.rotation.order = 'YXZ';
  asset.rotation.z = Math.PI / 2;
  asset.rotation.y = Math.PI / 2;
  const mixer = new T.AnimationMixer(asset);
  const clip = gltf.animations.find(animation => animation.name === 'open')!;
  const action = mixer.clipAction(clip);
  action.setLoop(T.LoopOnce, 1); action.clampWhenFinished = true; action.play();
  mixer.setTime(0);
  asset.traverse(child => {
    if (!(child instanceof T.Mesh)) return;
    child.frustumCulled = false;
    const material = child.material as T.MeshStandardMaterial;
    if (!(child instanceof T.SkinnedMesh) && material.map) {
      // Printed panels were authored for an upright display. Rotate their UVs
      // around the centre when the package is presented horizontally.
      material.map.center.set(.5, .5);
      material.map.rotation = Math.PI;
      material.map.matrixAutoUpdate = true;
    }
    if (material.name === 'printed-insignia') {
      material.depthWrite = false; material.polygonOffset = true; material.polygonOffsetFactor = -3;
      material.polygonOffsetUnits = -2; child.renderOrder = 1;
    }
  });
  asset.updateMatrixWorld(true);
  const bounds = new T.Box3().setFromObject(asset, true);
  const size = bounds.getSize(new T.Vector3()), center = bounds.getCenter(new T.Vector3());
  const scale = 3.04 / Math.max(size.x, size.z);
  asset.scale.multiplyScalar(scale);
  asset.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
  const hinge = asset.getObjectByName('crate_hinge');
  const axis = new T.Vector3(0, 1, 0);
  return {
    root,
    update(p) {
      const t = ease(p, .035, .93);
      action.paused = false; mixer.setTime(t * clip.duration);
      if (hinge) hinge.quaternion.setFromAxisAngle(axis, 1.80 * ease(p, .24, SOUVENIR_OPEN_POSE));
    },
    dispose() { mixer.stopAllAction(); mixer.uncacheRoot(asset); releaseImported(asset); },
  };
}

function contactShadow() {
  const stamp = document.createElement('canvas');
  stamp.width = stamp.height = 128;
  const ctx = stamp.getContext('2d')!;
  const gradient = ctx.createRadialGradient(64, 64, 5, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(1,4,6,.88)');
  gradient.addColorStop(.48, 'rgba(3,5,6,.64)');
  gradient.addColorStop(1, 'rgba(3,4,6,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  return new T.CanvasTexture(stamp);
}

function cameraPose(spec: ReturnType<typeof inspectionModel>, p: number) {
  const opening = ease(p, .18, .84);
  const inspect = ease(p, .57, 1);
  const yaw = .40 + .18 * ease(p, 0, .85);
  if ('workshop' in spec) {
    const flat = spec.kind === 'souvenir', compact = spec.kind === 'compact';
    const left = spec.id === 'aperture' || spec.id === 'relay' || spec.id === 'signal-flag';
    const liftHeight = spec.id === 'signal-flag' ? 1.74 : flat ? 1.43 : compact ? 1.16 : 1.10;
    return { yaw: (left ? -1 : 1) * (.44 + .09 * opening), elevation: (flat ? .60 : .40) + .17 * opening,
      targetY: (flat ? .18 : compact ? .69 : .46) + (flat ? .80 : .61) * opening,
      height: (flat ? 2.88 : 3.16) + liftHeight * opening, margin: 1.065 + .05 * opening };
  }

  switch (spec.kind) {
    case 'capsule': {
      const lift = ease(p,.35,.7), settle = ease(p,.78,1);
      const arc = ease(p,.275,.475) * (1-ease(p,.58,.82));
      return { yaw: .24 - .37*lift + .055*settle, elevation: .19 + .065*lift,
        targetY: 1.01 + .32*lift + .21*arc + .075*settle, height: 2.65 + .93*lift + .58*arc - .04*settle, margin: .985 };
    }
    case 'pin-pack': {
      const rip = ease(p,.1,.57), settle = ease(p,.75,.99);
      return { yaw: .18 - .29*rip + .12*settle, elevation: .10 + .11*rip + .075*settle,
        targetY: 1.10 + .54*rip - .54*settle, height: 2.81 + 1.15*rip - .86*settle, margin: 1.11 };
    }
    case 'bag':
      return { yaw, elevation: .34 + .49 * opening, targetY: .85 - .20 * inspect, height: 3.0 + .14 * opening - .12 * inspect, margin: 1 };
    case 'souvenir':
      return { yaw, elevation: .48 + .18 * opening, targetY: .24 + .40 * opening, height: 1.92 + .09 * opening - .12 * inspect, margin: 1.1 + .08 * opening };
    case 'series': {
      if (spec.id === 'copper') return { yaw: .44 + .10 * opening, elevation: .35 + .20 * opening, targetY: .85 - .27 * opening, height: 3.15 + .60 * opening, margin: 1.06 };
      const modern = spec.id === 'ak' || spec.id === 'awp';
      const height = modern ? 3.25 + 2.28 * opening : 3.55 + 2.75 * opening;
      return { yaw: .66 + .08 * opening, elevation: .40 + .21 * opening, targetY: .66 + .68 * opening, height, margin: 1.08 };
    }
    case 'terminal': {
      const boot = ease(p, .12, .53);
      const approach = ease(p, .72, 1);
      return { yaw: .42 - .25 * boot - .14 * approach, elevation: .70 - .37 * boot - .10 * approach,
        targetY: .03 + .80 * boot + .45 * approach, height: 3.04 + .24 * boot, margin: 1 - .36 * approach };
    }
    case 'xray': {
      const lift = ease(p, .45, .88);
      return { yaw: .56 - .14 * lift, elevation: .43 + .20 * lift, targetY: .52 + .93 * lift, height: 3.30 + 2.05 * lift, margin: 1.05 };
    }
    case 'compact': {
      const tall = spec.id === 'ronin-compact', left = spec.id === 'arctic-compact';
      const lift = T.MathUtils.smootherstep(p, .36, .78);
      // Follow the rising lid with just enough headroom to keep its back rim in view.
      return { yaw: left ? -.44 : .37, elevation: .30 + .10 * lift,
        targetY: (tall ? 1.12 : .80) + (tall ? .38 : .60) * lift,
        height: (tall ? 3.08 : 2.55) + (tall ? .88 : 1.64) * lift, margin: 1.04 };
    }
    case 'hard':
      return { yaw, elevation: .34 + .29 * opening, targetY: .54 + .93 * ease(p, .33, .75), height: 2.43 + .75 * opening - .12 * inspect, margin: 1.13 + .64 * opening };
  }
}

async function loadInspectionProp(item: Case, signal: AbortSignal, light: 'studio' | 'courtyard' = 'studio'): Promise<Prop> {
  signal.throwIfAborted();
  const spec = inspectionModel(item);
  if ('workshop' in spec || spec.kind === 'souvenir') return loadHingedModel(item, signal);
  if (spec.kind === 'series') return createSeriesCase(item, signal, light);
  if (spec.kind === 'terminal') return createTerminal(item, signal);

  const manager = new T.LoadingManager();
  let finish!: () => void;
  const texturesReady = new Promise<void>(resolve => { finish = resolve; });
  manager.onLoad = finish;
  const abort = () => { manager.abort(); finish(); };
  signal.addEventListener('abort', abort, { once: true });
  let prop: Prop | undefined;
  try {
    switch (spec.kind) {
      case 'capsule': prop = createCapsule(item, manager); break;
      case 'pin-pack': prop = createPinPack(item, manager); break;
      case 'xray': prop = createXRay(item, manager); break;
      case 'compact': prop = createCompactCase(item, manager); break;
      case 'bag': prop = createBag(item, manager); break;
      case 'hard': prop = createHardCase(item, manager); break;
    }
    await texturesReady;
    signal.throwIfAborted();
    return prop;
  } catch (error) {
    prop?.dispose();
    throw error;
  } finally {
    signal.removeEventListener('abort', abort);
  }
}

// Measure the animated vertices. Imported game models include detached keys and
// locks, whose bounds must not determine where the case's feet meet the ground.
function measureProp(model: T.Group, body?: T.Box3) {
  const bounds = new T.Box3(), point = new T.Vector3();
  model.updateMatrixWorld(true);
  model.traverseVisible(mesh => {
    if (!(mesh instanceof T.Mesh)) return;
    if (mesh instanceof T.InstancedMesh) {
      mesh.computeBoundingBox();
      bounds.union(mesh.boundingBox!.clone().applyMatrix4(mesh.matrixWorld));
      return;
    }
    const bodyBones = body && mesh instanceof T.SkinnedMesh
      ? mesh.skeleton.bones.map(bone => ['case', 'crate_root', 'root'].includes(bone.name))
      : undefined;
    const joints = mesh.geometry.getAttribute('skinIndex');
    const positions = mesh.geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i++) {
      mesh.getVertexPosition(i, point).applyMatrix4(mesh.matrixWorld);
      bounds.expandByPoint(point);
      if (bodyBones?.[joints.getX(i)]) body!.expandByPoint(point);
    }
  });
  return bounds;
}

// The foil pouch and capsule each have a moving shell, a detachable top and an
// insert. Keep the shell on the deck as it rocks; let the top land independently.
function groundCollectible(prop: Prop, placement: T.Group, floor: number) {
  const [shell, top] = prop.root.children;
  const worldToPlacement = new T.Matrix4(), local = new T.Matrix4();
  function lowestVertex(part: T.Object3D) {
    let lowest = Infinity;
    part.traverseVisible(mesh => {
      if (!(mesh instanceof T.Mesh)) return;
      local.multiplyMatrices(worldToPlacement, mesh.matrixWorld);
      const m = local.elements;
      const pos = mesh.geometry.getAttribute('position');
      for (let i = 0; i < pos.count; i++) {
        lowest = Math.min(lowest, m[1] * pos.getX(i) + m[5] * pos.getY(i) + m[9] * pos.getZ(i) + m[13]);
      }
    });
    return lowest;
  }
  return (progress: number) => {
    prop.root.position.y = 0;
    prop.update(progress);
    prop.root.updateWorldMatrix(true, true);
    worldToPlacement.copy(placement.matrixWorld).invert();
    const lift = floor - lowestVertex(shell);
    const topLift = Math.max(0, floor - lowestVertex(top) - lift);
    prop.root.position.y = lift;
    top.position.y += topLift / prop.root.scale.y;
  };
}

export async function createCourtyardProp(item: Case, signal: AbortSignal, alignWithRecording = false) {
  const prop = await loadInspectionProp(item, signal, 'courtyard');
  try {
    signal.throwIfAborted();
    prop.update(0);
    const base = new T.Box3();
    const closed = measureProp(prop.root, base);
    if (base.isEmpty()) base.copy(closed);
    const size = closed.getSize(new T.Vector3());
    const baseSize = base.getSize(new T.Vector3());
    const center = base.getCenter(new T.Vector3());
    const spec = inspectionModel(item);
    const handheld = spec.kind === 'capsule' || spec.kind === 'pin-pack';
    const scale = (handheld ? .43 : 1) * Math.min(3.45 / Math.max(baseSize.x, baseSize.z), 2.18 / size.y);
    const root = new T.Group(), placement = new T.Group();
    // The compact case recording uses the same bench pose as the workshop.
    const benchRecording = spec.kind === 'compact' && !spec.workshop;
    const fullYaw = handheld || (alignWithRecording && !benchRecording);
    const yaw = -cameraPose(spec, 0).yaw * (fullYaw ? 1 : .65);
    root.rotation.y = yaw;
    placement.scale.setScalar(scale);
    placement.position.set(-center.x, -base.min.y, -center.z).multiplyScalar(scale);
    root.add(placement);
    placement.add(prop.root);
    prop.root.traverse(mesh => {
      if (!(mesh instanceof T.Mesh)) return;
      const materials: T.Material[] = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mesh.castShadow = materials.some(material => material.depthWrite && (!material.transparent || material.alphaTest > 0 || material.opacity >= .7));
      mesh.receiveShadow = true;
    });
    root.updateMatrixWorld(true);
    const update = spec.kind === 'capsule' || spec.kind === 'pin-pack'
      ? groundCollectible(prop, placement, base.min.y)
      : prop.update;
    return {
      root, update, setReadout: prop.setReadout,
      dispose() { root.removeFromParent(); prop.dispose(); },
    };
  } catch (error) {
    prop.dispose();
    throw error;
  }
}

export async function createInspectionScene(canvas: HTMLCanvasElement, item: Case, signal: AbortSignal, framing: 'studio' | 'bench' = 'studio') {
  const spec = inspectionModel(item);
  const attributes = { antialias: true, alpha: true, powerPreference: 'high-performance' } as const;
  const context = canvas.getContext('webgl2', attributes);
  if (!context || !('createVertexArray' in context)) throw new Error('WebGL 2 недоступен');
  const renderer = new T.WebGLRenderer({ canvas, context, ...attributes });
  renderer.setClearColor(0, 0);
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.type = T.PCFShadowMap;
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(31, 1, .1, 40);
  if (framing === 'bench') {
    setBenchCamera(camera, benchView(spec.kind));
    // Capture the centre 72% at full resolution. The overlay restores this crop on the bench.
    camera.zoom = 1 / .72;
    camera.updateProjectionMatrix();
  }
  const studio = new RoomEnvironment();
  const pmrem = new T.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(studio, .045);
  studio.dispose(); pmrem.dispose();
  scene.environment = environment.texture;
  scene.environmentIntensity = .93;
  const key = new T.DirectionalLight(0xffe7c5, 2.6);
  key.position.set(-3.2,6.3,4.4);
  key.castShadow = true;
  key.shadow.mapSize.set(768,768);
  key.shadow.radius=4;
  Object.assign(key.shadow.camera,{ left:-4.2, right:4.2, top:4, bottom:-4, near:.25, far:15 });
  key.shadow.normalBias=.018; key.shadow.bias=-.00035;
  const rim = new T.DirectionalLight(0xb9daed, 2.3); rim.position.set(3.0,4.2,-3.5);
  const fill = new T.HemisphereLight(0xdbeaf1, 0x7f7668, .91);
  if ('workshop' in spec) {
    scene.environmentIntensity = .59;
    renderer.toneMappingExposure = .94;
    fill.intensity = .46;
    rim.intensity = 1.85;
  }
  scene.add(key,rim,fill);
  const floor = new T.Mesh(new T.PlaneGeometry(20,20),new T.ShadowMaterial({opacity:.09,depthWrite:false}));
  floor.rotation.x=-Math.PI/2; floor.position.y=-.017;floor.receiveShadow=true;
  const shadowTexture=contactShadow();
  const contact=new T.Mesh(new T.PlaneGeometry(4.1,2.7), new T.MeshBasicMaterial({map:shadowTexture,transparent:true,depthWrite:false,toneMapped:false}));
  contact.rotation.x=-Math.PI/2;contact.position.y=-.01;
  scene.add(floor,contact);
  let prop: Prop | undefined, disposed=false;
  function dispose() {
    if(disposed) return;
    disposed=true;
    prop?.dispose();
    floor.geometry.dispose(); floor.material.dispose(); contact.geometry.dispose(); contact.material.dispose();
    shadowTexture.dispose(); key.shadow.dispose(); environment.dispose();renderer.dispose();
    renderer.forceContextLoss();
  }
  signal.addEventListener('abort',dispose,{once:true});
  try {
    const object = framing === 'bench' ? await createCourtyardProp(item, signal) : await loadInspectionProp(item, signal);
    if (disposed) { object.dispose(); throw new DOMException('Cancelled', 'AbortError'); }
    prop=object; scene.add(prop.root);
    prop.root.traverse(child=>{if(child instanceof T.Mesh){child.castShadow=true; child.receiveShadow=true;}});
  } catch(error) { dispose(); throw error; }

  let lastWidth = 0, lastHeight = 0;
  let lastProgress: number | undefined;
  function render(progress: number, orbit = 0) {
    if (disposed || !prop) return;
    const width = canvas.clientWidth, height = canvas.clientHeight;
    if (!width || !height) return;
    if (width !== lastWidth || height !== lastHeight) {
      lastWidth = width;
      lastHeight = height;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }
    const p = T.MathUtils.clamp(progress, 0, 1);
    // Orbiting a closed container only changes the camera; keep its mesh at rest.
    if (p !== lastProgress) renderer.shadowMap.needsUpdate = true;
    if (p !== 0 || lastProgress !== 0) prop.update(p);
    lastProgress = p;
    if (framing === 'bench') {
      renderer.render(scene, camera);
      return;
    }
    const pose = cameraPose(spec, p);
    const visibleHeight = Math.max(pose.height, 4.22 / camera.aspect) * pose.margin;
    const distance = visibleHeight / (2 * Math.tan(T.MathUtils.degToRad(camera.fov * .5)));
    const horizontal = Math.cos(pose.elevation) * distance;
    camera.position.set(
      Math.sin(pose.yaw + orbit) * horizontal,
      pose.targetY + Math.sin(pose.elevation) * distance,
      Math.cos(pose.yaw + orbit) * horizontal,
    );
    camera.lookAt(0, pose.targetY, -.04);
    renderer.render(scene, camera);
  }
  return { render, dispose, setReadout: (skins: readonly Skin[]) => prop?.setReadout?.(skins) };
}
