import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, renderHook } from '@testing-library/react'
import type { CharacterCreationData, Species } from '../../../types/dnd'

const FAKE: Species = {
  slug: 'fake-genasi',
  name: 'Fake Genasi',
  edition: '2014',
  source: 'EEPC',
  speed: 30,
  ability_bonuses: { CON: 2 },
  species_traits: ['Darkvision'],
  description: '',
  typicalRoles: [],
  variants: [
    { slug: 'air', name: 'Air Genasi', description: 'Wind', ability_bonuses: { CON: 2, DEX: 1 }, species_traits: ['Unending Breath'], features: [] },
    { slug: 'fire', name: 'Fire Genasi', description: 'Flame', ability_bonuses: { CON: 2, INT: 1 }, species_traits: ['Fire Resistance'], features: [] },
  ],
}
let species: Species[] = [FAKE]

vi.mock('../../../services/dataService', async importOriginal => {
  const original = await importOriginal<typeof import('../../../services/dataService')>()
  return {
    ...original,
    getAllSpecies: () => species,
    findSpeciesBySlug: (slug?: string) => species.find(s => s.slug === slug),
  }
})

import { SpeciesVariantSelector } from './SpeciesVariantSelector'
import { useStepValidation } from '../hooks/useStepValidation'
import { resolveSpeciesAbilityBonuses } from '../../../utils/speciesAbilityUtils'

describe('SpeciesVariantSelector', () => {
  it('lists variants with their ability scores and traits, and reports the selection', () => {
    const onSelect = vi.fn()
    render(<SpeciesVariantSelector species={FAKE} variants={FAKE.variants!} onSelect={onSelect} />)
    expect(screen.getByText('Ability scores: CON +2, DEX +1')).toBeTruthy()
    expect(screen.getByText('Traits: Fire Resistance')).toBeTruthy()
    fireEvent.click(screen.getByLabelText(/Fire Genasi/))
    expect(onSelect).toHaveBeenCalledWith('fire')
  })

  it('offers a standard option only when the variant is optional', () => {
    const onSelect = vi.fn()
    const { rerender } = render(<SpeciesVariantSelector species={FAKE} variants={FAKE.variants!} onSelect={onSelect} />)
    expect(screen.queryByLabelText(/Standard Fake Genasi/)).toBeNull()
    rerender(
      <SpeciesVariantSelector species={{ ...FAKE, variantOptional: true }} variants={FAKE.variants!} selectedSlug="air" onSelect={onSelect} />,
    )
    fireEvent.click(screen.getByLabelText(/Standard Fake Genasi/))
    expect(onSelect).toHaveBeenCalledWith(undefined)
  })
})

describe('Step 2 validation with a variant species', () => {
  const data = (o: Partial<CharacterCreationData> = {}) =>
    ({ edition: '2014', speciesSlug: 'fake-genasi', ...o }) as CharacterCreationData

  beforeEach(() => {
    species = [FAKE]
  })

  it('blocks until a variant is chosen', () => {
    const r = renderHook(() => useStepValidation(2, data())).result.current
    expect(r.canProceed).toBe(false)
    expect(r.missingItems).toContain('Species variant')
    expect(renderHook(() => useStepValidation(2, data({ selectedSpeciesVariant: 'air' }))).result.current.canProceed).toBe(true)
  })

  it('does not block when the variant is optional', () => {
    species = [{ ...FAKE, variantOptional: true }]
    expect(renderHook(() => useStepValidation(2, data())).result.current.canProceed).toBe(true)
  })

  it('the selected variant drives the ability bonuses', () => {
    expect(resolveSpeciesAbilityBonuses(FAKE, data({ selectedSpeciesVariant: 'air' }))).toMatchObject({ CON: 2, DEX: 1, INT: 0 })
    expect(resolveSpeciesAbilityBonuses(FAKE, data({ selectedSpeciesVariant: 'fire' }))).toMatchObject({ CON: 2, DEX: 0, INT: 1 })
  })
})
