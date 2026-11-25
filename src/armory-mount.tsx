import { Maximize2 } from 'lucide-react';
import { useState } from 'react';
import type { Skin } from './types';

export function ArmoryMount({ skin, onInspect }: { skin: Skin; onInspect: (visible: Skin) => void }) {
  const [shown, setShown] = useState(skin);
  const [failed, setFailed] = useState<string | null>(null);
  const images = shown.id === skin.id ? [shown] : [shown, skin];
  return <button className={'armory-mount rarity-' + shown.rarity} onClick={() => onInspect(shown)} aria-label={'Посмотреть ' + shown.weapon + ' | ' + shown.name} aria-busy={shown.id !== skin.id && skin.id !== failed}>
    {images.map(item => <img key={item.id} src={item.image} alt="" draggable="false" decoding="sync"
      hidden={item.id !== shown.id} onError={() => setFailed(item.id)}
      onLoad={() => { if (item.id === skin.id) { setFailed(null); setShown(item); } }}/>)}
    <span className="mount-plate"><span className="rarity-dot"/>{shown.weapon}<strong>{shown.name}</strong><Maximize2 size={12}/></span>
  </button>;
}
