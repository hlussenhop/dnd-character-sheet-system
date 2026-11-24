import React from 'react';
import { Species, SpeciesVariant } from '../../../types/dnd';
import { formatAbilityPattern, getChoosableAbilities } from '../../../utils/speciesAbilityUtils';

interface SpeciesVariantSelectorProps {
  species: Pick<Species, 'name'> & { variantOptional?: boolean };
  variants: SpeciesVariant[];
  selectedSlug?: string;
  onSelect: (variantSlug: string | undefined) => void;
}

const describeAbilities = (variant: SpeciesVariant): string => {
  const parts = Object.entries(variant.ability_bonuses ?? {})
    .filter(([, v]) => v)
    .map(([a, v]) => `${a} +${v}`);
  if (variant.abilityChoice) {
    const from = getChoosableAbilities(variant.abilityChoice, variant.ability_bonuses ?? {});
    const scope = variant.abilityChoice.from ? ` from ${from.join(', ')}` : '';
    parts.push(`choose ${variant.abilityChoice.patterns.map(formatAbilityPattern).join(' or ')}${scope}`);
  }
  return parts.join(', ');
};

/**
 * Generic Step 2 picker for species that have selectable variants (subraces, Genasi
 * elements, Dragonmarks, ...). Human uses HumanVariantSelector instead.
 */
export const SpeciesVariantSelector: React.FC<SpeciesVariantSelectorProps> = ({
  species,
  variants,
  selectedSlug,
  onSelect,
}) => {
  const optional = !!species.variantOptional;

  return (
    <div className="space-y-3 p-4 bg-theme-tertiary/50 border border-theme-primary rounded-lg" data-testid="species-variant-selector">
      <h5 className="font-semibold text-accent-yellow-light">
        {species.name} Variant{optional ? ' (optional)' : ''}
      </h5>
      <div className="space-y-2" role="radiogroup" aria-label={`${species.name} variant`}>
        {optional && (
          <label className="flex items-start gap-3 p-3 border border-theme-primary rounded cursor-pointer hover:bg-theme-quaternary/40">
            <input
              type="radio"
              name="speciesVariant"
              checked={!selectedSlug}
              onChange={() => onSelect(undefined)}
              className="mt-1"
            />
            <div>
              <div className="font-semibold text-theme-primary">Standard {species.name}</div>
              <div className="text-xs text-theme-muted">No variant.</div>
            </div>
          </label>
        )}
        {variants.map(variant => {
          const abilities = describeAbilities(variant);
          return (
            <label
              key={variant.slug}
              className={`flex items-start gap-3 p-3 border rounded cursor-pointer transition-colors ${
                selectedSlug === variant.slug
                  ? 'border-accent-yellow-light bg-theme-quaternary'
                  : 'border-theme-primary hover:bg-theme-quaternary/40'
              }`}
            >
              <input
                type="radio"
                name="speciesVariant"
                checked={selectedSlug === variant.slug}
                onChange={() => onSelect(variant.slug)}
                className="mt-1"
              />
              <div className="flex-1">
                <div className="font-semibold text-theme-primary">{variant.name}</div>
                {variant.description && <div className="text-sm text-theme-muted mb-1">{variant.description}</div>}
                {abilities && <div className="text-xs text-theme-disabled">Ability scores: {abilities}</div>}
                {variant.species_traits.length > 0 && (
                  <div className="text-xs text-theme-disabled">Traits: {variant.species_traits.join(', ')}</div>
                )}
                {variant.replacesTraits && variant.replacesTraits.length > 0 && (
                  <div className="text-xs text-theme-disabled">Replaces: {variant.replacesTraits.join(', ')}</div>
                )}
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );
};
