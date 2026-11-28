/**
 * Level-Up Wizard - Class Step
 *
 * Pick the class that gains this level: one the character already has, or a new class
 * (multiclassing) when the ability score prerequisites are met.
 */

import React, { useMemo } from 'react';
import { Character, LevelUpChoices, SkillName } from '../../../types/dnd';
import { LevelUpData } from '../../../data/classProgression';
import { getSubclass } from '../../../services/dataService';
import {
  classInstrumentOptions,
  classSkillOptions,
  describeMulticlassPrerequisite,
  getClassEntries,
  MULTICLASS_MIN_SCORE,
  multiclassOptions,
  multiclassProficiencies,
} from '../../../utils/multiclass';

interface StepClassProps {
  character: Character;
  levelUpData: LevelUpData;
  choices: LevelUpChoices;
  updateChoices: (choices: Partial<LevelUpChoices>) => void;
  selectedClassSlug: string;
  onSelectClass: (classSlug: string) => void;
  onNext: () => void;
}

const skillLabel = (skill: string) => skill.replace(/([a-z])([A-Z])/g, '$1 $2');

const cardClass = (selected: boolean, disabled = false) =>
  `w-full text-left p-4 rounded-lg border-2 transition-all ${
    disabled
      ? 'border-theme-primary bg-theme-primary opacity-50 cursor-not-allowed'
      : selected
        ? 'border-accent-red bg-theme-tertiary'
        : 'border-theme-primary bg-theme-primary hover:border-accent-red'
  }`;

