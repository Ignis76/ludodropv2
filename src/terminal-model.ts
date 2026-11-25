import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { Case } from './types';

const smooth = T.MathUtils.smoothstep;

function terminalDisplay() {
  const panel = document.createElement('canvas');
  const width = 544, height = 336, pixelRatio = 1.5;
  panel.width = width * pixelRatio;
  panel.height = height * pixelRatio;
  const ctx = panel.getContext('2d')!;
  ctx.scale(pixelRatio, pixelRatio);
  const texture = new T.CanvasTexture(panel);
  texture.colorSpace = T.SRGBColorSpace;
  texture.flipY = false;
  texture.anisotropy = 4;
  const glass = new T.MeshBasicMaterial({ map: texture, toneMapped: false });
  let last = -1;

  function update(progress: number) {
    const frame = Math.round(smooth(progress, .32, .96) * 54);
    if (frame === last) return;
    last = frame;
    const p = frame / 54;
    ctx.fillStyle = '#101b1a';
    ctx.fillRect(0, 0, width, height);
    if (frame > 0) {
      ctx.save();
      const warmup = smooth(p, 0, .2);
      const half = 1.5 + warmup * (height / 2);
      ctx.beginPath();
      ctx.rect(0, height / 2 - half, width, 2 * half);
      ctx.clip();
      const phosphor = ctx.createRadialGradient(255, 162, 10, 255, 162, 315);
      phosphor.addColorStop(0, '#30443b');
      phosphor.addColorStop(1, '#152620');
      ctx.fillStyle = phosphor;
      ctx.fillRect(0, 0, width, height);
      const scanning = smooth(p, .24, .80);
      const accepted = p >= .80;
      const pale = '#dbefd3', green = '#a3d7a6', muted = '#789883';
      const ink = accepted ? pale : green;
      ctx.fillStyle = green;
      ctx.font = 'bold 22px monospace';
      ctx.fillText('GENESIS', 27, 38);
      ctx.fillStyle = muted;
      ctx.font = 'bold 16px monospace';
      ctx.textAlign = 'right';
      ctx.fillText('GNS / 01', width - 26, 37);
      ctx.textAlign = 'left';
      ctx.fillRect(26, 51, width - 52, 1);

      const x = 102, y = 157, radius = 53;
      ctx.strokeStyle = muted;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.arc(x, y, radius * .74, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = ink;
      ctx.lineWidth = 4;
      ctx.beginPath();
      if (accepted) {
        ctx.moveTo(x - radius * .43, y + 1);
        ctx.lineTo(x - radius * .12, y + radius * .33);
        ctx.lineTo(x + radius * .47, y - radius * .35);
      } else {
        const angle = scanning * Math.PI * 3 - Math.PI / 2;
        ctx.moveTo(x, y);
        ctx.lineTo(x + 48 * Math.cos(angle), y + 48 * Math.sin(angle));
      }
      ctx.stroke();
      ctx.fillStyle = muted;
      ctx.font = '19px monospace';
      ctx.fillText('КАНАЛ 01', 183, 122);
      ctx.fillStyle = ink;
      ctx.font = 'bold 39px monospace';
      if (accepted) {
        ctx.fillText('КАНАЛ', 179, 167);
        ctx.fillText('ОТКРЫТ', 179, 211);
      } else {
        ctx.fillText('ПОИСК', 179, 167);
        ctx.fillText('СИГНАЛА', 179, 211);
      }
      const bars = 24;
      for (let i = 0; i < bars; i++) {
        ctx.fillStyle = (i + 1) / bars <= scanning ? green : '#41554a';
        ctx.fillRect(28 + i * 19, 259, 15, 9);
      }
      ctx.font = '16px monospace';
      ctx.fillStyle = green;
      ctx.fillText(accepted ? 'КАТАЛОГ ПОДКЛЮЧЁН' : 'ПРИЁМ ДАННЫХ', 28, 302);
      ctx.textAlign = 'right';
      ctx.fillText(Math.round(scanning * 100) + '%', width - 30, 302);
      ctx.textAlign = 'left';
      ctx.fillStyle = '#14241e26';
      for (let row = 0; row < height; row += 3) ctx.fillRect(0, row, width, 1);
      if (p < .18) {
        ctx.fillStyle = '#c5ffcb';
        ctx.globalAlpha = 1 - warmup;
        ctx.fillRect(0, height / 2 - 1, width, 3);
      }
      ctx.restore();
    }
    texture.needsUpdate = true;
  }
  return { glass, update };
}

function disposeModel(root: T.Object3D) {
  const materials = new Set<T.Material>();
  const textures = new Set<T.Texture>();
  const skeletons = new Set<T.Skeleton>();
  root.traverse(child => {
    if (!(child instanceof T.Mesh)) return;
    child.geometry.dispose();
    if (child instanceof T.SkinnedMesh) skeletons.add(child.skeleton);
    for (const material of Array.isArray(child.material) ? child.material : [child.material]) materials.add(material);
  });
  for (const skeleton of skeletons) skeleton.dispose();
  for (const material of materials) {
    for (const value of Object.values(material)) if (value instanceof T.Texture) textures.add(value);
    material.dispose();
  }
  for (const texture of textures) {
    texture.dispose();
    const data = texture.source.data;
    if (typeof ImageBitmap !== 'undefined' && data instanceof ImageBitmap) data.close();
  }
}

export async function createTerminal(_item: Case, signal: AbortSignal) {
  const url = '/assets/unseal/terminal/genesis.glb';
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error('Genesis terminal unavailable');
  const model = await new GLTFLoader().parseAsync(await response.arrayBuffer(), '/assets/unseal/terminal/');
  const asset = model.scene;
  if (signal.aborted) { disposeModel(asset); throw new DOMException('Cancelled', 'AbortError'); }
  const root = new T.Group();
  const display = terminalDisplay();
  asset.traverse(child => {
    if (!(child instanceof T.Mesh)) return;
    child.frustumCulled = false;
    if (child.material.name === 'lcd-glass') {
      child.material.dispose();
      child.material = display.glass;
    }
    if (child.material.name.includes('decal')) {
      child.material.depthWrite = false;
      child.material.polygonOffset = true;
      child.material.polygonOffsetFactor = -2;
      child.material.polygonOffsetUnits = -2;
      child.renderOrder = 1;
    }
  });
  root.add(asset);
  asset.rotation.y = Math.PI / 2;
  const mixer = new T.AnimationMixer(asset);
  const clip = model.animations.find(a => a.name === 'open')!;
  const action = mixer.clipAction(clip);
  action.setLoop(T.LoopOnce, 1);
  action.clampWhenFinished = true;
  action.play();
  mixer.setTime(0);
  asset.updateMatrixWorld(true);
  const box = new T.Box3().setFromObject(asset, true);
  const center = box.getCenter(new T.Vector3());
  const scale = 3.05 / box.getSize(new T.Vector3()).x;
  asset.scale.setScalar(scale);
  asset.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
  function update(progress: number) {
    action.paused = false;
    mixer.setTime(clip.duration * smooth(progress, .045, .73));
    display.update(progress);
  }
  update(0);
  return {
    root, update,
    dispose() { mixer.stopAllAction(); mixer.uncacheRoot(asset); disposeModel(root); },
  };
}
