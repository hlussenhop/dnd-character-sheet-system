import React from 'react';
import { X } from 'lucide-react';
import type { Equipment } from '../../types/dnd';
import { loadEquipment } from '../../services/dataService';
import { monsterSourceLabel } from '../../utils/monsterUtils';

interface GearDetailProps {
  slug: string | null;
  onClose: () => void;
}

type StoredGear = Equipment & { source?: string };

export const GearDetail: React.FC<GearDetailProps> = ({ slug, onClose }) => {
  if (!slug) return null;
  const item = (loadEquipment() as StoredGear[]).find(entry => entry.slug === slug);
  if (!item) return null;

  const description = item.description && item.description !== item.equipment_category ? item.description : '';
  const properties = item.properties?.map(property => property.name).join(', ');

  return (
    <div className="fixed inset-0 backdrop-blur-md flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-theme-secondary border border-theme-primary rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        onClick={event => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 p-6 border-b border-theme-primary">
          <div>
            <h2 className="text-xl font-bold text-theme-primary">{item.name}</h2>
            <p className="text-sm text-theme-muted mt-1">
              {item.equipment_category} · {item.year} · {monsterSourceLabel(item.source)}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-theme-tertiary rounded-lg" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 space-y-3 text-sm text-theme-primary">
          <p>
            {item.cost ? `${item.cost.quantity} ${item.cost.unit}` : 'No listed price'}
            {item.weight ? ` · ${item.weight} lb.` : ''}
          </p>
          {item.damage && <p>Damage: {item.damage.damage_dice} {item.damage.damage_type}</p>}
          {item.armor_class && <p>Armor class: {item.armor_class.base}{item.armor_category ? ` (${item.armor_category})` : ''}</p>}
          {properties && <p>Properties: {properties}</p>}
          {item.mastery && <p>Mastery: {item.mastery.name}</p>}
          {description && <p className="leading-relaxed whitespace-pre-wrap">{description}</p>}
        </div>
      </div>
    </div>
  );
};
