import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { Case } from './types';

const seriesPath = '/assets/unseal/series/';
const smooth = T.MathUtils.smoothstep;

function disposeModel(object: T.Object3D) {
  const geometries = new Set<T.BufferGeometry>();
  const materials = new Set<T.Material>();
  const textures = new Set<T.Texture>();
  const skeletons = new Set<T.Skeleton>();
  const bitmaps = new Set<ImageBitmap>();
  object.traverse(node => {
    if (!(node instanceof T.Mesh)) return;
    geometries.add(node.geometry);
    for (const mat of Array.isArray(node.material) ? node.material : [node.material]) materials.add(mat);
    if (node instanceof T.SkinnedMesh) skeletons.add(node.skeleton);
  });
  for (const mat of materials) {
    for (const value of Object.values(mat)) if (value instanceof T.Texture) textures.add(value);
    mat.dispose();
  }
  for (const tex of textures) {
    if (typeof ImageBitmap !== 'undefined' && tex.image instanceof ImageBitmap) bitmaps.add(tex.image);
    tex.dispose();
  }
  for (const bitmap of bitmaps) bitmap.close();
  for (const geometry of geometries) geometry.dispose();
  for (const skeleton of skeletons) skeleton.dispose();
}

type Outline = ReadonlyArray<readonly [number, number]>;

function outline(points: Outline) {
  const shape = new T.Shape();
  points.forEach(([x, y], i) => i === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y));
  shape.closePath();
  return shape;
}

