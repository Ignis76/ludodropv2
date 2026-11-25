import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import { LoaderCircle, Pause, Rotate3D } from 'lucide-react';
import type { Case } from './types';
import type { createInspectionScene } from './inspection-scene';
import './home-inspection.css';

type Scene = Awaited<ReturnType<typeof createInspectionScene>>;
type Turn = { from: number; to: number; duration: number; elapsed: number; lastFrame?: number; full: boolean };

export function HomeInspection({ item, poster, initialOrbit = 0, onOpen }: { item: Case; poster: string; initialOrbit?: number; onOpen: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const scene = useRef<Scene | null>(null);
  const angle = useRef(initialOrbit);
  const turn = useRef<Turn | null>(null);
  const frame = useRef(0);
  const suspended = useRef(false);
  const drag = useRef<{ id: number; x: number; y: number; start: number } | null>(null);
  const dragged = useRef(false);
  const [mode, setMode] = useState<'poster' | 'loading' | 'live' | 'unavailable'>('poster');
  const [spinning, setSpinning] = useState(false);
  const [canvasVersion, setCanvasVersion] = useState(0);
  const requested = mode === 'loading' || mode === 'live';

  const renderFrame = useCallback(function render(now: number) {
    frame.current = 0;
    if (!scene.current || document.hidden || suspended.current) return;
    const motion = turn.current;
    if (motion) {
      // Some browsers restore a frozen tab without dispatching visibility events.
      // Keep the missing frames available to show when the surface can paint again.
      motion.elapsed += Math.min(100, Math.max(0, now - (motion.lastFrame ?? now)));
      motion.lastFrame = now;
      const t = Math.min(1, motion.elapsed / motion.duration);
      const eased = motion.full ? t * t * (3 - 2 * t) : 1 - (1 - t) ** 3;
      angle.current = motion.from + (motion.to - motion.from) * eased;
      if (t === 1) {
        turn.current = null;
        if (motion.full) setSpinning(false);
      }
    }
    scene.current.render(0, angle.current);
    if (turn.current) frame.current = requestAnimationFrame(render);
  }, []);

  useEffect(() => {
    if (!requested) return;
    const view = canvas.current!;
    const controller = new AbortController();
    const failed = () => {
      if (controller.signal.aborted) return;
      drag.current = null;
      turn.current = null;
      setSpinning(false);
      setMode('unavailable');
    };
    const requestFrame = () => {
      if (scene.current && !frame.current && !document.hidden && !suspended.current) frame.current = requestAnimationFrame(renderFrame);
    };
    const syncFrame = () => {
      cancelAnimationFrame(frame.current);
      frame.current = 0;
      if (turn.current) turn.current.lastFrame = undefined;
      requestFrame();
    };
    const suspend = () => { suspended.current = true; syncFrame(); };
    const resume = () => { suspended.current = false; syncFrame(); };
    document.addEventListener('visibilitychange', syncFrame);
    document.addEventListener('freeze', suspend);
    document.addEventListener('resume', resume);
    window.addEventListener('pagehide', suspend);
    window.addEventListener('pageshow', resume);
    const size = new ResizeObserver(requestFrame);
    size.observe(view);
    view.addEventListener('webglcontextlost', failed);
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    const stopMotion = () => {
      if (!preference.matches) return;
      turn.current = null;
      setSpinning(false);
    };
    preference.addEventListener('change', stopMotion);
    void (async () => {
      const { createInspectionScene } = await import('./inspection-scene');
      if (controller.signal.aborted) return;
      const prop = await createInspectionScene(view, item, controller.signal);
      if (controller.signal.aborted) return;
      scene.current = prop;
      prop.render(0, angle.current);
      setMode('live');
      if (turn.current) requestFrame();
    })().catch(failed);
    return () => {
      view.removeEventListener('webglcontextlost', failed);
      preference.removeEventListener('change', stopMotion);
      document.removeEventListener('visibilitychange', syncFrame);
      document.removeEventListener('freeze', suspend);
      document.removeEventListener('resume', resume);
      window.removeEventListener('pagehide', suspend);
      window.removeEventListener('pageshow', resume);
      size.disconnect();
      cancelAnimationFrame(frame.current);
      frame.current = 0;
      scene.current = null;
      suspended.current = false;
      controller.abort();
    };
  }, [item, requested, renderFrame]);

  function rotateTo(radians: number, duration: number, full = false) {
    setSpinning(full);
    turn.current = duration ? { from: angle.current, to: radians, duration, elapsed: 0, full } : null;
    if (!duration) angle.current = radians;
    if (!requested) setMode('loading');
    if (scene.current && !frame.current && !document.hidden && !suspended.current) frame.current = requestAnimationFrame(renderFrame);
  }
  function step(amount: number) {
    const start = turn.current && !turn.current.full ? turn.current.to : angle.current;
    rotateTo(start + amount, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 210);
  }
  function inspectAround() {
    if (mode === 'unavailable') {
      angle.current = initialOrbit;
      setCanvasVersion(version => version + 1);
    }
    if (spinning) { turn.current = null; setSpinning(false); return; }
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) step(Math.PI / 6);
    else rotateTo(angle.current + Math.PI * 2, 1800, true);
  }
  function move(event: PointerEvent<HTMLButtonElement>) {
    const grip = drag.current;
    if (!grip || grip.id !== event.pointerId) return;
    if (!event.buttons) { drag.current = null; return; }
    const dx = event.clientX - grip.x;
    if (!dragged.current) {
      const dy = event.clientY - grip.y;
      if (Math.abs(dx) < 6 || Math.abs(dy) > Math.abs(dx)) return;
      dragged.current = true;
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    rotateTo(grip.start - dx / event.currentTarget.clientWidth * Math.PI * 2, 0);
  }

  return <div className="home-inspection" data-mode={mode}>
    <button className="home-inspection-surface" type="button" aria-label={'Осмотреть контейнер «' + item.name + '»'}
      title={mode === 'unavailable' ? item.name : 'Потяни, чтобы повернуть. Нажми, чтобы осмотреть.'}
      onPointerDown={e => {
        if (!e.isPrimary || e.button !== 0) return;
        dragged.current = false;
        if (mode !== 'unavailable') {
          turn.current = null;
          setSpinning(false);
          drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, start: angle.current };
        }
      }}
      onPointerMove={move} onPointerUp={() => { drag.current = null; }}
      onLostPointerCapture={() => { drag.current = null; }}
      onPointerCancel={() => { drag.current = null; }}
      onPointerLeave={e => { if (!e.currentTarget.hasPointerCapture(e.pointerId)) drag.current = null; }}
      onKeyDown={e => {
        if (mode === 'unavailable' || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
        e.preventDefault();
        step((e.key === 'ArrowRight' ? 1 : -1) * Math.PI / 9);
      }}
      onClick={e => { if (!dragged.current || e.detail === 0) onOpen(); }}>
      <span className="home-inspection-frame">
        <img src={poster} alt="" fetchPriority="high" draggable="false"/>
        <canvas key={canvasVersion} ref={canvas} aria-hidden="true"/>
      </span>
    </button>
    <button type="button" className="home-orbit" onClick={inspectAround}
      aria-busy={mode === 'loading'}
      aria-label={(mode === 'unavailable' ? 'Повторить загрузку 3D «' : spinning ? 'Остановить вращение «' : 'Повернуть «') + item.name + '»'} title={mode === 'unavailable' ? 'Повторить загрузку 3D' : spinning ? 'Остановить вращение' : 'Повернуть предмет'}>
      {mode === 'loading' ? <LoaderCircle className="orbit-loading" size={15}/> : spinning ? <Pause size={15}/> : <Rotate3D size={15}/>}
      <span>{mode === 'loading' ? 'Загрузка 3D' : mode === 'unavailable' ? 'Повторить 3D' : spinning ? 'Пауза' : '360°'}</span></button>
  </div>;
}
