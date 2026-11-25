import { useId } from 'react';
import type { CaseScenery } from './courtyard-poster';
import './case-scenery-picker.css';

const locations = [
  { id: 'workshop', name: 'Мастерская', preview: '/assets/cases/features/scenery-workshop-thumb.webp' },
  { id: 'summit', name: 'Вершина', preview: '/assets/cases/features/scenery-summit-thumb.webp' },
] as const;

type Props = {
  value: CaseScenery;
  onChange: (value: CaseScenery) => void;
};

export function CaseSceneryPicker({ value, onChange }: Props) {
  const group = useId();
  return <div className="case-scenery-picker" role="radiogroup" aria-label="Фон открытия">
    <div className="case-scenery-choices">
      {locations.map(location => <label key={location.id} className="case-scenery-choice">
        <input type="radio" name={group} value={location.id} checked={value === location.id} onChange={() => onChange(location.id)}/>
        <span className="case-scenery-tile">
          <span className="case-scenery-thumbnail" aria-hidden="true">
            <img src={location.preview} alt="" draggable={false} decoding="async" fetchPriority="low"/>
          </span>
          <span>{location.name}</span>
        </span>
      </label>)}
    </div>
  </div>;
}
