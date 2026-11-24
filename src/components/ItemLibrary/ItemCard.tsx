import React from 'react';
import type { LibraryItem } from '../../utils/itemLibrary';
import { monsterSourceLabel } from '../../utils/monsterUtils';

interface ItemCardProps {
  item: LibraryItem;
  onView: () => void;
}

export const ItemCard: React.FC<ItemCardProps> = ({ item, onView }) => (
  <button
    type="button"
    onClick={onView}
    className="text-left bg-theme-secondary border border-theme-primary rounded-xl p-4 hover:bg-theme-tertiary transition-colors"
  >
    <div className="flex items-start justify-between gap-3">
      <h3 className="font-bold text-theme-primary">{item.name}</h3>
      <span className="text-xs px-2 py-0.5 rounded bg-theme-tertiary text-theme-secondary shrink-0">{item.edition}</span>
    </div>
    <p className="text-sm text-theme-secondary mt-2 capitalize">
      {item.kind === 'magic' ? item.rarity : 'Gear'} · {item.category}
    </p>
    <p className="text-xs text-theme-muted mt-2">
      {item.summary} · {monsterSourceLabel(item.source)}
      {item.attunement ? ' · Attunement' : ''}
    </p>
  </button>
);
