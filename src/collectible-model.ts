import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { Case } from './types';

const smooth = T.MathUtils.smoothstep;
const directory = '/assets/unseal/collectibles/';
type PropMesh = T.Mesh<T.BufferGeometry, T.Material>;

function mount(parent: T.Object3D, geometry: T.BufferGeometry, material: T.Material, x = 0, y = 0, z = 0) {
  const mesh = new T.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

function ring(group: T.Object3D, radius: number, thickness: number, y: number, material: T.Material) {
  const hoop = mount(group, new T.TorusGeometry(radius, thickness, 9, 96), material, 0, y);
  hoop.rotation.x = Math.PI / 2;
  return hoop;
}

function texture(loader: T.TextureLoader, path: string) {
  const map = loader.load(path);
  map.colorSpace = T.SRGBColorSpace;
  map.anisotropy = 4;
  return map;
}

function dispose(root: T.Object3D) {
  const geos = new Set<T.BufferGeometry>(), mats = new Set<T.Material>(), maps = new Set<T.Texture>();
  root.traverse(node => {
    if (!(node instanceof T.Mesh)) return;
    geos.add(node.geometry);
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) mats.add(material);
  });
  for (const material of mats) {
    for (const field of Object.values(material)) if (field instanceof T.Texture) maps.add(field);
    material.dispose();
  }
  maps.forEach(map => map.dispose());
  geos.forEach(geo => geo.dispose());
}

const capsuleFinishes: Record<string, { body: string; sticker?: number }> = {
  'capsule-chicken': { body: '#a52419', sticker: 3970 },
  'capsule-espionage': { body: '#ae541f', sticker: 6594 },
  'capsule-skill-groups': { body: '#13335c', sticker: 3456 },
  'capsule-boardroom': { body: '#30336d', sticker: 5259 },
  'capsule-poorly-drawn': { body: '#dc772b' },
  'capsule-cs20': { body: '#b98719' },
};

function roundedLabel(w: number, h: number, r: number) {
  const shape = new T.Shape();
  const x = -w / 2, y = -h / 2;
  shape.moveTo(x + r, y);
  shape.lineTo(x + w - r, y); shape.quadraticCurveTo(x + w, y, x + w, y + r);
  shape.lineTo(x + w, y + h - r); shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  shape.lineTo(x + r, y + h); shape.quadraticCurveTo(x, y + h, x, y + h - r);
  shape.lineTo(x, y + r); shape.quadraticCurveTo(x, y, x + r, y);
  const geo = new T.ShapeGeometry(shape, 8);
  const pos = geo.getAttribute('position'), uv = geo.getAttribute('uv');
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / w + .5, pos.getY(i) / h + .5);
  return geo;
}

