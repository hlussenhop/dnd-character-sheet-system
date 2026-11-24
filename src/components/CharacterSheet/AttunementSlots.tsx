import React from 'react';
import { Sparkles, Star } from 'lucide-react';
import { Character } from '../../types/dnd';
import { useMagicItemIndex } from '../../hooks/useMagicItemIndex';
import { attunedItemCount, attunementSlotCount } from '../../utils/magicItemInventory';

interface AttunementSlotsProps {
  character: Character;
}

export const AttunementSlots: React.FC<AttunementSlotsProps> = ({ character }) => {
  const index = useMagicItemIndex();
  const maxSlots = attunementSlotCount(character);
  const usedSlots = attunedItemCount(character);
  const attunedItems = character.inventory?.filter(item => item.attuned) ?? [];
  const names = new Map((index ?? []).map(item => [item.slug, item.name]));

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-bold text-accent-yellow-light flex items-center gap-2">
        <Sparkles className="w-5 h-5" />
        Attunement
      </h3>

      <div className="text-center">
        <div className="text-3xl font-bold text-theme-primary">{usedSlots} / {maxSlots}</div>
        <div className="text-sm text-theme-muted">Items attuned</div>
      </div>

      <div className="flex justify-center gap-2 flex-wrap">
        {Array.from({ length: maxSlots }, (_, index) => (
          <div
            key={index}
            className={`w-8 h-8 rounded-full border-2 flex items-center justify-center ${
              index < usedSlots
                ? 'bg-accent-yellow border-yellow-400 text-cyan-900'
                : 'bg-theme-tertiary border-theme-primary text-theme-disabled'
            }`}
          >
            {index < usedSlots ? <Star className="w-4 h-4 fill-current" /> : <span className="text-xs font-bold">{index + 1}</span>}
          </div>
        ))}
      </div>

      {attunedItems.length > 0 && (
        <div className="space-y-1">
          {attunedItems.map(item => {
            const label = (item.magicItemSlug && names.get(item.magicItemSlug)) || item.magicItemSlug || item.equipmentSlug;
            return (
              <div key={item.magicItemSlug || item.equipmentSlug} className="flex items-center gap-2 p-2 bg-theme-secondary/50 rounded">
                <Star className="w-4 h-4 text-accent-yellow-light fill-current" />
                <span className="text-sm text-theme-tertiary">{label}</span>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-xs text-theme-disabled text-center">
        A character attunes to three magic items. An artificer attunes to four at level 10, five at level 14, and six at level 18.
      </p>
    </div>
  );
};
