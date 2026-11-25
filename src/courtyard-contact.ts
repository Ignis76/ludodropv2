import * as T from 'three';

// Capture the distance to the underside from the deck. High parts of the lid,
// floating inserts, glass and print never turn into a solid mark on the snow.
export function createCourtyardContact(renderer: T.WebGLRenderer, scene: T.Scene, root: T.Object3D) {
  const span = 7, resolution = 128, layer = 29;
  const camera = new T.OrthographicCamera(-span/2, span/2, span/2, -span/2, .001, .68);
  camera.layers.set(layer);
  camera.position.y = -.032;
  camera.up.set(0,0,1);
  camera.lookAt(0,0,0);

  const addedLayers: T.Mesh[] = [], translucentGroups = new Set<T.Material>();
  const hiddenInCapture: T.Material[] = [];
  const opaque = (material: T.Material) => !material.transparent && material.depthWrite;
  root.traverse(node => {
    if (!(node instanceof T.Mesh)) return;
    const materials: T.Material[] = Array.isArray(node.material) ? node.material : [node.material];
    if (!materials.some(opaque)) return;
    if (!node.layers.isEnabled(layer)) {
      node.layers.enable(layer);
      addedLayers.push(node);
    }
    for (const material of materials) {
      if (!opaque(material)) translucentGroups.add(material);
    }
  });

  const footprint = new T.WebGLRenderTarget(resolution, resolution);
  const scratch = new T.WebGLRenderTarget(resolution, resolution, { depthBuffer: false });
  const depth = new T.MeshDepthMaterial({ depthPacking: T.BasicDepthPacking, side: T.DoubleSide, blending: T.NoBlending });
  const blur = new T.ShaderMaterial({
    depthTest: false, depthWrite: false, blending: T.NoBlending,
    uniforms: { source: { value: footprint.texture }, stepUV: { value: new T.Vector2() } },
    vertexShader: `varying vec2 imageUV;
      void main() { imageUV = uv; gl_Position = vec4(position.xy, 0., 1.); }`,
    fragmentShader: `varying vec2 imageUV;
      uniform sampler2D source;
      uniform vec2 stepUV;
      void main() {
        float density = texture2D(source, imageUV).r * .227027;
        density += .316216 * (texture2D(source, imageUV + 1.384615 * stepUV).r
                           + texture2D(source, imageUV - 1.384615 * stepUV).r);
        density += .070270 * (texture2D(source, imageUV + 3.230769 * stepUV).r
                           + texture2D(source, imageUV - 3.230769 * stepUV).r);
        gl_FragColor = vec4(vec3(density), 1.);
      }`,
  });
  const blurScene = new T.Scene(), blurCamera = new T.Camera();
  const quad = new T.Mesh(new T.PlaneGeometry(2,2), blur);
  quad.frustumCulled = false;
  blurScene.add(quad);

  // The camera faces up (+Z at the top), while a face-up floor plane has -Z
  // at its top. Flip only the plane's UVs, keeping capture texels unchanged.
  const floorGeometry = new T.PlaneGeometry(span,span);
  floorGeometry.rotateX(-Math.PI/2);
  const uv = floorGeometry.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
  const shade = new T.MeshBasicMaterial({
    color: '#182532', alphaMap: footprint.texture, transparent: true, opacity: .64,
    depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  });
  const floor = new T.Mesh(floorGeometry, shade);
  floor.name = 'Контактная тень контейнера';
  floor.position.y = .0006;
  floor.renderOrder = 1;
  floor.visible = false;
  scene.add(floor);
  const savedColor = new T.Color();

  function update() {
    floor.visible = root.visible;
    if (!root.visible) return;
    const target = renderer.getRenderTarget(), face = renderer.getActiveCubeFace(), level = renderer.getActiveMipmapLevel();
    const background = scene.background, override = scene.overrideMaterial;
    const autoClear = renderer.autoClear, shadow = renderer.shadowMap.enabled, alpha = renderer.getClearAlpha();
    renderer.getClearColor(savedColor);
    try {
      renderer.autoClear = false;
      renderer.shadowMap.enabled = false;
      scene.background = null;
      scene.overrideMaterial = depth;
      for (const material of translucentGroups) {
        if (!material.visible) continue;
        hiddenInCapture.push(material);
        material.visible = false;
      }
      renderer.setRenderTarget(footprint);
      renderer.setClearColor(0,0);
      renderer.clear(true,true,false);
      renderer.render(scene,camera);

      const stride = 1.45 / resolution;
      blur.uniforms.source.value = footprint.texture;
      blur.uniforms.stepUV.value.set(stride,0);
      renderer.setRenderTarget(scratch);
      renderer.render(blurScene,blurCamera);
      blur.uniforms.source.value = scratch.texture;
      blur.uniforms.stepUV.value.set(0,stride);
      renderer.setRenderTarget(footprint);
      renderer.render(blurScene,blurCamera);
    } finally {
      hiddenInCapture.forEach(material => { material.visible = true; });
      hiddenInCapture.length = 0;
      scene.overrideMaterial = override;
      scene.background = background;
      renderer.shadowMap.enabled = shadow;
      renderer.autoClear = autoClear;
      renderer.setClearColor(savedColor,alpha);
      renderer.setRenderTarget(target,face,level);
    }
  }

  function dispose() {
    floor.removeFromParent();
    for (const mesh of addedLayers) mesh.layers.disable(layer);
    quad.geometry.dispose();
    blur.dispose();
    depth.dispose();
    floorGeometry.dispose();
    shade.dispose();
    scratch.dispose();
    footprint.dispose();
  }
  return { update, dispose };
}