export const StepClass: React.FC<StepClassProps> = ({
  character,
  levelUpData,
  choices,
  updateChoices,
  selectedClassSlug,
  onSelectClass,
  onNext,
}) => {
  const entries = useMemo(() => getClassEntries(character), [character]);
  const options = useMemo(() => multiclassOptions(character), [character]);
  const isNewClass = levelUpData.isNewClass === true;

  const gained = isNewClass ? multiclassProficiencies(selectedClassSlug, character.edition) : null;
  const skillOptions = useMemo(
    () => (isNewClass ? classSkillOptions(selectedClassSlug, character.edition).filter(skill => !character.skills?.[skill]?.proficient) : []),
    [isNewClass, selectedClassSlug, character.edition, character.skills],
  );
  const instrumentOptions = useMemo(
    () => (isNewClass ? classInstrumentOptions(selectedClassSlug, character.edition) : []),
    [isNewClass, selectedClassSlug, character.edition],
  );

  const pickedSkills = choices.multiclassSkills ?? [];
  const skillsNeeded = Math.min(gained?.skills ?? 0, skillOptions.length);
  const instrumentNeeded = (gained?.instruments ?? 0) > 0 && instrumentOptions.length > 0;
  const ready = !isNewClass || (pickedSkills.length === skillsNeeded && (!instrumentNeeded || Boolean(choices.multiclassInstrument)));

  const toggleSkill = (skill: SkillName) => {
    if (pickedSkills.includes(skill)) {
      updateChoices({ multiclassSkills: pickedSkills.filter(item => item !== skill) });
    } else if (pickedSkills.length < skillsNeeded) {
      updateChoices({ multiclassSkills: [...pickedSkills, skill] });
    }
  };

  const gainedList = gained ? [...gained.armor, ...gained.weapons, ...gained.tools] : [];

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-2xl font-bold text-accent-red mb-2">Choose a Class</h3>
        <p className="text-theme-secondary">
          Advance a class {character.name} already has, or take a first level in a new class.
        </p>
      </div>

      <section className="space-y-2">
        <h4 className="text-sm font-semibold uppercase tracking-wide text-theme-muted">Your classes</h4>
        {entries.map(entry => {
          const subclassName = entry.subclass ? getSubclass(entry.subclass)?.name ?? entry.subclass : null;
          const atMax = entry.level >= 20;
          return (
            <button
              key={entry.classSlug}
              type="button"
              disabled={atMax}
              onClick={() => onSelectClass(entry.classSlug)}
              className={cardClass(selectedClassSlug === entry.classSlug, atMax)}
              aria-pressed={selectedClassSlug === entry.classSlug}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-semibold text-accent-red">{entry.class}</div>
                  {subclassName && <div className="text-sm text-theme-secondary">{subclassName}</div>}
                </div>
                <div className="text-sm text-theme-primary">
                  Level {entry.level} → {entry.level + 1}
                </div>
              </div>
            </button>
          );
        })}
      </section>

      {options.length > 0 && (
        <section className="space-y-2">
          <h4 className="text-sm font-semibold uppercase tracking-wide text-theme-muted">Multiclass</h4>
          <p className="text-xs text-theme-secondary">
            Each class needs its listed scores of {MULTICLASS_MIN_SCORE} or higher, and so does every class you already have.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {options.map(({ cls, eligibility }) => (
              <button
                key={cls.slug}
                type="button"
                disabled={!eligibility.eligible}
                onClick={() => onSelectClass(cls.slug)}
                className={cardClass(selectedClassSlug === cls.slug, !eligibility.eligible)}
                aria-pressed={selectedClassSlug === cls.slug}
                title={eligibility.reasons.join('. ')}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-accent-red">{cls.name}</span>
                  <span className="text-xs text-theme-muted">d{cls.hit_die}</span>
                </div>
                <div className="text-xs text-theme-secondary mt-1">{describeMulticlassPrerequisite(cls.slug)}</div>
                {!eligibility.eligible && (
                  <div className="text-xs text-theme-muted mt-1">{eligibility.reasons.join('. ')}</div>
                )}
              </button>
            ))}
          </div>
        </section>
      )}

      {isNewClass && (
        <section className="bg-theme-tertiary rounded-lg p-4 border border-theme-primary space-y-4">
          <div>
            <h4 className="font-semibold text-accent-red mb-1">Joining {levelUpData.className}</h4>
            <p className="text-sm text-theme-secondary">
              {gainedList.length > 0 ? `You gain ${gainedList.join(', ')}.` : 'You gain no armor, weapon, or tool proficiencies.'}
              {' '}Saving throw proficiencies stay with your first class.
            </p>
          </div>

          {skillsNeeded > 0 && (
            <div>
              <div className="text-sm font-semibold text-theme-primary mb-2">
                Choose {skillsNeeded} skill{skillsNeeded === 1 ? '' : 's'} ({pickedSkills.length} / {skillsNeeded})
              </div>
              <div className="flex flex-wrap gap-2">
                {skillOptions.map(skill => {
                  const picked = pickedSkills.includes(skill);
                  return (
                    <button
                      key={skill}
                      type="button"
                      onClick={() => toggleSkill(skill)}
                      disabled={!picked && pickedSkills.length >= skillsNeeded}
                      aria-pressed={picked}
                      className={`px-3 py-1 rounded-full text-sm border transition-colors disabled:opacity-50 ${
                        picked
                          ? 'bg-accent-red text-white border-accent-red'
                          : 'bg-theme-primary text-theme-primary border-theme-primary hover:border-accent-red'
                      }`}
                    >
                      {skillLabel(skill)}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {instrumentNeeded && (
            <label className="block">
              <span className="text-sm font-semibold text-theme-primary">Musical instrument</span>
              <select
                value={choices.multiclassInstrument ?? ''}
                onChange={event => updateChoices({ multiclassInstrument: event.target.value || undefined })}
                className="mt-1 w-full rounded-lg border border-theme-primary bg-theme-primary px-3 py-2 text-theme-primary"
              >
                <option value="">Choose an instrument</option>
                {instrumentOptions.map(instrument => (
                  <option key={instrument} value={instrument}>{instrument}</option>
                ))}
              </select>
            </label>
          )}
        </section>
      )}

      <div className="flex justify-end pt-4">
        <button
          onClick={onNext}
          disabled={!ready}
          className="px-6 py-3 bg-accent-red text-white font-bold rounded-lg hover:bg-opacity-90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Continue
        </button>
      </div>
    </div>
  );
};
