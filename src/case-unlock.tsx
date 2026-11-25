import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { CourtyardCaseSession } from './courtyard-case-session';
import { COMPACT_OPEN_POSE, inspectionModel, SOUVENIR_OPEN_POSE } from './inspection-model';
import { openRecordingFrames, recordingMotionEnd } from './recording-frames';
import { runVisibleTimeline } from './visible-timeline';
import type { Case, Skin } from './types';
import type { createInspectionScene } from './inspection-scene';

export type UnlockPace = 'normal' | 'fast' | 'reduced';
type Inspector = Awaited<ReturnType<typeof createInspectionScene>>;
type UnlockProps = { item: Case; active: boolean; pace: UnlockPace; readout: readonly Skin[]; onLatch: () => void; onOpened: () => void };
type Inspection = ReturnType<typeof inspectionModel>;
const timing = {
  normal: { lead: 120, movement: 2100, hold: 0 },
  fast: { lead: 0, movement: 580, hold: 100 },
  reduced: { lead: 0, movement: 0, hold: 190 },
};

function latchFraction({ kind, id }: Inspection) {
  if (kind === 'terminal' || kind === 'xray' || kind === 'capsule') return .12;
  if (kind === 'pin-pack') return .16;
  if (kind === 'compact' || kind === 'hard') return .19;
  return kind === 'souvenir' || ['ak', 'awp', 'copper'].includes(id) ? .32 : .55;
}

function useRecording(file?: string) {
  const [clip, setClip] = useState<{ file: string; url: string; blob?: Blob; motionEnd?: number }>();
  useEffect(() => {
    setClip(undefined);
    if (!file) return;
    const controller = new AbortController();
    let url = '';
    void fetch(file, { signal: controller.signal })
      .then(response => {
        if (!response.ok) throw new Error('Recording unavailable');
        return response.arrayBuffer();
      })
      .then(data => {
        if (controller.signal.aborted) return;
        const blob = new Blob([data], { type: 'image/webp' });
        const motionEnd = recordingMotionEnd(new Uint8Array(data));
        // A fresh URL starts an independent image timeline on each opening.
        url = URL.createObjectURL(blob);
        setClip({ file, url, blob, motionEnd });
      }).catch(() => {
        if (!controller.signal.aborted) setClip({ file, url: '' });
      });
    return () => { controller.abort(); if (url) URL.revokeObjectURL(url); };
  }, [file]);
  return clip?.file === file ? clip : undefined;
}

function openingLabel(item: Case, kind: Inspection['kind'], active: boolean) {
  if (!active) return item.name;
  if (kind === 'terminal') return 'Терминал Genesis обрабатывает запрос';
  if (kind === 'xray') return 'Идёт рентгеновское сканирование упаковки';
  const verb = kind === 'bag' ? 'Расстёгивается сумка' : kind === 'capsule' ? 'Открывается капсула' : kind === 'pin-pack' ? 'Вскрывается пакет' : 'Открывается кейс';
  return verb + ' «' + item.name + '»';
}

function openingHold(kind: Inspection['kind'], pace: UnlockPace) {
  if (pace === 'normal' && kind === 'xray') return 670;
  if (pace === 'normal' && kind === 'terminal') return 200;
  return timing[pace].hold;
}

function isRigid(kind: Inspection['kind']) {
  return kind === 'series' || kind === 'hard' || kind === 'compact' || kind === 'souvenir';
}

type ModelProps = UnlockProps & { model: Inspection };