// The eSports 2013 inventory model has a standing two-leaf shell and a handhold
// moulded into its upper edge. Both halves rotate about the bottom piano hinge.
async function createEsportsCase(signal: AbortSignal) {
  const response = await fetch(seriesPath + 'copper-print.webp', { signal });
  if (!response.ok) throw new Error('Missing eSports 2013 insignia');
  const picture = await createImageBitmap(await response.blob(), { imageOrientation: 'flipY' });
  if (signal.aborted) { picture.close(); throw new DOMException('Cancelled', 'AbortError'); }
  const ink = new T.Texture(picture); ink.needsUpdate = true; ink.colorSpace = T.SRGBColorSpace;
  const root = new T.Group(), front = new T.Group(), back = new T.Group();
  front.position.y = back.position.y = .11;
  root.add(front, back);

  const rubber = new T.MeshStandardMaterial({ color: '#252321', roughness: .9 });
  const casing = new T.MeshStandardMaterial({ color: '#742b15', roughness: .75, metalness: .13 });
  const trim = new T.MeshStandardMaterial({ color: '#81341b', roughness: .71, metalness: .13 });
  const edges = new T.MeshStandardMaterial({ color: '#562613', roughness: .75, metalness: .1 });
  const steel = new T.MeshStandardMaterial({ color: '#645d51', roughness: .43, metalness: .69 });
  const foam = new T.MeshStandardMaterial({ color: '#323030', roughness: .96 });
  const frontFoam = new T.MeshStandardMaterial({ color: '#292829', roughness: .98 });
  const print = new T.MeshStandardMaterial({ map: ink, color: '#cfc390', transparent: true, depthWrite: false, roughness: .82, polygonOffset: true, polygonOffsetFactor: -2 });

  function part(group: T.Group, geom: T.BufferGeometry, mat: T.Material, x: number, y: number, z: number) {
    const mesh = new T.Mesh(geom, mat);
    mesh.position.set(x, y, z); mesh.castShadow = mesh.receiveShadow = true; group.add(mesh);
    return mesh;
  }
  function box(group: T.Group, mat: T.Material, x: number, y: number, z: number, w: number, h: number, d: number, radius = .02) {
    return part(group, new RoundedBoxGeometry(w, h, d, 2, radius), mat, x, y, z);
  }
  function bevel(shape: T.Shape, depth: number, radius: number) {
    return new T.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSize: radius, bevelThickness: radius, bevelSegments: 2, curveSegments: 6 });
  }
  const perimeter: Outline = [[-1.27,0],[1.27,0],[1.49,.21],[1.49,1.33],[1.27,1.56],[-1.26,1.56],[-1.49,1.34],[-1.49,.21]];
  const rim = outline(perimeter);
  const aperture = outline(perimeter.map(([x,y]) => [x * .955, .052 + y * .933] as const));
  rim.holes.push(aperture);
  const walls = bevel(rim,.084,.016);
  const outer = bevel(outline(perimeter),.034,.037);
  // Stamped panel, bevelled ribs and the recessed rectangular side catches.
  const rails=outline([[-1.22,.07],[1.22,.07],[1.427,.27],[1.427,1.30],[1.22,1.48],[.34,1.48],[.25,1.37],[-.25,1.37],[-.34,1.48],[-1.22,1.48],[-1.427,1.30],[-1.427,.27]]);
  rails.holes.push(outline([[-1.12,.235],[1.10,.235],[1.23,.35],[1.23,.98],[1.12,1.19],[-1.03,1.19],[-1.21,1.31],[-1.23,1.09],[-1.23,.36]]));
  for (const x of [-1.335,1.335]) rails.holes.push(outline([[x-.037,.60],[x+.037,.60],[x+.037,.89],[x-.037,.89]]));
  const panel = bevel(rails,.023,.025);
  const catches: T.Group[] = [];
  for (const [shell, side] of [[front,1],[back,-1]] as const) {
    const face = new T.Group(); shell.add(face);
    if (side < 0) face.rotation.y = Math.PI;
    part(face,walls,edges,0,0,.008);
    part(face,outer,casing,0,0,.095);
    part(face,panel,trim,0,0,.155);
    const crown = outline([[-.37,1.54],[.37,1.54],[.32,1.66],[.24,1.72],[-.24,1.72],[-.32,1.66]]);
    crown.holes.push(outline([[-.235,1.582],[.235,1.582],[.208,1.64],[.154,1.662],[-.163,1.662],[-.21,1.64]]));
    part(face,bevel(crown,.065,.014),casing,0,0,.046);
    box(face,rubber,0,1.656,.071,.36,.025,.08,.012);
    for (const x of [-1.35,1.35]) {
      box(face,edges,x,.752,.165,.093,.287,.014,.01);
    }
    const interior = bevel(outline(perimeter.map(([x,y])=>[x*.91,.067+y*.905] as const)), .032,.016);
    part(face,interior,side===1?frontFoam:foam,0,0,.044);
    if (side === 1) {
      const mat = frontFoam.clone(); mat.color.set('#373435');
      const pockets = outline([[-1.22,.22],[1.22,.22],[1.22,1.25],[-1.22,1.25]]);
      pockets.holes.push(outline([[-1.07,.40],[-.25,.40],[-.19,.47],[-.19,1.07],[-.27,1.13],[-1.07,1.13]]));
      pockets.holes.push(outline([[.04,.40],[1.08,.40],[1.08,.64],[.97,.77],[.04,.77]]));
      pockets.holes.push(outline([[.04,.89],[1.08,.89],[1.08,1.12],[.04,1.12]]));
      part(face,bevel(pockets,.025,.012),mat,0,0,.003);
      part(face,new T.PlaneGeometry(2.24,.89),print,-.075,.70,.17);
    } else {
      // A single mesh forms the moulded convoluted lining inside the rear lid.
      const liner = new T.PlaneGeometry(2.55,1.23,91,45);
      const verts = liner.getAttribute('position');
      for (let i=0;i<verts.count;i++) {
        const x=verts.getX(i), y=verts.getY(i);
        const taper=smooth(1.275-Math.abs(x),0,.09)*smooth(.615-Math.abs(y),0,.09);
        const crest=(.5+.5*Math.cos(x*27))*(.5+.5*Math.cos(y*25));
        verts.setZ(i,.053*crest*taper);
      }
      liner.computeVertexNormals(); liner.rotateY(Math.PI);
      part(face,liner,foam,0,.78,.021);
    }
  }
  for (const x of [-.94,.94]) {
    const clip = new T.Group(); clip.position.set(x,1.515,.04); back.add(clip);
    box(clip,edges,0,.024,.059,.184,.076,.19);
    box(clip,trim,0,.017,.118,.151,.079,.054);
    catches.push(clip);
  }
  for (const x of [-1.03,-.79,.79,1.03]) {
    const spindle = part(root,new T.CylinderGeometry(.055,.055,.22,14),steel,x,.105,0); spindle.rotation.z = Math.PI/2;
  }
  // As the front leaf rolls onto its thick outer ribs, its point of contact
  // moves away from the spindle. Keep the actual lower silhouette on the desk.
  root.updateMatrixWorld(true);
  const forwardAtHeight = new Map<number, number>();
  const vertex = new T.Vector3();
  front.traverse(node => {
    if (!(node instanceof T.Mesh)) return;
    const positions = node.geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i++) {
      vertex.fromBufferAttribute(positions, i).applyMatrix4(node.matrixWorld);
      const y = vertex.y - front.position.y;
      forwardAtHeight.set(y, Math.max(vertex.z, forwardAtHeight.get(y) ?? -Infinity));
    }
  });
  let furthest = -Infinity;
  const supports = [...forwardAtHeight].sort(([a], [b]) => a - b).filter(([, z]) => {
    if (z <= furthest) return false;
    furthest = z;
    return true;
  });
  return {
    root,
    update(p: number) {
      catches.forEach((clip,i)=>{ clip.rotation.x=-1.55*smooth(p,.04+i*.07,.28+i*.05); });
      front.rotation.x=1.43*smooth(p,.24,.86)+.035*(smooth(p,.67,.85)-smooth(p,.85,1));
      back.rotation.x=-.26*smooth(p,.24,.76);
      const sin = Math.sin(front.rotation.x), cos = Math.cos(front.rotation.x);
      const lowest = Math.min(...supports.map(([y,z]) => front.position.y + y*cos - z*sin));
      root.position.y = -Math.min(.105 - .055, lowest);
      root.position.z=-.48*smooth(p,.24,.86);
    },
    dispose() { disposeModel(root); },
  };
}

