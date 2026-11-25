import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CourtyardCaseSession } from './courtyard-case-session';
import { COURTYARD_COMPACT_WIDTH, sceneryImages } from './courtyard-poster';
import type { CaseScenery } from './courtyard-poster';
import type { Case } from './types';

type CaseSurface = {
  resize(width: number, height: number): void;
  draw(time: number): void;
  loadCase(signal: AbortSignal): Promise<CourtyardCaseSession>;
  snapshotWindowMask?(maxWidth: number): string;
  dispose(): void;
};

export function CourtyardAtmosphere({ opening, scenery, item, onSession, onPosterFailedChange }: {
  opening: boolean;
  scenery: CaseScenery;
  item: Case;
  onSession: (session: CourtyardCaseSession | null) => void;
  onPosterFailedChange: (failed: boolean) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const poster = useRef<HTMLImageElement>(null);
  const weather = useRef<HTMLSpanElement>(null);
  const [compact, setCompact] = useState<boolean>();
  const images = compact === undefined ? undefined : sceneryImages(item, scenery, compact);
  useLayoutEffect(() => {
    setCompact(host.current!.clientWidth < COURTYARD_COMPACT_WIDTH);
  }, []);

  useEffect(() => {
    const container = host.current!;
    container.dataset.renderer = 'preparing';
    const lifetime = new AbortController();
    let surface: CaseSurface | undefined;
    let canvas: HTMLCanvasElement | undefined;
    let visible = false, loading = false, propVisible = false;
    let revealFrame = 0, startFrame = 0, startTimer = 0;
    let width = 0, height = 0;
    let maskTimer = 0, angle = 0;
    function updateWindowMask() {
      const layer = weather.current;
      if (!layer || !surface?.snapshotWindowMask) return;
      clearTimeout(maskTimer);
      if (!angle) {
        layer.style.removeProperty('--turned-window-mask');
        container.removeAttribute('data-turning');
        return;
      }
      container.toggleAttribute('data-turning', true);
      if (!visible || document.hidden) return;
      maskTimer = window.setTimeout(() => {
        if (!lifetime.signal.aborted && surface?.snapshotWindowMask && layer.isConnected && visible && !document.hidden) {
          layer.style.setProperty('--turned-window-mask', 'url("' + surface.snapshotWindowMask(720) + '")');
          container.removeAttribute('data-turning');
        }
      }, 180);
    }
    function resize() {
      const w = container.clientWidth, h = container.clientHeight;
      if (!w || !h || (w === width && h === height)) return;
      width = w; height = h;
      setCompact(w < COURTYARD_COMPACT_WIDTH);
      surface?.resize(w, h);
      if (propVisible || container.hasAttribute('data-painted')) surface?.draw(1.6);
      if (angle) updateWindowMask();
    }
    function release() {
      clearTimeout(maskTimer);
      angle = 0;
      weather.current?.style.removeProperty('--turned-window-mask');
      container.removeAttribute('data-turning');
      cancelAnimationFrame(revealFrame);
      canvas?.removeEventListener('webglcontextlost', lost);
      surface?.dispose();
      canvas?.remove();
      surface = undefined;
      propVisible = false;
      container.removeAttribute('data-painted');
      container.dataset.renderer = 'poster';
    }
    function lost(event: Event) {
      event.preventDefault();
      lifetime.abort();
      release();
      onSession(null);
    }
    async function prepare() {
      if (lifetime.signal.aborted) return;
      try {
        const createRenderer = scenery === 'workshop'
          ? (await import('./workshop-renderer')).createWorkshopRenderer
          : (await import('./courtyard-renderer')).createCourtyardRenderer;
        if (lifetime.signal.aborted) return;
        canvas = document.createElement('canvas');
        container.append(canvas);
        surface = createRenderer(canvas, item);
        canvas.addEventListener('webglcontextlost', lost);
        width = height = 0;
        resize();
        surface.draw(1.6);
        const session = await surface.loadCase(lifetime.signal);
        if (lifetime.signal.aborted) return;
        container.dataset.renderer = 'webgl';
        const turnCase = session.setInspectionAngle;
        onSession({
          ...session,
          setInspectionAngle: turnCase && (radians => {
            if (lifetime.signal.aborted) return;
            turnCase(radians);
            if (scenery === 'workshop') {
              angle = radians % (2 * Math.PI);
              updateWindowMask();
            }
          }),
          setVisible(show) {
            if (lifetime.signal.aborted) return;
            session.setVisible(show);
            propVisible = show;
            if (!show && angle) { angle = 0; updateWindowMask(); }
            cancelAnimationFrame(revealFrame);
            if (show) {
              // The model has scheduled its first draw. Keep the identical still
              // above the canvas until that draw has filled its framebuffer.
              revealFrame = requestAnimationFrame(() => container.setAttribute('data-painted', ''));
            }
          },
        });
      } catch {
        if (!lifetime.signal.aborted) { release(); onSession(null); }
      }
    }
    function start() {
      if (loading || !visible || document.hidden || lifetime.signal.aborted) return;
      loading = true;
      // Give the case photograph a paint before allocating WebGL or parsing
      // the model. Slow or unavailable poster downloads must still allow 3D.
      let started = false;
      function afterPoster() {
        if (started || lifetime.signal.aborted) return;
        started = true;
        clearTimeout(startTimer);
        startFrame = requestAnimationFrame(() => {
          startTimer = window.setTimeout(() => {
            if (!visible || document.hidden) { loading = false; return; }
            void prepare();
          }, 0);
        });
      }
      startTimer = window.setTimeout(afterPoster, 240);
      void poster.current!.decode().then(afterPoster, afterPoster);
    }
    function visibilityChanged() {
      container.toggleAttribute('data-in-view', visible && !document.hidden);
      if (angle && container.hasAttribute('data-turning')) updateWindowMask();
      start();
    }
    const size = new ResizeObserver(resize);
    const intersection = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      visibilityChanged();
    });
    size.observe(container);
    intersection.observe(container);
    document.addEventListener('visibilitychange', visibilityChanged);
    return () => {
      lifetime.abort();
      clearTimeout(startTimer);
      cancelAnimationFrame(startFrame);
      size.disconnect();
      intersection.disconnect();
      document.removeEventListener('visibilitychange', visibilityChanged);
      release();
    };
  }, [item, scenery, onSession]);

  return <div className="courtyard-atmosphere" data-scenery={scenery} ref={host} aria-hidden="true">
    <img className="courtyard-bench" src={images?.plate} alt="" draggable={false} fetchPriority="high"/>
    <img className="courtyard-entry-poster" ref={poster} src={images?.poster} alt="" draggable={false}
      fetchPriority="high" onLoad={() => onPosterFailedChange(false)} onError={() => onPosterFailedChange(true)}/>
    {!opening && (scenery === 'summit' ? <span className="summit-spindrift"/> : images?.windowMask &&
      <span ref={weather} className="workshop-snow" style={{ maskImage: `var(--turned-window-mask, url("${images.windowMask}"))` }}/>)}
  </div>;
}
