import * as T from 'three';
import { createCourtyardContact } from './courtyard-contact';
import type { createCourtyardProp } from './inspection-scene';
import type { CourtyardCaseSession } from './courtyard-case-session';
import { inspectionModel } from './inspection-model';
import { benchView, COURTYARD_COMPACT_WIDTH } from './courtyard-poster';
import { setBenchCamera } from './courtyard-camera';
import type { Case } from './types';

interface StageLayout {
  ready: Promise<void>;
  setArmoryEnvironment?(texture: T.Texture): void;
  update(time: number): void;
  dispose(): void;
}

interface StageScenery<Layout extends StageLayout> {
  buildLayout(scene: T.Scene, compact: boolean, closeUp: boolean): Layout;
  sky: T.ShaderMaterialParameters;
  panorama: string;
  reflections: { load(): Promise<T.Texture> } | { fromPanorama(renderer: T.WebGLRenderer, photo: HTMLImageElement): T.WebGLCubeRenderTarget };
  reflectionIntensity: number;
  alignWithRecording?: boolean;
  snow: { wide: number; compact: number; opacity: number; variation: number };
}

function snowfall(count: number, opacity: number, variation: number) {
  const geometry = new T.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const factors = new Float32Array(count * 2);
  let seed = 10846;
  const random = () => ((seed = (Math.imul(seed,1664525) + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < count; i++) {
    positions.set([random()*34,random()*10,-7.4-random()*18],i*3);
    factors.set([0.42+random()*0.63,random()],i*2);
  }
  geometry.setAttribute('position',new T.BufferAttribute(positions,3));
  geometry.setAttribute('aDrift',new T.BufferAttribute(factors,2));
  const material = new T.ShaderMaterial({
    transparent: true, depthWrite: false, toneMapped: false,
    uniforms: { uTime: { value: 0 }, uScale: { value: 400 } },
    vertexShader: `
      attribute vec2 aDrift;
      uniform float uTime, uScale;
      varying float vOpacity;
      void main() {
        vec3 p = position;
        p.x = mod(p.x + uTime * (0.28 + aDrift.x * 0.32) + 0.20*sin(uTime*0.7 + p.z),34.0)-17.0;
        p.y = mod(p.y - uTime * aDrift.x,10.0)-1.0;
        vec4 mv = modelViewMatrix * vec4(p,1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = clamp((0.018 + 0.022*aDrift.y)*uScale/max(1.0,-mv.z),1.15,5.4);
        vOpacity = (${opacity}+${variation}*aDrift.y)*smoothstep(-1.0,.5,p.y);
      }`,
    fragmentShader: `
      varying float vOpacity;
      void main() {
        float radius=length((gl_PointCoord-.5)*vec2(2.1,1.68));
        gl_FragColor=vec4(.87,.93,1.,(1.0-smoothstep(.20,1.,radius))*vOpacity);
      }`,
  });
  const points = new T.Points(geometry,material);
  points.frustumCulled = false;
  points.renderOrder = 8;
  return points;
}

export function createCaseStageRenderer<Layout extends StageLayout>(
  canvas: HTMLCanvasElement, item: Case | undefined, scenery: StageScenery<Layout>, captureAlpha = false,
) {
  const attributes = { alpha: captureAlpha, antialias: true, powerPreference: 'low-power' } as const;
  const context = canvas.getContext('webgl2',attributes as WebGLContextAttributes);
  if (!context) throw new Error('WebGL2 unavailable');
  const renderer = new T.WebGLRenderer({ canvas, context, ...attributes });
  renderer.debug.checkShaderErrors = process.env.NODE_ENV !== 'production';
  const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const maxDimension = Math.min(renderer.capabilities.maxTextureSize, context.getParameter(context.MAX_RENDERBUFFER_SIZE));
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  const scene = new T.Scene();
  scene.fog = new T.Fog(0x8396a9,11,68);
  const camera = new T.PerspectiveCamera(38,1,.12,100);
  const skyMaterial = new T.ShaderMaterial({
    ...scenery.sky, side: T.BackSide, depthWrite: false, toneMapped: false,
    uniforms: { ...scenery.sky.uniforms, uSkyMap: { value: null }, uSkyReady: { value: 0 } },
  });
  const sky = new T.Mesh(new T.SphereGeometry(61,24,12), skyMaterial);
  sky.renderOrder = -10;
  const snow = snowfall(scenery.snow.wide, scenery.snow.opacity, scenery.snow.variation);
  scene.add(sky, snow);
  let set: Layout | undefined, incoming: Layout | undefined;
  let layoutReady: Promise<void> = Promise.resolve();
  let compact: boolean | undefined;
  let disposed = false;
  let prop: Awaited<ReturnType<typeof createCourtyardProp>> | undefined;
  let reflections: T.Texture | undefined;
  let reflectionTarget: T.WebGLCubeRenderTarget | undefined;
  let readyToDraw = !item;
  let contact: ReturnType<typeof createCourtyardContact> | undefined;
  let contactDirty = false, lastContactTime = -Infinity;
  let progress = 0, currentTime = 1.6, pendingPaint = 0, lastPoseTime = -Infinity;
  const view = item ? benchView(inspectionModel(item).kind) : 'standard';
  setBenchCamera(camera,view);
  sky.position.copy(camera.position);

  function draw(time: number) {
    cancelAnimationFrame(pendingPaint);
    pendingPaint = 0;
    currentTime = time;
    if (!readyToDraw || disposed) return;
    if (skyMaterial.uniforms.uTime) skyMaterial.uniforms.uTime.value = time;
    snow.material.uniforms.uTime.value = time;
    set?.update(time);
    if (contact && contactDirty) {
      const now = performance.now();
      if (!prop?.root.visible || progress === 0 || progress === 1 || now-lastContactTime >= 50) {
        contact.update();
        contactDirty = false;
        lastContactTime = now;
      }
    }
    renderer.render(scene,camera);
  }
  function paintPose() {
    if (readyToDraw && !pendingPaint && !disposed) pendingPaint = requestAnimationFrame(() => draw(currentTime));
  }

  async function loadCase(signal: AbortSignal): Promise<CourtyardCaseSession> {
    if (!item) throw new Error('Case required');
    const { createCourtyardProp } = await import('./inspection-scene');
    signal.throwIfAborted();
    const model = await createCourtyardProp(item,signal,scenery.alignWithRecording);
    if (disposed || signal.aborted) {
      model.dispose();
      throw new DOMException('Cancelled','AbortError');
    }
    prop = model;
    await lightingReady;
    // A resize can replace the layout while its textures are still being decoded.
    let layout;
    do { layout = layoutReady; await layout; } while (layout !== layoutReady && !disposed);
    signal.throwIfAborted();
    if (disposed) throw new DOMException('Cancelled','AbortError');
    model.root.traverse(node => {
      if (!(node instanceof T.Mesh)) return;
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
        if (!(material instanceof T.MeshStandardMaterial)) continue;
        for (const map of [material.map, material.normalMap, material.roughnessMap, material.metalnessMap, material.bumpMap]) {
          if (map && map.generateMipmaps && map.anisotropy < anisotropy) {
            map.anisotropy = anisotropy;
            map.needsUpdate = true;
          }
        }
        if (reflections && !material.envMap) {
          material.envMap = reflections;
          material.envMapIntensity = scenery.reflectionIntensity;
          material.needsUpdate = true;
        }
      }
    });
    model.root.visible = false;
    scene.add(model.root);
    contact = createCourtyardContact(renderer,scene,model.root);
    await renderer.compileAsync(scene,camera);
    signal.throwIfAborted();
    if (disposed) throw new DOMException('Cancelled','AbortError');
    readyToDraw = true;
    const container = canvas.parentElement;
    const restYaw = model.root.rotation.y;
    if (container) container.dataset.caseId = item.id;
    return {
      setVisible(visible) {
        if (disposed || model.root.visible === visible) return;
        model.root.visible = visible;
        if (!visible) model.root.rotation.y = restYaw;
        contactDirty = true;
        container?.toggleAttribute('data-prop-visible',visible);
        renderer.shadowMap.needsUpdate = true;
        paintPose();
      },
      setInspectionAngle(radians) {
        if (disposed || !model.root.visible || !Number.isFinite(radians)) return;
        model.root.rotation.y = restYaw + radians;
        contactDirty = true;
        renderer.shadowMap.needsUpdate = true;
        paintPose();
      },
      render(value) {
        if (disposed) return;
        const pose = T.MathUtils.clamp(value,0,1);
        const now = performance.now();
        const endpoint = pose !== progress && (pose === 0 || pose === 1);
        if (!endpoint && now-lastPoseTime < 1000/60-.5) return;
        const elapsed = Math.min(.1,(now-lastPoseTime)/1000);
        lastPoseTime = now;
        if (progress !== pose) {
          renderer.shadowMap.needsUpdate = true;
          contactDirty = true;
        }
        progress = pose;
        model.update(pose);
        // The unlock clock already runs inside requestAnimationFrame.
        if (model.root.visible) draw(currentTime+(pose > 0 ? elapsed : 0));
      },
      setReadout(skins) {
        if (disposed) return;
        model.setReadout?.(skins);
        if (model.root.visible) paintPose();
      },
    };
  }
  function applyReflections(texture: T.Texture) {
    reflections = texture;
    set?.setArmoryEnvironment?.(texture);
    incoming?.setArmoryEnvironment?.(texture);
    paintPose();
  }

  const lighting = scenery.reflections;
  let panorama: T.Texture | undefined;
  const panoramaReady = new T.TextureLoader().loadAsync(scenery.panorama).then(texture => {
    if (disposed) { texture.dispose(); return; }
    panorama = texture;
    texture.colorSpace = T.SRGBColorSpace;
    skyMaterial.uniforms.uSkyMap.value = texture;
    skyMaterial.uniforms.uSkyReady.value = 1;
    if ('fromPanorama' in lighting) {
      reflectionTarget = lighting.fromPanorama(renderer, texture.image);
      applyReflections(reflectionTarget.texture);
    }
    paintPose();
  }).catch(error => {
    // The indoor sky shader and baked lighting also work without the landscape photo.
    if ('fromPanorama' in lighting) throw error;
  });
  const bakedReady = item && 'load' in lighting && lighting.load().then(texture => {
    if (disposed) texture.dispose();
    else applyReflections(texture);
  }).catch(() => {});
  const lightingReady = Promise.all([panoramaReady, bakedReady]);
  void lightingReady.catch(() => {}); // loadCase observes this once its prop is ready.

  function changeLayout(isCompact: boolean) {
    incoming?.dispose();
    const staging = new T.Scene();
    const next = scenery.buildLayout(staging, isCompact, view === 'small');
    incoming = next;
    if (reflections) next.setArmoryEnvironment?.(reflections);
    layoutReady = next.ready.then(() => {
      if (disposed || incoming !== next) return;
      set?.dispose();
      scene.add(...staging.children.slice());
      set = next;
      incoming = undefined;
      renderer.shadowMap.needsUpdate = true;
      paintPose();
    }).catch(error => {
      if (disposed || incoming !== next) return;
      next.dispose();
      incoming = undefined;
      if (!set) throw error;
      // The last complete layout can still render if a replacement texture failed.
    });
    void layoutReady.catch(() => {});
    snow.geometry.setDrawRange(0, isCompact ? scenery.snow.compact : scenery.snow.wide);
  }

  const surface = {
    resize(width: number, height: number, exportRatio?: number) {
      if (compact !== (width < COURTYARD_COMPACT_WIDTH)) {
        compact = width < COURTYARD_COMPACT_WIDTH;
        changeLayout(compact);
      }
      // On phones match the display density; on desktop supersample up to 1080 scanlines.
      const density = window.devicePixelRatio || 1;
      const liveRatio = Math.min(compact ? Math.min(density, 3) : Infinity,
        1080 / height, Math.sqrt(4_194_304 / (width * height)));
      const ratio = Math.min(exportRatio ?? liveRatio, maxDimension / Math.max(width,height));
      renderer.setDrawingBufferSize(width,height,ratio);
      camera.aspect=width/height;
      if (skyMaterial.uniforms.uAspect) skyMaterial.uniforms.uAspect.value = camera.aspect;
      camera.updateProjectionMatrix();
      snow.material.uniforms.uScale.value=height*ratio*.95;
    },
    draw(time: number, _pointer = 0) {
      draw(time);
    },
    loadCase,
    snapshot(time: number, _pointer = 0, quality = .8) {
      draw(time);
      return canvas.toDataURL('image/webp', quality);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(pendingPaint);
      canvas.parentElement?.removeAttribute('data-prop-visible');
      contact?.dispose();
      if (prop) { scene.remove(prop.root); prop.dispose(); }
      incoming?.dispose();
      set?.dispose();
      if (reflectionTarget) reflectionTarget.dispose();
      else reflections?.dispose();
      panorama?.dispose();
      for (const node of [sky,snow]) { node.geometry.dispose(); node.material.dispose(); }
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };

  return {
    surface, renderer, scene, camera, sky, snow,
    get layout() { return set; },
    get visibleCase() { return prop?.root.visible ?? false; },
  };
}
