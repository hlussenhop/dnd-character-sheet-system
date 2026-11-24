/**
 * Level-up choices for invocations, maneuvers, metamagic, and the other optional features.
 */

import React, { useState } from 'react'
import { Character, LevelUpChoices } from '../../../types/dnd'
import { LevelUpData } from '../../../data/classProgression'
import {
  type OptionalFeatureAllowance,
  getOptionalFeature,
  optionalFeatureAllowance,
  optionalFeaturePicksAtLevel,
  optionalFeatureSelectionComplete,
  resolveOptionalFeatureSlug,
} from '../../../utils/optionalFeatures'
import { OptionalFeaturePicker } from '../../OptionalFeaturePicker'

interface StepOptionalFeaturesProps {
  character: Character
  levelUpData: LevelUpData
  choices: LevelUpChoices
  updateChoices: (choices: Partial<LevelUpChoices>) => void
  onNext: () => void
  onPrev: () => void
}

const knownSlugs = (character: Character): string[] => {
  const raw = [
    ...(character.optionalFeatures ?? []),
    ...(character.fightingStyle ? [character.fightingStyle] : []),
    ...(character.selectedFightingStyle ? [character.selectedFightingStyle] : []),
    ...(character.eldritchInvocations ?? []),
  ]
  return [...new Set(raw.flatMap(slug => {
    const resolved = resolveOptionalFeatureSlug(slug, character.edition)
    return getOptionalFeature(resolved, character.edition) ? [resolved] : []
  }))]
}

export const StepOptionalFeatures: React.FC<StepOptionalFeaturesProps> = ({
  character,
  levelUpData,
  choices,
  updateChoices,
  onNext,
  onPrev,
}) => {
  const [selected, setSelected] = useState<string[]>(choices.optionalFeaturesChosen ?? [])
  const edition = character.edition
  const classSlug = (character.classSlug || character.class).toLowerCase()
  const subclass = choices.subclassChosen || character.subclass
  const already = knownSlugs(character)

  const base = optionalFeaturePicksAtLevel(classSlug, edition, levelUpData.toLevel, subclass, already)
  const withPicks = optionalFeatureAllowance(classSlug, edition, levelUpData.toLevel, subclass, [...already, ...selected])
  const withoutPicks = optionalFeatureAllowance(classSlug, edition, levelUpData.toLevel, subclass, already)
  const groups: OptionalFeatureAllowance[] = base.map(group => ({ ...group, known: group.gain ?? group.known }))
  for (const group of withPicks) {
    const extra = group.known - (withoutPicks.find(row => row.featureType === group.featureType)?.known ?? 0)
    if (extra <= 0) continue
    const existing = groups.find(row => row.featureType === group.featureType)
    if (existing) existing.known += extra
    else groups.push({ ...group, known: extra })
  }

  const withRequired = [...new Set([
    ...selected,
    ...groups.flatMap(group => group.required).filter(slug => !already.includes(slug)),
  ])]
  const keep = withRequired.filter(slug => {
    const feature = getOptionalFeature(slug, edition)
    return !!feature && groups.some(group => feature.featureTypes.includes(group.featureType))
  })

  const handleNext = () => {
    const fighting = keep
      .map(slug => getOptionalFeature(slug, edition))
      .find(feature => feature?.featureTypes.some(type => type.startsWith('FS:')))
    updateChoices({
      optionalFeaturesChosen: keep,
      ...(character.fightingStyle || !fighting ? {} : { fightingStyleChosen: fighting.slug }),
    })
    onNext()
  }

  if (groups.length === 0) {
    return (
      <div className="space-y-6">
        <h3 className="text-2xl font-bold text-accent-red">Class Options</h3>
        <p className="text-theme-secondary">Nothing new to choose at this level.</p>
        <div className="flex justify-between pt-4">
          <button type="button" onClick={onPrev} className="px-6 py-3 bg-theme-primary text-theme-primary font-semibold rounded-lg border border-theme-primary">Back</button>
          <button
            type="button"
            onClick={() => {
              updateChoices({ optionalFeaturesChosen: [] })
              onNext()
            }}
            className="px-6 py-3 bg-accent-red text-white font-semibold rounded-lg"
          >
            Continue
          </button>
        </div>
      </div>
    )
  }

  const ready = optionalFeatureSelectionComplete(groups, keep, edition)

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-2xl font-bold text-accent-red mb-2">
          {groups.length === 1 ? `Choose ${groups[0].name}` : 'Choose Class Options'}
        </h3>
        <p className="text-theme-secondary">
          Pick the options gained at level {levelUpData.toLevel}.
        </p>
      </div>

      <OptionalFeaturePicker
        groups={groups}
        edition={edition}
        level={levelUpData.toLevel}
        classSlug={classSlug}
        pact={character.pactBoon}
        locked={already}
        selected={keep}
        onChange={setSelected}
      />

      <div className="flex justify-between pt-4">
        <button
          type="button"
          onClick={onPrev}
          className="px-6 py-3 bg-theme-primary text-theme-primary font-semibold rounded-lg hover:bg-opacity-80 transition-colors border border-theme-primary"
        >
          Back
        </button>
        <button
          type="button"
          onClick={handleNext}
          disabled={!ready}
          className="px-6 py-3 bg-accent-red text-white font-semibold rounded-lg hover:bg-opacity-90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Continue
        </button>
      </div>
    </div>
  )
}
