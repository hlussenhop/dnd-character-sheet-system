import React from 'react';
import type { CharacterCreationData, Species } from '../../../types/dnd';
import {
  getSpeciesChoiceDefs,
  getSpeciesPickSlots,
  sanitizePicks,
} from '../../../utils/speciesGrantUtils';

type GrantChoiceData = Pick<CharacterCreationData, 'edition' | 'selectedSpeciesVariant' | 'speciesChoices' | 'speciesPicks'>;

interface SpeciesGrantChoicesProps {
  species: Pick<Species, 'slug' | 'species_traits' | 'variants' | 'languageChoices'>;
  data: GrantChoiceData;
  /** Skills the character already has from elsewhere (background, fixed species grants); not offered again */
  unavailableSkills?: string[];
  onChange: (patch: Pick<CharacterCreationData, 'speciesChoices' | 'speciesPicks'>) => void;
}

const prettify = (name: string) => name.replace(/([a-z])([A-Z])/g, '$1 $2');

/**
 * Species choices the wizard has to ask for: option choices (Draconic Ancestry, Fiendish Legacy, ...)
 * and skill/tool picks granted by species traits. Controlled by `data`.
 */
export const SpeciesGrantChoices: React.FC<SpeciesGrantChoicesProps> = ({
  species,
  data,
  unavailableSkills = [],
  onChange,
}) => {
  const defs = getSpeciesChoiceDefs(species.slug);
  const slots = getSpeciesPickSlots(species, data.edition, data.selectedSpeciesVariant);
  if (defs.length === 0 && slots.length === 0) return null;

  const choices = data.speciesChoices ?? {};
  const picks = data.speciesPicks ?? {};

  const togglePick = (slotId: string, option: string, count: number) => {
    const slot = slots.find(s => s.id === slotId)!;
    const current = sanitizePicks(slot, picks[slotId]);
    let next: string[];
    if (current.includes(option)) next = current.filter(p => p !== option);
    else if (current.length < count) next = [...current, option];
    else next = [...current.slice(1), option]; // replace the oldest pick when full
    onChange({ speciesChoices: choices, speciesPicks: { ...picks, [slotId]: next } });
  };

  return (
    <div className="space-y-4" data-testid="species-grant-choices">
      {defs.map(def => (
        <div key={def.id} className="p-4 bg-theme-tertiary/50 border border-theme-primary rounded-lg space-y-2">
          <h5 className="font-semibold text-accent-purple-light">{def.label}</h5>
          {def.description && <p className="text-xs text-theme-muted">{def.description}</p>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" role="radiogroup" aria-label={def.label}>
            {def.options.map(option => {
              const active = choices[def.id] === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => onChange({ speciesChoices: { ...choices, [def.id]: option.value }, speciesPicks: picks })}
                  className={`text-left p-2 rounded border text-sm transition-colors ${
                    active
                      ? 'border-accent-purple-light bg-theme-quaternary text-white'
                      : 'border-theme-primary bg-theme-secondary/30 text-theme-primary hover:bg-theme-quaternary/40'
                  }`}
                >
                  <span className="block font-medium">{option.label}</span>
                  {option.description && <span className="block text-xs text-theme-muted">{option.description}</span>}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {slots.map(slot => {
        const chosen = sanitizePicks(slot, picks[slot.id]);
        return (
          <div key={slot.id} className="p-4 bg-theme-tertiary/50 border border-theme-primary rounded-lg space-y-2">
            <h5 className="font-semibold text-accent-green-light">
              {slot.trait}: choose {slot.count} {slot.kind}{slot.count > 1 ? 's' : ''}
              <span className="ml-2 text-xs text-theme-muted">({chosen.length}/{slot.count})</span>
            </h5>
            <div className="flex flex-wrap gap-2">
              {slot.options.map(option => {
                const active = chosen.includes(option);
                const blocked = slot.kind === 'skill' && !active && unavailableSkills.includes(option);
                return (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={active}
                    disabled={blocked}
                    title={blocked ? 'You already have this proficiency' : undefined}
                    onClick={() => togglePick(slot.id, option, slot.count)}
                    className={`px-3 py-1 text-sm rounded border transition-colors ${
                      active
                        ? 'bg-accent-green-dark border-accent-green text-white'
                        : blocked
                          ? 'opacity-40 cursor-not-allowed bg-theme-secondary border-theme-primary text-theme-muted'
                          : 'bg-theme-secondary border-theme-primary text-theme-primary hover:bg-theme-quaternary'
                    }`}
                  >
                    {slot.kind === 'skill' ? prettify(option) : option}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};
