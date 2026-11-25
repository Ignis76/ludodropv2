import * as T from 'three';

// Use the depth of the room, display boards and closed case so the snow stays behind the glass.
export function windowMask(renderer: T.WebGLRenderer, scene: T.Scene, camera: T.Camera, pane: T.Mesh, excluded: T.Object3D[], maxWidth = Infinity) {
  const scale = Math.min(1 / 3, maxWidth / renderer.domElement.width);
  const width = Math.ceil(renderer.domElement.width * scale);
  const height = Math.ceil(renderer.domElement.height * scale);
  const target = new T.WebGLRenderTarget(width,height);
  const opaque = new T.MeshBasicMaterial({ color: 0, side: T.DoubleSide, fog: false });
  const glass = new T.MeshBasicMaterial({ color: 0xffffff, side: T.DoubleSide, fog: false });
  const stencil = new T.Scene();
  const window = new T.Mesh(pane.geometry,glass);
  pane.updateWorldMatrix(true,false);
  window.matrixAutoUpdate = false;
  window.matrix.copy(pane.matrixWorld);
  stencil.add(window);
  const previousTarget = renderer.getRenderTarget(), previousOverride = scene.overrideMaterial;
  const previousShadow = renderer.shadowMap.enabled, previousClear = renderer.autoClear;
  const objects = [pane,...excluded], visibility = objects.map(object => object.visible);
  const pixels = new Uint8Array(width*height*4);
  try {
    objects.forEach(object => { object.visible = false; });
    renderer.setRenderTarget(target);
    renderer.shadowMap.enabled = false;
    renderer.autoClear = true;
    scene.overrideMaterial = opaque;
    renderer.render(scene,camera);
    renderer.autoClear = false;
    renderer.render(stencil,camera);
    renderer.readRenderTargetPixels(target,0,0,width,height,pixels);
  } finally {
    scene.overrideMaterial = previousOverride;
    objects.forEach((object,i) => { object.visible = visibility[i]; });
    renderer.autoClear = previousClear;
    renderer.shadowMap.enabled = previousShadow;
    renderer.setRenderTarget(previousTarget);
    opaque.dispose(); glass.dispose(); target.dispose();
  }
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  const mask = ctx.createImageData(width,height);
  for (let y=0; y<height; y++) for (let x=0; x<width; x++) {
    mask.data[(y*width+x)*4+3] = pixels[((height-1-y)*width+x)*4];
  }
  ctx.putImageData(mask,0,0);
  return canvas.toDataURL('image/png');
}
