import { cameraAt, easeBetween, project, rimCenter, sectorPoint, transferFrame, unproject, UPGRADE_CUES } from './upgrade-film-motion.ts';
import { silhouetteOffset, type UpgradeSprite } from './upgrade-film-stage.ts';
import type { Skin } from './types';

type Point = { x: number; y: number };
type Pen = CanvasRenderingContext2D;
type Project = (x: number, z: number, depth?: number) => Point;
type Pose = ReturnType<typeof transferFrame>;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function path(pen: Pen, points: Point[]) {
  pen.beginPath(); pen.moveTo(points[0].x, points[0].y);
  for (const p of points.slice(1)) pen.lineTo(p.x, p.y);
  pen.closePath();
}

function contact(pen: Pen, at: Project, landing: number, pose: Pose) {
  const mark = (degrees: number, rad: number) => {
    const p = sectorPoint(degrees, rad); return at(p.x, p.z);
  };
  const tip = mark(landing, 3.19), left = mark(landing - 1.2, 3.49);
  const right = mark(landing + 1.2, 3.49), spine = mark(landing, 3.47);
  pen.save(); pen.globalAlpha = pose.contact;
  for (const direction of [-1, 1]) {
    const end = landing + direction * 28 * pose.charge;
    pen.beginPath();
    for (let i = 0; i <= 28; i++) {
      const p = mark(lerp(landing, end, i / 28), 3.38);
      if (i) pen.lineTo(p.x, p.y); else pen.moveTo(p.x, p.y);
    }
    pen.lineWidth = 1.6; pen.strokeStyle = '#fff1b9'; pen.shadowColor = '#ff9a26'; pen.shadowBlur = 10; pen.stroke();
  }
  pen.shadowBlur = 0; pen.shadowColor = '#0e0704'; pen.shadowOffsetY = 2;
  path(pen, [tip, left, right]); pen.fillStyle = '#604023'; pen.fill();
  pen.shadowOffsetY = 0;
  const edge = pen.createLinearGradient(left.x, left.y, tip.x, tip.y);
  edge.addColorStop(0, '#976332'); edge.addColorStop(.42, '#ffe6a3'); edge.addColorStop(1, '#fff8ce');
  path(pen, [spine, left, tip]); pen.fillStyle = edge; pen.fill();
  path(pen, [right, spine, tip]); pen.fillStyle = '#b2864c'; pen.fill();
  pen.restore();
}

function lightBand(pen: Pen, center: Point, span: number, alpha: number) {
  if (alpha <= 0) return;
  pen.save(); pen.translate(center.x, center.y); pen.scale(1, .095);
  const light = pen.createRadialGradient(0, 0, 0, 0, 0, span);
  light.addColorStop(0, 'rgba(255,236,176,' + .8 * alpha + ')');
  light.addColorStop(.23, 'rgba(255,180,83,' + .47 * alpha + ')');
  light.addColorStop(1, 'rgba(255,160,45,0)');
  pen.fillStyle = light; pen.fillRect(-span, -span, 2 * span, 2 * span); pen.restore();
}

// The photographed finish retains its own alpha. The moving edge only illuminates lacquer and metal.
function litSprite(layer: HTMLCanvasElement, skin: UpgradeSprite, swipe: number) {
  if (swipe <= 0 || swipe >= 1) return skin.canvas;
  const { width, height } = skin.canvas;
  if (layer.width !== width || layer.height !== height) { layer.width = width; layer.height = height; }
  const paint = layer.getContext('2d');
  if (!paint) return skin.canvas;
  paint.clearRect(0, 0, width, height); paint.drawImage(skin.canvas, 0, 0);
  paint.globalCompositeOperation = 'source-atop';
  const x = width * (-.32 + 1.65 * swipe);
  const beam = paint.createLinearGradient(x - width * .13, height * .51, x + width * .13, height * .44);
  beam.addColorStop(0, '#ffd37300'); beam.addColorStop(.44, '#ffcb72ad');
  beam.addColorStop(.51, '#fff4d5ef'); beam.addColorStop(1, '#ffd68b00');
  paint.fillStyle = beam; paint.fillRect(0, 0, width, height);
  paint.globalCompositeOperation = 'source-over'; return layer;
}

