import { describe, expect, it, vi } from 'vitest'
import { render, renderHook } from '@testing-library/react'
import type { CharacterCreationData, Edition } from '../types/dnd'
import { getAllSpecies, getBackground, getFeatBySlug } from '../services/dataService'
import { backgroundFeatSlug, missingBackgroundPicks } from './backgroundUtils'
import { getMissingFeatPicks } from './featGrantUtils'
import { optionalFeatureAllowance, optionalFeatureSelectionComplete } from './optionalFeatures'
import { randomizeEntireCharacter } from './randomizeCreation'
import { cantripsKnownForCreation, getSpellcastingType } from './spellUtils'
import { BackgroundASIWidget } from '../components/CharacterCreationWizard/components/BackgroundASIWidget'
import { useStepValidation } from '../components/CharacterCreationWizard/hooks/useStepValidation'

const base = (edition: Edition, level: number): CharacterCreationData => ({
  name: '',
  level,
  edition,
  speciesSlug: '',
  classSlug: '',
  abilities: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
  abilityScoreMethod: 'standard-array',
  background: '',
  alignment: '',
  selectedSkills: [],
  selectedMusicalInstruments: [],
  equipmentChoices: [],
  hpCalculationMethod: 'max',
  spellSelection: { selectedCantrips: [] },
  personality: '',
  ideals: '',
  bonds: '',
  flaws: '',
})

describe('randomizeEntireCharacter', () => {
  it.each([
    ['2014', 1],
    ['2024', 1],
    ['2024', 5],
  ] as const)('fills the required %s level %s choices', (edition, level) => {
    for (let i = 0; i < 8; i += 1) {
      const rolled = randomizeEntireCharacter({ edition, level })
      const data = { ...base(edition, level), ...rolled }
      const identity = renderHook(() => useStepValidation(1, data)).result.current
      const species = renderHook(() => useStepValidation(2, data)).result.current
      expect(identity.missingItems, identity.missingItems.join(', ')).toEqual([])
      expect(species.missingItems, species.missingItems.join(', ')).toEqual([])
      expect(getAllSpecies(edition).some(entry => entry.slug === data.speciesSlug)).toBe(true)

      const background = getBackground(data.background)
      expect(background && missingBackgroundPicks(background, data)).toEqual([])
      const feat = background ? getFeatBySlug(backgroundFeatSlug(background, data) ?? '', edition) : undefined
      expect(getMissingFeatPicks(feat, data.featChoices?.[feat?.slug ?? ''])).toEqual([])

      if (getSpellcastingType(data.classSlug)) {
        expect(data.spellSelection.selectedCantrips.length).toBe(
          cantripsKnownForCreation(data.classSlug, level, data),
        )
      }

      const groups = optionalFeatureAllowance(data.classSlug, edition, level, data.subclassSlug, data.optionalFeatures ?? [])
      expect(optionalFeatureSelectionComplete(groups, data.optionalFeatures ?? [], edition)).toBe(true)
      if (level >= 4) {
        expect(data.cumulativeASI?.every(choice =>
          Object.values(choice.asiAllocations ?? {}).reduce((sum, points) => sum + points, 0) === 2,
        )).toBe(true)
      }
    }
  })
})

describe('BackgroundASIWidget', () => {
  it('keeps ability increases that were chosen before it opened', () => {
    const updateData = vi.fn()
    const { getAllByRole } = render(
      <BackgroundASIWidget
        availableOptions={['STR', 'DEX', 'CON']}
        data={{
          edition: '2024',
          backgroundAbilityChoices: { method: '2/1', bonuses: { STR: 2, DEX: 1 } },
        } as CharacterCreationData}
        updateData={updateData}
      />,
    )
    const selects = getAllByRole('combobox') as HTMLSelectElement[]
    expect(selects[0].value).toBe('STR')
    expect(selects[1].value).toBe('DEX')
    expect(updateData).not.toHaveBeenCalled()
  })
})
