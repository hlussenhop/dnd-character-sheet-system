import { describe, it, expect } from 'vitest'
import type { Species } from '../types/dnd'
import {
  getEffectiveSpeciesTraits,
  getSelectedVariant,
  getVariantPickerOptions,
  hasValidVariantSelection,
  isVariantChoiceRequired,
} from './speciesVariantUtils'

const variants: Species['variants'] = [
  { slug: 'air', name: 'Air Genasi', description: '', ability_bonuses: { CON: 2, DEX: 1 }, species_traits: ['Unending Breath'], features: [] },
  { slug: 'fire', name: 'Fire Genasi', description: '', ability_bonuses: { CON: 2, INT: 1 }, species_traits: ['Fire Resistance', 'Unending Breath'], features: [] },
]
const genasi = { slug: 'genasi', variants, species_traits: ['Darkvision', 'Fire Resistance'] }

describe('getVariantPickerOptions', () => {
  it('offers variants for 2014 species', () => {
    expect(getVariantPickerOptions(genasi, '2014')).toHaveLength(2)
  })
  it('does not apply to 2024 (lineage metadata) or to Human (dedicated selector)', () => {
    expect(getVariantPickerOptions(genasi, '2024')).toBeUndefined()
    expect(getVariantPickerOptions({ slug: 'human', variants }, '2014')).toBeUndefined()
  })
  it('does not apply to species without variants', () => {
    expect(getVariantPickerOptions({ slug: 'dwarf', variants: undefined }, '2014')).toBeUndefined()
    expect(getVariantPickerOptions({ slug: 'dwarf', variants: [] }, '2014')).toBeUndefined()
  })
})

describe('isVariantChoiceRequired / hasValidVariantSelection', () => {
  it('requires a choice unless variantOptional', () => {
    expect(isVariantChoiceRequired(genasi, '2014')).toBe(true)
    expect(isVariantChoiceRequired({ ...genasi, variantOptional: true }, '2014')).toBe(false)
    expect(isVariantChoiceRequired({ slug: 'human', variants }, '2014')).toBe(false)
  })
  it('validates the selection against the species variants', () => {
    expect(hasValidVariantSelection(genasi, { edition: '2014', selectedSpeciesVariant: 'air' })).toBe(true)
    expect(hasValidVariantSelection(genasi, { edition: '2014', selectedSpeciesVariant: 'water' })).toBe(false)
    expect(hasValidVariantSelection(genasi, { edition: '2014', selectedSpeciesVariant: undefined })).toBe(false)
  })
})

describe('getSelectedVariant / getEffectiveSpeciesTraits', () => {
  it('finds the selected variant', () => {
    expect(getSelectedVariant(genasi, 'fire')?.name).toBe('Fire Genasi')
    expect(getSelectedVariant(genasi, 'nope')).toBeUndefined()
  })
  it('merges base and variant traits without duplicates', () => {
    expect(getEffectiveSpeciesTraits(genasi, 'fire')).toEqual(['Darkvision', 'Fire Resistance', 'Unending Breath'])
  })
  it('returns only base traits when no/unknown variant is selected', () => {
    expect(getEffectiveSpeciesTraits(genasi, undefined)).toEqual(['Darkvision', 'Fire Resistance'])
    expect(getEffectiveSpeciesTraits(genasi, 'nope')).toEqual(['Darkvision', 'Fire Resistance'])
    expect(getEffectiveSpeciesTraits(undefined, 'fire')).toEqual([])
  })
})
