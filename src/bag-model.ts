import * as T from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { Case } from './types';

type Point = (u: number, v: number, time: number) => T.Vector3;
type Side = -1 | 1;
const V = (x: number, y: number, z: number) => new T.Vector3(x, y, z);
const smooth = (from: number, to: number, x: number) => T.MathUtils.smoothstep(x, from, to);
const zipper = (p: number) => smooth(.1, .61, p);
const poses = [0, .18, .29, .38, .46, .55, .69, .86, 1];
const halfLength = 1.45;

function clothPoint(x: number, t: number, side: Side, p: number, inside = false) {
  const end = Math.pow(Math.abs(x), 6);
  const angle = (t - .5) * Math.PI;
  const cross = Math.pow(Math.max(0, Math.cos(angle)), .72);
  const h = Math.sign(Math.sin(angle)) * Math.pow(Math.abs(Math.sin(angle)), .68);
  const halfH = .665 - .095 * end;
  const halfW = .68 - .125 * end;
  const foldEnvelope = Math.sin(Math.PI * t) * (1 - Math.pow(x, 8));
  const crease = Math.sin(x * 12 + t * 15 + side + .7 * Math.sin(t * 11));
  const fold = (.035 * Math.sin(x * 9.4 + t * 12 + side) +
    .027 * Math.tanh(3.6 * crease) + .014 * Math.cos(x * 21.1 + t * 14)) * foldEnvelope;
  const release = smooth(-.02, .32, zipper(p) - Math.abs(x));
  const spread = release * smooth(.18, .85, p) * (1 - Math.pow(Math.abs(x), 4));
  const lip = smooth(.56, 1, t);
  const settle = Math.sin(smooth(.60, 1, p) * Math.PI * 1.7) * (1 - smooth(.84, 1, p));
  const width = halfW * cross + fold + spread * lip * (.55 + .024 * Math.sin(7*x+side));
  let y = .12 + halfH * (1 + h) + .018 * Math.cos(7 * x + 1.4) * smooth(.70,1,t) +
    spread * lip * (side === 1 ? -.39 : -.18) + .025 * settle * lip;
  let z = side * width;
  if (inside) {
    y += .035 * (1 - 2*t);
    z -= side * (.021 + .009 * cross);
  }
  return V(halfLength*x, y, z);
}

