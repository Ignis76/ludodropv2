import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { batchRigidPart } from './case-geometry';

// Reuse the BRDF tables for every scene in this tab. Load them alongside the bench textures.
let panelLighting: Promise<void> | undefined;
function preparePanelLighting() {
  return panelLighting ??= import('three/addons/lights/RectAreaLightUniformsLib.js')
    .then(({ RectAreaLightUniformsLib }) => { RectAreaLightUniformsLib.init(); })
    .catch(error => { panelLighting = undefined; throw error; });
}

// The tray and its mat share world-space UVs, independent of the width of the bench.
function surface(points: readonly [number, number][], y: number, uvStep = .36) {
  const vertices = [], uvs = [], indices = [];
  for (const [x,z] of points) {
    vertices.push(x, y, z); uvs.push(x * uvStep, z * uvStep);
  }
  for (let i = 1; i < points.length - 1; i++) indices.push(0, i, i + 1);
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.Float32BufferAttribute(vertices, 3));
  geo.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices); geo.computeVertexNormals();
  return geo;
}

function apronRing(x: number, front: number, back: number, cut: number): [number, number][] {
  return [[-x + cut,front],[x - cut,front],[x,front - cut],[x,back + cut],[x - cut,back],[-x + cut,back],[-x,back + cut],[-x,front - cut]];
}

// The three linear channels carry paint variation, roughness and relief. Sampling
// once keeps the moving shot inexpensive and uses the same filtered detail for all three.
function applySurface(material:T.MeshStandardMaterial, texture:T.Texture, relief:number) {
  material.map=material.bumpMap=texture;
  material.bumpScale=relief;
  material.onBeforeCompile=shader=>{
    shader.fragmentShader=shader.fragmentShader
      .replace('#include <map_fragment>', 'vec3 finishSample=texture2D(map,vMapUv).rgb; diffuseColor.rgb*=.45+1.05*finishSample.r;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor=clamp(roughnessFactor*(.56+.58*finishSample.g),.12,1.);')
      .replace('#include <normal_fragment_maps>', 'normal=perturbNormalArb(-vViewPosition,normal,bumpScale*vec2(dFdx(finishSample.b),dFdy(finishSample.b)),faceDirection);');
  };
  material.needsUpdate=true;
}

function releaseMeshes(root:T.Object3D, extraTextures:T.Texture[] = [], sharedEnvironment?:T.Texture) {
  const geometries=new Set<T.BufferGeometry>(), materials=new Set<T.Material>(), textures=new Set(extraTextures);
  root.traverse(node=>{
    if(!(node instanceof T.Mesh))return;
    geometries.add(node.geometry);
    for(const material of Array.isArray(node.material)?node.material:[node.material])materials.add(material);
  });
  for(const material of materials){
    for(const value of Object.values(material))if(value instanceof T.Texture && value!==sharedEnvironment)textures.add(value);
    material.dispose();
  }
  geometries.forEach(geometry=>geometry.dispose());
  for(const texture of textures){
    texture.dispose();
    if(typeof ImageBitmap!=='undefined' && texture.source.data instanceof ImageBitmap)texture.source.data.close();
  }
}

type CradleContact = { x:number; z:number; underside:number; front:number };
// An upward line hits a front-facing triangle if its XZ barycentric coordinates are inside.
// Most triangles are nowhere near either bracket and exit at the X interval test.
function sampleCradle(world:Float32Array, a:number, b:number, c:number, contact:CradleContact, length:number) {
  const x=contact.x, ax=world[a], bx=world[b], cx=world[c];
  if(x<Math.min(ax,bx,cx)||x>Math.max(ax,bx,cx))return;
  const az=world[a+2], dx1=bx-ax, dx2=cx-ax, dz1=world[b+2]-az, dz2=world[c+2]-az;
  const det=dx1*dz2-dz1*dx2;
  if(det<=0)return;
  for(let step=-5;step<=5;step++){
    const z=contact.z+step*.008*length;
    const u=((x-ax)*dz2-(z-az)*dx2)/det, v=(dx1*(z-az)-dz1*(x-ax))/det;
    if(u<0||v<0||u+v>1)continue;
    const y=world[a+1]+u*(world[b+1]-world[a+1])+v*(world[c+1]-world[a+1]);
    contact.underside=Math.min(contact.underside,y);
    contact.front=Math.max(contact.front,z);
  }
}

