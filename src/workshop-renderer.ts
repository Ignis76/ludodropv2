import * as T from 'three';
import { buildWorkshop } from './workshop-geometry';
import { createCaseStageRenderer } from './case-stage-renderer';
import type { Case } from './types';
import { windowMask } from './workshop-window-mask';

const skyVertex = `
  varying vec3 vDirection;
  void main() {
    vDirection = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

const skyFragment = `
  varying vec3 vDirection;
  uniform float uTime;
  uniform float uSkyReady;
  uniform sampler2D uSkyMap;
  uniform vec3 uZenith, uHorizon, uGlow;
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f*f*(3.0-2.0*f);
    vec4 k = vec4(dot(i, vec2(41.3, 67.7))) + vec4(0.0, 41.3, 67.7, 109.0);
    vec4 v = fract(sin(k) * 21843.3125);
    return mix(mix(v.x,v.y,f.x),mix(v.z,v.w,f.x),f.y);
  }
  void main() {
    vec3 dir = normalize(vDirection);
    float height = max(dir.y,0.0);
    vec3 color = mix(uHorizon,uZenith,smoothstep(0.0,0.48,height));
    float sunset = exp(-4.0 * abs(height-0.035) - 2.1 * abs(dir.x+0.66));
    color = mix(color,uGlow,sunset*0.77);
    vec2 uv = vec2(dir.x, dir.y) * vec2(4.0,19.0) + vec2(-uTime*0.025,0.0);
    float cloud = noise(uv)*0.6 + noise(uv*2.27+3.0)*0.28 + noise(uv*4.9)*0.12;
    color *= 1.0 - smoothstep(0.32,0.8,cloud)*smoothstep(0.0,0.17,height)*0.26;
    float azimuth = atan(dir.x,-dir.z);
    vec2 panoUv = vec2(.5+azimuth/1.98,.37+asin(clamp(dir.y,-1.,1.))/.66);
    float highCloud = smoothstep(.50,.85,panoUv.y);
    panoUv.x += highCloud * (.007*sin(uTime*.055)+.002*sin(uTime*.13+8.0*panoUv.y));
    vec3 horizon = texture2D(uSkyMap,clamp(panoUv,0.0,1.0)).rgb;
    horizon = mix(horizon, uHorizon,.14) * (.96 + .11*cloud*highCloud);
    color = mix(color,horizon,uSkyReady);
    gl_FragColor = vec4(color,1.0);
    #include <colorspace_fragment>
  }`;

// Six faces per strip, with one strip per prefiltered roughness level.
async function loadBenchReflections() {
  const atlas = await new T.ImageLoader().loadAsync('/assets/cases/features/workbench-light.png');
  const canvas = document.createElement('canvas');
  canvas.width = atlas.width; canvas.height = atlas.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(atlas, 0, 0);
  const base = atlas.width / 6;
  if (!Number.isInteger(Math.log2(base)) || atlas.height !== 2 * base - 8) throw new Error('Invalid workbench reflection map');
  const faces = Array.from({length: 6}, (_, face) => {
    const mipmaps = [];
    for (let size = base, y = 0; size >= 8; y += size, size /= 2) {
      const pixels = ctx.getImageData(face * size, y, size, size).data;
      mipmaps.push({ width: size, height: size, data: new Uint8Array(pixels.buffer) });
    }
    return { width: base, height: base, mipmaps };
  });
  const texture = new T.CompressedCubeTexture(faces);
  texture.isPMREMTexture = true;
  texture.colorSpace = T.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

export function createWorkshopRenderer(canvas: HTMLCanvasElement, item?: Case) {
  const stage = createCaseStageRenderer(canvas, item, {
    buildLayout: (scene, compact, closeUp) => buildWorkshop(scene, compact, undefined, closeUp),
    sky: {
      vertexShader: skyVertex, fragmentShader: skyFragment,
      uniforms: {
        uTime: { value: 0 }, uZenith: { value: new T.Color('#42536f') },
        uHorizon: { value: new T.Color('#b4c4d3') }, uGlow: { value: new T.Color('#eac8a4') },
      },
    },
    panorama: '/assets/cases/features/radar-horizon.webp',
    reflections: { load: loadBenchReflections },
    reflectionIntensity: 2.16, // The prefiltered atlas stores one third of the captured intensity.
    snow: { wide: 640, compact: 420, opacity: .34, variation: .36 },
  });
  return {
    ...stage.surface,
    snapshotWindowMask(maxWidth?: number) {
      if (!stage.layout) throw new Error('Resize the workbench before capturing its window.');
      return windowMask(stage.renderer, stage.scene, stage.camera, stage.layout.pane, [stage.sky,stage.snow], maxWidth);
    },
  };
}