// Build matching positions AND normals for the successive cloth shapes.
// Movement is local to the part of the zipper that the runners have passed.
function surface(point: Point, nx: number, ny: number, reverse: boolean, time: number) {
  const positions: number[] = [], uvs: number[] = [], index: number[] = [];
  for (let j=0; j<=ny; j++) {
    for (let i=0; i<=nx; i++) {
      const u=i/nx, v=j/ny, q=point(u,v,time);
      positions.push(q.x,q.y,q.z);
      uvs.push(u,v);
      if (i<nx && j<ny) {
        const a=j*(nx+1)+i, b=a+1, c=a+nx+1, d=c+1;
        index.push(...(reverse ? [a,c,b,b,c,d] : [a,b,c,b,d,c]));
      }
    }
  }
  const g=new T.BufferGeometry();
  g.setAttribute('position',new T.Float32BufferAttribute(positions,3));
  g.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

// The closed carryall, its lining and the open mouth all belong to one deforming volume.
export function createBag(_item: Case, manager?: T.LoadingManager) {
  const root=new T.Group();
  root.name='Field carryall';
  const morphs: T.Mesh[]=[];
  const parts: Array<(p:number)=>void>=[];
  const geometries=new Set<T.BufferGeometry>();
  const materials=new Set<T.Material>();
  const textures: T.Texture[]=[];
  const loader=new T.TextureLoader(manager);
  function texture(path:string,repeatX=1,repeatY=1) {
    const image=loader.load('/assets/unseal/bag/'+path);
    image.colorSpace=T.SRGBColorSpace;
    image.wrapS=image.wrapT=T.RepeatWrapping;
    image.repeat.set(repeatX, repeatY);
    image.anisotropy=4;
    textures.push(image);
    return image;
  }
  const woven=texture('field-cloth.webp',4.5,2.8);
  const weathering=texture('field-shell.webp');
  const webbing=texture('field-cloth.webp',1.6,7);
  function mat(params:T.MeshStandardMaterialParameters) {
    const result=new T.MeshStandardMaterial(params);
    materials.add(result);
    return result;
  }
  const cloth=mat({color:0x65583a, map:weathering, roughness:.91, bumpMap:woven, bumpScale:.007});
  const pocket=mat({color:0x584f36,map:weathering,roughness:.91,bumpMap:woven,bumpScale:.006});
  const lining=mat({color:0x4f4936,map:woven,roughness:.93,side:T.DoubleSide});
  const bottom=mat({color:0x353428,map:weathering,bumpMap:woven,bumpScale:.008,roughness:.73});
  const straps=mat({color:0x423e2a,map:webbing,bumpMap:webbing,bumpScale:.008,roughness:.88,side:T.DoubleSide});
  const trim=mat({color:0x4b4934,roughness:.78});
  const seam=mat({color:0xbaad7b,roughness:.92});
  const zipCloth=mat({color:0x403f30,map:webbing,roughness:.80,side:T.DoubleSide});
  const teethMat=mat({color:0x998c63,metalness:.62,roughness:.43});
  const steel=mat({color:0x897c64,metalness:.69,roughness:.37});
  const rubber=mat({color:0x292c24,roughness:.78});
  const patchMat=mat({map:texture('field-patch.webp'),roughness:.94,side:T.DoubleSide});

  function mesh(g:T.BufferGeometry,m:T.Material,group:T.Object3D=root) {
    geometries.add(g);
    const object=new T.Mesh(g,m);
    object.castShadow=true;
    object.receiveShadow=true;
    group.add(object);
    return object;
  }
  function clothMesh(build:(time:number)=>T.BufferGeometry,m:T.Material,moves:boolean) {
    const g=build(0);
    if(moves){
      g.morphAttributes.position=[]; g.morphAttributes.normal=[];
      poses.slice(1).forEach(p=>{
        const shape=build(p);
        g.morphAttributes.position!.push(shape.getAttribute('position') as T.BufferAttribute);
        g.morphAttributes.normal!.push(shape.getAttribute('normal') as T.BufferAttribute);
        shape.dispose();
      });
    }
    const shape=mesh(g,m);
    if(moves) morphs.push(shape);
    return shape;
  }
  function panel(point:Point, nx:number,ny:number,m:T.Material,reverse=false,moves=true) {
    return clothMesh(time=>surface(point,nx,ny,reverse,time),m,moves);
  }
  function cube(w:number,h:number,d:number,r:number,m:T.Material,at:T.Vector3, group:T.Object3D=root) {
    const object=mesh(new RoundedBoxGeometry(w,h,d,2,r),m,group);
    object.position.copy(at); return object;
  }
  function tube(points:T.Vector3[],radius:number) {
    const path=new T.CatmullRomCurve3(points);
    return new T.TubeGeometry(path,Math.max(12,points.length*2),radius,6,false);
  }
  function cord(points:T.Vector3[],radius:number,m:T.Material,group:T.Object3D=root) {
    return mesh(tube(points,radius),m,group);
  }
  function sample(n:number,fn:(u:number)=>T.Vector3) {
    return Array.from({length:n},(_,i)=>fn(i/(n-1)));
  }

  // A moulded boot supports the cloth and gives the bag four points of contact with the bench.
  cube(2.85,.23,1.03,.079,bottom,V(0,.141,0));
  for(const x of [-1.18,1.18]) {
    for(const s of [1,-1] as const) {
      cube(.235,.20,.135,.031,trim,V(x,.135,s*.483));
      cube(.30,.045,.21,.018,rubber,V(x,.026,s*.431));
      for(const dx of [-.068,.068]) {
        const rivet=mesh(new T.SphereGeometry(.015,8,5),steel);
        rivet.position.set(x+dx,.155,s*.549);
        rivet.scale.z=.40;
      }
    }
  }
  for(const s of [1,-1] as const) {
    const back=s===-1;
    panel((u,v,p)=>clothPoint(2*u-1,v,s,p),52,28,cloth,back);
    panel((u,v,p)=>clothPoint(2*u-1,v,s,p,true),44,20,lining,!back);
    // Abrasion-resistant lower panel wraps around the bottom instead of a flat black box.
    panel((u,v,p)=>{
      const t=v*.343;
      const q=clothPoint(2*u-1,t,s,p);
      q.z+=s*.017; q.y-=.005; return q;
    },44,10,bottom,back,false);
    cord(sample(35,u=>clothPoint(2*u-1,.343,s,0).add(V(0,0,s*.018))),.012,trim);

    // Zipper tape backed by a second strip of fabric with its own moving teeth.
    panel((u,v,p)=>{
      const q=clothPoint(2*u-1,.934+.066*v,s,p);
      q.y+=.014;
      q.z+=s*.013;
      return q;
    },60,4,zipCloth,back);
    // Rolled piping around the top edges casts a shadow on the lining.
    panel((u,v,p)=>{
      const q=clothPoint(2*u-1,.942,s,p);
      const angle=v*2*Math.PI;
      q.z+=s*(.014+.014*Math.cos(angle)); q.y+=.012+.014*Math.sin(angle);
      return q;
    },48,6,trim,back);
  }

  // The solid end gussets are convex sewn panels that join both fabric walls.
  for(const s of [1,-1] as const) {
    function gusset(u:number,v:number) {
      const t=v*.998+.001;
      const front=clothPoint(s,t,1,0), other=clothPoint(s,t,-1,0);
      const q=other.lerp(front,u);
      q.x+=s*.11*Math.sin(Math.PI*u)*Math.sin(Math.PI*v);
      return q;
    }
    panel(gusset,20,20,pocket,s===1,false);
    panel((u,v)=>gusset(u,v).add(V(-s*.014,0,0)),20,20,lining,s!==1,false);
    const edge=[...sample(30,t=>clothPoint(s,t,1,0)),...sample(30,t=>clothPoint(s,1-t,-1,0))];
    edge.push(edge[0]);
    cord(edge,.023,trim);
    // Dashed webbing, a stitched end pocket and a short padded pickup grip break up the end gussets.
    function endPocket(u:number,v:number) {
      const z=(u-.5)*.91, y=.31+v*.59;
      const fullness=Math.sin(u*Math.PI)*Math.sin(v*Math.PI);
      return V(s*(1.563 + fullness*.074),y,z*(.90+.10*Math.sin(v*Math.PI)));
    }
    panel((u,v)=>endPocket(u,v),20,12,pocket,s===1,false);
    const outline=[
      ...sample(10,u=>endPocket(u,0)),...sample(6,v=>endPocket(1,v)),
      ...sample(10,u=>endPocket(1-u,1)),...sample(6,v=>endPocket(0,1-v)),
    ];
    cord(outline,.012,trim);
    const openingEdges: Array<(t:number)=>T.Vector3>=[
      t=>endPocket(t,0),t=>endPocket(1,t),t=>endPocket(1-t,1),t=>endPocket(0,1-t),
    ];
    for(const rim of openingEdges) {
      panel((u,v)=>{
        const q=rim(u);
        q.x=s*T.MathUtils.lerp(1.47,Math.abs(q.x),v);
        return q;
      },14,3,straps,false,false);
    }
    for(const level of [.32,.55]) {
      panel((u,v)=>endPocket(.04+.92*u,level+v*.14).add(V(s*.009,0,0)),16,4,straps,s===1,false);
      for(const u of [.17,.38,.61,.82]){
        cord([endPocket(u,level+.018).add(V(s*.013,0,0)),endPocket(u+.006,level+.12).add(V(s*.013,0,0))],.004,seam);
      }
    }
    for(const dz of [-1,1]) {
      cube(.06,.19,.12,.015,trim,V(s*1.525,.963,dz*.392));
      const stud=mesh(new T.SphereGeometry(.022,8,5),steel);
      stud.position.set(s*1.561,.993,dz*.39);
    }
    cord([V(s*1.53,.947,-.38),V(s*1.66,.971,-.24),V(s*1.68,.974,.22),V(s*1.53,.946,.38)],.038,rubber);
  }
  // Four webbing runs descend the front and rear side; they anchor the carry handles.
  for(const s of [1,-1] as const) {
    for(const x of [-.64,.64]) {
      panel((u,v,p)=>{
        const q=clothPoint(x+(u-.5)*.145,.25+v*.54,s,p);
        q.z+=s*.033;q.y+=.009; return q;
      },5,24,straps,s===-1);
      for(const offset of [-.052,.052]) {
        panel((u,v,p)=>{
          const q=clothPoint(x+offset+(u-.5)*.006,.265+v*.507,s,p);
          q.z+=s*.037;q.y+=.012;return q;
        },1,18,seam,s===-1);
      }
    }
  }
  // A padded access pocket with a large printed field patch sits between the front straps.
  function pocketPoint(u:number,v:number,p:number) {
    const x=(u-.5)*.91;
    const t=.295+v*.36;
    const q=clothPoint(x,t,1,p);
    q.z+=.029+.077*Math.sin(u*Math.PI)*Math.sin(v*Math.PI);
    return q;
  }
  panel(pocketPoint,24,14,pocket);
  clothMesh(p=>tube([
    ...sample(19,u=>pocketPoint(u,0,p)), ...sample(9,v=>pocketPoint(1,v,p)).slice(1),
    ...sample(19,u=>pocketPoint(1-u,1,p)).slice(1), ...sample(9,v=>pocketPoint(0,1-v,p)).slice(1),
  ].map(q=>q.add(V(0,0,.009))),.012),trim,true);
  panel((u,v,p)=>pocketPoint(.20+.60*u,.19+.55*v,p).add(V(0,0,.007)),18,10,patchMat);
  clothMesh(p=>tube(sample(24,u=>pocketPoint(.03+.94*u,.93,p).add(V(0,.003,.012))),.008),seam,true);
  // A small internal pad, stitched channels and a back-wall slip pocket reveal the cavity's depth.
  cube(2.47,.105,.83,.046,lining,V(0,.20,0));
  for(const x of [-.72,0,.72])cord([V(x,.251,-.37),V(x+.01,.258,0),V(x,.251,.36)],.008,trim);
  panel((u,v,p)=>{
    const x=(u-.5)*1.58;
    const q=clothPoint(x,.42+.32*v,-1,p,true);
    q.z+=.022+.031*Math.sin(Math.PI*u)*v;return q;
  },32,10,bottom,false);

  // Fit the rigid hardware to the full stitched footprint in each cloth pose.
  // The mount turns with the side wall and stays above the ridges in the weave.
  function mountOnCloth(group:T.Group,x:number,t:number,s:Side,low:number,high:number,offset:number) {
    const mounts=poses.map(p=>{
      const center=clothPoint(x,t,s,p);
      const along=clothPoint(x+.085,t,s,p).sub(clothPoint(x-.085,t,s,p)).normalize();
      const up=clothPoint(x,high,s,p).sub(clothPoint(x,low,s,p));
      const normal=along.clone().cross(up).normalize();
      up.crossVectors(normal,along).normalize();
      const rotation=new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(along,up,normal));
      const outward=normal.multiplyScalar(s);
      let lift=0;
      for(const dx of [-.085,0,.085]) for(const fraction of [0,.25,.5,.75,1]) {
        const q=clothPoint(x+dx,T.MathUtils.lerp(low,high,fraction),s,p);
        lift=Math.max(lift,q.sub(center).dot(outward));
      }
      return {at:center.addScaledVector(outward,lift+offset),rotation};
    });
    parts.push(p=>{
      let i=1;
      while(i<poses.length-1 && p>poses[i]) i++;
      const f=(p-poses[i-1])/(poses[i]-poses[i-1]);
      group.position.lerpVectors(mounts[i-1].at,mounts[i].at,f);
      group.quaternion.slerpQuaternions(mounts[i-1].rotation,mounts[i].rotation,f);
    });
  }
  // The padded nylon grips settle against the sides as the mouth spreads.
  for(const s of [1,-1] as const) {
    function handleCenter(u:number,p:number) {
      const open=smooth(.14,.80,p);
      const arch=Math.pow(Math.sin(Math.PI*u),.82);
      const base=clothPoint((2*u-1)*.64,.79,s,p);
      return V(
        (2*u-1)*.93,
        base.y+.018+arch*.61*Math.cos(2.09*open),
        base.z+s*(.046+arch*(.05+.43*Math.sin(2.09*open)))
      );
    }
    function gripSurface(u:number,v:number,p:number,pad:boolean){
      const origin=handleCenter(u,p);
      const tangent=handleCenter(Math.min(1,u+.001),p).sub(handleCenter(Math.max(0,u-.001),p)).normalize();
      const across=V(-tangent.y,tangent.x,0).normalize();
      const normal=tangent.clone().cross(across).normalize();
      const a=v*Math.PI*2;
      return origin.addScaledVector(across,Math.cos(a)*(pad?.070:.055)).addScaledVector(normal,Math.sin(a)*(pad?.045:.021));
    }
    panel((u,v,p)=>gripSurface(u,v,p,false),30,8,straps,true);
    panel((u,v,p)=>gripSurface(.29+.42*u,v,p,true),18,12,rubber,true);
    // Reinforced metal sliders and the sewn webbing loops sit below the handle roots.
    for(const x of [-.64,.64]) {
      const group=new T.Group();root.add(group);
      mountOnCloth(group,x,.675,s,.60,.755,.045);
      cube(.25,.035,.052,.012,steel,V(0,.112,0),group);
      cube(.25,.035,.052,.012,steel,V(0,-.112,0),group);
      cube(.035,.23,.052,.012,steel,V(-.107,0,0),group);
      cube(.035,.23,.052,.012,steel,V(.107,0,0),group);
      const plate=new T.Shape();
      plate.moveTo(-.117,.076);plate.lineTo(.117,.076);plate.quadraticCurveTo(.125,.056,.095,.038);
      plate.quadraticCurveTo(.055,0,.099,-.046);plate.lineTo(.113,-.073);plate.lineTo(-.113,-.073);
      plate.quadraticCurveTo(-.119,-.061,-.093,-.039);plate.quadraticCurveTo(-.06,0,-.108,.045);
      plate.closePath();
      const plateMesh=mesh(new T.ExtrudeGeometry(plate,{depth:.018,bevelEnabled:true,bevelThickness:.004,bevelSize:.004,bevelSegments:1,steps:1}),steel,group);
      plateMesh.position.z=s*.021;
    }
  }

  // Die-cut inventory tag on a split ring, held by the front right webbing run.
  const tag=new T.Group();
  root.add(tag);
  mountOnCloth(tag,.74,.73,1,.46,.76,.048);
  const loop=mesh(new T.TorusGeometry(.053,.009,6,22),steel,tag);
  loop.rotation.y=.33;
  const leather=mat({color:0xb36929, roughness:.79, map:webbing});
  const tagCut=new T.Shape();
  tagCut.moveTo(-.09,-.06);tagCut.lineTo(-.047,0);tagCut.quadraticCurveTo(0,.033,.048,0);
  tagCut.lineTo(.09,-.06);tagCut.lineTo(.09,-.34);tagCut.quadraticCurveTo(.09,-.36,.07,-.36);
  tagCut.lineTo(-.07,-.36);tagCut.quadraticCurveTo(-.09,-.36,-.09,-.34);tagCut.closePath();
  const label=mesh(new T.ExtrudeGeometry(tagCut,{depth:.011,bevelEnabled:true,bevelThickness:.003,bevelSize:.003,bevelSegments:1,steps:1}),leather,tag);
  label.position.set(.013,-.035,.019);
  const eye=mesh(new T.TorusGeometry(.021,.005,5,16),steel,tag);
  eye.position.set(.013,-.054,.034);
  parts.push(p=>{ tag.rotateZ(.060+.16*Math.sin(smooth(.08,.80,p)*Math.PI*1.5)*(1-smooth(.72,1,p))); });

  // Each tooth is an actual piece of hardware; the two chain halves follow their own rim.
  const toothGeo=new T.BoxGeometry(.031,.024,.052), toothCount=69;
  geometries.add(toothGeo);
  const teeth=new T.InstancedMesh(toothGeo,teethMat,toothCount*2);
  teeth.castShadow=true; teeth.frustumCulled=false;root.add(teeth);
  const transform=new T.Object3D();
  const teethAt=([-1,1] as const).flatMap((s,j)=>Array.from({length:toothCount},(_,i)=>{
    const x=-.949+(i+(j?.45:0))*1.89/(toothCount-1);
    return {s,x};
  }));
  parts.push(p=>{
    teethAt.forEach(({s,x},i)=>{
      const at=clothPoint(x,1,s,p);
      at.y+=.022;at.z+=s*.015;
      transform.position.copy(at);
      transform.rotation.set(s*.10,0,-.045*Math.sin(x*4));
      transform.updateMatrix();teeth.setMatrixAt(i,transform.matrix);
    });
    teeth.instanceMatrix.needsUpdate=true;
  });

  // Die-cast carriages carry a pivoting metal ring and an orange knotted pull cord.
  for(const sign of [-1,1] as const){
    const carriage=new T.Group(), pull=new T.Group();root.add(carriage);carriage.add(pull);
    cube(.117,.061,.102,.017,steel,V(0,0,0),carriage);
    cube(.084,.042,.037,.009,steel,V(0,.034,0),carriage);
    const ring=mesh(new T.TorusGeometry(.051,.010,6,20),steel,pull);
    ring.rotation.x=Math.PI/2;ring.scale.set(1.25,.62,1);
    const pullMat=mat({color:0xc48443,map:webbing,roughness:.82});
    const tab=cube(.187,.036,.073,.014,straps,V(.145,-.029,0),pull);
    tab.rotation.z=-.37;
    const end=cube(.053,.039,.075,.009,pullMat,V(.212,-.053,0),pull);
    end.rotation.z=-.37;
    pull.position.set(sign*.01,.052,.037);
    const swing=new T.Euler(), swingRotation=new T.Quaternion();
    parts.push(p=>{
      const travel=zipper(p), x=sign*(.044+.913*travel);
      const q=clothPoint(x,1,sign,p);
      const ahead=clothPoint(x+.012,1,sign,p), behind=clothPoint(x-.012,1,sign,p);
      carriage.rotation.z=Math.atan2(ahead.y-behind.y,ahead.x-behind.x);
      carriage.position.set(q.x,q.y+.057,q.z);
      const trail=Math.sin(travel*Math.PI);
      // The hinged pull hangs independently of the carriage pitch at the curved ends.
      swing.set(0,sign===1?-1.09-1.12*trail:-2.05+1.12*trail,-.13+.40*trail-.17*smooth(.76,1,travel));
      pull.quaternion.copy(carriage.quaternion).invert().multiply(swingRotation.setFromEuler(swing));
    });
  }

  function update(p:number) {
    const t=T.MathUtils.clamp(p,0,1);
    let upper=1;
    while(upper<poses.length-1 && poses[upper]<t) upper++;
    const lower=upper-1;
    const f=(t-poses[lower])/(poses[upper]-poses[lower]);
    for(const shape of morphs) {
      const weights=shape.morphTargetInfluences!;
      weights.fill(0);
      if(lower>0) weights[lower-1]=1-f;
      weights[upper-1]=f;
    }
    for(const paint of parts) paint(t);
  }
  update(0);
  return {root,update,dispose(){
    teeth.dispose();
    for(const g of geometries) g.dispose();
    for(const m of materials) m.dispose();
    for(const t of textures)t.dispose();
  }};
}