function drawItem(pen: Pen, sprite: HTMLCanvasElement, pos: Point, width: number, angle: number, alpha: number, tilt = 1, defocus = 0) {
  if (width < 1 || alpha <= 0) return;
  const height = width * sprite.height / sprite.width;
  pen.save(); pen.globalAlpha = alpha; pen.translate(pos.x, pos.y); pen.rotate(angle); pen.scale(tilt, 1);
  if (defocus > .25) pen.filter = 'blur(' + defocus + 'px)';
  pen.drawImage(sprite, -width / 2, -height / 2, width, height); pen.restore();
}

function matShadow(pen: Pen, at: Project, length: number, contactX: number, strength: number) {
  if (strength <= 0) return;
  const center = at(0, .001), lateral = at(1, .001), back = at(0, .001, 1);
  pen.save();
  path(pen, [at(-.70, .001, -.22), at(.70, .001, -.22), at(.70, .001, .22), at(-.70, .001, .22)]);
  pen.clip();
  pen.transform(lateral.x - center.x, lateral.y - center.y, back.x - center.x, back.y - center.y, center.x, center.y);
  function pool(x: number, span: number, depth: number, opacity: number) {
    pen.save(); pen.translate(x, .012); pen.scale(span, depth);
    const shade = pen.createRadialGradient(0, 0, 0, 0, 0, 1);
    shade.addColorStop(0, 'rgba(3,8,9,' + strength * opacity + ')');
    shade.addColorStop(.5, 'rgba(4,9,10,' + strength * opacity * .61 + ')');
    shade.addColorStop(1, 'rgba(4,9,10,0)');
    pen.fillStyle = shade; pen.fillRect(-1, -1, 2, 2); pen.restore();
  }
  pool(contactX, length * .58, .19, .6);
  pool(contactX, length * .22, .075, .94);
  pen.restore();
}

function displayRest(pen: Pen, at: Project, x: number, depth: number, height: number, opacity: number) {
  if (height <= .006 || opacity <= 0) return;
  pen.save(); pen.globalAlpha = opacity;
  function sleeve(low: number, high: number, radius: number, dark: string, light: string) {
    if (high <= low) return;
    const a = at(x-radius, low, depth), b = at(x+radius, low, depth);
    const shade = pen.createLinearGradient(a.x, a.y, b.x, b.y);
    shade.addColorStop(0, dark); shade.addColorStop(.30, light); shade.addColorStop(.62, dark); shade.addColorStop(1, '#536065');
    path(pen, [a, b, at(x+radius, high, depth), at(x-radius, high, depth)]); pen.fillStyle = shade; pen.fill();
    const lip = [];
    for (let j = 0; j < 16; j++) {
      const t = j * Math.PI / 8;
      lip.push(at(x + Math.cos(t)*radius, high, depth + Math.sin(t)*radius));
    }
    path(pen, lip); pen.fillStyle = light; pen.fill();
  }
  const shoulder = Math.min(height * .51, .085);
  sleeve(0, .011, .036, '#393936', '#a79b7f');
  sleeve(.008, shoulder, .014, '#394852', '#b9c6c5');
  sleeve(shoulder - .003, height, .008, '#49565a', '#d5d7c6');
  sleeve(height - .008, height + .001, .021, '#252c2e', '#596262');
  pen.restore();
}

