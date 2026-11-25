import { memo, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, Ref, RefObject } from 'react';
import './contract-signature.css';

type InkPoint = { x: number; y: number };
type InkStroke = { pointerId: number; path: string; last: InkPoint };
type InkEvent = ReactPointerEvent<SVGSVGElement>;
export type ContractSignatureHandle = { undo: () => void; clear: () => void };
const viewBox = '0 0 1080 500';

function position(sample: PointerEvent, inverse: DOMMatrix): InkPoint {
  const point = new DOMPoint(sample.clientX, sample.clientY).matrixTransform(inverse);
  return { x: Math.round(point.x * 10) / 10, y: Math.round(point.y * 10) / 10 };
}

function inkPath(stroke: InkStroke) {
  return `${stroke.path} L${stroke.last.x} ${stroke.last.y}`;
}

export const ContractSignature = memo(function ContractSignature({ disabled, wholeSheet, signatureLine, onInkChange, ref }: {
  disabled: boolean; wholeSheet: boolean; signatureLine: RefObject<HTMLDivElement | null>;
  onInkChange: (hasInk: boolean) => void; ref?: Ref<ContractSignatureHandle>;
}) {
  const [paths, setPaths] = useState<string[]>([]);
  const [writing, setWriting] = useState(false);
  const stroke = useRef<InkStroke | null>(null);
  const live = useRef<SVGPathElement>(null);
  const hit = useRef<SVGRectElement>(null);
  useLayoutEffect(() => {
    const surface = hit.current?.ownerSVGElement;
    if (!surface || disabled) return;
    // A completed drawing gesture must not absorb the next tap on a terminal control.
    const startDrawing = (event: TouchEvent) => { if (event.cancelable) event.preventDefault(); };
    surface.addEventListener('touchstart', startDrawing, {passive:false});
    return () => surface.removeEventListener('touchstart', startDrawing);
  }, [disabled]);
  useLayoutEffect(() => {
    const rect = hit.current, pad = rect?.ownerSVGElement, line = signatureLine.current;
    if (!rect || !pad || !line) return;
    const sizeTarget = () => {
      const box = pad.getBoundingClientRect();
      const area = wholeSheet ? box : line.getBoundingClientRect();
      if (!box.width || !box.height) return;
      rect.setAttribute('x', String(1080 * (area.left - box.left) / box.width));
      rect.setAttribute('y', String(500 * (area.top - box.top) / box.height));
      rect.setAttribute('width', String(1080 * area.width / box.width));
      rect.setAttribute('height', String(500 * area.height / box.height));
    };
    sizeTarget();
    const observer = new ResizeObserver(sizeTarget);
    observer.observe(pad);
    observer.observe(line);
    return () => observer.disconnect();
  }, [wholeSheet, signatureLine]);
  const hasInk = writing || paths.length > 0;
  useEffect(() => { onInkChange?.(hasInk); }, [hasInk, onInkChange]);

  function discardLive() {
    stroke.current = null;
    live.current?.removeAttribute('d');
    setWriting(false);
  }
  useImperativeHandle(ref, () => ({
    undo() {
      if (disabled) return;
      if (stroke.current) discardLive();
      else setPaths(previous => previous.slice(0, -1));
    },
    clear() {
      if (disabled) return;
      discardLive();
      setPaths([]);
    },
  }), [disabled]);

  function finish() {
    if (!stroke.current) return;
    const path = inkPath(stroke.current);
    setPaths(previous => [...previous, path]);
    discardLive();
  }

  useEffect(() => {
    if (disabled) finish();
  }, [disabled]);

  function start(event: InkEvent) {
    if (disabled || stroke.current || !event.isPrimary || event.button !== 0) return;
    const matrix = event.currentTarget.getScreenCTM();
    if (!matrix) return;
    const first = position(event.nativeEvent, matrix.inverse());
    stroke.current = { pointerId: event.pointerId, path: `M${first.x} ${first.y}`, last: first };
    event.currentTarget.setPointerCapture(event.pointerId);
    live.current?.setAttribute('d', inkPath(stroke.current));
    setWriting(true);
  }

  function move(event: InkEvent) {
    const drawing = stroke.current;
    if (disabled || !drawing || drawing.pointerId !== event.pointerId) return;
    const matrix = event.currentTarget.getScreenCTM();
    if (!matrix) return;
    const inverse = matrix.inverse();
    const samples = event.nativeEvent.getCoalescedEvents?.() ?? [];
    for (const sample of [...samples, event.nativeEvent]) {
      const next = position(sample, inverse);
      const last = drawing.last;
      if (last.x === next.x && last.y === next.y) continue;
      // Draw through the midpoints so adjacent samples share a tangent.
      const midX = (last.x + next.x) / 2, midY = (last.y + next.y) / 2;
      drawing.path += ` Q${last.x} ${last.y} ${midX.toFixed(1)} ${midY.toFixed(1)}`;
      drawing.last = next;
    }
    live.current?.setAttribute('d', inkPath(drawing));
  }

  function release(event: InkEvent) {
    if (stroke.current?.pointerId !== event.pointerId) return;
    if (event.type === 'pointerup') move(event);
    finish();
  }

  return <svg className="dispatch-ink contract-signature-pad" viewBox={viewBox} preserveAspectRatio="none"
    role="img" aria-label="Поле для рисунка и подписи на терминале" aria-disabled={disabled}
    onPointerDown={start} onPointerMove={move} onPointerUp={release}
    onPointerCancel={release} onLostPointerCapture={release}>
    <rect ref={hit} className="dispatch-ink-target" fill="transparent"/>
    {paths.map((path, i) => <path key={i} d={path} data-ink-stroke=""/>)}
    <path ref={live}/>
  </svg>;
});
