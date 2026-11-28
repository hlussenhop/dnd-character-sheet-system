/**
 * Level-Up Wizard Modal
 *
 * Guided multi-step wizard for leveling up a character.
 * Walks the player through all choices required for their new level:
 * - HP increase (roll or take average)
 * - ASI or Feat selection
 * - Subclass selection (if applicable)
 * - Spell selection (for spellcasters)
 * - Fighting style (if applicable)
 * - Feature summary
 */

import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Character, LevelUpChoices } from '../../types/dnd';
import { LevelUpData } from '../../data/classProgression';
import { calculateLevelUpData, getLevelUpSteps, applyLevelUp } from '../../utils/levelUpUtils';
import { getClassEntries, projectCharacterForClass } from '../../utils/multiclass';

import { StepClass } from './steps/StepClass';
import { StepOverview } from './steps/StepOverview';
import { StepHP } from './steps/StepHP';
import { StepASIFeat } from './steps/StepASIFeat';
import { StepSubclass } from './steps/StepSubclass';
import { StepSpells } from './steps/StepSpells';
import { StepFightingStyle } from './steps/StepFightingStyle';
import { StepOptionalFeatures } from './steps/StepOptionalFeatures';
import { StepFeatures } from './steps/StepFeatures';
import { StepConfirm } from './steps/StepConfirm';

interface LevelUpWizardProps {
  isOpen: boolean;
  character: Character;
  onClose: () => void;
  onComplete: (updatedCharacter: Character) => void;
}

export const LevelUpWizard: React.FC<LevelUpWizardProps> = ({
  isOpen,
  character,
  onClose,
  onComplete
}) => {
  // The class that gained the last level is the likeliest one to advance again.
  const [classSlug, setClassSlug] = useState<string>(() => {
    const entries = getClassEntries(character);
    const last = character.levelHistory?.[character.levelHistory.length - 1]?.classSlug;
    return entries.find(entry => entry.classSlug === last && entry.level < 20)?.classSlug ?? entries[0].classSlug;
  });
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [choices, setChoices] = useState<LevelUpChoices>(() => ({
    classSlug,
    hpGained: calculateLevelUpData(character, classSlug)?.averageHpGain ?? 0,
  }));

  const levelUpData = useMemo<LevelUpData | null>(
    () => (isOpen ? calculateLevelUpData(character, classSlug) : null),
    [isOpen, character, classSlug],
  );
  const steps = useMemo(() => (levelUpData ? ['class', ...getLevelUpSteps(levelUpData)] : []), [levelUpData]);

  // Class steps (subclass, spells, class options, features) see the class level and that class's subclass.
  const classView = useMemo(() => projectCharacterForClass(character, classSlug), [character, classSlug]);
  const classLevelUpData = useMemo<LevelUpData | null>(
    () => (levelUpData
      ? { ...levelUpData, fromLevel: levelUpData.fromClassLevel ?? levelUpData.fromLevel, toLevel: levelUpData.toClassLevel ?? levelUpData.toLevel }
      : null),
    [levelUpData],
  );

  if (!isOpen || !levelUpData || !classLevelUpData) return null;

  const handleSelectClass = (slug: string) => {
    if (slug === classSlug) return;
    setClassSlug(slug);
    setChoices({ classSlug: slug, hpGained: calculateLevelUpData(character, slug)?.averageHpGain ?? 0 });
  };

  const currentStep = steps[currentStepIndex];

  const handleNext = () => {
    if (currentStepIndex < steps.length - 1) {
      setCurrentStepIndex(currentStepIndex + 1);
    }
  };

  const handlePrev = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex(currentStepIndex - 1);
    }
  };

  const handleComplete = () => {
    const updatedCharacter = applyLevelUp(character, levelUpData, choices);
    onComplete(updatedCharacter);
    onClose();
  };

  const updateChoices = (newChoices: Partial<LevelUpChoices>) => {
    setChoices({ ...choices, ...newChoices });
  };

  const renderStep = () => {
    const stepProps = {
      character,
      levelUpData,
      choices,
      updateChoices,
      onNext: handleNext,
      onPrev: handlePrev
    };
    const classStepProps = { ...stepProps, character: classView, levelUpData: classLevelUpData };

    switch (currentStep) {
      case 'class':
        return (
          <StepClass
            {...stepProps}
            selectedClassSlug={classSlug}
            onSelectClass={handleSelectClass}
          />
        );
      case 'overview':
        return <StepOverview {...stepProps} />;
      case 'hp':
        return <StepHP {...stepProps} />;
      case 'asi-feat':
        return <StepASIFeat {...stepProps} />;
      case 'subclass':
        return <StepSubclass {...classStepProps} />;
      case 'spells':
        return <StepSpells {...classStepProps} />;
      default:
        // Handle dynamic spell steps (spells-0, spells-1, etc.)
        if (currentStep.startsWith('spells-')) {
          const spellChoiceIndex = parseInt(currentStep.split('-')[1]);
          return <StepSpells key={currentStep} {...classStepProps} spellChoiceIndex={spellChoiceIndex} />;
        }
        if (currentStep === 'fighting-style') {
          return <StepFightingStyle {...classStepProps} />;
        }
        if (currentStep === 'optional-features') {
          return <StepOptionalFeatures {...classStepProps} />;
        }
        if (currentStep === 'features') {
          return <StepFeatures {...classStepProps} />;
        }
        if (currentStep === 'confirm') {
          return <StepConfirm {...stepProps} onComplete={handleComplete} />;
        }
        return <div>Unknown step: {currentStep}</div>;
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 backdrop-blur-md flex items-center justify-center z-[100] p-4"
      onClick={onClose}
    >
      <div
        className="relative z-10 bg-theme-secondary text-theme-primary border border-theme-primary rounded-xl shadow-theme-lg w-full max-w-3xl transition-all transform duration-300 scale-100 my-8 flex flex-col max-h-[calc(100vh-4rem)] pointer-events-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex-shrink-0 p-6 md:p-8 pb-4 border-b border-theme-primary">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-3xl font-bold text-theme-primary">Level Up!</h2>
              <p className="text-theme-secondary mt-1">
                {character.name} - Level {levelUpData.fromLevel} → {levelUpData.toLevel}
              </p>
              {levelUpData.className && (
                <p className="text-sm text-theme-muted">
                  {levelUpData.isNewClass
                    ? `New class: ${levelUpData.className} 1`
                    : `${levelUpData.className} ${levelUpData.fromClassLevel} → ${levelUpData.toClassLevel}`}
                </p>
              )}
            </div>
            <button
              onClick={onClose}
              className="text-theme-muted hover:text-theme-primary transition-colors"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Progress Bar */}
          <div className="mt-4">
            <div className="flex items-center justify-between text-sm text-theme-secondary mb-2">
              <span>Step {currentStepIndex + 1} of {steps.length}</span>
              <span className="capitalize">{currentStep.replace('-', ' ')}</span>
            </div>
            <div className="w-full bg-theme-primary rounded-full h-2">
              <div
                className="bg-accent-red rounded-full h-2 transition-all duration-300"
                style={{ width: `${((currentStepIndex + 1) / steps.length) * 100}%` }}
              />
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 md:p-8">
          {renderStep()}
        </div>
      </div>
    </div>,
    document.body
  );
};