export function makeUpgradeTransfer(canvas: HTMLCanvasElement, windowFrame: HTMLElement, field: HTMLElement,
  target: Skin, award: Skin, landing: number, tier: number, type: HTMLImageElement, art: Map<string, UpgradeSprite>) {
  const pen = canvas.getContext('2d'), glaze = document.createElement('canvas');
  let picture = windowFrame.getBoundingClientRect(), receiver: DOMRect | undefined, receivingImage: HTMLImageElement | null = null;
  let left = 0, top = 0, plateWidth = 0, plateHeight = 0, ratio = 1;
  function resize(followPrize = false) {
    picture = windowFrame.getBoundingClientRect();
    receivingImage = field.parentElement?.querySelector<HTMLImageElement>('.target-slot .upgrade-item-art img') ?? null;
    receiver = receivingImage?.getBoundingClientRect();
    if (followPrize && receiver && (receiver.bottom < 20 || receiver.top > window.innerHeight - 20)) {
      receivingImage?.scrollIntoView({ block: 'center', behavior: 'instant' });
      receiver = receivingImage?.getBoundingClientRect();
    }
    const viewport = field.getBoundingClientRect();
    // Keep the canvas to the optical frame and the actual flight path, even on a 4K screen.
    left = Math.max(viewport.left, Math.floor(Math.min(picture.left, receiver?.left ?? picture.left) - 8));
    top = Math.max(viewport.top, Math.floor(Math.min(picture.top, receiver?.top ?? picture.top) - 74));
    const width = Math.max(1, Math.ceil(Math.min(viewport.right, Math.max(picture.right, receiver?.right ?? picture.right) + 8) - left));
    const height = Math.max(1, Math.ceil(Math.min(viewport.bottom, Math.max(picture.bottom, receiver?.bottom ?? picture.bottom) + 12) - top));
    ratio = Math.min(2, window.devicePixelRatio || 1, 2560 / width);
    Object.assign(canvas.style, { left: left - viewport.left + 'px', top: top - viewport.top + 'px', width: width + 'px', height: height + 'px' });
    canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
    plateWidth = Math.max(picture.width, picture.height * 2); plateHeight = plateWidth / 2;
  }
  function paint(t: number, pose: Pose, fallback: boolean) {
    if (!pen || !plateWidth) return;
    if (pose.delivery > 0 && !receivingImage?.isConnected) resize(true);
    pen.setTransform(1, 0, 0, 1, 0, 0); pen.clearRect(0, 0, canvas.width, canvas.height);
    pen.setTransform(ratio, 0, 0, ratio, -left * ratio, -top * ratio); pen.imageSmoothingQuality = 'high';
    const camera = cameraAt(t, pose.shot, fallback);
    const originX = picture.left + (picture.width - plateWidth) / 2, originY = picture.top + (picture.height - plateHeight) / 2;
    const pixel = (p: Point) => ({ x: originX + p.x * plateWidth, y: originY + p.y * plateHeight });
    const at: Project = (x, z, depth = 0) => pixel(project(camera, x, z, depth));
    const hub = pixel(rimCenter(camera));
    if (pose.shot === 0) { contact(pen, at, landing, pose); return; }
    const core = at(0, 0), right = at(1, 0);
    const unit = Math.hypot(right.x - core.x, right.y - core.y), cameraAngle = Math.atan2(right.y - core.y, right.x - core.x);
    const goal = art.get(target.image);
    if (pose.target > 0 && goal) {
      const growth = easeBetween(UPGRADE_CUES.runway, UPGRADE_CUES.rotor + .12, t);
      const size = Math.min(unit * (2.72 + .38 * growth), picture.width * .57, picture.height * .39 * goal.canvas.width / goal.canvas.height);
      const angle = cameraAngle - .025 * (1 - growth), tilt = .94 + .06 * growth;
      const offset = silhouetteOffset(goal.outline, size, size * goal.canvas.height / goal.canvas.width, angle, tilt);
      drawItem(pen, litSprite(glaze, goal, easeBetween(2.04, 2.65, t)), { x: hub.x - offset.x, y: hub.y - offset.y },
        size, angle, pose.target, tilt);
    }
    if (pose.mint > 0 && pose.shot === 2) {
      const press = easeBetween(UPGRADE_CUES.multiplier - .08, UPGRADE_CUES.multiplier + .29, t);
      const size = Math.min(unit * 2.65, picture.width * .36, picture.height * .43);
      pen.save(); pen.translate(hub.x, hub.y); pen.rotate(cameraAngle - (1 - press) * .085);
      pen.globalAlpha = pose.mint; pen.scale(.88 + .12 * press, .92 + .08 * press);
      pen.shadowColor = '#170f0a'; pen.shadowBlur = Math.min(11, size * .05); pen.shadowOffsetY = 2.5;
      if (type.naturalWidth && type.complete) {
        const h = size * type.naturalHeight / type.naturalWidth;
        pen.drawImage(type, -size * .5, -h * .5, size, h);
      } else {
        pen.font = 'bold ' + Math.round(size * .68) + 'px system-ui'; pen.textAlign = 'center';
        pen.textBaseline = 'middle'; pen.fillStyle = '#ffdf9d'; pen.fillText('×' + tier, 0, 0);
      }
      pen.restore();
    }
    if (pose.shot !== 3) return;
    // This shot is registered to the rising suede mat on the front bench, in metres.
    lightBand(pen, core, unit * .69, pose.impulse * .7);
    const prize = art.get(award.image);
    if (!prize) return;
    const aspect = prize.canvas.width / prize.canvas.height;
    const blade = /knife|bayonet|karambit|daggers/i.test(award.weapon);
    const length = Math.min(blade ? .89 : 1.17, .47 * aspect);
    const wide = unit * length, high = wide / aspect;
    const fly = pose.delivery, settle = easeBetween(UPGRADE_CUES.award + .06, UPGRADE_CUES.award + .88, t);
    const displayAngle = cameraAngle - .048 * (1 - settle) - .019;
    const c = Math.cos(displayAngle), s = Math.sin(displayAngle);
    const offset = silhouetteOffset(prize.outline, wide, high, displayAngle);
    let x = hub.x - offset.x, y = hub.y - offset.y, displayWidth = wide, rot = displayAngle;
    const reveal = easeBetween(UPGRADE_CUES.award + .055, UPGRADE_CUES.award + .62, t);
    const restTravel = easeBetween(UPGRADE_CUES.award + .015, UPGRADE_CUES.award + .46, t) * (1 - easeBetween(0, .55, fly));
    const matCenter = unproject(camera, (hub.x - originX) / plateWidth, (hub.y - originY) / plateHeight);
    matShadow(pen, at, length, matCenter.x, reveal * .52 * (1 - easeBetween(0, .5, fly)) * pose.background);
    for (const rest of prize.rests) {
      const u = x + rest.x * wide * c - rest.y * high * s;
      const v = y + rest.x * wide * s + rest.y * high * c;
      const support = unproject(camera, (u - originX) / plateWidth, (v - originY) / plateHeight);
      displayRest(pen, at, support.x, 0, Math.max(0, support.z) * restTravel, pose.background);
    }
    if (fly > 0 && receiver) {
      const fit = Math.min(receiver.width / prize.sourceWidth, receiver.height / prize.sourceHeight);
      const destX = receiver.x + receiver.width / 2 + (prize.nativeCenterX - prize.sourceWidth / 2) * fit;
      const destY = receiver.y + receiver.height / 2 + (prize.nativeCenterY - prize.sourceHeight / 2) * fit;
      x = lerp(x, destX, fly); y = lerp(y, destY, fly) - Math.sin(fly * Math.PI) * Math.min(52, picture.height * .13);
      displayWidth = wide * Math.pow(Math.max(.002, prize.croppedWidth * fit / wide), fly);
      rot = lerp(rot, -prize.angle * Math.PI / 180, fly);
    }
    const sweep = easeBetween(UPGRADE_CUES.award + .12, UPGRADE_CUES.award + .95, t);
    drawItem(pen, litSprite(glaze, prize, sweep), { x, y }, displayWidth, rot,
      reveal * (1 - easeBetween(.72, 1, fly)), 1, (1 - settle) * Math.min(4, picture.width * .0035));
  }
  return { resize, paint };
}
