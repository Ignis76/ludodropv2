import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CircleHelp, Coins, History, Plus, Volume2, VolumeX } from 'lucide-react';
import { cases } from './data/cases';
import { StoreProvider, useStore } from './store';
import { WalletDialog } from './wallet';
import { OFFICE_PROMO_CODE, officePromoStatus } from './wallet-offer';
import { getAudioVolume, preloadCaseSounds, setAudioVolume, sound } from './audio';
import { Empty, Modal, money } from './components';
import { CasePage } from './case-pages';
import { MinesPage, UpgradePage } from './games';
import { ContractsPage } from './contracts';
import { CrashPage } from './crash';
import { WheelPage } from './wheel';
import { Home } from './home';
import { LootStrip } from './loot-strip';
import { gameSections, mainSections, Masthead, Wordmark } from './masthead';
import { SkinLibrary } from './skin-library';
import { ProfilePage } from './profile';
import type { Route } from './types';
import { useReducedMotion } from './use-reduced-motion';

export type Navigate = (route: Route, id?: string) => void;
const compactCredits = new Intl.NumberFormat('ru-RU', { notation: 'compact', maximumFractionDigits: 1 });
function readRoute(): { name: Route; id?: string } {
  const [route, id] = location.hash.slice(1).split('/');
  if (route === 'inventory') return { name: 'profile', id: 'inventory' };
  return [...mainSections, ...gameSections].some(s => s.id === route) || route === 'case' || route === 'profile' ? { name: route as Route, id } : { name: 'cases' };
}
function Balance({ amount }: { amount: number }) {
  const reduced = useReducedMotion();
  const [display, setDisplay] = useState(amount);
  const current = useRef(amount);
  useEffect(() => {
    const from = current.current;
    const start = performance.now();
    let frame = 0;
    function step(now: number) {
      const p = Math.max(0, Math.min(1, (now - start) / 230));
      current.current = from + (amount - from) * (1 - (1 - p) ** 3);
      setDisplay(p === 1 ? amount : Math.round(current.current));
      if (p < 1) frame = requestAnimationFrame(step);
    }
    if (reduced || from === amount) { current.current = amount; setDisplay(amount); }
    else frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [amount, reduced]);
  return <span className="mast-credit" aria-hidden="true"><Coins size={19}/><span className="mast-credit-figures"><small>Баланс</small>
    <b className="credit-full">{money(display)}</b><b className="credit-short">{display < 100000 ? money(display) : compactCredits.format(display)}</b></span>
  </span>;
}
export default function App() { return <StoreProvider><Shell/></StoreProvider>; }
function Shell() {
  const { player, update, busy, setBusy, toast } = useStore();
  const [route, setRoute] = useState(readRoute);
  const previousRoute = useRef(route);
  useLayoutEffect(() => {
    if (route.name === 'profile' && route.id === 'inventory') {
      if (location.hash.split('/', 1)[0] === '#inventory') history.replaceState(history.state, '', '#profile/inventory');
      const inventory = document.getElementById('profile-inventory');
      inventory?.scrollIntoView({ block: 'start', behavior: 'instant' });
      inventory?.focus({ preventScroll: true });
    } else if (previousRoute.current !== route) {
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
    previousRoute.current = route;
  }, [route]);
  const [modal, setModal] = useState<'wallet' | 'promo-wallet' | 'help' | 'history' | 'sound' | null>(null);
  const [volume, setVolume] = useState(getAudioVolume);
  // Case rewards are saved before their presentation starts. Other modes retain their round lock.
  const navigationLocked = busy && route.name !== 'case';
  const drawingResult = busy && (route.name === 'upgrade' || route.name === 'contracts');
  const revealedHistory = useRef(player.history);
  useEffect(() => {
    if (!drawingResult) revealedHistory.current = player.history;
  }, [drawingResult, player.history]);
  const historyEntries = drawingResult ? revealedHistory.current : player.history;
  useEffect(() => { void preloadCaseSounds(); }, []);
  const showRoute = useCallback((next: ReturnType<typeof readRoute>) => {
    // Release the opening animation lock in the same render as the route change.
    if (route.name === 'case' && (next.name !== 'case' || next.id !== route.id)) setBusy(false);
    setModal(null);
    setRoute(next);
  }, [route, setBusy]);
  const go: Navigate = (name, id) => {
    if (navigationLocked) { toast('Дождись завершения раунда', 'error'); return; }
    sound('click'); showRoute({ name, id });
    const hash = '#' + name + (id ? '/' + id : '');
    if (location.hash !== hash) history.pushState(null, '', hash);
  };
  useEffect(() => {
    const back = () => {
      if (navigationLocked) history.replaceState(null, '', '#' + route.name + (route.id ? '/' + route.id : ''));
      else showRoute(readRoute());
    };
    window.addEventListener('hashchange', back);
    return () => window.removeEventListener('hashchange', back);
  }, [navigationLocked, route, showRoute]);
  const currentCase = cases.find(c => c.id === route.id) || cases[0];
  const active = route.name === 'case' ? 'cases' : route.name;
  const soundIcon = player.sound && volume > 0 ? <Volume2 size={19}/> : <VolumeX size={19}/>;
  return <div className="client">
    <a className="skip-link" href="#main-content" onClick={e => { e.preventDefault(); document.getElementById('main-content')?.focus(); }}>Перейти к содержимому</a>
    <Masthead active={active} go={go} onSound={() => setModal('sound')} tools={<>
      <button className="bar-audio" onClick={() => setModal('sound')} aria-label="Громкость и звук">{soundIcon}</button>
      <button className="balance-control" aria-label={'Баланс ' + money(player.balance) + ' кредитов. Пополнить'} onClick={() => setModal('wallet')}>
        <Balance amount={player.balance}/><i><Plus size={17} strokeWidth={2.6}/></i>
      </button>
      <button className="profile-go" aria-label="Профиль игрока" aria-current={active === 'profile' ? 'page' : undefined} onClick={() => go('profile')}>
        <span className="profile-badge"><img src={'/assets/maps/' + player.profile.emblem + '-emblem.webp'} width="32" height="32" alt=""/></span><span className="profile-caption"><small>Профиль</small><b className="profile-name">{player.profile.nickname}</b></span>
      </button>
    </>}/>
    <div className="work-area">
      <LootStrip go={go}/>
      <div className="client-content">
        <main className="client-main" id="main-content" tabIndex={-1} key={route.name === 'profile' ? 'profile' : route.name + '/' + (route.id || '')}>
          {route.name === 'cases' && <Home go={go} onPromo={() => setModal(officePromoStatus(player) === 'available' ? 'promo-wallet' : 'wallet')}/>}
          {route.name === 'skins' && <SkinLibrary go={go} initialSkinId={route.id}/>}
          {route.name === 'case' && <CasePage item={currentCase} go={go}/>}
          {route.name === 'profile' && <ProfilePage go={go} openPanel={setModal}/>}
          {route.name === 'upgrade' && <UpgradePage go={go} initialItemId={route.id}/>}
          {route.name === 'mines' && <MinesPage go={go}/>}
          {route.name === 'contracts' && <ContractsPage/>}
          {route.name === 'crash' && <CrashPage go={go}/>}
          {route.name === 'wheel' && <WheelPage go={go}/>}
        </main>
        <footer className="client-footer">
          <div className="footer-main"><a className="ld-brand" href="#cases" onClick={e => { e.preventDefault(); go('cases'); }}><Wordmark/></a>
            <p>Кредиты и предметы виртуальные.</p>
            <div className="footer-links"><button onClick={() => setModal('history')}><History size={16}/>История</button><button onClick={() => setModal('help')}><CircleHelp size={16}/>Правила игры</button></div>
          </div>
        </footer>
      </div>
    </div>
    {modal === 'sound' && <Modal icon={<Volume2/>} title="Настройки звука" onClose={() => setModal(null)}><div className="sound-panel"><button onClick={() => update(p => ({ ...p, sound: !p.sound }))} aria-pressed={player.sound}>{soundIcon}{player.sound ? 'Звук включён' : 'Звук выключен'}</button><label><span>Громкость <b>{Math.round(volume * 100)}%</b></span><input type="range" min="0" max="1" step=".01" value={volume} onChange={e => { const n = Number(e.target.value); setAudioVolume(n); setVolume(n); }} onPointerUp={() => sound('click')}/></label></div></Modal>}
    {(modal === 'wallet' || modal === 'promo-wallet') && <WalletDialog
      initialCode={modal === 'promo-wallet' ? OFFICE_PROMO_CODE : undefined} onClose={() => setModal(null)}/>}
    {modal === 'history' && <Modal icon={<History/>} title="История действий" onClose={() => setModal(null)}>{historyEntries.length ? <div className="history-list">{historyEntries.map(h => <div key={h.id}><span><strong>{h.title}</strong><small>{new Date(h.time).toLocaleString('ru-RU')}</small></span><b data-credit={Math.sign(h.amount)}>{h.amount > 0 ? '+' : ''}{h.amount ? money(h.amount) : '·'}</b></div>)}</div> : <Empty title="История пока пуста" text="Здесь появятся открытия, продажи и результаты раундов."/>}</Modal>}
    {modal === 'help' && <Modal icon={<CircleHelp/>} title="Правила игры" onClose={() => setModal(null)}><div className="rules"><p>Начальный баланс — 10 000 виртуальных кредитов. Для первых игровых раундов в инвентаре есть шесть стартовых скинов. Кнопка «+» пополняет баланс бесплатно.</p><h3>Открытие контейнеров</h3><p>Выбери оружейный кейс, капсулу с наклейками или пакет с пином и посмотри вероятности под лентой. При открытии игра списывает стоимость и выдаёт предметы в инвентарь. Можно уйти со страницы, пока идёт анимация. Быстрый режим меняет длительность анимации. Каждый контейнер в серии открывается независимо.</p><h3>Инвентарь и режимы</h3><p>Кредитами можно открыть контейнер или повысить шанс в апгрейде. В рулетке, минах и краше ставь скин из инвентаря. При выигрыше ты получишь самый дорогой скин в пределах выигранной суммы, а остаток зачислится на баланс. В апгрейде и контрактах обменивай предметы, а продать их за кредиты можно в профиле.</p><h3>Сохранение</h3><p>Баланс, предметы, история и настройки сохраняются на этом устройстве. Очистка данных сайта сбрасывает игровой профиль. Все цены выражены в виртуальных кредитах.</p></div></Modal>}
  </div>;
}




