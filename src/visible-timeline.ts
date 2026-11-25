/** Run a local presentation only while the document can paint it. */
export function runVisibleTimeline(duration: number, onFinish: () => void, onFrame?: (elapsed: number) => void, onPause?: (elapsed: number) => void) {
  let elapsed = 0;
  let started: number | null = null;
  let frame = 0, timeout = 0;
  let suspended = false, cancelled = false;

  function stop() {
    if (started !== null) elapsed = Math.min(duration, elapsed + Math.max(0, performance.now() - started));
    started = null;
    cancelAnimationFrame(frame);
    clearTimeout(timeout);
  }
  function cancel() {
    cancelled = true;
    stop();
    document.removeEventListener('visibilitychange', sync);
    document.removeEventListener('freeze', suspend);
    document.removeEventListener('resume', resume);
    window.removeEventListener('pagehide', suspend);
    window.removeEventListener('pageshow', resume);
  }
  function advance() {
    if (started === null || cancelled) return;
    if (document.hidden || suspended) { sync(); return; }
    const now = performance.now();
    elapsed = Math.min(duration, elapsed + now - started);
    started = now;
    onFrame?.(elapsed);
    if (cancelled) return;
    if (elapsed >= duration) { cancel(); onFinish(); }
    else if (onFrame) frame = requestAnimationFrame(advance);
    else timeout = window.setTimeout(advance, duration - elapsed);
  }
  function sync() {
    if (document.hidden || suspended) {
      const wasRunning = started !== null;
      stop();
      if (wasRunning) onPause?.(elapsed);
      return;
    }
    if (started !== null || cancelled) return;
    started = performance.now();
    if (onFrame) frame = requestAnimationFrame(advance);
    else timeout = window.setTimeout(advance, duration - elapsed);
  }
  function suspend() { suspended = true; sync(); }
  function resume() { suspended = false; sync(); }

  document.addEventListener('visibilitychange', sync);
  document.addEventListener('freeze', suspend);
  document.addEventListener('resume', resume);
  window.addEventListener('pagehide', suspend);
  window.addEventListener('pageshow', resume);
  sync();
  return cancel;
}
