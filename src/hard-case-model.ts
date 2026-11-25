import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { batchRigidPart } from './case-geometry';
import type { Case } from './types';

const W = 3.04, D = 1.75, SEAM = 1.05, AXLE_Z = -.90;
const HALF_PI = Math.PI / 2;
const textureRoot = '/assets/unseal/hard/';

type Finish = { paint: string; trim: string; hardware: string; detail?: string; badge?: string; carbon?: boolean; flat?: boolean };
const finishes: Record<string, Finish> = {
  'night-port': { paint: '#387477', trim: '#ed7b29', hardware: '#404848', badge: 'night-port' },
  redline: { paint: '#424449', trim: '#c33336', hardware: '#b3a69a', badge: 'redline', carbon: true },
  arctic: { paint: '#eeeae4', trim: '#636a72', hardware: '#a8aaac', detail: '#1de1ee' },
  'original-asiimov': { paint: '#ece6d7', trim: '#ed6f22', hardware: '#5c5b5a', badge: 'asiimov', flat: true },
  neon: { paint: '#403f46', trim: '#85728c', hardware: '#a8a0ac', detail: '#9944ff', carbon: true },
  'original-ronin': { paint: '#42413f', trim: '#a63833', hardware: '#7d7770', badge: 'ronin' },
  'original-graffiti': { paint: '#514257', trim: '#929396', hardware: '#b8b6b3', badge: 'graffiti', flat: true },
  hanami: { paint: '#753047', trim: '#a14484', hardware: '#b4a4ab', detail: '#ed448c', badge: 'sakura' },
  gold: { paint: '#51473a', trim: '#cb9652', hardware: '#bca06c', detail: '#f5b03a' },
};

function outline(w: number, h: number, r: number) {
  const path = new THREE.Shape();
  const left = -w / 2, right = w / 2, bottom = -h / 2, top = h / 2;
  path.moveTo(left + r, bottom);
  path.lineTo(right - r, bottom); path.quadraticCurveTo(right, bottom, right, bottom + r);
  path.lineTo(right, top - r); path.quadraticCurveTo(right, top, right - r, top);
  path.lineTo(left + r, top); path.quadraticCurveTo(left, top, left, top - r);
  path.lineTo(left, bottom + r); path.quadraticCurveTo(left, bottom, left + r, bottom);
  return path;
}

function horizontalExtrusion(shape: THREE.Shape, height: number, bevel: number) {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: height - bevel * 2, bevelEnabled: bevel > 0, bevelSegments: 2,
    bevelSize: bevel, bevelThickness: bevel, curveSegments: 4,
  });
  geometry.rotateX(-HALF_PI);
  return geometry.translate(0, bevel, 0);
}

function ramp(p: number, start: number, end: number) {
  const t = THREE.MathUtils.clamp((p - start) / (end - start), 0, 1);
  return t * t * (3 - 2 * t);
}

