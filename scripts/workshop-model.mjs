import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { batchRigidPart } from '../src/case-geometry.ts';
import { workshopPrint } from './workshop-print.mjs';

// Dimensions refer to the actual hinge frame, in scene units. All cutouts, end caps,
// printed plates and latches are attached to the physical half that carries them.
const housings = {
  foundry: { size:[3.36,1.60,.95,.34,.12], body:'#343b39', trim:'#ca5126', metal:'#747b77',
    print:['#373a34','#e87b3c','#eadfc2'], word:'FOUNDRY', code:'FC–08', short:'HEAT TREATMENT', locks:[-.98,.98], angle:1.69 },
  relay: { size:[2.48,1.62,1.19,.32,.22], body:'#6a7447', trim:'#949d57', metal:'#5c614d',
    print:['#384435','#afc982','#e4e5bd'], word:'RELAY', code:'RX–04', short:'FIELD RECEIVER', locks:[-.66,.66], angle:1.79 },
  pelagic: { size:[3.04,1.83,.97,.34,.26], body:'#21636b', trim:'#80c2bd', metal:'#938365',
    print:['#20575f','#81c6bf','#e1dbc0'], word:'PELAGIC', code:'DS–12', short:'SUBSEA RECOVERY', locks:[-1.04,.98], angle:1.64 },
  aperture: { size:[2.51,1.79,.85,.49,.36], body:'#383640', trim:'#9c84bb', metal:'#656371',
    print:['#302d3e','#b292db','#e1d8df'], word:'APERTURE', code:'AP–14', short:'OPTICAL EQUIPMENT', locks:[0], angle:1.88 },
  'salt-flat': { size:[3.06,1.86,.42,.18,.09], body:'#a79972', trim:'#c4a66e', metal:'#84745b',
    print:['#c7b48d','#8e7956','#443e32'], word:'SALT FLAT', code:'SV–06', short:'LAND SURVEY', locks:[-.79,.79], angle:1.70 },
  'signal-flag': { size:[2.86,2.03,.51,.19,.13], body:'#a9483b', trim:'#e0c9a2', metal:'#686863',
    print:['#ab4d40','#e5ad69','#efe7cf'], word:'SEMAPHORE', code:'SF–21', short:'MARITIME SIGNALS', locks:[-.86,.86], angle:1.78 },
  'polar-night': { size:[2.65,1.81,1.29,.35,.30], body:'#34475c', trim:'#a5b8c5', metal:'#7a8b9b',
    print:['#26394e','#7298bc','#e5ece7'], word:'POLAR NIGHT', code:'PN–78', short:'ARCTIC FIELD UNIT', locks:[-.75,.75], angle:1.61 },
  blackbird: { size:[3.44,1.56,.73,.28,.075], body:'#2c3034', trim:'#9b9e9e', metal:'#a1a4a1',
    print:['#262a2c','#a9ada8','#ecebe2'], word:'BLACKBIRD', code:'BB–03', short:'FLIGHT EQUIPMENT', locks:[-1.17,1.17], angle:1.77 },
};

const halfPi = Math.PI / 2;
function outline(w,d,cut) {
  const x=w/2,z=d/2;
  return [[-x+cut,-z],[x-cut,-z],[x,-z+cut],[x,z-cut],[x-cut,z],[-x+cut,z],[-x,z-cut],[-x,-z+cut]].map(([a,b])=>new T.Vector2(a,b));
}

