import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { batchRigidPart } from './case-geometry';
import { COMPACT_OPEN_POSE } from './inspection-model';
import type { Case } from './types';

type Housing = {
  skin: string; width: number; depth: number; seam: number; cap: number;
  paint: string; metal: string; accent: string; corners: number; latches: number[];
};
const housings: Record<string, Housing> = {
  arctic: { skin: 'arctic', width: 2.65, depth: 1.57, seam: 1.05, cap: .39, paint: '#dbdedd', metal: '#797c81', accent: '#28dee7', corners: .23, latches: [-.72,.73] },
  neon: { skin: 'neon', width: 2.48, depth: 1.68, seam: 1.15, cap: .41, paint: '#27232d', metal: '#756c80', accent: '#b824ff', corners: .24, latches: [-.68,.62] },
  'original-ronin': { skin: 'ronin', width: 2.20, depth: 1.22, seam: 1.68, cap: .34, paint: '#272728', metal: '#943231', accent: '#ad3833', corners: .12, latches: [0] },
  gold: { skin: 'gold', width: 2.85, depth: 1.74, seam: 1.10, cap: .45, paint: '#302c29', metal: '#bc8840', accent: '#ffc04b', corners: .26, latches: [-.77,.79] },
};

function octagon(w: number, d: number, cut: number) {
  const x = w / 2, z = d / 2;
  return [[-x + cut,-z],[x-cut,-z],[x,-z+cut],[x,z-cut],[x-cut,z],[-x+cut,z],[-x,z-cut],[-x,-z+cut]];
}

function polygon(points: number[][]) {
  const shape = new T.Shape(points.map(([x,y]) => new T.Vector2(x,y)));
  shape.closePath();
  return shape;
}

