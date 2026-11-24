import React from 'react';
import { AbilityName, SpeciesAbilityChoice, SpeciesAbilityChoiceSelection } from '../../../types/dnd';
import {
  AbilityBonusMap,
  buildAbilityChoiceSelection,
  formatAbilityPattern,
  getAbilityChoicePicks,
  getChoosableAbilities,
  validateAbilityChoice,
} from '../../../utils/speciesAbilityUtils';

interface SpeciesAbilityChoiceWidgetProps {
  choice: SpeciesAbilityChoice;
  /** Fixed increases the species already grants (shown for context, not choosable) */
  fixed: AbilityBonusMap;
  selection?: SpeciesAbilityChoiceSelection;
  onChange: (selection: SpeciesAbilityChoiceSelection) => void;
}

/**
 * Lets the player spend a species' flexible ability score increases.
 * Controlled: all state lives in `selection`.
 */
export const SpeciesAbilityChoiceWidget: React.FC<SpeciesAbilityChoiceWidgetProps> = ({
  choice,
  fixed,
  selection,
  onChange,
}) => {
  const pattern = selection?.pattern ?? choice.patterns[0];
  const picks = getAbilityChoicePicks(pattern, selection);
  const choosable = getChoosableAbilities(choice, fixed);
  const validation = validateAbilityChoice(choice, fixed, selection ?? { pattern, bonuses: {} });

  const handlePatternChange = (next: number[]) => {
    onChange({ pattern: next, bonuses: {} });
  };

  const handlePick = (slot: number, value: string) => {
    const next = [...picks];
    const ability = (value || undefined) as AbilityName | undefined;
    // An ability can fill only one slot
    next.forEach((existing, i) => {
      if (ability && existing === ability) next[i] = undefined;
    });
    next[slot] = ability;
    onChange(buildAbilityChoiceSelection(pattern, next));
  };

  const fixedText = Object.entries(fixed)
    .filter(([, v]) => v)
    .map(([a, v]) => `${a} +${v}`)
    .join(', ');

  return (
    <div className="space-y-3 p-4 bg-theme-tertiary/50 border border-theme-primary rounded-lg" data-testid="species-ability-choice">
      <h5 className="font-semibold text-accent-red-light">Ability Score Increases</h5>
      {fixedText && (
        <p className="text-xs text-theme-muted">Fixed: {fixedText}</p>
      )}

      {choice.patterns.length > 1 && (
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Increase distribution">
          {choice.patterns.map(p => {
            const active = p.length === pattern.length && p.every((v, i) => v === pattern[i]);
            return (
              <button
                key={p.join('-')}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => handlePatternChange(p)}
                className={`px-3 py-1 text-sm rounded border transition-colors ${
                  active
                    ? 'bg-accent-red-darker border-red-500 text-white'
                    : 'bg-theme-secondary border-theme-primary text-theme-primary hover:bg-theme-quaternary'
                }`}
              >
                {formatAbilityPattern(p)}
              </button>
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {pattern.map((amount, slot) => (
          <label key={slot} className="text-sm text-theme-primary">
            <span className="block mb-1 font-medium">+{amount} to</span>
            <select
              aria-label={`Ability for +${amount} (choice ${slot + 1})`}
              value={picks[slot] ?? ''}
              onChange={e => handlePick(slot, e.target.value)}
              className="w-full p-2 border border-theme-primary/20 rounded bg-theme-secondary text-theme-primary"
            >
              <option value="">Choose an ability...</option>
              {choosable.map(a => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </label>
        ))}
      </div>

      {!validation.valid && (
        <p className="text-xs text-accent-yellow-light">{validation.reason}</p>
      )}
    </div>
  );
};
