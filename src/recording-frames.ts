// Animated <img> elements have no seek or pause API. On an interrupted opening,
// composite the WebP frame rectangles at the visible playback time instead.
type Patch = { x: number; y: number; w: number; h: number; end: number; flags: number; bytes: Uint8Array<ArrayBuffer> };

function word(data: Uint8Array, at: number, length: number) {
  let value = 0;
  for (let i = 0; i < length; i++) value += data[at + i] * 256 ** i;
  return value;
}

function* chunks(data: Uint8Array) {
  for (let offset = 12; offset + 8 <= data.length;) {
    const kind = String.fromCharCode(...data.subarray(offset, offset + 4));
    const size = word(data, offset + 4, 4);
    const start = offset + 8;
    if (start + size > data.length || (kind === 'ANMF' && size < 16) || (kind === 'VP8X' && size < 10)) {
      throw Error('Incomplete recording');
    }
    yield { kind, size, start };
    offset = start + size + size % 2;
  }
}

// The encoder folds a long still ending into the duration of the final frame.
export function recordingMotionEnd(data: Uint8Array) {
  let total = 0, last = 0;
  for (const { kind, start } of chunks(data)) {
    if (kind !== 'ANMF') continue;
    last = word(data, start + 12, 3);
    total += last;
  }
  return total ? total - last + Math.min(last, 1000 / 60) : undefined;
}

function staticFrame(patch: Patch) {
  const header = new Uint8Array(30);
  const view = new DataView(header.buffer);
  const code = (at: number, s: string) => header.set(Array.from(s, c => c.charCodeAt(0)), at);
  code(0, 'RIFF'); code(8, 'WEBP'); code(12, 'VP8X');
  view.setUint32(4, header.length - 8 + patch.bytes.length, true);
  view.setUint32(16, 10, true);
  header[20] = 16; // An isolated delta rectangle can carry an alpha plane.
  header[24] = (patch.w - 1) & 255;
  header[25] = (patch.w - 1) >> 8;
  header[27] = (patch.h - 1) & 255;
  header[28] = (patch.h - 1) >> 8;
  return new Blob([header, patch.bytes], { type: 'image/webp' });
}

export async function openRecordingFrames(source: Blob, output: HTMLCanvasElement, signal: AbortSignal) {
  const data = new Uint8Array(await source.arrayBuffer());
  signal.throwIfAborted();
  const patches: Patch[] = [];
  let time = 0;
  const scratch = document.createElement('canvas');
  for (const { kind, size, start: s } of chunks(data)) {
    if (kind === 'VP8X') {
      scratch.width = word(data, s + 4, 3) + 1;
      scratch.height = word(data, s + 7, 3) + 1;
    } else if (kind === 'ANMF') {
      time += word(data, s + 12, 3);
      patches.push({ x: word(data, s, 3) * 2, y: word(data, s + 3, 3) * 2,
        w: word(data, s + 6, 3) + 1, h: word(data, s + 9, 3) + 1,
        flags: data[s + 15], bytes: data.subarray(s + 16, s + size), end: time });
    }
  }
  if (!patches.length) throw Error('Missing recording frames');
  output.width = scratch.width;
  output.height = scratch.height;
  const ctx = scratch.getContext('2d')!;
  const display = output.getContext('2d')!;
  let drawn = -1, target = -1, pending: Promise<void> | undefined;
  let published = false;

  async function paint() {
    while (!signal.aborted && drawn < target) {
      let next = drawn + 1;
      // An independent, full-canvas frame discards all preceding patches.
      for (let i = target; i > next; i--) {
        const p = patches[i];
        if ((p.flags & 2) && !p.x && !p.y && p.w === scratch.width && p.h === scratch.height) { next = i; break; }
      }
      const patch = patches[next];
      const bitmap = await createImageBitmap(staticFrame(patch));
      if (signal.aborted) { bitmap.close(); return; }
      const last = patches[drawn];
      if (last && last.flags & 1) ctx.clearRect(last.x, last.y, last.w, last.h);
      if (patch.flags & 2) ctx.clearRect(patch.x, patch.y, patch.w, patch.h);
      ctx.drawImage(bitmap, patch.x, patch.y);
      bitmap.close();
      drawn = next;
      // Publish completed poses in one draw; clearing between tasks would flash.
      if (published || drawn === target) {
        display.globalCompositeOperation = 'copy';
        display.drawImage(scratch, 0, 0);
        published = true;
      }
    }
  }
  return (elapsed: number) => {
    const i = patches.findIndex(p => elapsed < p.end);
    target = i < 0 ? patches.length - 1 : i;
    if (drawn < target && !pending) pending = paint().finally(() => { pending = undefined; });
    return pending ?? Promise.resolve();
  };
}
