/**
 * Level-Up Wizard - ASI/Feat Step
 *
 * Choose between Ability Score Increase or Feat
 */

import React, { useState } from 'react';
import { Character, LevelUpChoices, AbilityName, ABILITY_SCORES, Feat, FeatChoiceMap } from '../../../types/dnd';
import { LevelUpData } from '../../../data/classProgression';
import { loadFeats, resolveFeatSlug, resolveSpeciesSlug } from '../../../services/dataService';
import { getAvailableFeatsForCharacter } from '../../../utils/featUtils';
import { getFeatChoiceSections } from '../../../utils/featGrantUtils';
import { FeatChoiceModal } from '../../CharacterCreationWizard/components';

interface StepASIFeatProps {
  character: Character;
  levelUpData: LevelUpData;
  choices: LevelUpChoices;
  updateChoices: (choices: Partial<LevelUpChoices>) => void;
  onNext: () => void;
  onPrev: () => void;
}

export const StepASIFeat: React.FC<StepASIFeatProps> = ({
  character,
  levelUpData,
  choices: _choices,
  updateChoices,
  onNext,
  onPrev
}) => {
  const [choiceType, setChoiceType] = useState<'asi' | 'feat'>('asi');
  const [asiSelections, setAsiSelections] = useState<Array<{ ability: AbilityName; increase: number }>>([]);
  const [selectedFeat, setSelectedFeat] = useState<string>('');
  const [featChoices, setFeatChoices] = useState<FeatChoiceMap | undefined>();
  const [choiceFeat, setChoiceFeat] = useState<Feat | null>(null);

  const abilityScores = ABILITY_SCORES.reduce((acc, ability) => {
    acc[ability as AbilityName] = character.abilities[ability as AbilityName].score;
    return acc;
  }, {} as Record<AbilityName, number>);

  const featSelectionLevel = levelUpData.toLevel || character.level;
  const heldFeats = (character.selectedFeats || character.feats || []).map(s => resolveFeatSlug(s, character.edition));
  const availableFeats = getAvailableFeatsForCharacter(loadFeats(), {
    level: featSelectionLevel,
    classSlug: character.classSlug || character.class?.toLowerCase(),
    subclassSlug: character.subclass,
    abilities: abilityScores,
    speciesSlug: resolveSpeciesSlug(character.species || '', character.edition),
    selectedSpeciesVariant: character.selectedSpeciesVariant,
    background: character.background,
    selectedFeats: heldFeats,
    proficiencies: [
      ...(character.proficiencies?.armor ?? []),
      ...(character.proficiencies?.weapons ?? []),
      ...(character.proficiencies?.tools ?? []),
    ],
    edition: character.edition
  }, 'asi').filter(feat => feat.repeatable || !heldFeats.includes(feat.slug));

  const handleSelectFeat = (feat: Feat) => {
    if (getFeatChoiceSections(feat).length > 0) {
      setChoiceFeat(feat);
    } else {
      setSelectedFeat(feat.slug);
      setFeatChoices(undefined);
    }
  };
  const maxASIPoints = 2;
  const remainingPoints = maxASIPoints - asiSelections.reduce((sum, sel) => sum + sel.increase, 0);

  const handleIncreaseAbility = (ability: AbilityName) => {
    if (remainingPoints > 0) {
      const currentAbilityScore = character.abilities[ability].score;
      const currentIncrease = asiSelections.find(s => s.ability === ability)?.increase || 0;

      // Can't increase above 20
      if (currentAbilityScore + currentIncrease >= 20) {
        return;
      }

      const existingIndex = asiSelections.findIndex(s => s.ability === ability);
      if (existingIndex >= 0) {
        const updated = [...asiSelections];
        updated[existingIndex].increase += 1;
        setAsiSelections(updated);
      } else {
        setAsiSelections([...asiSelections, { ability, increase: 1 }]);
      }
    }
  };

  const handleDecreaseAbility = (ability: AbilityName) => {
    const existingIndex = asiSelections.findIndex(s => s.ability === ability);
    if (existingIndex >= 0) {
      const updated = [...asiSelections];
      if (updated[existingIndex].increase > 1) {
        updated[existingIndex].increase -= 1;
      } else {
        updated.splice(existingIndex, 1);
      }
      setAsiSelections(updated);
    }
  };

  const handleNext = () => {
    if (choiceType === 'asi') {
      updateChoices({ asiChoices: asiSelections, featChosen: undefined });
    } else {
      updateChoices({ featChosen: selectedFeat, featChoices, asiChoices: undefined });
    }
    onNext();
  };

  const canProceed = choiceType === 'asi' ? remainingPoints === 0 : selectedFeat !== '';

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-2xl font-bold text-accent-red mb-2">
          Ability Score Improvement
        </h3>
        <p className="text-theme-secondary">
          Choose to increase your ability scores or gain a new feat.
        </p>
      </div>

      {/* Choice Type Toggle */}
      <div className="flex gap-4">
        <button
          onClick={() => setChoiceType('asi')}
          className={`flex-1 py-3 px-4 rounded-lg font-semibold transition-all ${
            choiceType === 'asi'
              ? 'bg-accent-red text-white'
              : 'bg-theme-tertiary text-theme-primary border-2 border-theme-primary hover:border-accent-red'
          }`}
        >
          Ability Score Increase
        </button>
        <button
          onClick={() => setChoiceType('feat')}
          className={`flex-1 py-3 px-4 rounded-lg font-semibold transition-all ${
            choiceType === 'feat'
              ? 'bg-accent-red text-white'
              : 'bg-theme-tertiary text-theme-primary border-2 border-theme-primary hover:border-accent-red'
          }`}
        >
          Choose a Feat
        </button>
      </div>

      {/* ASI Selection */}
      {choiceType === 'asi' && (
        <div className="space-y-4">
          <div className="bg-theme-tertiary border border-theme-primary rounded-lg p-4">
            <p className="text-theme-primary mb-2">
              You have <span className="text-accent-red font-bold">{remainingPoints} points</span> to spend.
            </p>
            <p className="text-sm text-theme-secondary">
              Increase one ability by 2, or two abilities by 1 each. No ability can exceed 20.
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {ABILITY_SCORES.map((ability) => {
              const currentScore = character.abilities[ability as keyof typeof character.abilities].score;
              const increase = asiSelections.find(s => s.ability === ability)?.increase || 0;
              const newScore = currentScore + increase;
              const atMax = newScore >= 20;

              return (
                <div
                  key={ability}
                  className="bg-theme-tertiary border border-theme-primary rounded-lg p-4"
                >
                  <div className="text-center mb-2">
                    <h4 className="text-lg font-semibold text-theme-primary">{ability}</h4>
                    <p className="text-2xl font-bold text-theme-primary">
                      {currentScore}
                      {increase > 0 && (
                        <span className="text-accent-red ml-2">→ {newScore}</span>
                      )}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleDecreaseAbility(ability)}
                      disabled={increase === 0}
                      className="flex-1 py-1 px-2 bg-theme-secondary text-theme-primary rounded hover:bg-opacity-80 disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      -
                    </button>
                    <button
                      onClick={() => handleIncreaseAbility(ability)}
                      disabled={remainingPoints === 0 || atMax}
                      className="flex-1 py-1 px-2 bg-accent-red text-white rounded hover:bg-opacity-90 disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      +
                    </button>
                  </div>
                  {atMax && increase > 0 && (
                    <p className="text-xs text-accent-red text-center mt-2">Max (20)</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Feat Selection */}
      {choiceType === 'feat' && (
        <div className="space-y-4">
          <div className="bg-theme-tertiary border border-theme-primary rounded-lg p-4">
            <p className="text-theme-secondary text-sm">
              Select a feat to gain new abilities and features.
            </p>
          </div>

          {availableFeats.length === 0 && (
            <div className="bg-theme-tertiary border border-theme-primary rounded-lg p-4 text-sm text-theme-primary">
              No feats meet your current prerequisites. Choose an Ability Score Increase instead.
            </div>
          )}

          <div className="max-h-96 overflow-y-auto space-y-2">
            {availableFeats.map((feat) => (
              <button
                key={feat.slug}
                onClick={() => handleSelectFeat(feat)}
                className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
                  selectedFeat === feat.slug
                    ? 'border-accent-red bg-theme-quaternary'
                    : 'border-theme-primary bg-theme-tertiary hover:border-accent-red'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h4 className="font-semibold text-theme-primary">{feat.name}</h4>
                    {feat.prerequisite && <p className="text-xs text-theme-muted mt-1">Prerequisite: {feat.prerequisite}</p>}
                    <ul className="text-sm text-theme-secondary mt-1 list-disc list-inside">
                      {feat.benefits.map((benefit, i) => <li key={i}>{benefit}</li>)}
                    </ul>
                  </div>
                  <div className={`flex-shrink-0 ml-4 w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                    selectedFeat === feat.slug ? 'border-accent-red bg-accent-red' : 'border-theme-primary'
                  }`}>
                    {selectedFeat === feat.slug && (
                      <svg className="w-3 h-3 text-theme-primary" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between pt-4">
        <button
          onClick={onPrev}
          className="px-6 py-3 bg-theme-primary text-theme-primary font-semibold rounded-lg hover:bg-opacity-80 transition-colors border border-theme-primary"
        >
          Back
        </button>
        <button
          onClick={handleNext}
          disabled={!canProceed}
          className="px-6 py-3 bg-accent-red text-white font-semibold rounded-lg hover:bg-opacity-90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Continue
        </button>
      </div>
      <FeatChoiceModal
        isOpen={!!choiceFeat}
        onClose={() => setChoiceFeat(null)}
        feat={choiceFeat}
        onConfirm={(picks) => {
          if (!choiceFeat) return;
          setSelectedFeat(choiceFeat.slug);
          setFeatChoices(picks);
        }}
      />
    </div>
  );
};
