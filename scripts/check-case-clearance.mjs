// Run against the Vite dev server to sample the opening rigs before they are baked.
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH || 'playwright');
const base = process.env.INSPECTION_URL || 'http://127.0.0.1:5188';
const browser = await chromium.launch({ executablePath: process.env.EXECUTABLE_PATH });
try {
  const page = await browser.newPage();
  await page.route('**/__case_clearance', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Case clearance</title>' }));
  await page.goto(new URL('/__case_clearance', base).href);
  const result = await page.evaluate(async () => {
    const { cases } = await import('/src/data/cases.ts');
    const { inspectionModel } = await import('/src/inspection-model.ts');
    const { createHardCase } = await import('/src/hard-case-model.ts');
    const { createCompactCase } = await import('/src/compact-case-model.ts');
    const { createSeriesCase } = await import('/src/series-case-model.ts');
    const { createCourtyardProp } = await import('/src/inspection-scene.ts');
    const T = await import('/node_modules/three/build/three.core.js');
    const ray = new T.Raycaster(), point = new T.Vector3(), target = new T.Vector3();
    const failures = [];
    const visibleWall = (body, y, dx, dz) => {
      ray.set(point.set(0,y,0), target.set(dx,0,dz).normalize());
      return ray.intersectObject(body)[0]?.object.material;
    };
    function checkFrontClearance(prop, parts, progress) {
      prop.update(progress);
      prop.root.updateMatrixWorld(true);
      const local = prop.root.matrixWorld.clone().invert(), shell = [], hardware = [];
      prop.root.traverse(mesh => {
        if (!mesh.isSkinnedMesh) return;
        const index = mesh.geometry.index, joints = mesh.geometry.getAttribute('skinIndex');
        const nameAt = i => mesh.skeleton.bones[joints.getX(i)].name;
        const positions = Array.from({ length: joints.count }, (_, i) =>
          mesh.getVertexPosition(i, new T.Vector3()).applyMatrix4(mesh.matrixWorld).applyMatrix4(local));
        positions.forEach((position, i) => { if (parts.includes(nameAt(i))) hardware.push(position); });
        for (let i = 0; i < (index?.count ?? joints.count); i += 3) {
          const a = index ? index.getX(i) : i;
          if (nameAt(a) === 'case') shell.push([positions[a], positions[index ? index.getX(i+1) : i+1], positions[index ? index.getX(i+2) : i+2]]);
        }
      });
      if (!hardware.length || !shell.length) throw Error('Missing geometry for ' + parts);
      let penetration = 0;
      const probe = new T.Ray(new T.Vector3(), new T.Vector3(0,0,-1));
      for (const position of hardware) {
        probe.origin.set(position.x,position.y,6);
        for (const [a,b,c] of shell) {
          if (probe.intersectTriangle(a,b,c,false,target)) penetration = Math.max(penetration, target.z-position.z);
        }
      }
      if (penetration > .006) failures.push(parts + ' enter front wall at ' + progress + ' by ' + penetration);
    }

    const redline = createHardCase(cases.find(item => item.id === 'redline'));
    redline.update(1);
    redline.root.updateMatrixWorld(true);
    for (const x of [-1,1]) for (const z of [-1,1]) {
      for (const y of [.88,.94,.975]) {
        const wall = visibleWall(redline.root.children[0], y, x*1.33, z*.70);
        if (!wall || wall.color.getHexString() === 'c33336') failures.push('Redline exterior guard visible from cavity at ' + [x,y,z]);
      }
    }
    redline.dispose();

    const compact = cases.filter(item => {
      const model = inspectionModel(item);
      return model.kind === 'compact' && !model.workshop;
    });
    for (const item of compact) {
      const manager = new T.LoadingManager();
      const loaded = new Promise(resolve => { manager.onLoad = resolve; });
      const prop = createCompactCase(item, manager);
      await loaded;
      prop.update(1);
      prop.root.updateMatrixWorld(true);
      const [body, hinge] = prop.root.children;
      for (const [dx,dz] of [[1,0],[0,-1],[.84,-.54]]) {
        const wall = visibleWall(body, hinge.position.y - .24, dx, dz);
        if (!wall?.map?.image?.src.endsWith('/foam-grain.webp')) failures.push(item.id + ' shell exposed through lining');
      }
      const levers = [];
      body.traverse(node => { if (node.name === 'Draw lever') levers.push(node); });
      if (!levers.length) throw Error(item.id + ' missing draw latches');
      const cap = hinge.children[0], loopPoint = new T.Vector3(), capPoint = new T.Vector3();
      const front = body.children.find(mesh => mesh.material?.map?.image?.src.includes('-face.webp'));
      const seam = hinge.position.y, depth = 2 * (front.position.z - .021);
      if (hinge.position.z >= -depth / 2 - .045) throw Error(item.id + ' hinge buried in rear casting');
      for (let frame = 0; frame <= 200; frame++) {
        prop.update(frame / 200);
        prop.root.updateMatrixWorld(true);
        // Track the bore of the moving hinge knuckle against the fixed pin.
        cap.localToWorld(capPoint.set(0, 0, hinge.position.z));
        if (capPoint.distanceTo(hinge.position) > .00001) throw Error(item.id + ' hinge separated at ' + frame);
        cap.localToWorld(capPoint.set(0, .003, -depth / 2 - .018));
        if (capPoint.y < seam && capPoint.z > -depth / 2 - .04) throw Error(item.id + ' rear lid lip enters shell');
        for (const lever of levers) {
          const wire = lever.getObjectByName('Wire loop');
          wire.localToWorld(loopPoint.set(0, .384, 0));
          if (loopPoint.z - .018 < depth / 2 + .02) throw Error(item.id + ' latch enters front panel at ' + frame);
          if (frame === 200 && loopPoint.y > seam - .50) throw Error(item.id + ' latch did not fold down');
          // Distance from the centre of the wire to the bounds of the keeper's outer lip.
          cap.worldToLocal(capPoint.copy(loopPoint));
          const gapY = Math.max(0, Math.abs(capPoint.y - .092) - .020);
          const gapZ = Math.max(0, Math.abs(capPoint.z - (depth / 2 + .169)) - .013);
          if (Math.hypot(gapY, gapZ) < .0175) throw Error(item.id + ' latch pierces keeper at ' + frame);
        }
      }
      prop.dispose();
    }

    const series = cases.filter(item => inspectionModel(item).kind === 'series');
    for (const item of series) {
      const prop = await createSeriesCase(item, new AbortController().signal);
      const copper = item.id === 'copper';
      const fittings = [];
      prop.root.traverse(mesh => {
        if (!mesh.isMesh) return;
        const vertices = [];
        const joints = mesh.geometry.getAttribute('skinIndex');
        for (let i = 0; i < mesh.geometry.getAttribute('position').count; i++) {
          const bone = joints && mesh.skeleton.bones[joints.getX(i)].name;
          if (copper || /key|lock|shackle|tumbler/.test(bone)) vertices.push(i);
        }
        if (vertices.length) fittings.push({ mesh, vertices });
      });
      let lowest = Infinity;
      for (let i = 0; i <= 100; i++) {
        prop.update(i / 100);
        prop.root.updateMatrixWorld(true);
        for (const { mesh, vertices } of fittings) for (const index of vertices) {
          mesh.getVertexPosition(index, point).applyMatrix4(mesh.matrixWorld);
          lowest = Math.min(lowest, point.y);
        }
      }
      if (!Number.isFinite(lowest) || lowest < -.0001) failures.push(item.id + ' floor clearance ' + lowest);

      // All classic editions share an animation. Check the two poses at which
      // the detached lock and key used to enter the front casting.
      if (item.id === 'case-cs20') for (const [part, progress] of [['lock', .53], ['key', .79]]) {
        checkFrontClearance(prop,[part],progress);
      }
      prop.dispose();
    }
    const courtyardCases = ['black', 'capsule-chicken', 'pins-series-1'];
    for (const id of courtyardCases) {
      const prop = await createCourtyardProp(cases.find(item => item.id === id), new AbortController().signal);
      const supports = [];
      prop.root.traverseVisible(mesh => {
        if (!mesh.isMesh) return;
        // Use Blacksite's rigid case bone. On the collectibles only the shell
        // touches the deck while closed, so the loose top cannot mask a floating shell.
        if (id === 'black' ? !mesh.isSkinnedMesh : new T.Box3().setFromObject(mesh, true).min.y > .08) return;
        const joints = mesh.geometry.getAttribute('skinIndex');
        const count = mesh.geometry.getAttribute('position').count;
        for (let i = 0; i < count; i++) {
          if (id !== 'black' || mesh.skeleton.bones[joints.getX(i)].name === 'case') supports.push([mesh, i]);
        }
      });
      for (const progress of [0, .32, .55, .78, 1, 0]) {
        prop.update(progress);
        prop.root.updateMatrixWorld(true);
        let floor = Infinity;
        for (const [mesh, i] of supports) {
          mesh.getVertexPosition(i, point).applyMatrix4(mesh.matrixWorld);
          floor = Math.min(floor, point.y);
        }
        if (!(Math.abs(floor) < .0001)) failures.push(id + ' courtyard shell height at ' + progress + ': ' + floor);
      }
      if (id === 'black') {
        const parts = ['lock', 'tumbler', 'shackle'];
        for (const progress of [.53, .78, .88, .95, 1]) checkFrontClearance(prop,parts,progress);
        const landed = new T.Box3();
        prop.root.traverse(mesh => {
          if (!mesh.isSkinnedMesh) return;
          const joints = mesh.geometry.getAttribute('skinIndex');
          for (let i = 0; i < joints.count; i++) if (parts.includes(mesh.skeleton.bones[joints.getX(i)].name)) {
            landed.expandByPoint(mesh.getVertexPosition(i,point).applyMatrix4(mesh.matrixWorld));
          }
        });
        if (landed.isEmpty() || Math.abs(landed.min.y) > .003 || landed.max.z >= 2.48) {
          failures.push('Blacksite padlock did not land on the bench: floor=' + landed.min.y + ', front=' + landed.max.z);
        }
      }
      prop.dispose();
    }
    if (failures.length) throw Error(failures.join('\n'));
    return { redlineCorners: 4, compactCases: compact.length, seriesCases: series.length, posesPerSeries: 101, courtyardCases: courtyardCases.length };
  });
  console.log(result);
} finally {
  await browser.close();
}
