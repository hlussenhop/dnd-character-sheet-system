import { useMemo, useCallback } from 'react';
import { CharacterCreationData, ValidationResult } from '../../../types/dnd';
import { getAllSpecies, getBackground } from '../../../services/dataService';
import { missingBackgroundPicks } from '../../../utils/backgroundUtils';
import { isVariantChoiceRequired, hasValidVariantSelection } from '../../../utils/speciesVariantUtils';
import { getSpeciesAbilityRules, getAbilityChoiceSelection, validateAbilityChoice } from '../../../utils/speciesAbilityUtils';
import { getMissingSpeciesChoices } from '../../../utils/speciesGrantUtils';

export const useStepValidation = (stepIndex: number, data: CharacterCreationData) => {
  const validateStep1 = (data: CharacterCreationData): ValidationResult => {
    const missing = [];

    if (!data.background) missing.push("Background selection");
    if (!data.alignment) missing.push("Alignment choice");

    // Enhanced 2024 background ability validation
    if (data.background) {
      const background = getBackground(data.background);
      if (background) missing.push(...missingBackgroundPicks(background, data));
    }

    if (data.edition === '2024' && data.background) {
      const background = getBackground(data.background);
      const needsChoices = background?.abilityScores?.choose && background.abilityScores.choose > 0;

      if (needsChoices) {
        const choices = data.backgroundAbilityChoices;
        let hasValidChoices = false;

        if (choices?.method && choices?.bonuses) {
          const bonuses = Object.values(choices.bonuses);
          const totalBonus = bonuses.reduce((sum, bonus) => sum + bonus, 0);

          if (choices.method === '2/1') {
            // Need +2 and +1 = total of 3
            hasValidChoices = totalBonus === 3 && bonuses.includes(2) && bonuses.includes(1);
          } else if (choices.method === '1/1/1') {
            // Need three +1s = total of 3
            hasValidChoices = totalBonus === 3 && bonuses.filter(b => b === 1).length === 3;
          }
        }

        if (!hasValidChoices) {
          missing.push("Background ability score choices");
        }
      }
    }

    return {
      isComplete: missing.length === 0,
      missingSelections: missing,
      nextRequiredAction: missing.length > 0 ? missing[0] : undefined
    };
  };

  const validateStep2 = (data: CharacterCreationData): ValidationResult => {
    const missing = [];

    const species = getAllSpecies(data.edition).find(s => s.slug === data.speciesSlug);
    if (!species) missing.push("Species selection");

    if (species && data.edition === '2024') {
      if (species.speciesFeatOptions && !data.speciesFeat) {
        missing.push("Species feat choice");
      }
      if (species.lineages && Object.keys(species.lineages).length > 0 && !data.selectedLineage) {
        missing.push("Lineage choice");
      }
    }

    if (species && data.edition === '2014') {
      if (isVariantChoiceRequired(species, data.edition) && !hasValidVariantSelection(species, data)) {
        missing.push("Species variant");
      }
      const { fixed, choice } = getSpeciesAbilityRules(species, data.selectedSpeciesVariant);
      if (choice && !validateAbilityChoice(choice, fixed, getAbilityChoiceSelection(data)).valid) {
        missing.push("Species ability score increases");
      }
    }

    // Species choices (draconic ancestry, fiendish legacy, ...) and skill/tool picks, both editions
    if (species) {
      getMissingSpeciesChoices(species, data).forEach(item => missing.push(`Species choice: ${item}`));
    }

    return {
      isComplete: missing.length === 0,
      missingSelections: missing,
      nextRequiredAction: missing.length > 0 ? missing[0] : undefined
    };
  };

  const validateStep3 = (data: CharacterCreationData): ValidationResult => {
    const missing = [];

    if (!data.classSlug) missing.push("Class selection");

    return {
      isComplete: missing.length === 0,
      missingSelections: missing,
      nextRequiredAction: missing.length > 0 ? missing[0] : undefined
    };
  };

  const validateStep4 = (data: CharacterCreationData): ValidationResult => {
    const missing = [];

    // Check if all ability scores are assigned (not 0)
    const unassignedScores = Object.values(data.abilities).filter(score => score === 0);
    if (unassignedScores.length > 0) {
      missing.push(`${unassignedScores.length} ability score${unassignedScores.length > 1 ? 's' : ''} to assign`);
    }

    return {
      isComplete: missing.length === 0,
      missingSelections: missing,
      nextRequiredAction: missing.length > 0 ? "Assign all ability scores" : undefined
    };
  };

  const validateCurrentStep = useCallback((): ValidationResult => {
    switch (stepIndex) {
      case 1: return validateStep1(data);
      case 2: return validateStep2(data);
      case 3: return validateStep3(data);
      case 4: return validateStep4(data);
      default: return { isComplete: true, missingSelections: [] };
    }
  }, [stepIndex, data]);

  const validation = useMemo(() => validateCurrentStep(), [validateCurrentStep]);

  return {
    canProceed: validation.isComplete,
    missingItems: validation.missingSelections,
    nextAction: validation.nextRequiredAction,
    progressPercent: validation.isComplete ? 100 : Math.max(0, 100 - (validation.missingSelections.length * 25))
  };
};
