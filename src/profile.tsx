import { useMemo, useState } from 'react';
import type { CSSProperties, FormEvent } from 'react';
import { ArrowRight, ArrowUpRight, Check, CircleHelp, History, Layers3, MapPin, PackageOpen, Pencil, Plus, Volume2 } from 'lucide-react';
import { ProfileInventory } from './case-pages';
import { Coin, Modal, money } from './components';
import { cases } from './data/cases';
import { emblems, nicknameLimit, validNickname } from './player-identity';
import { skinById, useStore } from './store';
import type { Navigate } from './App';
import './profile.css';

const caseIds = new Map(cases.map(item => [item.name, item.id]));
const stamp = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

function ProfileEditor({ onClose }: { onClose: () => void }) {
  const { player, update, toast } = useStore();
  const [nickname, setNickname] = useState(player.profile.nickname);
  const [emblem, setEmblem] = useState(player.profile.emblem);
  const [error, setError] = useState('');
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validNickname(nickname)) {
      setError('Введи никнейм от 1 до ' + nicknameLimit + ' символов.');
      return;
    }
    const name = nickname.trim();
    const changed = name !== player.profile.nickname || emblem !== player.profile.emblem;
    if (changed && !update(p => ({ ...p, profile: { ...p.profile, nickname: name, emblem } }))) return;
    if (changed) toast('Профиль обновлён');
    onClose();
  }
  return <Modal title="Редактировать профиль" onClose={onClose}>
    <form className="identity-editor" onSubmit={save}>
      <label htmlFor="profile-nickname">Никнейм</label>
      <input id="profile-nickname" value={nickname} maxLength={nicknameLimit} autoComplete="nickname" aria-invalid={!!error}
        aria-describedby={error ? 'nickname-error' : undefined} onChange={e => { setNickname(e.target.value); setError(''); }}/>
      {error && <p id="nickname-error" role="alert">{error}</p>}
      <fieldset><legend>Эмблема и фон профиля</legend>
        <div className="identity-emblems">{emblems.map(option => <button type="button" key={option.id} aria-pressed={emblem === option.id}
          onClick={() => setEmblem(option.id)}><img src={'/assets/maps/' + option.id + '-emblem.webp'} alt=""/><span>{option.name}</span>
          {emblem === option.id && <Check size={14} className="identity-chosen" aria-hidden="true"/>}</button>)}</div>
      </fieldset>
      <div className="identity-editor-actions"><button type="button" className="secondary-button" onClick={onClose}>Отмена</button><button className="primary-button">Сохранить</button></div>
    </form>
  </Modal>;
}

interface ProfilePageProps {
  go: Navigate;
  openPanel: (panel: 'wallet' | 'history' | 'sound' | 'help') => void;
}

export function ProfilePage({ go, openPanel }: ProfilePageProps) {
  const { player } = useStore();
  const [editing, setEditing] = useState(false);
  const { profile, inventory, drops, history } = player;
  const badge = emblems.find(emblem => emblem.id === profile.emblem)!;
  const collectionValue = useMemo(() => inventory.reduce((sum, item) => sum + skinById.get(item.skinId)!.price, 0), [inventory]);
  return <div className="dossier-page">
    <section className="dossier-id" style={{ '--dossier-map': 'url(/assets/maps/' + badge.id + '.webp)' } as CSSProperties} aria-label="Профиль игрока">
      <div className="dossier-cover">
        <div className="dossier-role"><span className="dossier-status-led"/>Профиль игрока</div>
        <div className="dossier-person">
          <div className="dossier-emblem"><img className="dossier-patch" src={'/assets/maps/' + badge.id + '-emblem.webp'} alt={'Эмблема ' + badge.name}/></div>
          <div className="dossier-name"><h1>{profile.nickname}</h1><span className="dossier-number"><b>ID</b> {profile.id}</span></div>
        </div>
        <button className="dossier-edit" onClick={() => setEditing(true)}><Pencil size={15}/>Редактировать профиль</button>
      </div>
      <div className="dossier-map">
        <span className="dossier-place"><MapPin size={13}/>{badge.name}</span>
      </div>
      <dl className="dossier-metrics">
        <div><dt>Открыто контейнеров</dt><dd>{money(player.opened)}</dd></div>
        <div><dt>Предметов в инвентаре</dt><dd>{money(inventory.length)}</dd></div>
        <div><dt>Стоимость инвентаря</dt><dd><Coin value={collectionValue}/></dd></div>
      </dl>
    </section>

    <ProfileInventory go={go}/>

    <div className="dossier-columns">
      <div className="dossier-main">
        <section className="dossier-panel">
          <header className="dossier-heading"><h2>Последние открытия</h2></header>
          {drops.length ? <ul className="dossier-drops">{drops.slice(0, 5).map(drop => {
            const skin = skinById.get(drop.skinId)!;
            const caseId = caseIds.get(drop.caseName);
            return <li key={drop.uid}><div className={'dossier-drop-art rarity-' + skin.rarity}><img src={skin.image} alt="" loading="lazy"/></div>
              <div className="dossier-drop-text"><strong>{skin.weapon} | {skin.name}</strong>{caseId
                ? <button onClick={() => go('case', caseId)}>{drop.caseName} <ArrowUpRight size={12}/></button>
                : <span>{drop.caseName}</span>}</div>
              <div className="dossier-drop-value"><Coin value={skin.price}/><time dateTime={new Date(drop.time).toISOString()}>{stamp.format(drop.time)}</time></div>
            </li>;
          })}</ul> : <div className="dossier-empty"><PackageOpen size={25}/><span>Здесь появятся находки из открытых контейнеров.</span><button onClick={() => go('cases')}>К контейнерам <ArrowRight size={15}/></button></div>}
        </section>
      </div>
      <aside className="dossier-aside">
        <section className="dossier-account">
          <header className="dossier-heading"><h2>Баланс</h2></header>
          <div className="dossier-balance"><Coin value={player.balance}/><button onClick={() => openPanel('wallet')}><Plus size={15}/>Пополнить</button></div>
        </section>
        <section className="dossier-panel dossier-ledger">
          <header className="dossier-heading"><h2>История</h2><button aria-label="Вся история действий" onClick={() => openPanel('history')}>Вся история <ArrowRight size={14}/></button></header>
          {history.length ? <ul>{history.slice(0, 3).map(entry => <li key={entry.id}><div><strong>{entry.title}</strong><time>{stamp.format(entry.time)}</time></div>
            {entry.amount !== 0 && <b className={entry.amount > 0 ? 'gain' : ''}>{entry.amount > 0 ? '+' : ''}{money(entry.amount)}</b>}</li>)}</ul>
            : <p className="dossier-no-history"><History size={17}/>История действий пока пуста.</p>}
        </section>
        <nav className="dossier-links" aria-label="Настройки и разделы профиля">
          <button onClick={() => go('skins')}><Layers3 size={15}/>Каталог предметов <ArrowRight size={13}/></button>
          <button onClick={() => openPanel('sound')}><Volume2 size={15}/>Настройки звука <ArrowRight size={13}/></button>
          <button onClick={() => openPanel('help')}><CircleHelp size={15}/>Правила игры <ArrowRight size={13}/></button>
        </nav>
      </aside>
    </div>
    {editing && <ProfileEditor onClose={() => setEditing(false)}/>}
  </div>;
}
