// Run against the Vite dev server to inspect the same deforming meshes used for opening.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { checkCollectiblePresentation } from './check-collectible-presentation.mjs';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH || 'playwright');
const base = process.env.INSPECTION_URL || 'http://127.0.0.1:5188';
const browser = await chromium.launch({ executablePath: process.env.EXECUTABLE_PATH });
try {
  const page = await browser.newPage();
  await page.route('**/__collectible_clearance', route => route.fulfill({
    contentType: 'text/html', body: '<!doctype html><title>Collectible clearance</title>',
  }));
  await page.goto(new URL('/__collectible_clearance', base).href);

  const checked = await page.evaluate(async () => {
    const { cases } = await import('/src/data/cases.ts');
    const { createCapsule, createPinPack } = await import('/src/collectible-model.ts');
    const T = await import('/node_modules/three/build/three.core.js');
    const ray = new T.Ray(), point = new T.Vector3();

    // A shared edge or an edge ending at the other triangle is contact. Count an
    // intersection when the interior of an edge passes through the other face.
    function crossesEdge(a, b, face) {
      ray.origin.copy(a);
      ray.direction.subVectors(b, a);
      if (!ray.intersectTriangle(...face, false, point)) return false;
      const t = point.sub(a).dot(ray.direction) / ray.direction.lengthSq();
      return t > 1e-6 && t < 1 - 1e-6;
    }
    function crossesFace(a, b) {
      for (let i = 0; i < 3; i++) {
        const j = (i + 1) % 3;
        if (crossesEdge(a[i], a[j], b) || crossesEdge(b[i], b[j], a)) return true;
      }
      return false;
    }

    // Partition once and refit bounds every pose. Pouch and paper vertices change
    // shape along with their parent transforms, so initial mesh bounds are stale.
    function partition(faces) {
      const box = new T.Box3();
      for (const face of faces) box.union(face.box);
      if (faces.length <= 8) return { box, faces };
      const size = box.getSize(new T.Vector3());
      const axis = size.x > size.y && size.x > size.z ? 'x' : size.y > size.z ? 'y' : 'z';
      const middle = Math.floor(faces.length / 2);
      faces.sort((a, b) => a.box.min[axis] + a.box.max[axis] - b.box.min[axis] - b.box.max[axis]);
      return { box, left: partition(faces.slice(0, middle)), right: partition(faces.slice(middle)) };
    }
    function refit(node) {
      node.box.makeEmpty();
      if (node.faces) {
        for (const face of node.faces) node.box.union(face.box.setFromPoints(face.vertices));
      } else {
        node.box.union(refit(node.left)).union(refit(node.right));
      }
      return node.box;
    }
    function surface(mesh) {
      const positions = mesh.geometry.getAttribute('position'), index = mesh.geometry.index;
      const vertices = Array.from({ length: positions.count }, () => new T.Vector3());
      function transform() {
        for (let i = 0; i < vertices.length; i++) {
          vertices[i].fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld);
        }
      }
      transform();
      const faces = [];
      const count = index ? index.count : positions.count;
      for (let i = 0; i < count; i += 3) {
        const triangle = [i, i + 1, i + 2].map(j => vertices[index ? index.getX(j) : j]);
        faces.push({ vertices: triangle, box: new T.Box3().setFromPoints(triangle) });
      }
      const tree = partition(faces);
      return { tree, update() { transform(); refit(tree); } };
    }
    function intersects(a, b) {
      if (!a.box.intersectsBox(b.box)) return false;
      if (!a.faces) return intersects(a.left, b) || intersects(a.right, b);
      if (!b.faces) return intersects(a, b.left) || intersects(a, b.right);
      return a.faces.some(first => b.faces.some(second =>
        first.box.intersectsBox(second.box) && crossesFace(first.vertices, second.vertices)));
    }

    const checked = [];
    const items = cases.filter(c => c.containerKind === 'capsule' || c.containerKind === 'pin-pack');
    for (const item of items) {
      const capsule = item.containerKind === 'capsule';
      const labels = capsule ? ['cup', 'dome', 'paper'] : ['pouch', 'torn strip', 'pin card'];
      const prop = (capsule ? createCapsule : createPinPack)(item, new T.LoadingManager());
      try {
        prop.root.updateMatrixWorld(true);
        const parts = prop.root.children.map((group, i) => {
          const surfaces = [];
          group.traverse(node => { if (node.isMesh) surfaces.push(surface(node)); });
          return { group, label: labels[i], surfaces };
        });
        if (parts.length !== labels.length || parts.some(part => !part.surfaces.length)) {
          throw new Error('Unexpected moving parts for ' + item.id);
        }
        for (let step = 0; step <= 400; step++) {
          const p = step / 400;
          prop.update(p);
          prop.root.updateMatrixWorld(true);
          const visible = parts.filter(part => part.group.visible);
          for (const part of visible) {
            for (const mesh of part.surfaces) {
              mesh.update();
              if (mesh.tree.box.min.y < -.017) throw new Error(item.id + ': ' + part.label + ' below the table at ' + p);
            }
          }
          for (let i = 0; i < visible.length; i++) {
            for (const other of visible.slice(i + 1)) {
              const part = visible[i];
              if (part.surfaces.some(a => other.surfaces.some(b => intersects(a.tree, b.tree)))) {
                throw new Error(item.id + ': ' + part.label + ' intersects ' + other.label + ' at ' + p);
              }
            }
          }
        }
        checked.push(item.id);
      } finally {
        prop.dispose();
      }
    }
    return checked;
  });
  assert.ok(checked.length > 0, 'Missing collectible containers');
  console.log('Checked moving surfaces and table clearance for ' + checked.length + ' containers at 401 poses each.');
  const gaps = await checkCollectiblePresentation(page);
  assert.deepEqual(gaps.map(result => result.id), checked);
  for (const { id, minimum, closestAt, margins } of gaps) {
    if (margins) {
      assert.ok(Math.min(...Object.values(margins)) >= .05, id + ': print reaches the edge of the sheet');
      assert.ok(Math.abs(margins.left - margins.right) < .08 && Math.abs(margins.top - margins.bottom) < .08,
        id + ': print is off-centre');
    }
    assert.ok(minimum >= 8, id + ': only ' + minimum.toFixed(1) + ' px from the visible insert at ' + closestAt);
    console.log(id + ': minimum visible separation ' + minimum.toFixed(1) + ' px at ' + closestAt);
  }
} finally {
  await browser.close();
}
