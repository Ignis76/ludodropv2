import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronsRight, Diamond, Volume2 } from 'lucide-react';
import { Coin } from './components';
import { round, type GoldUpgradePayout } from './engine';
import type { Skin } from './types';
import { FAST_RATE, FILM_DURATION, POSTER_URLS, easeBetween, transferFrame } from './upgrade-film-motion';
import { preparePrizeArt, type UpgradeSprite } from './upgrade-film-stage';
import { makeUpgradeTransfer } from './upgrade-film-transfer';
import './upgrade-cinematic.css';

type FilmProps = {
  active: boolean; fast: boolean; volume: number; inputs: Skin[]; contribution: number;
  landing: number; target: Skin; payout: GoldUpgradePayout; onDelivery: () => void; onFinish: () => void;
};

function sourceName(inputs: Skin[]) {
  if (inputs.length === 1) return inputs[0].name;
  return inputs.length === 5 ? '5 предметов' : `${inputs.length} предмета`;
}

export function UpgradeCinematic({ active, fast, volume, inputs, contribution, landing, target, payout, onDelivery, onFinish }: FilmProps) {
  const { skin, remainder, multiplier } = payout;
  const stake = round(inputs.reduce((total, item) => total + item.price, contribution));
  const art = useMemo(() => new Map<string, UpgradeSprite>(), [target, skin]);
  const dialog = useRef<HTMLDialogElement>(null), media = useRef<HTMLVideoElement>(null);
  const picture = useRef<HTMLDivElement>(null), still = useRef<HTMLImageElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null), numeral = useRef<HTMLImageElement>(null);
  const skip = useRef<HTMLButtonElement>(null), equation = useRef<HTMLElement>(null);
  const [soundBlocked, setSoundBlocked] = useState(false);

  useLayoutEffect(() => {
    let mounted = true;
    for (const entry of new Map([target, skin].map(s => [s.image, s])).values()) {
      void preparePrizeArt(entry).then(sprite => {
        if (mounted && sprite) art.set(entry.image, sprite);
      }).catch(() => {});
    }
    return () => { mounted = false; };
  }, [target, skin, art]);

  useLayoutEffect(() => {
    if (media.current) {
      media.current.volume = volume; media.current.muted = !volume || soundBlocked;
    }
  }, [volume, soundBlocked]);

  useLayoutEffect(() => {
    const surface = dialog.current, film = media.current, glass = canvas.current;
    const windowFrame = picture.current, type = numeral.current, poster = still.current;
    if (!active || !surface || !film || !glass || !windowFrame || !type || !poster) return;
    surface.show(); skip.current?.focus({ preventScroll: true });
    const stage = surface.parentElement;
    const field = surface.getBoundingClientRect(), dial = stage?.querySelector('.probability-dial')?.getBoundingClientRect();
    const origin = dial ? `${dial.x + dial.width / 2 - field.x}px ${dial.y + dial.height / 2 - field.y}px` : '50% 50%';
    const opening = dial && surface.animate ? surface.animate([
      { clipPath: `circle(${dial.width / 2}px at ${origin})`, opacity: .67 },
      { clipPath: `circle(${Math.hypot(field.width, field.height)}px at ${origin})`, opacity: 1 },
    ], { duration: fast ? 215 : 310, easing: 'cubic-bezier(.22,.67,.22,1)' }) : undefined;
    const painter = makeUpgradeTransfer(glass, windowFrame, surface, target, skin, landing, multiplier, type, art);
    const rate = fast ? FAST_RATE : 1;
    film.playbackRate = rate;
    let elapsed = 0, last = performance.now(), lastMedia = -1, lastAdvanced = last;
    let stopped = false, frozen = false, unavailable = !!film.error, running = false, callback = 0;
    let fallback = unavailable, previousPhase = '', lastPoster = -1, receiptReady = false;
    const styles = new Map<string, number>();
    const readouts = Array.from(surface.querySelectorAll<HTMLElement>('[data-readout]'));
    function set(name: string, value: number) {
      if (styles.get(name) === value) return;
      surface!.style.setProperty(name, String(value)); styles.set(name, value);
    }
    function paint(time: number) {
      const pose = transferFrame(time);
      if (pose.phase !== previousPhase) {
        surface!.dataset.shot = pose.phase; previousPhase = pose.phase;
        for (const el of readouts) el.hidden = el.dataset.readout !== pose.phase;
      }
      if (fallback && lastPoster !== pose.shot) {
        poster!.src = POSTER_URLS[pose.shot]; lastPoster = pose.shot;
      }
      const hideEquation = pose.mint <= 0 || pose.phase !== 'target';
      if (equation.current && equation.current.hidden !== hideEquation) {
        equation.current.hidden = hideEquation; surface!.dataset.minted = String(!hideEquation);
      }
      // Install the same, already settled award underneath the film before its flight starts.
      if (!receiptReady && time >= FILM_DURATION - 1) { receiptReady = true; onDelivery(); }
      painter.paint(time, pose, fallback);
      set('--scene', pose.background); set('--legend', pose.label * pose.background);
      set('--gain', pose.mint);
      if (pose.delivery > 0) stage?.style.setProperty('--native-prize', String(easeBetween(.72, 1, pose.delivery)));
    }
    function finish() { if (!stopped) { stopped = true; onFinish(); } }
    function frame(now: number) {
      if (stopped || !running) return;
      const dt = (now - last) / 1000; last = now;
      const mediaTime = film!.currentTime;
      if (mediaTime > lastMedia + .001) { lastAdvanced = now; lastMedia = mediaTime; }
      const mediaLive = !unavailable && !film!.paused && film!.readyState >= 2 && now - lastAdvanced < 320;
      if (mediaLive) {
        if (!film!.seeking && Math.abs(mediaTime - elapsed) > .45) film!.currentTime = Math.min(elapsed, FILM_DURATION - .01);
        else if (!film!.seeking) elapsed = Math.max(elapsed, mediaTime);
      } else elapsed += dt * rate;
      fallback = unavailable || now - lastAdvanced > 480;
      surface!.classList.toggle('film-fallback', fallback); paint(elapsed);
      if (elapsed >= FILM_DURATION - .012) finish();
      else callback = requestAnimationFrame(frame);
    }
    function suspend() { running = false; cancelAnimationFrame(callback); film!.pause(); }
    function start() {
      if (stopped || frozen || document.hidden || running) return;
      running = true; last = lastAdvanced = performance.now();
      if (!unavailable) {
        if (film!.readyState >= 1 && Math.abs(film!.currentTime - elapsed) > .1) film!.currentTime = elapsed;
        void film!.play().catch((err: DOMException) => {
          if (stopped || !running || err.name === 'AbortError') return;
          if (err.name === 'NotAllowedError' && !film!.muted) {
            film!.muted = true; setSoundBlocked(true);
            void film!.play().catch(() => { if (running) unavailable = true; });
          } else unavailable = true;
        });
      }
      callback = requestAnimationFrame(frame);
    }
    const resize = () => { painter.resize(); paint(elapsed); };
    const observer = new ResizeObserver(resize); observer.observe(surface); observer.observe(windowFrame);
    const visibility = () => document.hidden ? suspend() : start();
    const freeze = () => { frozen = true; suspend(); };
    const thaw = () => { frozen = false; start(); };
    const failed = () => { unavailable = true; };
    const seek = () => { if (!running && !stopped) { elapsed = film.currentTime; paint(elapsed); } };
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(); } };
    surface.classList.toggle('film-fallback', fallback); resize(); start();
    film.addEventListener('ended', finish); film.addEventListener('error', failed); film.addEventListener('seeked', seek);
    document.addEventListener('visibilitychange', visibility); document.addEventListener('keydown', escape, true);
    document.addEventListener('freeze', freeze); document.addEventListener('resume', thaw);
    window.addEventListener('pagehide', freeze); window.addEventListener('pageshow', thaw);
    return () => {
      stopped = true; suspend(); opening?.cancel(); observer.disconnect();
      stage?.style.removeProperty('--native-prize');
      film.removeEventListener('ended', finish); film.removeEventListener('error', failed); film.removeEventListener('seeked', seek);
      document.removeEventListener('visibilitychange', visibility); document.removeEventListener('keydown', escape, true);
      document.removeEventListener('freeze', freeze); document.removeEventListener('resume', thaw);
      window.removeEventListener('pagehide', freeze); window.removeEventListener('pageshow', thaw); surface.close();
    };
  }, [active, fast, target, skin, multiplier, landing, art, onDelivery, onFinish]);

  return <dialog ref={dialog} className="upgrade-film" aria-label="Золотой апгрейд"
    onCancel={e => { e.preventDefault(); onFinish(); }}>
    <div className="upgrade-film-frame">
      <div ref={picture} className="upgrade-film-picture" data-landing={landing} aria-hidden="true">
        <img ref={still} className="upgrade-film-poster" src={POSTER_URLS[0]} alt=""/>
        <video ref={media} preload="auto" playsInline disablePictureInPicture poster={POSTER_URLS[0]}>
          <source src="/assets/upgrade-film/induction-mobile.mp4" type="video/mp4" media="(max-width: 700px)"/>
          <source src="/assets/upgrade-film/induction.mp4" type="video/mp4"/>
          <source src="/assets/upgrade-film/induction.webm" type="video/webm"/>
        </video>
      </div>
      <div className="upgrade-film-grade" aria-hidden="true"/>
      <img ref={numeral} src={`/assets/upgrade-film/multiplier-${multiplier}.webp`} alt="" hidden/>
      <canvas ref={canvas} className="upgrade-film-glass" aria-hidden="true"/>
      <div className="upgrade-film-top">
        <span><Diamond size={15} aria-hidden="true"/>Золотая зона</span>
        <div className="upgrade-film-controls">
          {soundBlocked && volume > 0 && <button type="button" aria-label="Включить звук" onClick={() => {
            const film = media.current;
            if (!film) return;
            film.muted = false;
            void film.play().then(() => setSoundBlocked(false)).catch(() => { film.muted = true; });
          }}><Volume2 size={16}/></button>}
          <button ref={skip} type="button" onClick={onFinish}>Пропустить<ChevronsRight size={15} aria-hidden="true"/></button>
        </div>
      </div>
      <section className="upgrade-film-display" role="status" aria-atomic="true">
        <div data-readout="stake" className="wing-input">
          <span className="upgrade-film-eyebrow">Твоя ставка{inputs.length === 1 && <> · {inputs[0].weapon}</>}</span>
          <div className="upgrade-film-stake"><strong>{sourceName(inputs)}</strong>
            <div className="upgrade-film-thumbs">{inputs.map((s, index) => <img key={index} src={s.image} alt={s.weapon + ' | ' + s.name}/>)}</div>
          </div>
          <div className="upgrade-film-amount"><Coin value={stake}/>
            {contribution > 0 && <small>С баланса <Coin value={contribution}/></small>}
          </div>
        </div>
        <div data-readout="target" className="wing-target" hidden>
          <span className="upgrade-film-eyebrow">Цель апгрейда · {target.weapon}</span>
          <strong>{target.name}</strong>
          <div className="upgrade-film-base"><Coin value={target.price}/></div>
          <small ref={equation} className="upgrade-film-equation" hidden><Coin value={target.price}/> <i>×</i> {multiplier} <i>=</i> <Coin value={payout.total}/></small>
        </div>
        <div data-readout="award" className="upgrade-film-caption" hidden>
          <p className="upgrade-film-multiplier"><span>{skin.weapon}</span><b>×{multiplier}</b></p>
          <h2>{skin.name}</h2>
          <div className="upgrade-film-value"><Coin value={skin.price}/>
            {remainder > 0 && <small>+<Coin value={remainder}/> на баланс</small>}
          </div>
        </div>
      </section>
      <div className="upgrade-film-receipt">
        <img src={target.image} alt=""/><div><span>Цель апгрейда</span><strong>{target.weapon} | {target.name}</strong></div>
      </div>
    </div>
  </dialog>;
}