// The source animations include a tumbling padlock and key. Their pivots can
// be above the workbench even while a shackle or tooth is already beneath it.
function supportFitting(root: T.Group, joint: T.Object3D) {
  const parent = joint.parent!;
  const travel = new T.Group();
  parent.add(travel);
  travel.add(joint);
  const members = new Set<T.Object3D>();
  joint.traverse(node => members.add(node));
  const contactMeshes: { mesh: T.SkinnedMesh; vertices: number[] }[] = [];
  root.traverse(mesh => {
    if (!(mesh instanceof T.SkinnedMesh)) return;
    const joints = mesh.geometry.getAttribute('skinIndex');
    const vertices: number[] = [];
    // Imported fittings are rigidly weighted to one bone per vertex.
    for (let i = 0; i < joints.count; i++) {
      if (members.has(mesh.skeleton.bones[joints.getX(i)])) vertices.push(i);
    }
    if (vertices.length) contactMeshes.push({ mesh, vertices });
  });
  const vertex = new T.Vector3(), toBench = new T.Matrix4(), fromBench = new T.Matrix4();
  const meshToBench = new T.Matrix4(), translation = new T.Matrix3();
  return (forward: number, sideways = 0) => {
    travel.position.set(0, 0, 0);
    root.updateMatrixWorld(true);
    toBench.copy(root.matrixWorld).invert();
    let lowest = Infinity;
    for (const { mesh, vertices } of contactMeshes) {
      meshToBench.multiplyMatrices(toBench, mesh.matrixWorld);
      for (const i of vertices) {
        mesh.getVertexPosition(i, vertex).applyMatrix4(meshToBench);
        lowest = Math.min(lowest, vertex.y);
      }
    }
    fromBench.copy(parent.matrixWorld).invert().multiply(root.matrixWorld);
    translation.setFromMatrix4(fromBench);
    travel.position.set(sideways, Math.max(0, .001 - lowest), forward).applyMatrix3(translation);
  };
}