export function createCapsule(item: Case, manager: T.LoadingManager) {
  const root = new T.Group(), cup = new T.Group(), cap = new T.Group(), insert = new T.Group();
  root.add(cup, cap, insert);
  cap.rotation.order = 'ZXY';
  const loader = new T.TextureLoader(manager);
  const finish = capsuleFinishes[item.id] ?? { body: item.color };
  const cartoon = item.id === 'capsule-poorly-drawn';
  const enamel = new T.MeshStandardMaterial({ color: new T.Color(finish.body).multiplyScalar(.78), roughness: cartoon ? .89 : .32, metalness: cartoon ? 0 : .46, side: T.DoubleSide });
  const inner = new T.MeshStandardMaterial({ color: new T.Color(finish.body).multiplyScalar(.42), roughness: .56, metalness: .2 });
  const gasket = new T.MeshStandardMaterial({ color: cartoon ? '#282724' : '#433931', roughness: .73 });
  const poly = new T.MeshPhysicalMaterial({ color: cartoon ? '#388b83' : '#b2cfcd', roughness: cartoon ? .48 : .10, metalness: .28,
    clearcoat: 1, clearcoatRoughness: .10, transparent: true, opacity: cartoon ? .37 : .12, depthWrite: false, envMapIntensity: 1.0 });
  const rim = new T.MeshStandardMaterial({ color: cartoon ? '#292927' : '#c4d1c9', transparent: !cartoon, opacity: cartoon ? 1 : .55,
    roughness: .2, metalness: .27 });
  // Grazing reflections describe the clear shell even against dark maps.
  poly.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
      float edgeReflection = pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 2.8);
      diffuseColor.a = min(0.86, diffuseColor.a + 0.45 * edgeReflection);
      outgoingLight += vec3(0.32, 0.36, 0.39) * edgeReflection;
      #include <opaque_fragment>`);
  };
  // A hollow injection-moulded cup with its own inner wall, neck and thread under the dome.
  const profile = [[.001,.06],[.51,.06],[.64,.10],[.80,.28],[.88,.51],[.9,.62],[.9,.77],[.86,.79],
    [.856,.88],[.81,.88],[.81,.75],[.80,.55],[.72,.32],[.52,.16],[.001,.16]];
  mount(cup, new T.LatheGeometry(profile.map(([r, y]) => new T.Vector2(r, y)), 96), enamel);
  ring(cup,.86,.013,.785,gasket);
  ring(cup,.535,.018,.075,inner);
  const thread: T.Vector3[] = [];
  for (let i = 0; i <= 180; i++) {
    const t = i / 180, angle = t * Math.PI * 3.8;
    thread.push(new T.Vector3(Math.sin(angle) * .857, .807 + t * .062, Math.cos(angle) * .857));
  }
  mount(cup, new T.TubeGeometry(new T.CatmullRomCurve3(thread), 180, .011, 6, false), enamel);
  const dome = mount(cap, new T.SphereGeometry(.895, 72, 32, 0, 2*Math.PI, 0, Math.PI / 2), poly);
  dome.scale.y = .94;
  dome.renderOrder = 2;
  ring(cap,.901,cartoon ? .027 : .018,.002,rim);
  ring(cap,.893,.011,.038,rim);
  // Narrow reflected strips stay attached to the clear polycarbonate as it twists.
  const reflection = new T.MeshBasicMaterial({ color: '#ebf5ef', transparent: true, opacity: cartoon ? .15 : .42, depthWrite: false });
  for (const [yaw, width, from, length] of [[.80,.14,.64,.43],[.985,.032,.64,.43],[2.48,.035,.30,.70]]) {
    const glint = mount(cap, new T.SphereGeometry(.897, 12, 18, yaw, width, from, length), reflection);
    glint.scale.y = .94; glint.renderOrder = 3;
  }
  if (cartoon) {
    ring(cup,.898,.021,.62,gasket);
    const slot = mount(cup,new RoundedBoxGeometry(.32,.27,.035,3,.085),gasket,.03,.48,.871);
    slot.rotation.x=-.22;
    mount(cup,new T.CircleGeometry(.051,20),inner,.026,.505,.907);
  } else {
    const mark = texture(loader, finish.sticker ? '/assets/collectibles/sticker-' + finish.sticker + '.webp' : directory + 'cs20-mark.webp');
    const label = new T.MeshStandardMaterial({ map: mark, transparent: true, alphaTest: .08, roughness: .52, metalness: .12, side: T.DoubleSide });
    const w = finish.sticker ? 1.05 : .59, h = finish.sticker ? .72 : .63;
    const placard = new T.PlaneGeometry(w, h, 24, 12);
    const positions = placard.getAttribute('position');
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i), y = positions.getY(i);
      const height = .43 + y;
      const edge = profile.slice(2,8).findIndex(([,level])=>level >= height);
      const end = edge < 0 ? 6 : Math.max(2,edge+2);
      const [r0,y0]=profile[end-1], [r1,y1]=profile[end];
      const radius = T.MathUtils.lerp(r0,r1,T.MathUtils.clamp((height-y0)/(y1-y0),0,1))+.016;
      positions.setXYZ(i, Math.sin(x/radius)*radius, y, Math.cos(x/radius)*radius);
    }
    placard.computeVertexNormals();
    mount(cup, placard, label, 0, .43);
  }
  // Shallow thumb grips on the collar make its counter-rotation visible through the clear shell.
  const gripMaterial = new T.MeshPhysicalMaterial({ color: '#cedbd5', transparent: true, opacity: .34,
    clearcoat: .85, metalness: .12, roughness: .19, depthWrite: false });
  for (let i = 0; i < 32; i++) {
    const a = Math.PI * 2 * i / 32;
    const lug = mount(cap, new T.BoxGeometry(.027,.042,.014), gripMaterial, Math.sin(a)*.890, .048, Math.cos(a)*.890);
    lug.rotation.y = a;
  }

  const paper = new T.PlaneGeometry(1, 1, 28, 22);
  const originalUv = paper.getAttribute('uv');
  const vertices = paper.getAttribute('position');
  const printed = new T.MeshStandardMaterial({ map: texture(loader, directory + (cartoon ? 'doodle-sheet-print.webp' : 'sheet-print.webp')),
    color: '#f3f3ec', roughness: .79, metalness: .02 });
  const leaf = mount(insert, paper, printed);
  const reverse = mount(insert, paper, new T.MeshStandardMaterial({
    color: cartoon ? '#c2d4c7' : '#d4dbd9', roughness: .88, side: T.BackSide,
  }));
  leaf.frustumCulled = reverse.frustumCulled = false;
  const capsuleHeightScale = 1.17;
  const roundedEdge = (axis: number) => {
    const excess = Math.max(0, Math.abs(axis) - .42);
    return .42 + Math.sqrt(Math.max(0, .08 ** 2 - excess ** 2));
  };
  function update(p: number) {
    const load = smooth(p,0,.13), screw = smooth(p,.105,.34), unseat = smooth(p,.32,.46);
    const travel = smooth(p,.435,.69), roll = smooth(p,.66,.975);
    const tip = smooth(travel,.43,1);
    const hit = Math.sin(roll * Math.PI * 2.1) * (1-roll);
    // The cup winds against the collar, recoils at thread release, then settles onto its foot.
    const recoil = Math.sin(travel * Math.PI) * (1-travel);
    cup.rotation.set(.085*recoil, -.15*load-.55*screw+.18*travel, .18*recoil-.085*roll);
    cup.position.set(-.60*travel-.09*roll,.07*roll+.095*recoil,-.015*roll);
    // Lift the rim vertically past the rolled paper before tipping it away from the cup.
    cap.rotation.set(-.08*tip+.06*hit, -.18*load+3.5*screw+.44*travel, -1.05*tip+.96*roll);
    const rimDrop = .91 * Math.hypot(Math.sin(cap.rotation.x), Math.cos(cap.rotation.x)*Math.sin(cap.rotation.z));
    cap.position.set(1.32*travel+.04*roll,
      T.MathUtils.lerp(.82+.084*screw+.62*unseat+.12*Math.sin(Math.PI*travel), .05+rimDrop, roll)+.12*Math.max(0,hit),
      -.37*travel-.11*roll);

    // The rolled sheet follows the cup until it lifts free. It opens towards the camera
    // and settles above the rim, with the illustration on the same vertices throughout.
    const draw = smooth(p,.54,.83), present = smooth(p,.70,.95);
    const unroll = smooth(p,.57,.89), spring = Math.sin(Math.PI*present)*(1-present);
    insert.position.set(T.MathUtils.lerp(cup.position.x-.045,-.02,present),
      .85+.99*draw+.15*present,.04*draw+.13*present);
    insert.rotation.set(-.17-.12*Math.sin(Math.PI*draw)-.06*present,
      -.29-.16*Math.sin(Math.PI*draw)+.22*present,-.15+.10*unseat+.095*Math.sin(Math.PI*draw)+.025*present);
    const bend = 4.1*(1-unroll) - .32*spring;
    for (let i=0;i<vertices.count;i++) {
      const u=originalUv.getX(i)-.5, v=originalUv.getY(i)-.5;
      const x=u*2*roundedEdge(v), angle=x*bend;
      const curveX = bend === 0 ? x : Math.sin(angle)/bend;
      const curveZ = bend === 0 ? 0 : 2*Math.sin(angle/2)**2/bend;
      // The moulded shell is tall; keep the printed stock physically square when flat.
      vertices.setXYZ(i,1.06*curveX,1.06*v/capsuleHeightScale,1.06*curveZ+.015*Math.sin(v*5+u*4)*Math.sin(Math.PI*draw));
    }
    vertices.needsUpdate = true;
    paper.computeVertexNormals();
  }
  root.scale.y=capsuleHeightScale;
  update(0);
  return { root, update, dispose: () => dispose(root) };
}

