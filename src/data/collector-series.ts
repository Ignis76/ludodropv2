import type { Case, ContainerKind } from '../types';

function series(kind: ContainerKind, entries: [id: string, name: string, subtitle: string, price: number, color: string][]): Case[] {
  return entries.map(([id, name, subtitle, price, color]) => ({
    id, name, subtitle, price, color, accent: color, containerKind: kind,
    category: kind === 'pin-pack' ? 'collection' : 'budget', art: 0,
    image: `/assets/containers/${id}.webp`,
  }));
}

export const collectorSeries: Case[] = [
  ...series('case', [
    ['case-cs20', 'CS20', 'Юбилейные раскраски и классические ножи', 49, '#cda43c'],
    ['case-fracture', 'Разлом', 'Коллекция Fracture и четыре вида ножей', 35, '#a897ce'],
    ['case-broken-fang', 'Сломанный клык', 'Коллекция операции Broken Fang и перчатки', 99, '#a3ad73'],
  ]),
  ...series('capsule', [
    ['capsule-chicken', 'Курочки', 'Пернатые талисманы Counter-Strike', 15, '#e7ad52'],
    ['capsule-cs20', '20 лет Counter-Strike', 'Юбилейная коллекция наклеек CS20', 4, '#c8a65a'],
    ['capsule-espionage', 'Шпионаж', 'Наклейки из коллекции Espionage', 7, '#74acae'],
    ['capsule-skill-groups', 'Звания', 'От серебра до всемирной элиты', 9, '#95abd8'],
    ['capsule-poorly-drawn', 'Плохо нарисованная', 'Агенты и курица в рисунках от руки', 39, '#dd8b72'],
    ['capsule-boardroom', 'Зал заседаний', 'Наклейки из коллекции The Boardroom', 19, '#7eaeb7'],
  ]),
  ...series('pin-pack', [
    ['pins-series-1', 'Пины · Серия 1', 'Первая серия коллекционных значков', 279, '#bc9b64'],
    ['pins-series-2', 'Пины · Серия 2', 'Вторая серия коллекционных значков', 329, '#8bb39e'],
    ['pins-series-3', 'Пины · Серия 3', 'Третья серия коллекционных значков', 249, '#94abca'],
  ]),
];
