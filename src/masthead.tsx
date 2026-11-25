import { useEffect, useRef, useState } from 'react';
import type { MouseEvent, ReactNode } from 'react';
import { ArrowUpRight, Box, ChartNoAxesCombined, ChevronDown, CircleUserRound, Disc3, FileSignature, Gamepad2, Gem, Layers3, Maximize, Menu, Minimize, TrendingUp, X } from 'lucide-react';
import type { Navigate } from './App';
import type { Route } from './types';
import { useStore } from './store';

export const mainSections = [
  { id: 'cases', label: 'Кейсы', icon: Box },
  { id: 'skins', label: 'Предметы', icon: Layers3 },
] as const;
export const gameSections = [
  { id: 'upgrade', label: 'Апгрейд', icon: TrendingUp },
  { id: 'crash', label: 'Краш', icon: ChartNoAxesCombined },
  { id: 'wheel', label: 'Рулетка', icon: Disc3 },
  { id: 'mines', label: 'Мины', icon: Gem },
  { id: 'contracts', label: 'Контракты', icon: FileSignature },
] as const;

export function Wordmark() {
  return <><img src="/favicon.svg" width="40" height="34" alt=""/><span>Ludo<b>Drop</b></span></>;
}

export function Masthead({ active, go, tools, onSound }: { active: Route; go: Navigate; tools: ReactNode; onSound: () => void }) {
  const { toast } = useStore();
  const [open, setOpen] = useState<'games' | 'menu' | null>(null);
  const [fullscreen, setFullscreen] = useState(() => !!document.fullscreenElement);
  useEffect(() => {
    const sync = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);
  async function toggleFullscreen() {
    setOpen(null);
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      toast('Браузер ограничил переход в полноэкранный режим', 'error');
    }
  }
  const screenLabel = fullscreen ? 'Выйти из полноэкранного режима' : 'На весь экран';
  const ScreenIcon = fullscreen ? Minimize : Maximize;
  const header = useRef<HTMLElement>(null);
  const gamesToggle = useRef<HTMLButtonElement>(null);
  const menuToggle = useRef<HTMLButtonElement>(null);
  const isGame = gameSections.some(section => section.id === active);
  useEffect(() => {
    if (!open) return;
    const dismiss = () => setOpen(null);
    const outside = (event: PointerEvent) => {
      if (!header.current?.contains(event.target as Node)) dismiss();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      (open === 'games' ? gamesToggle : menuToggle).current?.focus();
      dismiss();
    };
    const breakpoint = matchMedia('(max-width: 850px)');
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    window.addEventListener('hashchange', dismiss);
    breakpoint.addEventListener('change', dismiss);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
      window.removeEventListener('hashchange', dismiss);
      breakpoint.removeEventListener('change', dismiss);
    };
  }, [open]);
  function visit(event: MouseEvent<HTMLAnchorElement>, id: Route) {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    setOpen(null);
    go(id);
  }
  function pageLink(id: Route, label: string, icon?: ReactNode, className?: string) {
    return <a key={id} className={className} href={'#' + id} aria-current={active === id ? 'page' : undefined} onClick={e => visit(e, id)}>
      {icon}<span>{label}</span>
    </a>;
  }
  const gameLinks = gameSections.map(({ id, label, icon: Icon }) =>
    <a key={id} className="mast-game-link" href={'#' + id} aria-current={active === id ? 'page' : undefined} onClick={e => visit(e, id)}>
      <span><Icon size={18} aria-hidden="true"/>{label}</span><ArrowUpRight size={14} aria-hidden="true"/>
    </a>);
  return <header className="masthead" ref={header} onPointerMove={event => {
    if (event.pointerType !== 'mouse') return;
    const bar = event.currentTarget;
    const bounds = bar.getBoundingClientRect();
    bar.style.setProperty('--glint-x', ((event.clientX - bounds.left) / bounds.width * 100).toFixed(1) + '%');
  }} onPointerLeave={event => event.currentTarget.style.removeProperty('--glint-x')} onBlur={e => {
    if (e.relatedTarget && !e.currentTarget.contains(e.relatedTarget)) setOpen(null);
  }}>
    <div className="mast-inner">
      <a className="ld-brand" href="#cases" aria-label="LudoDrop, главная" onClick={e => visit(e, 'cases')}><Wordmark/></a>
      <nav className="mast-primary" aria-label="Главная навигация">
        {mainSections.map(({ id, label, icon: Icon }) => pageLink(id, label, <Icon size={17} aria-hidden="true"/>))}
        {gameSections.filter(section => section.id === 'upgrade' || section.id === 'contracts').map(({ id, label, icon: Icon }) => pageLink(id, label, <Icon size={17} aria-hidden="true"/>, 'mast-shortcut'))}
        <div className="mast-disclosure">
          <button className={isGame ? 'active' : ''} aria-expanded={open === 'games'} aria-controls="desktop-games" ref={gamesToggle} onClick={() => setOpen(open === 'games' ? null : 'games')}><Gamepad2 size={18} aria-hidden="true"/><span>Режимы <ChevronDown size={13} aria-hidden="true"/></span></button>
          {open === 'games' && <div className="mast-games" id="desktop-games">{gameLinks}</div>}
        </div>
      </nav>
      <div className="mast-tools" onClick={() => setOpen(null)}>
        {document.fullscreenEnabled && <button type="button" className="bar-audio screen-toggle" aria-label={screenLabel} title={screenLabel} onClick={toggleFullscreen}><ScreenIcon size={17}/></button>}
        {tools}
      </div>
      <button className="mast-toggle" ref={menuToggle} aria-label={open === 'menu' ? 'Закрыть меню' : 'Открыть меню'} aria-expanded={open === 'menu'} aria-controls="mobile-sections" onClick={() => setOpen(open === 'menu' ? null : 'menu')}>
        {open === 'menu' ? <X/> : <Menu/>}
      </button>
    </div>
    {open === 'menu' && <nav className="mast-mobile" id="mobile-sections" aria-label="Разделы сайта">
      <div className="mast-mobile-primary">{mainSections.map(({ id, label, icon: Icon }) => pageLink(id, label, <Icon size={17}/>))}{pageLink('profile', 'Профиль', <CircleUserRound size={17}/>)}</div>
      <h2>Игровые режимы</h2>
      <div className="mast-mobile-games">{gameLinks}</div>
      {document.fullscreenEnabled && <button type="button" className="mast-mobile-audio" onClick={() => { menuToggle.current?.focus(); void toggleFullscreen(); }}>{screenLabel}<ScreenIcon size={15}/></button>}
      <button className="mast-mobile-audio" onClick={() => { setOpen(null); menuToggle.current?.focus(); onSound(); }}>Громкость и звук <ArrowUpRight size={15}/></button>
    </nav>}
  </header>;
}