function seriesCard(series: number, ink: string) {
  const canvas = document.createElement('canvas');
  canvas.width=800; canvas.height=1024;
  const ctx=canvas.getContext('2d')!;
  ctx.scale(2,2);
  ctx.fillStyle='#23282a'; ctx.fillRect(0,0,400,512);
  // Offset-print hatching and registration circles around the pin mounting point.
  ctx.save(); ctx.beginPath(); ctx.rect(14,14,372,484); ctx.clip();
  ctx.strokeStyle='#35393a'; ctx.lineWidth=1.15;
  for(let k=-520;k<500;k+=10) {
    ctx.beginPath(); ctx.moveTo(k,350); ctx.lineTo(k+410,-60); ctx.stroke();
  }
  ctx.restore();
  ctx.strokeStyle='#77766d'; ctx.lineWidth=2; ctx.strokeRect(15,15,370,482);
  ctx.fillStyle='#e3e1d5'; ctx.font='bold 27px Arial'; ctx.fillText('COUNTER-STRIKE',34,62);
  ctx.font='16px Arial'; ctx.fillText('COLLECTIBLE PINS',35,90);
  ctx.strokeStyle=ink; ctx.beginPath(); ctx.moveTo(34,109); ctx.lineTo(366,109); ctx.stroke();
  ctx.strokeStyle='#737670'; ctx.setLineDash([3,7]);
  ctx.beginPath(); ctx.arc(200,254,73,0,Math.PI*2); ctx.stroke();
  ctx.setLineDash([]); ctx.lineWidth=1;
  ctx.strokeStyle='#464d4b';ctx.beginPath();ctx.arc(200,254,85,0,Math.PI*2);ctx.stroke();
  ctx.fillStyle=ink;ctx.font='bold 48px Arial';ctx.fillText('SERIES '+String(series).padStart(2,'0'),33,455);
  ctx.fillStyle='#7d817a';ctx.fillRect(35,470,94,4);
  const map=new T.CanvasTexture(canvas);map.colorSpace=T.SRGBColorSpace;map.anisotropy=4;
  return map;
}