export async function createSeriesCase(item: Case, signal: AbortSignal, light: 'studio' | 'courtyard' = 'studio') {
  if (item.id === 'copper') return createEsportsCase(signal);
  const manager = new T.LoadingManager();
  const abort = () => manager.abort();
  signal.throwIfAborted();
  signal.addEventListener('abort', abort, { once: true });
  let gltf;
  try {
    gltf = await new GLTFLoader(manager).loadAsync(seriesPath + item.id + '.gltf');
  } finally {
    signal.removeEventListener('abort', abort);
  }
  const asset = gltf.scene;
  if (signal.aborted) { disposeModel(asset); throw new DOMException('Cancelled','AbortError'); }
  asset.rotation.y = -Math.PI / 2;
  const modern = item.id === 'ak' || item.id === 'awp';
  const black = item.id === 'dry-dock' || item.id === 'm4' || item.id === 'rush';
  const tuned = new Set<T.Material>();
  asset.traverse(node => {
    if (!(node instanceof T.Mesh)) return;
    node.frustumCulled = false;
    const mat = node.material as T.MeshStandardMaterial;
    if (!tuned.has(mat)) {
      tuned.add(mat);
      if (light === 'studio') {
        if (mat.name.startsWith('ink-')) mat.color.multiplyScalar(.65);
        else if (modern) mat.color.multiply(new T.Color(.62,.46,.34));
        else if (black) mat.color.multiplyScalar(.52);
        else mat.color.multiply(new T.Color(.47,.36,.23));
      }
      if (mat.name === 'ink-front' && mat.map) {
        mat.map.center.set(.5,.5);
        mat.map.repeat.setScalar(1.16);
        mat.map.wrapS = mat.map.wrapT = T.ClampToEdgeWrapping;
      }
    }
    if (mat.name.startsWith('ink-')) {
      mat.depthWrite = false; mat.polygonOffset = true; mat.polygonOffsetFactor = -3; mat.polygonOffsetUnits = -2; node.renderOrder = 1;
    }
  });
  const root = new T.Group(); root.add(asset);
  const clip = gltf.animations[0], mixer = new T.AnimationMixer(asset);
  const action = mixer.clipAction(clip);
  action.setLoop(T.LoopOnce,1); action.clampWhenFinished=true; action.play();
  // Older cases keep the key well below the floor until it reaches the lock.
  mixer.setTime(modern ? 0 : clip.duration*.52);
  asset.updateMatrixWorld(true);
  const bounds = new T.Box3().setFromObject(asset, true);
  const size = bounds.getSize(new T.Vector3()), center = bounds.getCenter(new T.Vector3());
  const scale = 3.04 / Math.max(size.x, size.z);
  asset.scale.setScalar(scale);
  asset.position.set(-center.x*scale,-bounds.min.y*scale,-center.z*scale);
  const key = asset.getObjectByName(modern ? 'crate_key' : 'key');
  const lock = asset.getObjectByName(modern ? 'crate_padlock' : 'lock')!;
  const supportLock = supportFitting(root, lock);
  const supportKey = !modern && key ? supportFitting(root, key) : undefined;
  const lid = asset.getObjectByName(modern ? 'crate_lid' : 'lid')!;
  mixer.setTime(0);
  const shut = lid.quaternion.clone();
  mixer.setTime(clip.duration);
  const open = lid.quaternion.clone();
  // The first frame of the older animation teleports the key up from below the stage.
  const firstTime = modern ? 0 : 1 / 30;
  function update(p: number) {
    action.paused = false;
    mixer.setTime(T.MathUtils.lerp(firstTime, clip.duration, p));
    // Keep the original hinge axis, travel and the modern lid's small rebound.
    // The game clip reaches them in a few frames around a camera cut.
    const lift = T.MathUtils.smootherstep(p, modern ? .32 : .50, modern ? .85 : .94);
    const rebound = modern ? .045 * (smooth(p, .69, .85) - smooth(p, .85, .99)) : 0;
    lid.quaternion.slerpQuaternions(shut, open, lift + rebound);
    key?.scale.setScalar(Math.max(.001,smooth(p,.005,.115)*(1-smooth(p,.74,.88))));
    // The classic clip drops the released lock and key back into the front
    // casting. Carry them past the face before either starts to tumble.
    const clearance = modern ? 0 : .19 * smooth(p, .438, .495);
    // On the narrow inspection bench the released lock slides along the
    // front of the case, settling on the mat before it reaches the edge.
    const onBench = !modern && light === 'courtyard';
    const slide = onBench ? -.84 * smooth(p,.695,.975) : 0;
    const settle = onBench ? .395 * smooth(p,.8,1) : 0;
    supportLock(clearance - settle, slide);
    supportKey?.(clearance);
  }
  update(0);
  return { root, update, dispose() { mixer.stopAllAction(); mixer.uncacheRoot(asset); disposeModel(root); } };
}