export function createHardCase(item: Case, manager?: THREE.LoadingManager) {
  const style = finishes[item.id] || { paint: '#56646a', trim: item.color, hardware: '#959490' };
  const root = new THREE.Group(), body = new THREE.Group(), hinge = new THREE.Group(), lid = new THREE.Group();
  root.add(body, hinge); hinge.position.set(0, SEAM, AXLE_Z);
  lid.position.z = -AXLE_Z; hinge.add(lid);

  const loader = new THREE.TextureLoader(manager), textures: THREE.Texture[] = [], materials: THREE.Material[] = [];
  function texture(name: string, repeat = false, srgb = true) {
    const tex = loader.load(textureRoot + name + '.webp');
    if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
    if (repeat) { tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(1.5, 1.5); }
    tex.anisotropy = 4; textures.push(tex);
    return tex;
  }
  function surface(color: string, roughness: number, metalness: number, options: THREE.MeshStandardMaterialParameters = {}) {
    const m = new THREE.MeshStandardMaterial({ color, roughness, metalness, ...options });
    materials.push(m); return m;
  }
  const enamel = texture('enamel', true, false), weave = style.carbon ? texture('carbon-weave', true, false) : enamel;
  const grain = texture('surface-height', true, false), foamGrain = texture('foam-grain', true, false);
  const naval = item.id === 'night-port';
  const paintMap = naval ? texture('naval-enamel',true) : weave;
  const trimMap = naval ? texture('safety-enamel',true) : enamel;
  const paint = surface(naval ? '#e2e9e7' : style.paint, .48, .35, { map: paintMap, bumpMap: grain, bumpScale: .008 });
  const trim = surface(naval ? '#e9e5dc' : style.trim, .43, .40, { map: trimMap, bumpMap: grain, bumpScale: .007 });
  const panel = surface(naval ? '#d2dedd' : style.paint, .52, .28, { map: paintMap, bumpMap: grain, bumpScale: .009 });
  const metal = surface(style.hardware, .37, .66, { bumpMap: grain, bumpScale: .003 });
  const steel = surface('#a8aaa4', .30, .78);
  const gunmetal = surface('#394045', .42, .68);
  const black = surface('#262b2c', .76, .04, { bumpMap: grain, bumpScale: .005 });
  const liner = surface('#353a3c', .93, .015, { map: foamGrain, bumpMap: foamGrain, bumpScale: .028 });
  const recess = surface('#292f31', .93, .015, { map: foamGrain, bumpMap: foamGrain, bumpScale: .019 });
  function mesh(group: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0) {
    const obj = new THREE.Mesh(geometry, material);
    obj.position.set(x, y, z); obj.castShadow = true; obj.receiveShadow = true; group.add(obj); return obj;
  }
  function box(g: THREE.Object3D, mat: THREE.Material, x: number, y: number, z: number, w: number, h: number, d: number, r = .025) {
    const radius = Math.min(r, w * .45, h * .45, d * .45);
    return mesh(g, new RoundedBoxGeometry(w,h,d,2,radius), mat, x,y,z);
  }
  function cornerGuard(g: THREE.Group, x: number, y: number, z: number, w: number, h: number, d: number, radius: number) {
    // Trim the inward face of the cast guard to the shell's diagonal corner.
    // A full block here sticks through both the gasket and the foam lining.
    const bevel = Math.min(radius * .5, h * .2);
    const profile = outline(w - 2 * bevel, d - 2 * bevel, radius - bevel).getPoints(6);
    const cut = (point: THREE.Vector2) => Math.sign(x) * (x + point.x) + Math.sign(z) * (z - point.y) - (W / 2 + D / 2 - .20 + bevel * Math.SQRT2);
    const perimeter: THREE.Vector2[] = [];
    for (let i = 0; i < profile.length - 1; i++) {
      const a = profile[i], b = profile[i + 1], from = cut(a), to = cut(b);
      if (from >= 0) perimeter.push(a);
      if ((from >= 0) !== (to >= 0)) perimeter.push(a.clone().lerp(b, from / (from - to)));
    }
    mesh(g, horizontalExtrusion(new THREE.Shape(perimeter), h, bevel), trim, x, y - h / 2, z);
  }
  function pin(g: THREE.Object3D, mat: THREE.Material, x: number, y: number, z: number, r: number, length: number, axis: 'x'|'y'|'z') {
    const obj = mesh(g, new THREE.CylinderGeometry(r,r,length,14), mat,x,y,z);
    if (axis === 'x') obj.rotation.z = HALF_PI;
    if (axis === 'z') obj.rotation.x = HALF_PI;
    return obj;
  }
  function ring(g: THREE.Group, mat: THREE.Material, y: number, w: number, d: number, h: number, thickness: number, r: number, bevel: number) {
    const frame = outline(w,d,r);
    frame.holes.push(outline(w-thickness*2,d-thickness*2,Math.max(.03,r-thickness*.45)));
    return mesh(g, horizontalExtrusion(frame,h,bevel),mat,0,y,0);
  }
  function rivet(g: THREE.Group, x: number, y: number, z: number, side: 'front'|'side'|'top' = 'front') {
    const axis = side === 'front' ? 'z' : side === 'side' ? 'x' : 'y';
    pin(g, gunmetal, x,y,z,.031,.012,axis);
    const sign = side === 'side' ? Math.sign(x) : 1;
    const dx=axis==='x'?.008*sign:0, dy=axis==='y'?.008:0, dz=axis==='z'?.008:0;
    const slot = box(g,black,x+dx,y+dy,z+dz,axis==='x'?.005:.031,axis==='y'?.005:.007,axis==='z'?.005:.019,.002);
    if (axis === 'z') slot.rotation.z = .5;
  }

  // Hollow lower shell, continuous gasket and a recessed foam tray with routed pockets.
  box(body, black, 0,.115,0,W-.10,.18,D-.10,.075);
  ring(body, paint, .155, W-.055,D-.055,.835,.105,.16,.031);
  ring(body, paint, .945, W,D,.082,.119,.155,.017);
  ring(body, black, 1.023, W-.022,D-.022,.049,.072,.15,.009);
  box(body,recess,0,.267,0,W-.24,.10,D-.24,.07);
  const insert = outline(W-.272,D-.275,.08);
  const longPocket = outline(1.65,.89,.15), slotA=outline(.54,.30,.095), slotB=outline(.54,.30,.095);
  function shiftHole(path: THREE.Shape, x: number, z: number) {
    const vertices = path.getPoints(12).map(p=>new THREE.Vector2(p.x+x,p.y-z));
    return new THREE.Path(vertices);
  }
  insert.holes.push(shiftHole(longPocket,-.38,0),shiftHole(slotA,.89,-.28),shiftHole(slotB,.89,.28));
  mesh(body,horizontalExtrusion(insert,.29,.018),liner,0,.305,0);
  ring(body,black,.594,W-.255,D-.258,.036,.04,.075,.008);
  ring(body,liner,.423,W-.16,D-.16,.538,.097,.115,.012);
  // Structural front and side panels are cast into the shell. The lower rail
  // and replaceable corner guards never move when the lid opens.
  box(body,panel,0,.573,D/2-.019,W-.42,.737,.081,.069);
  box(body,panel,0,.552,-D/2+.015,W-.40,.60,.075,.07);
  box(body,paint,0,.179,D/2+.002,W-.23,.14,.10,.046);
  for (const sign of [-1,1]) {
    // A pressed kick plate wraps the corner at an angle. The thin return
    // casts a contact shadow on the inset face below the toggles.
    const shape = new THREE.Shape();
    const points = [[.41,.112],[1.36,.112],[1.39,.151],[1.36,.28],[1.15,.28],[1.08,.234],[.53,.234],[.47,.201]];
    points.forEach(([x,y],i)=>{ if(i===0)shape.moveTo(sign*x,y); else shape.lineTo(sign*x,y); });
    shape.closePath();
    mesh(body,new THREE.ExtrudeGeometry(shape,{depth:.028,bevelEnabled:true,bevelSize:.014,bevelThickness:.01,bevelSegments:2}),paint,0,0,D/2+.038);
  }
  for (const sx of [-1,1]) {
    box(body,panel,sx*(W/2-.018),.567,0,.082,.69,D-.35,.05);
    for (const sz of [-1,1]) {
      const x=sx*(W/2-.125), z=sz*(D/2-.12);
      box(body,black,x,.066,z,.29,.13,.33,.048);
      box(body,trim,x,.189,z,.285,.225,.30,.074);
      cornerGuard(body,x,.583,z,.196,.72,.20,.048);
      box(body,trim,x,.571,sz*(D/2+.013),.162,.726,.084,.032);
      box(body,trim,sx*(W/2+.006),.571,z,.068,.726,.180,.029);
      cornerGuard(body,x,.936,z,.27,.16,.29,.046);
      if(sz===1) {rivet(body,x,.21,D/2+.059);rivet(body,x,.87,D/2+.058);}
    }
    // Recessed hard rubber carrying handles on each side.
    box(body,black,sx*(W/2+.009),.57,0,.091,.45,.84,.043);
    for(const sz of [-1,1]) {
      box(body,metal,sx*(W/2+.057),.61,sz*.335,.09,.18,.088,.027);
      rivet(body,sx*(W/2+.10),.65,sz*.335,'side');
    }
    pin(body,black,sx*(W/2+.104),.57,0,.071,.65,'z');
    for(const dz of [-.205,-.105,0,.105,.205]) pin(body,gunmetal,sx*(W/2+.104),.570,dz,.072,.012,'z');
  }

  // The cover is a second open shell. All dimensions below are in lid space,
  // measured from the rear knuckle centre, not from the centre of an image.
  ring(lid, black, .009,W-.017,D-.017,.042,.105,.146,.008);
  ring(lid, paint, .044,W,D,.205,.089,.15,.025);
  box(lid,paint,0,.245,0,W-.055,.125,D-.05,.105);
  box(lid,panel,0,.308,0,W-.43,.090,D-.39,.07);
  ring(lid,black,.046,W-.182,D-.183,.039,.035,.085,.007);
  // The perimeter behind the foam masks the corner guards from inside.
  ring(lid,gunmetal,.052,W-.078,D-.079,.049,.128,.131,.011);
  const topStripes = item.id === 'redline' || item.id === 'original-asiimov';
  for (const sx of [-1,1]) {
    box(lid, item.id==='night-port'?trim:paint, sx*1.10,.323,0,.11,.078,D-.32,.035);
    if(topStripes) {
      box(lid,trim,sx*.85,.357,0,.059,.009,D-.56,.003);
      box(lid,trim,sx*.91,.358,0,.015,.009,D-.55,.003);
    }
    if(naval) {
      box(lid, paint,sx*.79,.348,.089,.46,.073,1.01,.030);
      box(lid,trim,sx*.79,.355,.689,.47,.067,.115,.024);
      box(lid,gunmetal,sx*.79,.369,-.552,.40,.050,.115,.020);
      rivet(lid,sx*.79,.392,.693,'top');
    }
    for(const sz of [-1,1]) {
      const x=sx*(W/2-.122), z=sz*(D/2-.12);
      cornerGuard(lid,x,.164,z,.29,.248,.30,.068);
      cornerGuard(lid,x,.277,z,.265,.100,.293,.046);
      box(lid,gunmetal,x*.974,.044,z*.951,.252,.043,.246,.028);
      rivet(lid,x,.328,z,'top');
    }
  }
  // Convoluted foam lining is actual displaced geometry, seen as the back
  // of the lid swings through the light.
  const inner = new THREE.PlaneGeometry(W-.30,D-.29,60,36);
  inner.rotateX(HALF_PI);
  const vertices=inner.getAttribute('position');
  for(let i=0;i<vertices.count;i++){
    const x=vertices.getX(i),z=vertices.getZ(i);
    const dome=(1+Math.cos(x*22.8))*(1+Math.cos(z*22.8));
    vertices.setY(i,.117-dome*.013);
  }
  inner.computeVertexNormals(); mesh(lid,inner,liner);
  for(const x of [-.98,.98]) {
    // The centre knuckle belongs to the moving cover. Outer ears and axle
    // stay with the base and are concentric with hinge.rotation.x.
    for (const dx of [-.131,.131]) {
      pin(body,gunmetal,x+dx,SEAM,AXLE_Z,.056,.088,'x');
      box(body,gunmetal,x+dx,SEAM-.081,AXLE_Z+.012,.074,.17,.09,.018);
    }
    pin(body,steel,x,SEAM,AXLE_Z,.028,.366,'x');
    pin(lid,metal,x,0,AXLE_Z,.052,.151,'x');
    box(lid,metal,x,.071,AXLE_Z+.023,.132,.128,.075,.014);
  }

  // Substantial injection-moulded carry handle with a gap under its grip.
  const handleZ = -.24;
  for(const sx of [-1,1]) {
    box(lid,gunmetal,sx*.41,.361,handleZ,.211,.080,.245,.038);
    const foot = box(lid,metal,sx*.406,.441,handleZ,.119,.207,.15,.035);
    foot.rotation.z = -sx*.19;
    rivet(lid,sx*.43,.404,handleZ+.092,'top');
  }
  box(lid,black,0,.539,handleZ,.88,.123,.152,.052);
  for(let x=-.27;x<=.28;x+=.101) box(lid,gunmetal,x,.541,handleZ,.009,.119,.153,.004);

  if (style.badge) {
    const badge=style.badge;
    const tex=texture(badge+'-mark');
    const decal=surface('#ffffff', .54,.16,{map:tex,transparent:true,alphaTest:.055,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1});
    const dimensions:Record<string,[number,number,number,number]>={
      'night-port':[.68,.744,0,.588],redline:[1.10,.49,0,.57],
      asiimov:[.40,.26,0,.61],ronin:[1.50,.65,0,.57],
      sakura:[1.03,.35,.20,.423],graffiti:[.79,.45,-.18,.53],
    };
    const [w,h,x,y]=dimensions[badge];
    mesh(body,new THREE.PlaneGeometry(w,h),decal,x,y,D/2+.024);
    if(badge==='graffiti'){
      const graphic=surface('#ffffff',.68,.15,{map:texture('graffiti-paint')});
      const p=mesh(lid,new THREE.PlaneGeometry(2.42,1.19),graphic,0,.355,0);
      p.rotation.x=-HALF_PI;
    } else if(badge==='redline'){
      for(const y of [.286,.312,.851,.877]) box(body,trim,0,y,D/2+.023,2.52,.009,.012,.002);
    } else if(badge==='asiimov'){
      for(const x of [-1.08,1.04]){
        const stripe=box(body,trim,x,.53,D/2+.026,.11,.69,.012,.004);
        stripe.rotation.z=-.39;
      }
    }
  }
  if(style.detail){
    const gem=surface(style.detail,.22,.52,{emissive:style.detail,emissiveIntensity:.14,flatShading:true});
    const mount=mesh(body,new THREE.CylinderGeometry(.23,.26,.07,6),gunmetal,0,.65,D/2+.053);
    mount.rotation.x=HALF_PI;
    const jewel=mesh(body,new THREE.OctahedronGeometry(1),gem,0,.65,D/2+.105);
    jewel.scale.set(.158,.20,.060);
    for(const x of [-.79,.79]) box(body,gem,x,.322,D/2+.026,.42,.018,.013,.006);
  }

  const catches: THREE.Group[]=[];
  const latchUppers: THREE.Group[]=[];
  for(const x of [-.95,.95]) {
    const z=D/2+.062;
    box(body,black,x,.785,z-.012,.260,.426,.088,.05);
    box(body,gunmetal,x,.779,z+.025,.190,.35,.073,.032);
    pin(body,steel,x,.796,z+.071,.038,.224,'x');
    box(lid,metal,x,.071,z-.008,.212,.150,.087,.032);
    box(lid,gunmetal,x,.086,z+.041,.146,.042,.020,.006);
    const lever=new THREE.Group(); body.add(lever); lever.position.set(x,.796,z+.075);
    box(lever,metal,0,-.096,0,.172,.237,.064,.029);
    box(lever,item.id==='night-port'?trim:gunmetal,0,-.156,.030,.114,.049,.034,.012);
    box(lever,steel,0,-.072,.033,.117,.040,.022,.006);
    const bail=new THREE.Group(); body.add(bail); bail.position.set(x,.825,z+.042);
    for(const dx of [-.094,.094]) pin(bail,steel,dx,.121,.003,.015,.244,'y');
    pin(bail,steel,0,.24,.003,.017,.205,'x');
    catches.push(lever); latchUppers.push(bail);
    batchRigidPart(lever); batchRigidPart(bail);
  }
  // A real telescoping stay on each side ties the moving lid to the shell.
  const stays = [-1,1].map(sign=>{
    const foot=new THREE.Vector3(sign*1.28,.73,-.01);
    const lidAnchor=new THREE.Vector3(sign*1.28,.092,-.47);
    const tube=pin(root,gunmetal,0,0,0,.031,1,'y');
    const rod=pin(root,steel,0,0,0,.015,1,'y');
    mesh(body,new THREE.SphereGeometry(.055,10,6),metal,foot.x,foot.y,foot.z);
    mesh(lid,new THREE.SphereGeometry(.045,10,6),steel,lidAnchor.x,lidAnchor.y,lidAnchor.z);
    return {foot,lidAnchor,tube,rod};
  });
  batchRigidPart(body); batchRigidPart(lid);
  if(style.flat) root.scale.y=.82;
  const up=new THREE.Vector3(0,1,0), lidPoint=new THREE.Vector3(), direction=new THREE.Vector3();
  function update(progress: number){
    const open=ramp(progress,.29,.84);
    // Ease through the seal, overshoot the stop slightly and let the stays damp it.
    const stop=ramp(progress,.70,.84)-ramp(progress,.84,.98);
    hinge.rotation.x=-1.835*open-.038*stop;
    catches.forEach((lever,i)=>{
      const delay=i*.034;
      const release=ramp(progress,.048+delay,.235+delay);
      lever.rotation.x=-1.14*release+.24*ramp(progress,.27+delay,.37+delay);
      latchUppers[i].rotation.x=1.21*ramp(progress,.145+delay,.31+delay);
    });
    for(const {foot,lidAnchor,tube,rod} of stays){
      lidPoint.copy(lidAnchor).add(lid.position).applyEuler(hinge.rotation).add(hinge.position);
      direction.subVectors(lidPoint,foot);
      const length=direction.length();
      direction.normalize();
      const sleeve=Math.min(.43,length*.78);
      tube.scale.y=sleeve; rod.scale.y=length-sleeve+.02;
      tube.position.copy(foot).addScaledVector(direction,sleeve/2);
      rod.position.copy(foot).addScaledVector(direction,sleeve+(length-sleeve)/2-.008);
      tube.quaternion.setFromUnitVectors(up,direction); rod.quaternion.copy(tube.quaternion);
    }
  }
  update(0);
  return { root,update,dispose() {
    root.traverse(node=>{if(node instanceof THREE.Mesh)node.geometry.dispose();});
    materials.forEach(mat=>mat.dispose()); textures.forEach(tex=>tex.dispose());
  }};
}