function pinClasp(holder: T.Group) {
  // Butterfly clutch seen from behind. The emblem on the far side stays concealed.
  const brass = new T.MeshStandardMaterial({color:'#907541', metalness:.78, roughness:.40});
  const foldedBrass = new T.MeshStandardMaterial({color:'#e6c97e', metalness:.78, roughness:.23, side:T.DoubleSide});
  const base = mount(holder, new T.CylinderGeometry(.153,.176,.036,52),brass,0,.015,.058);
  base.rotation.x=Math.PI/2;
  mount(holder,new T.TorusGeometry(.151,.012,9,48),foldedBrass,0,.015,.082);
  for (const sign of [-1,1]) {
    const wing=new T.Shape();
    wing.moveTo(sign*.009,-.033);
    wing.quadraticCurveTo(sign*.024,-.088,sign*.077,-.095);
    wing.quadraticCurveTo(sign*.147,-.065,sign*.111,.044);
    wing.quadraticCurveTo(sign*.065,.107,sign*.022,.064);
    wing.closePath();
    const wingGeo=new T.ExtrudeGeometry(wing,{depth:.018,bevelEnabled:true,bevelSize:.008,bevelThickness:.006,bevelSegments:2,curveSegments:8});
    const blade=mount(holder,wingGeo,foldedBrass,.015*sign,.012,.091);
    blade.rotation.y=sign*-.61;
  }
  mount(holder,new T.SphereGeometry(.030,16,10),brass,0,.015,.095);
}