export async function buildWorkshopModel(id) {
  const style=housings[id], [w,d,seam,cap,cut]=style.size;
  const flat = seam < .60, compact = w < 2.75;
  const body=new T.Group(), hinge=new T.Group(), lid=new T.Group(), root=new T.Group();
  body.name='Base'; hinge.name='Hinge'; lid.name='Cover';root.name='Case';
  root.add(body,hinge); hinge.add(lid);
  const hingeZ=-d/2-.052;
  hinge.position.set(0,seam,hingeZ); lid.position.z=-hingeZ;
  function material(name,color,roughness,metalness) {
    const m=new T.MeshStandardMaterial({color,roughness,metalness});m.name=name;return m;
  }
  const paint=material('Powder coat',style.body,.48,.35), trim=material('Enamel hardware',style.trim,.44,.42);
  const metal=material('Brushed metal',style.metal,.35,.72), bright=material('Steel', '#b2aca1',.31,.78);
  const black=material('Moulded rubber','#22272a',.76,.03), foam=material('Die cut foam','#383c3e',.91,.03);
  const interior=material('Felt','#424747',.95,.02), enamel=material('Painted interior',style.body,.61,.18);
  const pebble=document.createElement('canvas');pebble.width=pebble.height=128;
  const grain=pebble.getContext('2d'),pixels=grain.createImageData(128,128);
  for(let n=0;n<pixels.data.length;n+=4) {
    const x=(n/4)%128,y=Math.floor(n/512);
    const hash=Math.sin(x*17.31+y*81.77)*13758.231;
    const v=197+Math.round((hash-Math.floor(hash))*53);
    pixels.data.set([v,v,v,255],n);
  }
  grain.putImageData(pixels,0,0);
  const texture=new T.CanvasTexture(pebble);texture.colorSpace=T.SRGBColorSpace;
  texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.repeat.set(1.5,1.5);
  paint.map=texture;trim.map=texture;foam.map=texture;
  function mesh(parent,geometry,mat,x=0,y=0,z=0) {
    const m=new T.Mesh(geometry,mat); m.position.set(x,y,z);parent.add(m);return m;
  }
  function box(parent,mat,x,y,z,wide,high,deep,r=.018) {
    return mesh(parent,new RoundedBoxGeometry(wide,high,deep,1,Math.min(r,wide*.45,high*.45,deep*.45)),mat,x,y,z);
  }
  function cylinder(parent,mat,x,y,z,radius,length,axis='z',segments=16) {
    const m=mesh(parent,new T.CylinderGeometry(radius,radius,length,segments),mat,x,y,z);
    if(axis==='z')m.rotation.x=halfPi;else if(axis==='x')m.rotation.z=halfPi;return m;
  }
  function plate(parent,mat,width,depth,y,height,inset=0,corner=cut) {
    const shape=new T.Shape(outline(width,depth,corner));
    if(inset)shape.holes.push(new T.Path(outline(width-2*inset,depth-2*inset,Math.max(.015,corner-inset*.6))));
    const bev=Math.min(.015,height*.22);
    const g=new T.ExtrudeGeometry(shape,{depth:height-2*bev,bevelEnabled:true,bevelSize:bev,bevelThickness:bev,bevelSegments:1,curveSegments:1});
    g.rotateX(-halfPi);return mesh(parent,g,mat,0,y+bev,0);
  }
  function print(front,width,height,x,y,z) {
    const tex=new T.CanvasTexture(workshopPrint(id,style,front));tex.colorSpace=T.SRGBColorSpace;tex.anisotropy=8;
    tex.userData.mimeType='image/webp';
    const m=material(front?'Faceplate lettering':'Printed top panel','#f5f4ef',.55,.16); m.map=tex;
    const panel=mesh(front?body:lid,new T.PlaneGeometry(width,height),m,x,y,z);
    if(!front)panel.rotation.x=-halfPi;
  }
  // Body, dust seal, lower tray, folded lip and the second open shell.
  plate(body,black,w-.04,d-.04,.02,.08);
  plate(body,paint,w,d,.10,seam-.14,.092);
  plate(body,metal,w+.018,d+.018,seam-.092,.058,.092);
  plate(body,black,w+.02,d+.02,seam-.030,.039,.082);
  plate(body,interior,w-.21,d-.21,.107,.070);
  plate(body,foam,w-.22,d-.22,.18,flat?.06:.20,.12);
  const innerD=d-.53;
  for(const sign of [-1,1]) box(body,foam,sign*w*.23,flat?.185:.28,-.012,.084,flat?.073:.14,innerD,.022);
  plate(lid,black,w-.01,d-.01,.009,.034,.076);
  plate(lid,paint,w,d,.043,cap-.07,.085);
  plate(lid,paint,w-.02,d-.02,cap-.035,.045);
  plate(lid,enamel,w-.19,d-.19,.063,.028);
  for(let n=0;n<(flat?4:8);n++) {
    const count=flat?4:8;
    box(lid,flat?enamel:foam,(n-(count-1)/2)*(w-.38)/count,.045,0,(w-.49)/count-.027,.052,d-.31,.022);
  }
  // Bolted metal nameplates and textured top lid. The chamfered margin stays solid.
  const faceWidth=w-2*cut-.26, faceHeight=seam*(flat?.46:.53),faceY=seam*.50;
  box(body,metal,0,faceY,d/2+.010,faceWidth+.046,faceHeight+.039,.032);
  print(true,faceWidth,faceHeight,0,faceY,d/2+.029);
  const printedW=w-2*cut-.18, printedD=d-.33;
  box(lid,metal,0,cap+.020,0,printedW+.052,.038,printedD+.052,.025);
  print(false,printedW,printedD,0,cap+.041,0);
  for(const sign of [-1,1]) {
    for(const end of [-1,1]) {
      cylinder(lid,bright,sign*(printedW/2-.026),cap+.05,end*(printedD/2-.024),flat?.018:.022,.014,'y',8);
      box(body,black,sign*(w/2-cut*.65),.038,end*(d/2-cut*.59),.24,.075,.22,.022);
    }
    // Interleaved knuckles share an axle outside the rear wall.
    const hingeX=sign*w*.285;
    for(const end of [-1,1]){
      box(body,metal,hingeX+end*.145,seam-.080,-d/2-.023,.087,.14,.062,.010);
      cylinder(body,black,hingeX+end*.145,seam,hingeZ,.054,.087,'x');
    }
    box(lid,metal,hingeX,.082,-d/2-.023,.18,.11,.062,.010);
    cylinder(lid,bright,hingeX,0,hingeZ,.054,.18,'x');
  }
  // Corner protection follows the cut, with separate feet and plates for each half.
  for(const sx of [-1,1])for(const sz of [-1,1]) {
    const edge=Math.max(.085,cut*.61);
    const midX=sx*(w/2-edge), midZ=sz*(d/2-edge);
    const corner=box(body,flat?metal:trim,midX,flat?.17:seam*.45,midZ,Math.max(.17,cut*1.36),flat?.15:seam*.65,.13,.018);
    corner.rotation.y=sx*sz*.78;
    const top=box(lid,flat?trim:metal,midX,cap*.55,midZ,Math.max(.18,cut*1.42),cap*.84,.14,.023);
    top.rotation.y=sx*sz*.78;
  }
  // The energy, optical, aviation and hydrographic cases have distinct fittings.
  if(id==='foundry'||id==='relay'||id==='blackbird') {
    for(const sx of [-1,1]) {
      const high=seam*(id==='blackbird'?.76:.61);
      const n=id==='relay'?7:id==='foundry'?4:2;
      for(let i=0;i<n;i++) box(body,id==='foundry'?trim:id==='relay'?paint:metal,sx*(w/2+.017),seam*.49,
        (i-(n-1)/2)*(d-2*cut-.20)/n,.059,high,id==='blackbird'?.12:.072,.021);
      for(const y of [.16,seam-.13]) for(let i=0;i<(id==='blackbird'?7:3);i++){
        const count=id==='blackbird'?7:3;const z=(i-(count-1)/2)*(d-2*cut-.09)/count;
        cylinder(body,metal,sx*(w/2+.024),y,z,.022,.025,'x',8);
      }
    }
  }
  if(!flat) {
    // Stamped cap plates and split reinforcements bridge the corner visually.
    const rail= id==='foundry' ? trim : metal, sideX=w/2-cut-.037;
    for(const sx of [-1,1]) {
      box(lid,rail,sx*sideX,cap*.57,d/2+.015,.113,cap*.75,.074,.022);
      box(body,rail,sx*sideX,seam*.50,d/2+.033,.116,seam*.65,.078,.025);
      for(const y of [seam*.24,seam*.74]) {
        cylinder(body,black,sx*sideX,y,d/2+.080,.027,.014,'z',12);
        const slot=box(body,bright,sx*sideX,y,d/2+.090,.032,.006,.008,.002);slot.rotation.z=.47;
      }
      box(lid,black,sx*w*.37,cap*.61,d/2+.015,w*.14,.025,.039,.005);
      box(lid,black,sx*w*.37,cap*.41,d/2+.015,w*.14,.021,.039,.005);
    }
  }
  if(id==='foundry') {
    for(const sx of [-1,1]) {
      box(lid,trim,sx*(w/2-.163),cap+.030,0,.14,.068,d-.18,.025);
      box(lid,black,sx*(w/2-.163),cap+.066,0,.062,.014,d-.39,.006);
      for(const y of [seam*.24,seam*.71]) box(body,black,sx*(w/2+.038),y,0,.061,.057,d-.29,.018);
      for(const sz of [-1,1]) {
        const x=sx*(w/2-.17),z=sz*(d/2-.087);
        box(body,trim,x,.157,z,.32,.18,.18,.031);
        cylinder(lid,bright,x,cap+.057,z,.025,.030,'y',8);
      }
    }
    box(lid,black,0,cap*.53,d/2+.030,.59,.097,.040,.013);
    box(lid,trim,-.05,cap*.53,d/2+.055,.30,.024,.016,.006);
  }
  if(id==='blackbird') {
    for(const y of [.13,seam-.14]) {
      box(body,metal,0,y,d/2+.022,w-.22,.078,.061,.012);
      for(let i=0;i<12;i++)cylinder(body,bright,(i-5.5)*(w-.4)/12,y,d/2+.056,.016,.012,'z',8);
    }
  }
  if(id==='pelagic'||id==='aperture') {
    const radius=id==='pelagic'?.26:.22;
    for(const sx of [-1,1]) {
      const x=sx*(w/2+.026), y=seam*.52;
      cylinder(body,black,x,y,0,radius+.034,.084,'x',40);
      cylinder(body,metal,x+sx*.048,y,0,radius,.066,'x',40);
      cylinder(body,black,x+sx*.09,y,0,radius*.74,.041,'x',40);
      cylinder(body,trim,x+sx*.115,y,0,radius*.47,.022,'x',32);
      for(let i=0;i<8;i++) {
        const a=i*Math.PI/4;
        cylinder(body,bright,x+sx*.091,y+.85*radius*Math.sin(a),.85*radius*Math.cos(a),.018,.026,'x',8);
      }
    }
  }
  if(id==='relay') {
    for(const sx of [-1,1]) {
      for(let i=0;i<3;i++)cylinder(lid,i%2?black:metal,sx*(w/2-.082),cap+.055,(i-1)*.25,.073,.29,'z');
    }
  }
  if(id==='polar-night'||id==='salt-flat') {
    for(const sx of [-1,1]){
      const strap=id==='salt-flat'?metal:trim, x=sx*(w/2-cut-.025);
      box(lid,strap,x,cap+.052,0,flat?.067:.12,.040,d-.12,.010);
      box(lid,strap,x,cap*.57,d/2+.014,flat?.067:.12,cap*.84,.042,.009);
      box(body,strap,x,seam*.48,d/2+.024,flat?.067:.12,seam*.80,.047,.012);
    }
  }
  if(id==='signal-flag') {
    for(const side of [-1,1]) {
      box(body,trim,side*(w/2+.018),seam*.52,0,.048,.12,d-.21);
      for(const z of [-.59,.59]) cylinder(body,bright,side*(w/2+.049),seam*.52,z,.036,.021,'x');
    }
  }
  // Carry handles pivot independently; in the closed pose the lid face stays legible.
  const handle=new T.Group();handle.name='Handle';lid.add(handle);
  const hw=flat?.53:compact?.44:.53;
  handle.position.set(0,cap+.071,-d*.39);
  for(const sx of [-1,1]){
    box(lid,metal,sx*hw,cap+.034,-d*.39,.13,.11,.20,.025);
    cylinder(handle,bright,sx*hw,0,0,.049,.126,'x');
    box(handle,flat?metal:black,sx*hw,.105,0,.085,.26,.10,.033);
  }
  box(handle,flat?metal:black,0,.223,0,2*hw+.07,.094,.123,.038);
  if(!flat) for(let n=-3;n<=3;n++) box(handle,black,n*.078,.226,0,.028,.100,.127,.015);

  const latches=[];
  style.locks.forEach((x,index)=>{
    const lever=new T.Group(),wire=new T.Group();
    lever.name='Latch'+index; wire.name='Bail'+index;
    const z=d/2+.073, s=flat?.70:1;
    lever.position.set(x,seam-.142*s,z);wire.position.set(x,seam-.11*s,z-.022);
    body.add(lever,wire);
    box(body,black,x,seam-.199*s,d/2+.018,.27*s,.31*s,.038,.011);
    // The crossbar rests on the open shelf of the keeper and swings out above it.
    box(lid,metal,x,.052*s,d/2+.010,.184*s,.10*s,.027,.008);
    box(lid,metal,x,.011*s,d/2+.034,.128*s,.026*s,.056,.006);
    cylinder(lever,bright,0,0,0,.037*s,.212*s,'x');
    box(lever,metal,0,-.072*s,.008,.159*s,.19*s,.068,.019);
    box(lever,id==='foundry'||id==='pelagic'?trim:black,0,-.122*s,.047,.13*s,.055*s,.021,.006);
    for(const sx of [-1,1])box(wire,bright,sx*.12*s,.072*s,0,.020*s,.174*s,.026,.007);
    cylinder(wire,bright,0,.151*s,0,.012*s,.252*s,'x');
    latches.push([lever,wire]);
  });
  for (const part of [body,lid,handle,...latches.flat()]) batchRigidPart(part);
  const frames=Array.from({length:91},(_,i)=>i/90);
  const ease=(p,a,b)=>T.MathUtils.smootherstep(p,a,b);
  const hingeStart=flat?.27:compact?.37:.33, hingeEnd=flat?.85:.91;
  function track(node,axis,curve) {
    const values=frames.flatMap(p=>new T.Quaternion().setFromAxisAngle(axis,curve(p)).toArray());
    return new T.QuaternionKeyframeTrack(node.name+'.quaternion',frames,values);
  }
  const X=new T.Vector3(1,0,0);
  const tracks=[track(hinge,X,p=>-style.angle*ease(p,hingeStart,hingeEnd)-.032*(ease(p,.76,.89)-ease(p,.89,1))),
    track(handle,X,p=>-.45-(flat?1.08:.94)*ease(p,.07,.43))];
  for(const [i,[lever,wire]] of latches.entries()) {
    const lag=.061*i;
    tracks.push(track(lever,X,p=>-1.38*ease(p,.065+lag,.235+lag)),track(wire,X,p=>1.22*ease(p,.139+lag,.299+lag)));
  }
  const clip=new T.AnimationClip('open',1,tracks);
  const exporter=new GLTFExporter();
  const glb=await exporter.parseAsync(root,{binary:true,animations:[clip],onlyVisible:true});
  const bytes=new Uint8Array(glb);
  let binary='';
  for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
  root.traverse(child=>{if(child.isMesh){child.geometry.dispose();child.material.map?.dispose();child.material.dispose();}});
  return btoa(binary);
}