// Start the phase clock with the first visible frame, including on the WebGL fallback path.
function OpeningRecording({ model, active, pace, onLatch, onOpened, onStarted, preload = false, resumeAt }: ModelProps & { onStarted: () => void; preload?: boolean; resumeAt?: number }) {
  const base = '/assets/unseal/fallback/' + model.id;
  const poster = base + '-closed.webp';
  const still = pace === 'reduced' || (!active && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const file = !still && (active || preload) ? base + (pace === 'fast' ? '-fast.webp' : '.webp') : undefined;
  const clip = useRecording(file);
  const playback = clip?.url;
  const picture = useRef<HTMLImageElement>(null);
  const overlay = useRef<HTMLCanvasElement>(null);
  const [loaded, setLoaded] = useState('');
  const [unavailable, setUnavailable] = useState(false);
  const [missingStill, setMissingStill] = useState(false);
  const callbacks = useRef({ onLatch, onOpened });
  callbacks.current = { onLatch, onOpened };
  const staticOpening = still || unavailable || playback === '';
  const release = latchFraction(model);
  const src = active ? (staticOpening ? base + '-open.webp' : playback || poster) : poster;
  const ready = loaded === src && (staticOpening || !!playback);
  useEffect(() => {
    if (!active || ready) return;
    return runVisibleTimeline(6000, () => { if (staticOpening) setMissingStill(true); else setUnavailable(true); });
  }, [active, ready, staticOpening]);
  useLayoutEffect(() => {
    if (!active || (!ready && !missingStill)) return;
    onStarted();
    const speed = staticOpening ? 'reduced' : pace;
    const { lead, movement } = timing[speed];
    const cue = lead + release * movement;
    const deviceReadout = model.kind === 'terminal' || model.kind === 'xray';
    const duration = speed === 'normal' && !deviceReadout && clip?.motionEnd !== undefined
      ? clip.motionEnd : lead + movement + openingHold(model.kind, speed);
    const controller = new AbortController();
    const surface = overlay.current;
    const photo = picture.current;
    let cancel = () => {};
    let heard = false;
    let seek: Awaited<ReturnType<typeof openRecordingFrames>> | undefined;

    function staticFallback() {
      if (!controller.signal.aborted) setUnavailable(true);
    }
    async function continueFrom(at: number) {
      cancel();
      if (!clip?.blob || !surface) return;
      try {
        seek = await openRecordingFrames(clip.blob, surface, controller.signal);
        await seek(at);
        if (controller.signal.aborted) return;
        surface.style.opacity = '1';
        if (photo) photo.style.visibility = 'hidden';
        start(at);
      } catch { staticFallback(); }
    }
    function start(offset: number) {
      const end = () => callbacks.current.onOpened();
      cancel = runVisibleTimeline(Math.max(0, duration - offset), end, elapsed => {
        const at = elapsed + offset;
        if (seek) void seek(at).catch(staticFallback);
        if (!heard && at >= cue) { heard = true; callbacks.current.onLatch(); }
      }, !staticOpening && !seek ? elapsed => { void continueFrom(elapsed + offset); } : undefined);
    }
    if (!staticOpening && (resumeAt !== undefined || document.hidden)) void continueFrom(resumeAt ?? 0);
    else start(Math.min(resumeAt ?? 0, duration));
    return () => {
      controller.abort();
      cancel();
      if (surface) surface.style.opacity = '';
      if (photo) photo.style.visibility = '';
    };
  }, [active, pace, ready, missingStill, staticOpening, release, model.kind, clip, resumeAt, onStarted]);

  return <><img ref={picture} src={src} alt="" draggable={false} fetchPriority="high" data-recording-ready={active && ready ? '' : undefined}
    onLoad={() => setLoaded(src)}
    onError={() => { if (active && staticOpening) setMissingStill(true); else if (active && src !== poster) setUnavailable(true); }}/>
    {active && !staticOpening && <canvas ref={overlay} style={{ objectFit: 'contain' }} aria-hidden="true"/>}</>;
}

type PresentedProps = ModelProps & {
  session: CourtyardCaseSession | null;
  shown: boolean;
  canvas?: RefObject<HTMLCanvasElement | null>;
  preload?: boolean;
};

function PresentedUnlock({ session, shown, canvas, preload, ...props }: PresentedProps) {
  const { item, model, active, pace, readout, onLatch, onOpened } = props;
  // On a cold click, accept a ready 3D model while the recording is downloading.
  // Once a visible sequence starts, retain its timeline for the rest of this opening.
  const [round, setRound] = useState(() => ({ active, session: active ? session : null, recordingStarted: false }));
  if (round.active !== active || (active && !round.recordingStarted && !round.session && session)) {
    setRound({ active, session: active ? session : null, recordingStarted: false });
  }
  const recordingStarted = useCallback(() => setRound(current => current.recordingStarted ? current : { ...current, recordingStarted: true }), []);
  const scene = shown && (!active || round.session === session) ? session : null;
  let openPose = 1;
  if (pace === 'normal' && !('workshop' in model)) {
    if (model.kind === 'souvenir') openPose = SOUVENIR_OPEN_POSE;
    if (model.kind === 'compact') openPose = COMPACT_OPEN_POSE;
  }
  const elapsed = useRef(0);
  const callbacks = useRef({ onLatch, onOpened });
  callbacks.current = { onLatch, onOpened };
  const release = latchFraction(model);

  useLayoutEffect(() => { scene?.setReadout(readout); }, [scene, readout]);
  useLayoutEffect(() => {
    if (!scene) return;
    scene.render(0);
    scene.setVisible(true);
    return () => scene.setVisible(false);
  }, [scene]);
  useLayoutEffect(() => {
    if (!active) { elapsed.current = 0; scene?.render(0); return; }
    if (!scene) return;
    elapsed.current = 0;
    const { lead, movement } = timing[pace];
    const duration = lead + movement * openPose + openingHold(model.kind, pace);
    let previous = -1;
    let heard = false;
    return runVisibleTimeline(duration, () => callbacks.current.onOpened(), at => {
      elapsed.current = at;
      const progress = movement ? Math.min(1, Math.max(0, (at - lead) / movement)) : 1;
      if (progress !== previous || (progress === 1 && (model.kind === 'terminal' || model.kind === 'xray'))) {
        scene.render(progress);
        previous = progress;
      }
      if (!heard && progress >= release) { heard = true; callbacks.current.onLatch(); }
    }, at => { elapsed.current = at; });
  }, [active, scene, pace, model.kind, release, openPose]);

  const engine = scene ? (canvas ? 'webgl' : 'scene') : 'recording';
  const resumeAt = active && round.session && !scene ? elapsed.current : undefined;
  const viewport = <div className="inspection-viewport" data-engine={engine}>
    {shown && !scene && <OpeningRecording key={preload ? model.id : active ? 'opening' : 'preview'}
      {...props} onStarted={recordingStarted} resumeAt={resumeAt} preload={preload}/>}
    {canvas && <canvas ref={canvas} aria-hidden="true"/>}
  </div>;
  const rigid = isRigid(model.kind);
  return <div className={'case-unlock-stage' + (rigid ? ' rigid-opening' : '')} data-kind={model.kind} data-model={model.id}
    data-presentation={engine} aria-label={openingLabel(item, model.kind, active)} role={active ? 'status' : 'img'}>
    {rigid ? <div className="inspection-pan">{viewport}</div> : viewport}
  </div>;
}

// The independent inspector supports callers that do not supply a courtyard.
function StandaloneUnlock(props: ModelProps & { shown: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [session, setSession] = useState<CourtyardCaseSession | null>(null);
  useEffect(() => {
    const view = canvas.current!;
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    let controller: AbortController | undefined;
    let inspector: Inspector | undefined;
    let progress = 0;
    let frame = 0;
    async function prepare() {
      const current = new AbortController();
      controller = current;
      try {
        const { createInspectionScene } = await import('./inspection-scene');
        if (current.signal.aborted) return;
        const scene = await createInspectionScene(view, props.item, current.signal);
        if (current.signal.aborted) return;
        inspector = scene;
        setSession({
          setVisible(visible) { view.style.visibility = visible ? 'visible' : 'hidden'; },
          setReadout: scene.setReadout,
          render(value) { progress = value; scene.render(value); },
        });
      } catch { /* The same opening sequence is available as a recording. */ }
    }
    function schedule() {
      if (motion.matches || (controller && !controller.signal.aborted)) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(prepare);
    }
    function lost(event: Event) {
      event.preventDefault();
      inspector = undefined;
      controller?.abort();
      setSession(null);
    }
    view.addEventListener('webglcontextlost', lost);
    view.addEventListener('webglcontextrestored', schedule);
    motion.addEventListener('change', schedule);
    schedule();
    const observer = new ResizeObserver(() => inspector?.render(progress));
    observer.observe(view);
    return () => {
      view.removeEventListener('webglcontextlost', lost);
      view.removeEventListener('webglcontextrestored', schedule);
      motion.removeEventListener('change', schedule);
      observer.disconnect();
      cancelAnimationFrame(frame);
      controller?.abort();
    };
  }, [props.item]);
  return <PresentedUnlock {...props} session={session} canvas={canvas}/>;
}

export function CaseUnlock({ session, shown = true, ...props }: UnlockProps & {
  session?: CourtyardCaseSession | null; shown?: boolean;
}) {
  const model = inspectionModel(props.item);
  const latchPlayed = useRef(false);
  useLayoutEffect(() => { if (!props.active) latchPlayed.current = false; }, [props.active]);
  function latch() {
    if (latchPlayed.current) return;
    latchPlayed.current = true;
    props.onLatch();
  }
  const presentation = { ...props, model, shown, onLatch: latch };
  if (session !== undefined) return <PresentedUnlock key={props.item.id} {...presentation} session={session}/>;
  if (isRigid(model.kind)) {
    return <PresentedUnlock key={props.item.id} {...presentation} session={null} preload/>;
  }
  return <StandaloneUnlock key={props.item.id} {...presentation}/>;
}
