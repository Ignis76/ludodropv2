// Compare the silhouettes seen through the production opening camera.
export async function checkCollectiblePresentation(page) {
  return page.evaluate(async () => {
    // Three's inspector hook exposes the production scene without changing its
    // controller, camera, or geometry for this test.
    window.__THREE_DEVTOOLS__ = new EventTarget();
    const scenes = [];
    window.__THREE_DEVTOOLS__.addEventListener('observe', ({ detail }) => {
      if (detail.isScene) scenes.push(detail);
    });
    const { createInspectionScene } = await import('/src/inspection-scene.ts');
    const { cases } = await import('/src/data/cases.ts');
    const { MeshBasicMaterial } = await import('/node_modules/three/build/three.core.js');
    const width = 512, height = 352; // Native dimensions of the opening recordings.
    const copy = document.createElement('canvas');
    copy.width = width;
    copy.height = height;
    const ctx = copy.getContext('2d', { willReadFrequently: true });
    ctx.globalCompositeOperation = 'copy';
    function mask(canvas) {
      ctx.drawImage(canvas, 0, 0, width, height);
      return ctx.getImageData(0, 0, width, height).data;
    }
    // Nearest boundary-pixel centres, with a direct pixel test for overlaps.
    function visibleGap(card, strip) {
      const edgeA = [], edgeB = [];
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const i = (y * width + x) * 4;
          const a = card[i + 1] > 127 && card[i + 3] > 127;
          const b = strip[i] > 127 && strip[i + 3] > 127;
          if (a && b) return 0;
          if (!a && !b) continue;
          // Pixels on the frame edge are visible boundary pixels too.
          const data = a ? card : strip;
          const c = a ? i + 1 : i;
          const inside = k => data[c + k] > 127 && data[i + k + 3] > 127;
          if (!x || !y || x === width - 1 || y === height - 1 ||
              !inside(-4) || !inside(4) || !inside(-width * 4) || !inside(width * 4)) {
            (a ? edgeA : edgeB).push([x, y]);
          }
        }
      }
      let nearest = Infinity;
      for (const [x, y] of edgeA) {
        for (const [u, v] of edgeB) nearest = Math.min(nearest, (x - u) ** 2 + (y - v) ** 2);
      }
      return Math.sqrt(nearest);
    }
    function measurePrint(insert, rig, viewport) {
      const leaf = insert.children.find(mesh => mesh.material?.map);
      if (!leaf) throw new Error('Missing printed sheet');
      const original = leaf.material;
      const unlit = new MeshBasicMaterial({ map: original.map, side: original.side, toneMapped: false });
      const others = insert.parent.children.filter(group => group !== insert);
      // Keep the paper's actual UVs, texture transforms and final viewing angle.
      // Flat lighting separates the printing from shading caused by the curl.
      let pixels;
      try {
        for (const part of others) part.visible = false;
        leaf.material = unlit;
        rig.render(1);
        pixels = mask(viewport);
      } finally {
        for (const part of others) part.visible = true;
        leaf.material = original;
        unlit.dispose();
      }
      function bounds(include) {
        let x0 = width, y0 = height, x1 = -1, y1 = -1;
        for (let i = 0; i < pixels.length; i += 4) {
          if (pixels[i + 3] < 192 || !include(i)) continue;
          const x = i / 4 % width, y = Math.floor(i / 4 / width);
          x0 = Math.min(x0, x); x1 = Math.max(x1, x);
          y0 = Math.min(y0, y); y1 = Math.max(y1, y);
        }
        if (x0 > x1 || y0 > y1) throw new Error('Empty sheet or artwork');
        return { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 };
      }
      const sheet = bounds(() => true);
      const frameGap = Math.min(sheet.x0, sheet.y0, width - 1 - sheet.x1, height - 1 - sheet.y1);
      if (frameGap < 8) throw new Error('Sheet reaches the edge of the final camera frame');
      const corners = [[.12, .12], [.88, .12], [.12, .88], [.88, .88]];
      const stock = [0, 1, 2].map(channel => {
        const values = corners.map(([x, y]) => {
          const px = sheet.x0 + Math.floor(x * sheet.w), py = sheet.y0 + Math.floor(y * sheet.h);
          return pixels[4 * (py * width + px) + channel];
        });
        values.sort((a, b) => a - b);
        return (values[1] + values[2]) / 2;
      });
      const ink = bounds(i => stock.some((bg, channel) => Math.abs(bg - pixels[i + channel]) >= 35));
      return { left: (ink.x0 - sheet.x0) / sheet.w, right: (sheet.x1 - ink.x1) / sheet.w,
        top: (ink.y0 - sheet.y0) / sheet.h, bottom: (sheet.y1 - ink.y1) / sheet.h };
    }
    const results = [];
    for (const item of cases.filter(item => item.containerKind === 'pin-pack' || item.containerKind === 'capsule')) {
      const capsule = item.containerKind === 'capsule';
      const canvas = document.createElement('canvas');
      canvas.style.cssText = 'display:block;width:512px;height:352px';
      document.body.append(canvas);
      const controller = new AbortController();
      const materials = [];
      const originals = new Map();
      try {
        scenes.length = 0;
        const rig = await createInspectionScene(canvas, item, controller.signal);
        const prop = scenes.flatMap(scene => scene.children).find(group =>
          group.isGroup && group.children.length === 3 && group.children.every(child => child.isGroup));
        if (!prop) throw new Error('Missing collectible in the inspection scene: ' + item.id);
        for (const obj of prop.parent.children) if (obj !== prop) obj.visible = false;
        const margins = capsule ? measurePrint(prop.children[2], rig, canvas) : undefined;
        const parts = prop.children.map((group, index) => {
          const replacements = [];
          group.traverse(mesh => {
            if (!mesh.isMesh) return;
            const marker = new MeshBasicMaterial({ color: [capsule ? 0xff0000 : 0x000000, 0xff0000, 0x00ff00][index],
              side: mesh.material.side, toneMapped: false });
            originals.set(mesh, mesh.material);
            replacements.push(marker);
            materials.push(marker);
            mesh.material = marker;
            mesh.castShadow = mesh.receiveShadow = false;
          });
          return replacements;
        });
        const [base, cover, insert] = parts;
        let minimum = Infinity, closestAt = 0, sampledVisible = 0;
        // A sheet is intentionally inside the capsule before extraction. During
        // final presentation it should clear both halves. For pins, the pouch
        // masks the unexposed part of the card throughout its entire exit.
        for (let step = capsule ? 300 : 0; step <= 400; step++) {
          const p = step / 400;
          if (capsule) for (const m of base) m.visible = false;
          for (const m of cover) m.visible = false;
          for (const m of insert) m.visible = true;
          rig.render(p);
          if (!prop.children[2].visible) continue;
          const cardPixels = mask(canvas);
          if (capsule) for (const m of base) m.visible = true;
          for (const m of cover) m.visible = true;
          for (const m of insert) m.visible = false;
          rig.render(p);
          const gap = visibleGap(cardPixels, mask(canvas));
          if (Number.isFinite(gap)) sampledVisible++;
          if (gap < minimum) { minimum = gap; closestAt = p; }
        }
        if (sampledVisible < 2 || !Number.isFinite(minimum)) throw new Error('Missing visible insert: ' + item.id);
        results.push({ id: item.id, minimum, closestAt, sampledVisible, margins });
      } finally {
        for (const [mesh, original] of originals) mesh.material = original;
        for (const material of materials) material.dispose();
        controller.abort();
        canvas.remove();
      }
    }
    delete window.__THREE_DEVTOOLS__;
    return results;
  });
}