// Project the mounted model onto the wall behind the open grid and find its two support points.
function projectDisplay(rifle:T.Group, wallZ:number, width:number, height:number, length:number) {
  const canvas=document.createElement('canvas'), silhouette=document.createElement('canvas');
  canvas.width=silhouette.width=384;
  canvas.height=silhouette.height=Math.round(384*height/width);
  const path=new Path2D(), pixel=canvas.width/width, point=new T.Vector3();
  const contacts= [-.23,.33].map(u=>{
    const {x,z}=rifle.localToWorld(new T.Vector3(u,0,0));
    return {x,z,underside:Infinity,front:-Infinity};
  });
  rifle.traverse(child=>{
    if(!(child instanceof T.Mesh))return;
    const position=child.geometry.getAttribute('position'), index=child.geometry.index;
    const projected=new Float32Array(position.count*2), world=new Float32Array(position.count*3);
    for(let i=0;i<position.count;i++){
      point.fromBufferAttribute(position,i).applyMatrix4(child.matrixWorld);
      point.toArray(world,i*3);
      const depth=point.z-wallZ;
      projected[i*2]=canvas.width*.5+(point.x+.18*depth)*pixel;
      projected[i*2+1]=canvas.height*.5-(point.y-.40*depth)*pixel;
    }
    for(let i=0;i<(index?.count ?? position.count);i+=3){
      const ia=index?index.getX(i):i, ib=index?index.getX(i+1):i+1, ic=index?index.getX(i+2):i+2;
      for(const contact of contacts)sampleCradle(world,3*ia,3*ib,3*ic,contact,length);
      const a=2*ia,b=2*ib,c=2*ic;
      const ax=projected[a], ay=projected[a+1], bx=projected[b], by=projected[b+1], cx=projected[c], cy=projected[c+1];
      if((bx-ax)*(cy-ay)-(by-ay)*(cx-ax)>=0)continue;
      path.moveTo(ax,ay);path.lineTo(bx,by);path.lineTo(cx,cy);path.closePath();
    }
  });
  silhouette.getContext('2d')!.fill(path);
  const ctx=canvas.getContext('2d')!;
  ctx.filter='blur(4px)';ctx.globalAlpha=.36;ctx.drawImage(silhouette,0,0);
  ctx.filter='blur(1.5px)';ctx.globalAlpha=.12;ctx.drawImage(silhouette,0,0);
  const texture=new T.CanvasTexture(canvas);
  return {texture,contacts};
}

