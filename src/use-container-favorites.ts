import { sound } from './audio';
import { useStore } from './store';

export function useContainerFavorites() {
  const { player, update } = useStore();
  function toggleFavorite(id: string) {
    sound('click');
    update(current => ({
      ...current,
      favorites: current.favorites.includes(id) ? current.favorites.filter(key => key !== id) : [...current.favorites, id],
    }));
  }
  return { favorites: player.favorites, toggleFavorite };
}
