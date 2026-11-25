import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { Case, Skin } from './types';

const width = 3, depth = 2.30, rim = 1.16;
const ease = (p: number, from: number, to: number) => T.MathUtils.smoothstep(p, from, to);

// Develop the alpha cutout of the catalog item onto the film. Cropping the cutout keeps
// the optical scale consistent for portrait and landscape inventory thumbnails.
function developIcon(image: HTMLImageElement) {
  const photo = document.createElement('canvas');
  const scale = Math.min(1, 560 / Math.max(image.naturalWidth, image.naturalHeight));
  photo.width = Math.max(1, Math.round(image.naturalWidth * scale));
  photo.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const ctx = photo.getContext('2d')!;
  ctx.drawImage(image, 0, 0, photo.width, photo.height);
  const frame = ctx.getImageData(0, 0, photo.width, photo.height);
  let left = photo.width, right = 0, top = photo.height, bottom = 0;
  for (let y = 0; y < photo.height; y++) {
    for (let x = 0; x < photo.width; x++) {
      const i = 4 * (y * photo.width + x);
      if (frame.data[i + 3] < 12) continue;
      left = Math.min(left, x); right = Math.max(right, x);
      top = Math.min(top, y); bottom = Math.max(bottom, y);
      const luminance = (.21 * frame.data[i] + .72 * frame.data[i + 1] + .07 * frame.data[i + 2]) / 255;
      const density = .12 + .65 * (1 - luminance) ** 1.5;
      frame.data[i] = 22 + density * 175;
      frame.data[i + 1] = 83 + density * 164;
      frame.data[i + 2] = 99 + density * 154;
    }
  }
  if (left > right) return;
  ctx.putImageData(frame, 0, 0);
  return { photo, left, top, width: right - left + 1, height: bottom - top + 1 };
}

