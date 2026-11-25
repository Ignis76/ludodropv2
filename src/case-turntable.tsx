import { useEffect, useRef } from 'react';
import type { PointerEvent } from 'react';
import { runVisibleTimeline } from './visible-timeline';

export function CaseTurntable({ name, onTurn }: { name: string; onTurn: (angle: number) => void }) {
  const angle = useRef(0);
  const drag = useRef<{ id: number; x: number; y: number; angle: number } | null>(null);
  const dragged = useRef(false);
  const cancelStep = useRef<() => void>(() => {});
  useEffect(() => () => cancelStep.current(), [onTurn]);

  function turn(value: number) {
    angle.current = value;
    onTurn(value);
  }
  function step(delta: number) {
    cancelStep.current();
    const from = angle.current;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { turn(from + delta); return; }
    cancelStep.current = runVisibleTimeline(180, () => {}, elapsed => {
      turn(from + delta * (1 - (1 - elapsed / 180) ** 3));
    });
  }
  function move(event: PointerEvent<HTMLButtonElement>) {
    const start = drag.current;
    if (!start || start.id !== event.pointerId) return;
    const dx = event.clientX - start.x;
    if (!dragged.current) {
      if (Math.abs(dx) < 4 || Math.abs(dx) < Math.abs(event.clientY - start.y)) return;
      dragged.current = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      event.currentTarget.dataset.dragging = '';
    }
    turn(start.angle + dx / event.currentTarget.clientWidth * Math.PI * 2);
  }
  function release(event: PointerEvent<HTMLButtonElement>) {
    if (drag.current?.id !== event.pointerId) return;
    drag.current = null;
    delete event.currentTarget.dataset.dragging;
  }
  return <button type="button" className="case-turntable" aria-label={`Повернуть контейнер «${name}»`}
    aria-description="Потяните в сторону или нажмите для поворота. Стрелки — поворот, Home — исходный ракурс."
    onPointerDown={event => {
      if (!event.isPrimary || event.button !== 0) return;
      cancelStep.current();
      dragged.current = false;
      drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, angle: angle.current };
    }}
    onPointerMove={move} onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release}
    onPointerLeave={event => { if (!event.currentTarget.hasPointerCapture(event.pointerId)) release(event); }}
    onClick={event => { if (!dragged.current || event.detail === 0) step(Math.PI / 4); }}
    onKeyDown={event => {
      if (!['ArrowLeft','ArrowRight','Home'].includes(event.key)) return;
      event.preventDefault();
      if (event.key === 'Home') { cancelStep.current(); turn(0); }
      else step((event.key === 'ArrowLeft' ? -1 : 1) * Math.PI / 9);
    }}/>;
}