export function buildWorkshop(scene:T.Scene, compact:boolean, onTextureReady?:()=>void, closeUp=false) {
  const root=new T.Group(), room=new T.Group(), desk=new T.Group();
  root.add(room,desk); scene.add(root);
  const steel=(color:string,roughness:number,metalness:number)=>
    new T.MeshStandardMaterial({color,roughness,metalness});
  const iron=steel('#242d34',.76,.22), black=steel('#171e24',.63,.30);
  const brushed=steel('#6b7880',.49,.42);
  const graphite=steel('#465258',.68,.28);
  const rubber=steel('#545d60',.91,.025);
  const wall=steel('#647073',.86,.11), panel=steel('#4e5a5c',.73,.25);
  const wire=steel('#566168',.59,.43);
  const rifleMaterials=new Set<T.MeshStandardMaterial>();
  let armoryEnvironment:T.Texture|undefined;
  function illuminateRifle(material:T.MeshStandardMaterial){
    if(!armoryEnvironment || material.envMap===armoryEnvironment)return;
    material.envMap=armoryEnvironment;
    material.envMapIntensity=3.0;
    material.needsUpdate=true;
  }
  const upperWall=steel('#46535a',.82,.19);
  const enamel=steel('#c39e59',.72,.13);
  const loaded:T.Texture[]=[];
  const lifetime=new AbortController();
  let disposed=false, settle!:()=>void, displayFailure:unknown;
  const settled=new Promise<void>(done=>{settle=done;});
  let pendingTextures=6;
  function textureReady(){
    if(--pendingTextures===0){settle();if(!disposed && !displayFailure)onTextureReady?.();}
  }
  const loader=new T.TextureLoader();
  function finishMap(name:string, materials:T.MeshStandardMaterial[], relief:number){
    loaded.push(loader.load('/assets/cases/features/bench-'+name+'.webp',texture=>{
      if(disposed)return;
      texture.wrapS=texture.wrapT=T.RepeatWrapping;
      texture.anisotropy=8;
      for(const material of materials) applySurface(material,texture,relief);
      textureReady();
    },undefined,textureReady));
  }
  finishMap('mat',[rubber],1.75);
  finishMap('sheet',[wall,upperWall],.84);
  finishMap('alloy',[brushed,panel,graphite],1.10);

  const V=(x:number,y:number,z:number)=>new T.Vector3(x,y,z);
  function mesh(group:T.Group,geometry:T.BufferGeometry, material:T.Material, x=0,y=0,z=0) {
    const item=new T.Mesh(geometry,material);
    item.position.set(x,y,z);
    group.add(item); return item;
  }
  function box(group:T.Group,material:T.Material,x:number,y:number,z:number,w:number,h:number,d:number){
    const shape=new T.BoxGeometry(w,h,d);
    if(material===wall||material===upperWall||material===brushed||material===panel||material===graphite){
      const sheet=material===wall||material===upperWall;
      const sizeU=sheet?5.10:2.60, sizeV=sheet?2.55:.975;
      const pos=shape.getAttribute('position'), normals=shape.getAttribute('normal'), uv=shape.getAttribute('uv');
      for(let i=0;i<pos.count;i++){
        const wx=x+pos.getX(i), wy=y+pos.getY(i), wz=z+pos.getZ(i);
        const top=Math.abs(normals.getY(i))>.5, lateral=Math.abs(normals.getX(i))>.5;
        uv.setXY(i,(lateral?wz:wx)/sizeU, (top?wz:wy)/sizeV);
      }
    }
    return mesh(group,shape,material,x,y,z);
  }
  function rod(group:T.Group,material:T.Material,a:T.Vector3,b:T.Vector3,r:number,segments=8) {
    const delta=b.clone().sub(a), centre=a.clone().lerp(b,.5);
    const item=mesh(group,new T.CylinderGeometry(r,r,delta.length(),segments),material);
    item.position.copy(centre);
    item.quaternion.setFromUnitVectors(V(0,1,0),delta.normalize());
    return item;
  }
  // The window and work lights share one stationary shadow map for the work surface.
  root.add(new T.HemisphereLight(0xd5e6fa,0x647078,1.62));
  const daylight=new T.DirectionalLight(0xe1eaf6,1.52);
  daylight.position.set(-3.5,8.5,-2.4);
  daylight.castShadow=true;
  daylight.shadow.mapSize.setScalar(compact?768:1024);
  Object.assign(daylight.shadow.camera,{left:-6,right:6,top:5.6,bottom:-4.6,near:.4,far:25});
  daylight.shadow.camera.updateProjectionMatrix();
  daylight.shadow.bias=-.00038; daylight.shadow.normalBias=.006; daylight.shadow.radius=3.4; root.add(daylight);

  // A wide insulated lookout window. The sill stands behind the bench, leaving the floor shadow legible.
  const wz=-6.2, span=compact?5.6:6.2, sill=1.00, lintel=3.78;
  box(room,wall,0,-2.55,wz,44,7.10,.42);
  box(room,upperWall,0,8.78,wz,44,10,.46);
  for(const s of [-1,1]){
    box(room,wall,s*(span+6),2.25,wz,12,4.9,.43);
    box(room,black,s*span,(sill+lintel)/2,wz+.10,.20,lintel-sill+.18,.34);
    box(room,brushed,s*(span+.15),(sill+lintel)/2,wz+.18,.08,lintel-sill+.29,.22);
    box(room,brushed,s*(span-.125),(sill+lintel)/2,wz+.14,.045,lintel-sill,.085);
  }
  box(room,black,0,sill,wz+.10,2*span+.2,.19,.42);
  box(room,brushed,0,sill-.085,wz+.22,2*span+.42,.085,.54);
  box(room,black,0,lintel,wz+.10,2*span+.22,.24,.44);
  box(room,brushed,0,lintel+.17,wz+.13,2*span+.46,.08,.39);
  for(const x of [-span*.6,span*.6]){
    box(room,iron,x,(sill+lintel)/2,wz-.04,.085,lintel-sill,.14);
    box(room,brushed,x+.045,(sill+lintel)/2,wz+.055,.016,lintel-sill,.02);
  }
  const glazing=new T.ShaderMaterial({
    transparent:true,depthWrite:false,
    vertexShader:`varying vec2 pane;void main(){pane=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`varying vec2 pane;void main(){
      float edge=max(max(exp(-pane.y*27.),exp(-(1.-pane.y)*45.)),exp(-min(pane.x,1.-pane.x)*105.));
      float reflection=exp(-pow((pane.x+.18*pane.y-.74)*11.,2.));
      gl_FragColor=vec4(.56,.74,.81,.012+.14*edge+.026*reflection);
      #include <colorspace_fragment>
    }`,
  });
  const pane=mesh(root,new T.PlaneGeometry(span*2,lintel-sill),glazing,0,(lintel+sill)*.5,wz-.12);
  pane.renderOrder=1;
  // Vertical ribs, panel rebates and square wiring conduit give the workshop a consistent scale.
  for(let i=-5;i<=5;i++){
    const x=i*2.55;
    box(room,iron,x,-1.6,wz+.25,.046,4.75,.055);
    if(Math.abs(x)>span+.3){
      box(room,iron,x,3.24,wz+.25,.063,5.1,.08);
      box(room,brushed,x+.042,3.24,wz+.29,.012,5.1,.03);
    }
  }
  for(const y of [.16,.37]) rod(room,graphite,V(-14.2,y,wz+.46),V(14.2,y,wz+.46),.055);
  for(const side of [-1,1]){
    box(room,graphite,side*(span+7.1),lintel+.17,wz+.24,14.1,.095,.075);
    for(const x of [4.1,8.1,12.1]){
      box(room,brushed,side*x,.265,wz+.469,.08,.35,.042);
      box(room,iron,side*x,.265,wz+.48,.19,.104,.045);
    }
  }
  const floorY=-4.26;
  box(room,black,0,floorY-.10,.5,34,.20,20);
  for(const s of [-1,1]) box(room,wall,s*14.4,0,0,.5,12,17);

  // The wire grids mount beside the panoramic opening, or below its sill in tighter shots.
  const belowSill=compact || closeUp;
  const boardWidth=compact?(closeUp?2.28:2.80):(closeUp?3.46:6.15);
  const boardHeight=belowSill?(compact?1.02:1.43):2.58;
  const boardY=belowSill?sill-.25-boardHeight*.5:1.95, boardZ=wz+.31;
  const rackX=belowSill?(compact?(closeUp?3.10:4.67):5.25):span+boardWidth*.5+.48;
  const displayLights:T.RectAreaLight[]=[];
  const modelLoader=new GLTFLoader(), modelFolder='/assets/unseal/armory/';
  async function displayRifle(side:number,id:string) {
    const bay=new T.Group();
    // Welded rods stand off the real wall; the top and bottom rows carry all four mounting clips.
    const pitch=compact?.235:closeUp?.32:.40;
    const columns=Math.round((boardWidth+(compact?.30:.52))/pitch);
    const rows=Math.round((boardHeight+(belowSill?.12:.50))/pitch);
    const width=columns*pitch, height=rows*pitch, left=-width/2, bottom=-height/2;
    const radius=pitch*.055, gridZ=.18, hookZ=gridZ+radius*2;
    bay.position.set(side*rackX,boardY,wz+.46);
    bay.updateMatrix();
    for(let i=0;i<=columns;i++){
      const x=left+i*pitch;
      rod(bay,wire,V(x,bottom-radius,gridZ),V(x,-bottom+radius,gridZ),radius);
    }
    for(let j=0;j<=rows;j++){
      const y=bottom+j*pitch;
      rod(bay,wire,V(left-radius,y,hookZ),V(-left+radius,y,hookZ),radius);
    }
    const wallFace=-.242;
    for(const x of [left+pitch,-left-pitch])for(const y of [bottom,-bottom]){
      rod(bay,black,V(x,y,wallFace),V(x,y,gridZ),radius*2.20);
      box(bay,brushed,x,y,hookZ+radius,.27*pitch,.20*pitch,.060);
      rod(bay,graphite,V(x,y,hookZ+radius+.026),V(x,y,hookZ+radius+.047),radius*1.30,8);
    }
    // Each stationary mesh joins the room's shared draw batches.
    for(const part of [...bay.children]){part.applyMatrix4(bay.matrix);room.add(part);}
    const wash=new T.RectAreaLight(side<0?0xe9f3ff:0xffeacc,8.3,boardWidth*.64,.72);
    wash.position.copy(V(-boardWidth*.16,boardHeight*.65,2.25).applyMatrix4(bay.matrix));
    wash.lookAt(V(boardWidth*.06,0,.40).applyMatrix4(bay.matrix));
    displayLights.push(wash);
    const response=await fetch(modelFolder+id+'.glb',{signal:lifetime.signal});
    if(!response.ok)throw new Error('Unable to load armory display '+id);
    const gltf=await modelLoader.parseAsync(await response.arrayBuffer(),modelFolder);
    if(lifetime.signal.aborted){releaseMeshes(gltf.scene);return;}
    const rifle=new T.Group(), length=boardWidth*(side<0?.93:.98);
    rifle.name=id;
    rifle.add(gltf.scene);
    rifle.scale.setScalar(length);
    rifle.rotation.set(side<0?.31:.27,side*(compact?.24:.16),side<0?-.065:.105,'YXZ');
    rifle.position.set(0,side<0?-.015:.10,0);
    rifle.updateMatrixWorld(true);
    const bounds=new T.Box3().setFromObject(rifle,true);
    rifle.position.z=hookZ+.065-bounds.min.z;
    rifle.updateMatrixWorld(true);
    rifle.traverse(child=>{
      if(!(child instanceof T.Mesh))return;
      for(const material of Array.isArray(child.material)?child.material:[child.material]){
        if(!(material instanceof T.MeshStandardMaterial))continue;
        rifleMaterials.add(material);illuminateRifle(material);
        for(const map of [material.map,material.normalMap,material.roughnessMap,material.metalnessMap])
          if(map)map.anisotropy=8;
      }
    });
    const {texture,contacts}=projectDisplay(rifle,wallFace,width,height,length);
    // Only the projected shadow is opaque here. The actual wall and its vertical seams show through.
    const shadow=new T.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,toneMapped:false});
    mesh(bay,new T.PlaneGeometry(width,height),shadow,0,0,wallFace+.004);
    root.add(bay);
    const brackets=new T.Group();
    for(const {x,z,underside,front} of contacts){
      if(!Number.isFinite(underside))continue;
      const r=Math.max(radius*.94,length*.0065), y=underside-r, nose=front+r*1.8;
      const row=Math.min(rows,Math.max(0,Math.ceil((y-bottom+r*2)/pitch)));
      const anchorY=bottom+row*pitch;
      // The folded hanger wraps over a horizontal rod, then bends outward into a padded J hook.
      const hangerZ=hookZ+radius+r, crest=anchorY+radius+r;
      rod(brackets,brushed,V(x,anchorY-.08*pitch,hookZ-radius-r),V(x,crest,hookZ-radius-r),r);
      rod(brackets,brushed,V(x,crest,hookZ-radius-r),V(x,crest,hangerZ),r);
      rod(brackets,brushed,V(x,crest,hangerZ),V(x,y,hangerZ),r);
      rod(brackets,brushed,V(x,y,hangerZ),V(x,y,nose),r);
      rod(brackets,black,V(x,y,Math.max(hangerZ,z-.05*length)),V(x,y,nose),r);
      rod(brackets,black,V(x,y,nose),V(x,y+r*2.6,nose+r*.18),r);
    }
    batchRigidPart(brackets);
    brackets.applyMatrix4(bay.matrix);rifle.applyMatrix4(bay.matrix);
    root.add(brackets,rifle);
  }
  for(const task of [displayRifle(-1,'ak-neon-rider'),displayRifle(1,'awp-dragon-lore')]){
    void task.catch(error=>{if(!disposed)displayFailure=error;}).finally(textureReady);
  }
  // The outer bays carry the station ventilation return and its closed service hatch.
  // Dark painted louvers keep the color contrast concentrated on the two weapons.
  const serviceX=belowSill?span+2.12:rackX+boardWidth*.5+2.12, serviceY=2.04;
  box(room,iron,-serviceX,serviceY,boardZ,2.94,1.42,.14);
  box(room,graphite,-serviceX,serviceY,boardZ+.077,2.81,1.31,.04);
  box(room,black,-serviceX,serviceY,boardZ+.103,2.61,1.10,.025);
  for(let j=-3;j<=3;j++){
    const slat=box(room,panel,-serviceX,serviceY+j*.128,boardZ+.147,2.61,.082,.074);
    slat.rotation.x=-.35;
  }
  box(room,iron,serviceX,serviceY,boardZ,2.69,1.55,.12);
  box(room,panel,serviceX,serviceY,boardZ+.080,2.58,1.44,.073);
  for(const y of [serviceY-.48,serviceY+.48]){
    box(room,graphite,serviceX-1.24,y,boardZ+.14,.14,.22,.056);
    rod(room,brushed,V(serviceX-1.25,y-.084,boardZ+.173),V(serviceX-1.25,y+.084,boardZ+.173),.027);
  }
  box(room,iron,serviceX+.93,serviceY,boardZ+.139,.13,.34,.065);
  box(room,brushed,serviceX+.92,serviceY-.014,boardZ+.182,.057,.19,.037);
  // The mat and stainless surround meet on a single plane at the case's physical datum.
  const w=compact ? 3.10 : 5.35, front=2.40, rear=-2.35, thickness=.22;
  const deck=apronRing(w,front,rear,.29);
  const inlay=apronRing(w-.35,front-.33,rear+.47,.20);
  const positions:number[]=[], uvs:number[]=[], indices:number[]=[];
  for(const ring of [deck,inlay])for(const [x,z] of ring){
    positions.push(x,0,z); uvs.push(x/2.60,z/.975);
  }
  const count=deck.length;
  deck.forEach((_,i)=>{
    const j=(i+1)%count;
    indices.push(i,j,count+i,j,count+j,count+i);
  });
  const rim=new T.BufferGeometry();
  rim.setAttribute('position',new T.Float32BufferAttribute(positions,3));
  rim.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));
  rim.setIndex(indices);rim.computeVertexNormals();
  mesh(desk,rim,brushed);
  mesh(desk,surface(inlay,0,1/2.22),rubber);
  // A thin gasket seats the service mat in its tray. Set its top just below the mat datum.
  inlay.forEach(([x,z],i)=>{
    const [nx,nz]=inlay[(i+1)%inlay.length];
    const bead=rod(desk,black,V(x,-.004,z),V(nx,-.004,nz),.010,8);
    bead.name='Mat retaining bead';
  });
  deck.forEach(([x,z],i)=>{
    const [nx,nz]=deck[(i+1)%count], length=Math.hypot(nx-x,nz-z);
    const edge=box(desk,graphite,(x+nx)/2,-thickness/2,(z+nz)/2,length,thickness,.045);
    edge.rotation.y=-Math.atan2(nz-z,nx-x);
  });
  box(desk,iron,0,-.39,front-.22,2*w-.64,.38,.35);
  for(const side of [-1,1]){
    box(desk,graphite,side*(w*.46),-.40,front-.035,w*.82,.29,.040);
    box(desk,black,side*(w*.46),-.375,front-.010,Math.min(1.08,w*.25),.084,.025);
    box(desk,brushed,side*(w*.46),-.340,front+.010,Math.min(1.10,w*.25),.032,.037);
    for(const z of [rear+.18,front-.17]){
      const fastener=mesh(desk,new T.CylinderGeometry(.055,.054,.012,10),graphite,side*(w-.56),.005,z);
      fastener.rotation.y=.15;
      box(desk,black,side*(w-.56),.012,z,.054,.003,.010).rotation.y=side*.5;
    }
    for(const z of [front-.61,rear+.67])box(desk,iron,side*(w-.43),-2.20,z,.21,4.02,.28);
    box(desk,enamel,side*(w-.71),-.122,front+.024,.27,.052,.008);
  }

  // Soft sources light the case and rim without visible fixtures in the shot.
  const keyLights:T.RectAreaLight[]=[];
  for(const side of [-1,1]){
    const key=side<0, width=compact?.87:1.15, height=compact?.55:.72;
    const source=V(side*(w+(compact?1.04:2.08)),key?2.28:2.03,key?(compact?-1.32:.15):(compact?-2.32:-1.12));
    const target=V(side*.24,.44,.35);
    const light=new T.RectAreaLight(key?'#ffddb3':'#c4def2',(key?1.39:.86)*source.distanceToSquared(target),width-.138,height-.137);
    light.position.copy(source);light.lookAt(target);keyLights.push(light);
  }
  void preparePanelLighting().then(()=>{
    if(!disposed)root.add(...keyLights,...displayLights);
  },()=>{}).finally(textureReady);
  batchRigidPart(desk);
  batchRigidPart(room);
  desk.traverse(node=>{if(node instanceof T.Mesh){node.castShadow=false;node.receiveShadow=true;}});
  room.traverse(node=>{if(node instanceof T.Mesh){node.castShadow=false;node.receiveShadow=false;}});
  return {
    get ready(){return settled.then(()=>{if(displayFailure)throw displayFailure;});},
    pane,
    setArmoryEnvironment(environment:T.Texture) {
      armoryEnvironment=environment;
      rifleMaterials.forEach(illuminateRifle);
    },
    update(_time:number){ /* Work lights hold their aim as the case opens. */ },
    dispose(){
      disposed=true;lifetime.abort();settle();
      root.removeFromParent();daylight.shadow.dispose();
      releaseMeshes(root,loaded,armoryEnvironment);
    }
  };
}