export function createCompactCase(item: Case, manager: T.LoadingManager) {
  const spec = housings[item.id];
  const { width: w, depth: d, seam, cap, corners: cut } = spec;
  const root = new T.Group(), body = new T.Group(), hinge = new T.Group(), lid = new T.Group();
  root.add(body, hinge);
  // The pin sits behind both rear lips, so the back of the cap clears the gasket.
  hinge.position.set(0, seam, -d / 2 - .082);
  hinge.add(lid);
  lid.position.z = -hinge.position.z;

  const loader = new T.TextureLoader(manager);
  const textures: T.Texture[] = [];
  const materials: T.Material[] = [];
  function map(file: string, rgb = true) {
    const texture = loader.load('/assets/unseal/' + file + '.webp');
    if (rgb) texture.colorSpace = T.SRGBColorSpace;
    texture.anisotropy = 4;
    textures.push(texture);
    return texture;
  }
  function material(color: string, roughness: number, metalness: number, props: T.MeshStandardMaterialParameters = {}) {
    const mat = new T.MeshStandardMaterial({ color, roughness, metalness, ...props });
    materials.push(mat);
    return mat;
  }
  const grain = map('hard/surface-height', false);
  const paint = material(spec.paint, .45, .39, { bumpMap: grain, bumpScale: .005 });
  const metal = material(spec.metal, .28, .80, { bumpMap: grain, bumpScale: .003 });
  const graphite = material('#1b2023', .74, .12);
  const latchMetal = spec.skin === 'gold' ? metal : material('#817c79', .31, .77);
  const lining = material('#303537', .96, .015, { map: map('hard/foam-grain', false) });
  const accent = material(spec.accent, .36, .43, { emissive: spec.accent, emissiveIntensity: .34 });
  const face = material('#dedede', .53, .22, { map: map('compact/' + spec.skin + '-face') });
  const side = material('#dedede', .57, .22, { map: map('compact/' + spec.skin + '-side') });
  const isRonin = spec.skin === 'ronin';

  function mesh(parent: T.Object3D, geometry: T.BufferGeometry, mat: T.Material, x=0, y=0, z=0) {
    const object = new T.Mesh(geometry, mat);
    object.position.set(x,y,z);
    parent.add(object);
    return object;
  }
  function block(parent:T.Object3D, mat:T.Material, x:number,y:number,z:number, width:number,height:number,depth:number, radius=.018) {
    return mesh(parent, new RoundedBoxGeometry(width,height,depth,1,Math.min(radius,width*.45,height*.45,depth*.45)), mat, x,y,z);
  }
  function section(parent:T.Object3D, mat:T.Material, points:number[][], y:number, thickness:number, hole?:number[][]) {
    const shape = polygon(points);
    if (hole) shape.holes.push(polygon(hole));
    const bevel = Math.min(.018, thickness * .18);
    const geo = new T.ExtrudeGeometry(shape, {depth: thickness-2*bevel,bevelSegments:2,bevelSize:bevel,bevelThickness:bevel,curveSegments:2});
    geo.rotateX(-Math.PI/2);
    return mesh(parent,geo,mat,0,y+bevel);
  }
  function plate(parent:T.Object3D, mat:T.Material, width:number, depth:number, y:number, thickness:number, inset=0) {
    return section(parent,mat,octagon(width,depth,cut),y,thickness,
      inset ? octagon(width-2*inset,depth-2*inset,Math.max(.04,cut-inset*.5)) : undefined);
  }
  function axle(parent:T.Object3D, mat:T.Material, x:number,y:number,z:number, radius:number,length:number) {
    const obj=mesh(parent,new T.CylinderGeometry(radius,radius,length,16),mat,x,y,z);
    obj.rotation.z=Math.PI/2;
    return obj;
  }

  // Both halves carry their own corner protectors, casting over the joint only in the shut pose.
  function cornerBoots(parent:T.Object3D, y:number, thickness:number) {
    for (const sx of [-1,1]) for (const sz of [-1,1]) {
      const x=w/2+.024, z=d/2+.024, arm=isRonin?.28:.36, wall=.105;
      const points=[[x-arm,z],[x-cut,z],[x,z-cut],[x,z-arm],[x-wall,z-arm],[x-wall,z-cut-.04],[x-cut-.04,z-wall],[x-arm,z-wall]];
      section(parent,metal,points.map(([a,b])=>[sx*a,sz*b]),y,thickness);
    }
  }
  plate(body,graphite,w-.045,d-.06,.025,.105);
  plate(body,paint,w,d,.13,seam-.17,.12);
  plate(body,graphite,w+.012,d+.012,seam-.064,.064,.11);
  plate(body,lining,w-.22,d-.22,.14,.12);
  plate(body,lining,w-.20,d-.20,.25,.30,.16);
  // The inner face must sit inside the paint's bevel along both straight walls.
  plate(body,lining,w-.14,d-.14,.52,seam-.59,.080);
  block(body,lining,w*.18,.36,0,.13,.25,d-.55,.036);
  const front=mesh(body,new T.PlaneGeometry(w-2*cut, seam-.185),face,0,seam/2+.035,d/2+.021);
  for(const sign of [-1,1]){
    const panel=mesh(body,new T.PlaneGeometry(d-2*cut, seam-.185),side,sign*(w/2+.021),front.position.y);
    panel.rotation.y=sign*Math.PI/2;
    if(!isRonin) {
      for(const dz of [-1,1]) {
        block(body,metal,sign*(w/2-.050),seam*.51,dz*(d/2-.12),.11,seam*.72,.10,.031);
        block(body,accent,sign*(w/2+.019),seam*.50,dz*(d/2-.29),.013,seam*.47,.026,.008);
      }
    }
    if(isRonin){
      for(const z of [-.32,.35]) {
        block(body,graphite,sign*(w/2+.035),.88,z,.075,1.36,.10);
        block(body,latchMetal,sign*(w/2+.075),1.27,z,.065,.11,.16);
      }
    }
  }
  cornerBoots(body,.064,.15);
  cornerBoots(body,seam-.14,.075);

  plate(lid,graphite,w,d,.003,.043,.095);
  plate(lid,paint,w,d,.047,cap-.09,.11);
  plate(lid,paint,w-.065,d-.055,cap-.07,.082);
  cornerBoots(lid,.047,cap-.038);
  plate(lid,lining,w-.23,d-.23,.072,.052);
  if(!isRonin) {
    const width=w*.245, bottom=.105;
    const stages=[[-width,cap-.10],[-width*.83,bottom],[-width*.64,bottom-.045],[width*.64,bottom-.045],[width*.83,bottom],[width,cap-.10]];
    const brow = new T.ExtrudeGeometry(polygon(stages),{depth:.035,bevelEnabled:true,bevelSize:.022,bevelThickness:.016,bevelSegments:2});
    mesh(lid,brow,spec.skin==='gold'?metal:paint,0,0,d/2+.013);
    block(lid,accent,0,.141,d/2+.066,w*.21,.027,.014,.006);
  }
  // Pads and countersunk bars give the underside a separate profile from the outer lid.
  const padCount=isRonin?5:7;
  for (let i=0;i<padCount;i++) {
    const x=(i-(padCount-1)/2)*(w-.55)/padCount;
    block(lid,lining,x,.065,0,(w-.58)/padCount-.025,.065,d-.46,.03);
  }
  for (const sx of [-1,1]) {
    block(lid, isRonin?metal:graphite,sx*w*.36,cap+.014,0,isRonin?.24:.17,.054,d-.31,.025);
    if (!isRonin) {
      block(lid,accent,sx*w*.36,cap+.043,0,.028,.009,d-.51,.004);
    }
    const x=sx*w*.30, z=hinge.position.z;
    axle(body,graphite,x,seam,z,.030,.37);
    for(const dx of [-.126,.126]){
      axle(body,metal,x+dx,seam,z,.053,.088);
      block(body,metal,x+dx,seam-.060,z+.039,.088,.13,.115);
    }
    axle(lid,latchMetal,x,0,z,.054,.140);
    block(lid,latchMetal,x,.065,z+.037,.14,.139,.112);
  }
  const crown=octagon(w*.62,d*.58,.12);
  section(lid,isRonin?graphite:metal,crown,cap+.006,.038);
  section(lid,paint,octagon(w*.58,d*.53,.105),cap+.044,.035);

  // The articulated handle folds on pins before the cap starts moving.
  const handle=new T.Group();
  lid.add(handle);
  handle.position.set(0,cap+.095,-.09);
  const span=isRonin?.94:1.08;
  for (const sx of [-1,1]) {
    block(lid,metal,sx*span/2,cap+.061,-.09,.19,.12,.20,.031);
    axle(handle,latchMetal,sx*span/2,0,0,.065,.16);
    const leg=block(handle,metal,sx*(span*.465),.128,0,.125,.30,.17,.035);
    leg.rotation.z=-sx*.23;
  }
  block(handle,graphite,0,.275,0,span*.90,.15,.185,.056);
  for (let n=-3;n<=3;n++) block(handle,graphite,n*.08,.275,.002,.018,.153,.19,.018);

  const levers:T.Group[]=[], bails:T.Group[]=[];
  const latchZ=d/2+.068, pivotY=seam-.16;
  for (const x of spec.latches) {
    block(body,graphite,x,pivotY-.12,latchZ-.012,.204,.38,.065,.032);
    // The keeper's two lips form the shallow saddle for the wire crossbar.
    block(lid,latchMetal,x,.065,latchZ+.039,.173,.057,.141,.012);
    block(lid,metal,x,.092,latchZ+.101,.173,.040,.026,.008);
    const lever=new T.Group(), bail=new T.Group();
    lever.name='Draw lever'; bail.name='Wire loop';
    body.add(lever);lever.add(bail);
    lever.position.set(x,pivotY,latchZ+.041);
    bail.position.set(0,-.105,.064);
    axle(lever,latchMetal,0,0,0,.052,.205);
    block(lever,latchMetal,0,-.102,.007,.159,.23,.068,.029);
    block(lever,isRonin?graphite:metal,0,-.164,.043,.128,.043,.026,.008);
    axle(lever,latchMetal,0,-.105,.064,.022,.236);
    for (const dx of [-.111,.111]) block(bail,latchMetal,dx,.192,0,.025,.384,.029,.012);
    axle(bail,latchMetal,0,.384,0,.018,.244).name='Keeper crossbar';
    levers.push(lever); bails.push(bail);
  }
  if(isRonin) for(const x of [-.65,.65]) {
    block(body,latchMetal,x,seam-.10,latchZ-.012,.22,.15,.04);
    axle(lid,latchMetal,x,.040,latchZ-.01,.055,.22);
  }
  const up=new T.Vector3(0,1,0), end=new T.Vector3(), direction=new T.Vector3();
  const stays=[-1,1].map(sx=>{
    const x=sx*(w/2-.24), foot=new T.Vector3(x,seam-.65,-d/2+.90);
    const top=new T.Vector3(x,.032,-d/2+.39);
    axle(body,metal,x+sx*.051,foot.y,foot.z,.051,.18);
    axle(lid,metal,x+sx*.036,top.y,top.z,.040,.14);
    const sleeve=mesh(root,new T.CylinderGeometry(.034,.036,1,12),graphite);
    const rod=mesh(root,new T.CylinderGeometry(.018,.018,1,12),latchMetal);
    return {foot,top,sleeve,rod};
  });
  batchRigidPart(body);
  batchRigidPart(lid);
  batchRigidPart(handle);
  for (const joint of [...levers, ...bails]) batchRigidPart(joint);

  function update(p:number) {
    const progress=(from:number,to:number)=>T.MathUtils.smootherstep(p,from,to);
    const gold=spec.skin==='gold', neon=spec.skin==='neon';
    handle.rotation.x=-(isRonin?.90:1.14)*progress(.036,.35);
    for(let i=0;i<levers.length;i++) {
      const delay=i*(gold?.065:.036);
      // Moving the offset pin lifts the bail over the keeper first. The released
      // loop swings down outside its lever under gravity, staying on that pin.
      const lift=progress(.035+delay,.22+delay);
      const drop=progress(.182+delay,.494+delay);
      const settle=progress(.465+delay,.64+delay);
      const lever=-1.08*lift+.96*progress(.375+delay,.57+delay);
      levers[i].rotation.x=lever;
      bails[i].rotation.x=-.098-.17*lift+3.30*drop-.115*settle-lever;
    }
    accent.emissiveIntensity=.30+(neon?.70:.32)*(progress(.18,.38)-progress(.67,COMPACT_OPEN_POSE));
    const release=gold?.335:.30, limit=isRonin?1.88:gold?1.68:1.81;
    const unseal=progress(release,release+.16);
    const swing=progress(release+.035,COMPACT_OPEN_POSE);
    hinge.rotation.x=-.072*unseal-(limit-.072)*swing;
    for(const {foot,top,sleeve,rod} of stays){
      end.copy(top).add(lid.position).applyEuler(hinge.rotation).add(hinge.position);
      direction.subVectors(end,foot);
      const length=direction.length(), sleeveLength=.76;
      direction.divideScalar(length);
      sleeve.scale.y=sleeveLength;
      rod.scale.y=length-sleeveLength+.016;
      sleeve.position.copy(foot).addScaledVector(direction,sleeveLength/2);
      rod.position.copy(end).addScaledVector(direction,-rod.scale.y/2);
      sleeve.quaternion.setFromUnitVectors(up,direction);rod.quaternion.copy(sleeve.quaternion);
    }
  }
  update(0);
  return {root,update,dispose() {
    root.traverse(child=>{if(child instanceof T.Mesh) child.geometry.dispose();});
    textures.forEach(texture=>texture.dispose());
    materials.forEach(mat=>mat.dispose());
  }};
}
