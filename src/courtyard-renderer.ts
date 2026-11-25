import * as T from 'three';
import { buildCourtyard } from './courtyard-geometry';
import { createCaseStageRenderer } from './case-stage-renderer';
import type { Case } from './types';

const skyVertex = `
  varying vec4 vClip;
  void main() {
    vClip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = vClip;
  }`;

const skyFragment = `
  varying vec4 vClip;
  uniform float uAspect, uTime, uSkyReady;
  uniform sampler2D uSkyMap;
  void main() {
    vec2 screenUV = .5 + .5 * vClip.xy / vClip.w;
    // A narrower screen crops the sides of the photograph, preserving the
    // vertical registration of the sun, shelf and contact plane at every width.
    vec2 crop = vec2(min(uAspect * .25, 1.), .75 * min(4. / uAspect, 1.));
    vec2 uv = vec2(.5, .49) + (screenUV - .5) * crop;
    float cloud = smoothstep(.43, .54, uv.y) * (1. - smoothstep(.60, .68, uv.y));
    uv.x += .0018 * sin(uTime * .14) * cloud;
    vec3 sky = mix(vec3(.46,.53,.62), vec3(.22,.38,.58), screenUV.y);
    gl_FragColor = vec4(mix(sky, texture2D(uSkyMap, uv).rgb, uSkyReady), 1.);
    #include <colorspace_fragment>
  }`;

// Light the case with the colours of the sky above it and the rock underneath.
function alpineReflections(renderer: T.WebGLRenderer, photo: HTMLImageElement) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const light = ctx.createLinearGradient(0, 0, 0, 256);
  light.addColorStop(0, '#a7accb');
  light.addColorStop(.45, '#ead6c6');
  light.addColorStop(.54, '#9b9394');
  light.addColorStop(1, '#665f5b');
  ctx.fillStyle = light;
  ctx.fillRect(0, 0, 512, 256);
  ctx.drawImage(photo, 0, 85, 256, 85);
  ctx.translate(512, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(photo, 0, 85, 256, 85);
  const map = new T.CanvasTexture(canvas);
  map.mapping = T.EquirectangularReflectionMapping;
  map.colorSpace = T.SRGBColorSpace;
  const pmrem = new T.PMREMGenerator(renderer);
  try {
    return pmrem.fromEquirectangular(map);
  } finally {
    map.dispose();
    pmrem.dispose();
  }
}

export function createCourtyardRenderer(canvas: HTMLCanvasElement, item?: Case, captureAlpha = false) {
  const stage = createCaseStageRenderer(canvas, item, {
    buildLayout: buildCourtyard,
    sky: { vertexShader: skyVertex, fragmentShader: skyFragment, uniforms: { uAspect: { value: 1 }, uTime: { value: 1.6 } } },
    panorama: '/assets/cases/features/summit-shelf.webp',
    reflections: { fromPanorama: alpineReflections },
    reflectionIntensity: .89,
    alignWithRecording: true,
    snow: { wide: 210, compact: 95, opacity: .18, variation: .29 },
  }, captureAlpha);
  return {
    ...stage.surface,
    snapshotCase(quality: number) {
      const set = stage.layout;
      if (!captureAlpha || !set || !stage.visibleCase) throw new Error('A visible case and alpha capture are required');
      try {
        stage.sky.visible = stage.snow.visible = false;
        stage.renderer.shadowMap.needsUpdate = true;
        return stage.surface.snapshot(1.6, 0, quality);
      } finally {
        stage.sky.visible = stage.snow.visible = true;
        stage.renderer.shadowMap.needsUpdate = true;
      }
    },
  };
}
