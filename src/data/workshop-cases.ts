import type { Case } from '../types';

const editions: Pick<Case, 'id' | 'name' | 'subtitle' | 'price' | 'color' | 'category'>[] = [
  { id: 'foundry', name: 'Литейный цех', subtitle: 'Медь, окалина и раскалённая сталь', price: 159, color: '#df7441', category: 'collection' },
  { id: 'relay', name: 'Радиорелейная', subtitle: 'Печатные платы и полевая электроника', price: 39, color: '#91b65b', category: 'budget' },
  { id: 'pelagic', name: 'Батискаф', subtitle: 'Морские хищники и краски океанских глубин', price: 69, color: '#4bbac6', category: 'budget' },
  { id: 'aperture', name: 'Диафрагма', subtitle: 'Призмы, цветные стёкла и оптические иллюзии', price: 469, color: '#b192d7', category: 'collection' },
  { id: 'salt-flat', name: 'Солончак', subtitle: 'Песчаный камуфляж и узоры пустыни', price: 49, color: '#d6b476', category: 'budget' },
  { id: 'signal-flag', name: 'Семафор', subtitle: 'Сигнальный красный, полосы и контрастная разметка', price: 89, color: '#de6858', category: 'budget' },
  { id: 'polar-night', name: 'Полярная ночь', subtitle: 'Ледяные трещины и оттенки северного сияния', price: 249, color: '#7099df', category: 'collection' },
  { id: 'blackbird', name: 'Чёрный дрозд', subtitle: 'Авиационная графика и графитовый ламинат', price: 999, color: '#a5aab1', category: 'premium' },
];

export const workshopCases: Case[] = editions.map(item => ({
  ...item, containerKind: 'case', accent: item.color, art: 0,
  image: `/assets/cases/workshop/${item.id}.webp`,
}));