export function createPinPack(item: Case, manager: T.LoadingManager) {
  const root = new T.Group(), pouch = new T.Group(), ribbon = new T.Group(), card = new T.Group();
  root.add(pouch,ribbon,card);
  const series=Number(item.id.slice(-1));
  const colours = series===1 ? ['#242d3f','#beaa77'] : series===2 ? ['#9c9d96','#bbc6c3'] : ['#a6791e','#d7b367'];
  const print = texture(new T.TextureLoader(manager), directory + item.id + '-print.webp');
  const front = new T.MeshStandardMaterial({ map: print, color:'#cfc9be', metalness:.31, roughness:.43 });
  const reverse = new T.MeshStandardMaterial({ color:colours[0], metalness:.43, roughness:.39 });
  const lining = new T.MeshStandardMaterial({color:'#aaa899',metalness:.63,roughness:.38,side:T.BackSide});
  const stock = new T.MeshStandardMaterial({ color:'#323330', roughness:.82 });
  mount(card,new RoundedBoxGeometry(1.21,1.54,.051,4,.078),stock);
  const printedCard = new T.MeshStandardMaterial({map:seriesCard(series,colours[1]), roughness:.76});
  mount(card,roundedLabel(1.204,1.535,.069),printedCard,0,0,.027);
  pinClasp(card);
  const panels: { mesh: PropMesh; side: number; strip: boolean; rows: number }[] = [];
  const cols=48;
  for (const side of [1,-1]) for (const strip of [false,true]) {
    const rows=strip?8:30;
    const geo = new T.PlaneGeometry(1,1,cols,rows);
    if (side===-1) {
      const index=geo.index!;
      for (let k=0;k<index.count;k+=3) {
        const second=index.getX(k+1);
        index.setX(k+1,index.getX(k+2));index.setX(k+2,second);
      }
    }
    (geo.getAttribute('position') as T.BufferAttribute).setUsage(T.DynamicDrawUsage);
    const group=strip?ribbon:pouch;
    const mesh=mount(group,geo,side===1 ? front : reverse);
    mesh.frustumCulled=false;
    const inside=mount(group,geo,lining);
    inside.frustumCulled=false;
    panels.push({mesh,side,strip,rows});
    const uv=geo.getAttribute('uv');
    for(let j=0;j<=rows;j++) for(let i=0;i<=cols;i++) {
      const u=i/cols, v=1-j/rows;
      // The same notched contour runs along the top edge of the pouch and the crimped band.
      const notch=.827+.054*u+.006*Math.sin(i*3.7)+.0035*Math.sin(i*1.45);
      uv.setXY(j*(cols+1)+i, side===1?u:1-u, strip?notch+(1-notch)*v:notch*v);
    }
  }
  const seated = new T.Vector3(), presentation = new T.Vector3(), openRotation = new T.Quaternion(), angles = new T.Euler();
  function update(p: number) {
    const grip=smooth(p,.025,.17), rip=smooth(p,.16,.42);
    const mouth=smooth(p,.32,.61), pull=smooth(p,.56,.76), fall=smooth(p,.74,.93);
    // The tear ends at the right-hand corner. Carry the band past that corner
    // before lifting the card, then let it land on the same side of the pouch.
    const liftStrip=smooth(p,.42,.475), clearCorner=smooth(p,.445,.555), toss=smooth(p,.47,.90);
    const arc=Math.sin(Math.PI*toss);
    const settle=smooth(p,.74,.98), ringDown=Math.sin(settle*Math.PI*2)*(1-settle);
    const squeeze=grip*(1-mouth), shiver=Math.sin(Math.PI*rip*7)*Math.sin(Math.PI*rip);
    // The fingers tension the seam, then the empty sleeve buckles and drops back onto the mat.
    pouch.rotation.set(-.08+.075*squeeze-1.10*fall+.059*ringDown,.095+.18*squeeze-.21*fall,
      -.115+.16*grip-.10*rip+.028*shiver+.15*fall);
    pouch.position.set(-.07*squeeze-.57*fall,.05-.005*grip+.08*Math.sin(Math.PI*pull)+.095*fall,-.11*fall);
    ribbon.rotation.set(pouch.rotation.x*(1-fall),pouch.rotation.y*(1-fall),pouch.rotation.z*(1-fall));
    ribbon.position.copy(pouch.position).multiplyScalar(1-fall);
    pouch.updateMatrix();
    // Follow the sleeve's local axis until the *bottom* of the board clears the lips.
    seated.set(0,1.03+1.84*pull,-.010).applyMatrix4(pouch.matrix);
    presentation.set(.11+.28*settle,2.88-1.21*smooth(p,.765,.96),.02+.35*settle);
    const slide=smooth(p,.725,.78);
    card.position.lerpVectors(seated,presentation,slide);
    angles.set(-.075-.20*Math.sin(Math.PI*pull)+.045*settle,.095-.40*Math.sin(Math.PI*pull)+.075*settle,
      -.055+.14*grip-.28*Math.sin(Math.PI*pull)+.03*ringDown);
    card.quaternion.copy(pouch.quaternion).slerp(openRotation.setFromEuler(angles),slide);
    card.visible=p>.425;
    for (const { mesh, side, strip, rows } of panels) {
      const geo=mesh.geometry, pos=geo.getAttribute('position'), uv=geo.getAttribute('uv');
      for(let j=0;j<=rows;j++) for(let i=0;i<=cols;i++) {
        const index=j*(cols+1)+i,u=i/cols, v=1-j/rows, vy=uv.getY(index);
        const sideSpan=Math.sin(Math.PI*u), seam=smooth(vy,.035,.145)*(1-smooth(vy,.835,.96));
        const width=1.70-.067*squeeze*Math.sin(vy*Math.PI);
        const folded=Math.sin(27*u+6*vy)+.49*Math.sin(50*u-11*vy);
        const crimp=.009*Math.sin(50*Math.PI*u)*(1-seam);
        const wrinkle=(.025+.032*fall)*folded*seam;
        const depth=.002+sideSpan*(.19*seam+.019+wrinkle+crimp);
        const split=smooth(rip-u,-.10,.12);
        const lip=mouth*(1-.38*fall)*smooth(vy,.56,.84)*sideSpan;
        let x=(u-.5)*width, y=.055+vy*2.19, z=side*(depth+.31*lip);
        const upper=smooth(vy,.46,.85);
        const attached=strip ? 1-smooth(rip-u,0,.23) : 1;
        y-=attached*(.075*split+.12*fall)*upper*sideSpan;
        z+=attached*side*.060*Math.sin(u*11+4*vy)*mouth*upper*sideSpan;
        if(strip) {
          // Bend the free portion around the travelling tear front. Until the crack reaches
          // a column, that column shares the mouth edge position and tangent exactly.
          const free=Math.max(0,rip-u)*1.7;
          const curvature=1.53;
          x+=free-Math.sin(curvature*free)/curvature;
          y+=.73*(1-Math.cos(curvature*free))/curvature;
          z+=free*.15;
          const angle=(u-.5)*3.3;
          x=T.MathUtils.lerp(x+1.12*clearCorner,1.39+.52*Math.sin(angle),toss)+.11*arc;
          const foldAngle=.18+.88*Math.sin(5.5*u);
          y=T.MathUtils.lerp(y+.18*liftStrip,.12+(v-.5)*.23*Math.sin(foldAngle)+.045*(1-Math.cos(angle))+.006*side,toss)+.42*arc;
          z=T.MathUtils.lerp(z+.44*clearCorner,.74+(.5-v)*.26*Math.cos(foldAngle)+.18*Math.cos(angle),toss)+.14*arc;
        }
        pos.setXYZ(index,x,y,z);
      }
      pos.needsUpdate=true;geo.computeVertexNormals();
    }
  }
  update(0);
  return { root, update, dispose: () => dispose(root) };
}
