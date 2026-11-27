import { cameraAt, easeBetween, project, sectorPoint, transferFrame, UPGRADE_CUES } from './upgrade-film-motion.ts';
import type { UpgradeSprite } from './upgrade-film-stage.ts';
import type { Skin } from './types';

type Point = { x: number; y: number };
type Pen = CanvasRenderingContext2D;
type Project = (x: number, z: number) => Point;
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
  const tip = mark(landing, 3.17), left = mark(landing - 1.42, 3.54);
  const right = mark(landing + 1.42, 3.54), spine = mark(landing, 3.51);
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

function drawItem(pen: Pen, sprite: HTMLCanvasElement, pos: Point, width: number, angle: number, alpha: number, tilt = 1) {
  if (width < 1 || alpha <= 0) return;
  const height = width * sprite.height / sprite.width;
  pen.save(); pen.globalAlpha = alpha; pen.translate(pos.x, pos.y); pen.rotate(angle); pen.scale(tilt, 1);
  pen.shadowColor = '#060d12bd'; pen.shadowBlur = Math.min(9, width * .026); pen.shadowOffsetY = Math.min(5, height * .04);
  pen.drawImage(sprite, -width / 2, -height / 2, width, height); pen.restore();
}

export function makeUpgradeTransfer(canvas: HTMLCanvasElement, windowFrame: HTMLElement, field: HTMLElement,
  target: Skin, award: Skin, landing: number, tier: number, type: HTMLImageElement, art: Map<string, UpgradeSprite>) {
  const pen = canvas.getContext('2d'), glaze = document.createElement('canvas');
  let width = 0, height = 0, windowHeight = 0, plateWidth = 0, plateHeight = 0, offsetY = 0, ratio = 1;
  let fieldBox = field.getBoundingClientRect(), receiver: DOMRect | undefined, receivingImage: HTMLImageElement | null = null;
  function measureReceiver() {
    const img = field.parentElement?.querySelector<HTMLImageElement>('.target-slot .upgrade-item-art img') ?? null;
    fieldBox = field.getBoundingClientRect();
    receivingImage = img; receiver = img?.getBoundingClientRect();
  }
  function resize() {
    width = field.clientWidth; height = field.clientHeight; windowHeight = windowFrame.clientHeight;
    plateWidth = Math.max(width, windowHeight * 2); plateHeight = plateWidth / 2;
    offsetY = windowFrame.offsetTop + (windowHeight - plateHeight) * .48;
    ratio = Math.min(2, window.devicePixelRatio || 1, 2500 / Math.max(1, width));
    canvas.width = Math.max(1, Math.round(width * ratio)); canvas.height = Math.max(1, Math.round(height * ratio));
    measureReceiver();
  }
  function paint(t: number, pose: Pose, fallback: boolean) {
    if (!pen || !width || !height) return;
    pen.setTransform(ratio, 0, 0, ratio, 0, 0); pen.clearRect(0, 0, width, height); pen.imageSmoothingQuality = 'high';
    const m = cameraAt(t, pose.shot, fallback);
    const at: Project = (x, z) => {
      const p = project(m, x, z);
      return { x: (width - plateWidth) / 2 + p.x * plateWidth, y: offsetY + p.y * plateHeight };
    };
    if (pose.shot === 0) { contact(pen, at, landing, pose); return; }
    const core = at(0, .06);
    const unit = Math.hypot(at(1, .06).x - core.x, at(1, .06).y - core.y);
    const cameraAngle = Math.atan2(at(1, .06).y - core.y, at(1, .06).x - core.x);
    const goal = art.get(target.image);
    if (pose.target > 0 && goal) {
      const growth = easeBetween(UPGRADE_CUES.runway, UPGRADE_CUES.rotor + .12, t);
      const maxWidth = Math.min(width * .72, windowHeight * .43 * goal.canvas.width / goal.canvas.height);
      const displayWidth = Math.min(maxWidth, unit * (2.45 + .72 * growth));
      drawItem(pen, litSprite(glaze, goal, easeBetween(2.04, 2.65, t)), core,
        displayWidth, cameraAngle - .048 * (1 - growth), pose.target, .87 + .13 * growth);
    }
    if (pose.mint > 0) {
      const lift = easeBetween(UPGRADE_CUES.multiplier - .08, UPGRADE_CUES.multiplier + .29, t);
      const size = Math.min(unit * 2.75, width * .50, windowHeight * .52);
      pen.save(); pen.translate(core.x, core.y); pen.rotate(cameraAngle - (1 - lift) * .16);
      pen.globalAlpha = pose.mint; pen.scale(.67 + .33 * lift, .76 + .24 * lift);
      pen.shadowColor = '#170f0a'; pen.shadowBlur = 14; pen.shadowOffsetY = 4;
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
    lightBand(pen, core, Math.min(width * .53, windowHeight * 1.12), pose.impulse);
    const prize = art.get(award.image);
    if (!prize) return;
    const entry = pose.lift, fly = pose.delivery;
    const heroWidth = Math.min(width * .81, unit * 9.65, windowHeight * .48 * prize.canvas.width / prize.canvas.height);
    const startWidth = heroWidth * (.42 + .58 * entry + .055 * Math.sin(entry * Math.PI));
    const hovering = Math.sin(Math.min(3, t - UPGRADE_CUES.award) * 1.4);
    const center = { x: core.x + (1 - entry) * unit * .24, y: core.y + (1 - entry) * unit * .36 - unit * .04 * hovering };
    const angle = cameraAngle - .17 * (1 - entry) - .052 * hovering;
    let x = center.x, y = center.y, displayWidth = startWidth, rot = angle;
    if (fly > 0) {
      if (!receivingImage?.isConnected) measureReceiver();
      if (receiver) {
        const fit = Math.min(receiver.width / prize.sourceWidth, receiver.height / prize.sourceHeight);
        const destX = receiver.x - fieldBox.x + receiver.width / 2 + (prize.nativeCenterX - prize.sourceWidth / 2) * fit;
        const destY = receiver.y - fieldBox.y + receiver.height / 2 + (prize.nativeCenterY - prize.sourceHeight / 2) * fit;
        x = lerp(x, destX, fly); y = lerp(y, destY, fly) - Math.sin(fly * Math.PI) * Math.min(34, height * .075);
        displayWidth = lerp(startWidth, prize.croppedWidth * fit, fly);
        rot = lerp(rot, -prize.angle * Math.PI / 180, fly);
      }
    }
    const glint = easeBetween(UPGRADE_CUES.award + .04, UPGRADE_CUES.award + .67, t);
    drawItem(pen, litSprite(glaze, prize, glint), {x, y}, displayWidth, rot,
      easeBetween(UPGRADE_CUES.award, UPGRADE_CUES.award + .17, t) * (1 - easeBetween(.72, 1, fly)), .56 + .44 * entry);
  }
  return { resize, paint };
}