function inspectionFilm(loader: T.TextureLoader) {
  const canvas = document.createElement('canvas');
  canvas.width = 704; canvas.height = 456;
  const ctx = canvas.getContext('2d')!;
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  texture.anisotropy = 4;
  let disposed = false, batchSize = 0, selected: Skin | undefined;
  let icon: ReturnType<typeof developIcon>;
  let frame: HTMLImageElement | undefined, pending: HTMLImageElement | undefined;
  function draw() {
    if (disposed) return;
    ctx.fillStyle = '#122d34';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (frame) ctx.drawImage(frame, 0, 0, canvas.width, canvas.height);
    ctx.save();
    if (icon) {
      const fit = Math.min(565 / icon.width, 266 / icon.height);
      const w = fit * icon.width, h = fit * icon.height;
      ctx.shadowColor = '#398498'; ctx.shadowBlur = 8;
      ctx.drawImage(icon.photo, icon.left, icon.top, icon.width, icon.height, (canvas.width - w) / 2, 211 - h / 2, w, h);
    } else {
      ctx.lineWidth = 2; ctx.strokeStyle = '#4c757b';
      ctx.beginPath(); ctx.arc(352, 220, 65, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(352, 220, 76, -.82, .55); ctx.stroke();
      ctx.beginPath(); ctx.arc(352, 220, 76, 2.30, 3.67); ctx.stroke();
      ctx.lineWidth = 7; ctx.lineCap = ctx.lineJoin = 'round'; ctx.strokeStyle = '#9dd2d2';
      ctx.beginPath(); ctx.moveTo(321, 220); ctx.lineTo(344, 242); ctx.lineTo(387, 195); ctx.stroke();
    }
    ctx.restore();
    ctx.fillStyle = '#a6d2d2'; ctx.textAlign = 'center'; ctx.font = 'bold 24px monospace';
    ctx.fillText(selected ? selected.weapon + ' / ' + selected.name : 'SCAN COMPLETE', 352, 386, 586);
    ctx.textAlign = 'left';
    if (batchSize > 1) {
      ctx.font = 'bold 22px monospace'; ctx.fillText('×' + batchSize, 638, 90);
    }
    texture.needsUpdate = true;
  }
  const backing = loader.load('/assets/unseal/xray/film.webp', loaded => {
    if (!disposed) { frame = loaded.image; draw(); }
  });
  function cancelImage() {
    if (!pending) return;
    pending.onload = pending.onerror = null;
    pending.removeAttribute('src');
    pending = undefined;
  }
  draw();
  return {
    texture,
    setReadout(skins: readonly Skin[]) {
      cancelImage();
      batchSize = skins.length;
      selected = skins.reduce<Skin | undefined>((best, skin) => !best || skin.price > best.price ? skin : best, undefined);
      icon = undefined;
      if (disposed) return;
      draw();
      if (!selected) return;
      const image = new Image();
      pending = image;
      image.crossOrigin = 'anonymous';
      image.onload = () => {
        if (disposed || pending !== image) return;
        icon = developIcon(image);
        pending = undefined;
        draw();
      };
      image.onerror = () => { if (pending === image) pending = undefined; };
      image.src = selected.image;
    },
    dispose() { disposed = true; cancelImage(); backing.dispose(); texture.dispose(); },
  };
}

/** P250 Special Edition carton. Its lid flexes at the rear fold, above a removable film carrier. */
export function createXRay(_item: Case, manager?: T.LoadingManager) {
  const root = new T.Group();
  const loader = new T.TextureLoader(manager);
  const textures: T.Texture[] = [];
  const materials: T.Material[] = [];
  function print(name: string) {
    const texture = loader.load('/assets/unseal/xray/' + name + '.webp');
    texture.colorSpace = T.SRGBColorSpace;
    texture.anisotropy = 4;
    textures.push(texture);
    return texture;
  }
  function stock(color: string, roughness = .88, map?: T.Texture) {
    const mat = new T.MeshStandardMaterial({ color, roughness, map: map ?? null });
    materials.push(mat);
    return mat;
  }
  function block(parent: T.Group, w: number, h: number, d: number, x: number, y: number, z: number, mat: T.Material, radius = .015) {
    const mesh = new T.Mesh(new RoundedBoxGeometry(w, h, d, 1, radius), mat);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  }
  function face(parent: T.Group, w: number, h: number, mat: T.Material, x: number, y: number, z: number) {
    const mesh = new T.Mesh(new T.PlaneGeometry(w, h), mat);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  }

  const casing = stock('#354144');
  const kraft = stock('#beb8a7', .99, print('board'));
  const scored = stock('#514736');
  const lining = stock('#383b37');
  const filmBorder = stock('#253c41', .48);
  const label = stock('#b9bdb7', .96, print('label'));
  const endStamp = stock('#b9bdb7', .96, print('stock'));
  const lidPrint = stock('#b8c1bb', .94, print('lid'));
  const readout = inspectionFilm(loader);
  const filmTexture = readout.texture;
  const filmPrint = new T.MeshBasicMaterial({ map: filmTexture, toneMapped: false });
  materials.push(filmPrint);

  const halfW = width / 2, halfD = depth / 2;
  const board = .036;
  block(root, width, .07, depth, 0, .038, 0, casing);
  block(root, width, rim - .05, board, 0, (rim + .05) / 2, halfD - board / 2, casing);
  block(root, width, rim - .05, board, 0, (rim + .05) / 2, -halfD + board / 2, casing);
  face(root, width - .025, rim - .08, label, 0, (rim + .055) / 2, halfD + .001);
  for (const side of [-1, 1]) {
    const x = side * (halfW - board / 2);
    block(root, board, rim - .05, depth - .046, x, (rim + .05) / 2, 0, casing);
    const end = face(root, depth - .046, rim - .08, endStamp, side * (halfW + .001), (rim + .055) / 2, 0);
    end.rotation.y = side * Math.PI / 2;
    block(root, .040, .075, depth - .08, x - side * .016, rim - .055, 0, kraft, .006);
  }
  const innerW = width - .092, innerD = depth - .085;
  for (const side of [-1, 1]) {
    const inside = face(root, innerW, rim - .1, kraft, 0, rim / 2, side * (halfD - board - .002));
    inside.rotation.y = side === 1 ? Math.PI : 0;
    const end = face(root, innerD, rim - .13, kraft, side * (halfW - board - .002), rim / 2, 0);
    end.rotation.y = -side * Math.PI / 2;
  }
  block(root, innerW - .08, .33, innerD - .08, 0, .25, 0, lining, .028);

  const lid = new T.Group();
  lid.position.set(0, rim + .014, -halfD + .018);
  root.add(lid);
  const lidDepth = depth - .042;
  block(lid, width - .012, .039, lidDepth, 0, .010, lidDepth / 2, kraft, .009);
  face(lid, width - .022, lidDepth - .015, lidPrint, 0, .031, lidDepth / 2).rotation.x = -Math.PI / 2;
  // The scoring lines and folded returns stay attached to the unprinted side of the board.
  for (const offset of [.113, .176, lidDepth - .098]) {
    block(lid, innerW - .11, .005, .015, 0, -.012, offset, scored, .002);
  }
  for (const side of [-1, 1]) {
    block(lid, .055, .031, lidDepth - .09, side * (halfW - .060), -.019, lidDepth / 2, kraft, .004);
  }
  const tuck = new T.Group();
  tuck.position.set(0, .003, lidDepth - .032);
  lid.add(tuck);
  block(tuck, innerW - .15, .195, .026, 0, -.095, 0, kraft, .009);
  block(tuck, innerW - .18, .010, .014, 0, -.027, -.018, scored, .004);

  // These paper wings swing on their individual creases as the outer flap clears them.
  const wings = [-1, 1].map(side => {
    const pivot = new T.Group();
    pivot.position.set(side * (halfW - board - .026), rim - .127, -.02);
    root.add(pivot);
    block(pivot, .34, .027, depth - .29, -side * .17, 0, 0, kraft, .008);
    block(pivot, .009, .004, depth - .37, -side * .08, .015, 0, scored, .002);
    return pivot;
  });

  const carrier = new T.Group();
  root.add(carrier);
  const filmWidth = 2.38, filmDepth = 1.57;
  block(carrier, filmWidth + .08, .051, filmDepth + .08, 0, 0, 0, filmBorder, .020);
  const film = face(carrier, filmWidth, filmDepth, filmPrint, 0, .027, 0);
  film.rotation.x = -Math.PI / 2;
  // A paper pull-tab belongs to the carrier and moves out with the developed plate.
  block(carrier, .35, .024, .121, .71, -.011, filmDepth / 2 + .061, kraft, .010);

  const scanX = { value: -.14 }, light = { value: 0 };
  function scanSurface(scanFilm: boolean) {
    const material = new T.ShaderMaterial({
      transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
      uniforms: { scanX, light, filmMap: { value: filmTexture } },
      vertexShader: `
        varying vec2 surfaceUV;
        void main() {
          surfaceUV = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        varying vec2 surfaceUV;
        uniform sampler2D filmMap;
        uniform float scanX;
        uniform float light;
        void main() {
          float dx = surfaceUV.x - scanX;
          float beam = exp(-abs(dx) * 132.0) + .24 * exp(-abs(dx) * 31.0);
          vec3 line = vec3(.18, .86, 1.0);
          ${scanFilm ? `
            float exposure = (1.0 - smoothstep(-.035, .01, dx)) * .94;
            vec3 negative = texture2D(filmMap, surfaceUV).rgb * 1.30;
            gl_FragColor = vec4(negative + line * beam * 1.7, light * max(exposure, min(1.0, beam)));
          ` : `
            gl_FragColor = vec4(line, light * min(1.0, beam) * .87);
          `}
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    materials.push(material);
    return material;
  }
  const upperBeam = face(lid, width - .026, lidDepth - .020, scanSurface(true), 0, .034, lidDepth / 2);
  upperBeam.rotation.x = -Math.PI / 2;
  const frontBeam = face(root, width - .025, rim - .08, scanSurface(false), 0, (rim + .055) / 2, halfD + .004);
  // Invisible shader planes must not leave rectangular shadows on the original printing.
  upperBeam.customDepthMaterial = frontBeam.customDepthMaterial = new T.MeshDepthMaterial({ visible: false });
  materials.push(upperBeam.customDepthMaterial);

  function update(p: number) {
    scanX.value = -.12 + 1.25 * ease(p, .03, .48);
    light.value = ease(p, .019, .095) * (1 - ease(p, .47, .66));
    upperBeam.visible = frontBeam.visible = light.value > .002;
    const opening = ease(p, .46, .91);
    lid.rotation.x = -1.90 * opening - .026 * Math.sin(Math.PI * ease(p, .425, .51));
    // Pull the tongue towards the cavity until its bottom clears the front wall.
    tuck.rotation.x = .40 * Math.sin(Math.PI * ease(p, .425, .70)) - .58 * opening;
    const fold = ease(p, .56, .84);
    wings[0].rotation.z = 1.26 * fold;
    wings[1].rotation.z = -1.26 * ease(p, .58, .84);
    const issue = ease(p, .66, .975);
    carrier.position.set(0, .52 + 1.02 * issue, .035 + .32 * issue);
    carrier.rotation.x = .73 * issue;
    filmPrint.color.setScalar(1 + .15 * Math.sin(Math.PI * issue));
  }
  update(0);
  return {
    root, update, setReadout: readout.setReadout,
    dispose() {
      readout.dispose();
      root.traverse(part => { if (part instanceof T.Mesh) part.geometry.dispose(); });
      materials.forEach(material => material.dispose());
      textures.forEach(texture => texture.dispose());
    },
  };
}
