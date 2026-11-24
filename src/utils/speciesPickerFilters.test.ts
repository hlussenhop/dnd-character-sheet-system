import { describe, expect, it } from 'vitest'
import { filterPickerSpecies, type SpeciesPickerEntry, type SpeciesPickerFilters } from './speciesPickerFilters'

const filters = (over: Partial<SpeciesPickerFilters> = {}): SpeciesPickerFilters => ({
  search: '',
  groups: [],
  sources: [],
  tags: [],
  sort: 'name',
  ...over,
})

const species = (over: Partial<SpeciesPickerEntry> & Pick<SpeciesPickerEntry, 'slug' | 'name'>): SpeciesPickerEntry => ({
  edition: '2014',
  source: 'PHB',
  speed: 30,
  expanded: true,
  ...over,
})

const pool = [
  species({ slug: 'human', name: 'Human', core: true, expanded: false, edition: '2014' }),
  species({ slug: 'elf-2024', name: 'Elf', edition: '2024', source: 'PHB 2024', core: true, expanded: false, speed: 30 }),
  species({
    slug: 'bullywug',
    name: 'Bullywug',
    source: 'DMG',
    speed: 20,
    tags: ['monstrous', 'legacy'],
    species_traits: ['Amphibious'],
  }),
  species({ slug: 'eladrin', name: 'Eladrin', source: 'MPMM', tags: ['fey'], speed: 30 }),
]

describe('filterPickerSpecies', () => {
  it('keeps core and expanded species in one list', () => {
    expect(filterPickerSpecies(pool, filters()).map(entry => entry.slug)).toEqual([
      'bullywug',
      'eladrin',
      'elf-2024',
      'human',
    ])
  })

  it('filters by group, book, and tag', () => {
    expect(filterPickerSpecies(pool, filters({ groups: ['core'] })).map(entry => entry.slug)).toEqual(['elf-2024', 'human'])
    expect(filterPickerSpecies(pool, filters({ sources: ['DMG'] })).map(entry => entry.slug)).toEqual(['bullywug'])
    expect(filterPickerSpecies(pool, filters({ tags: ['fey'] })).map(entry => entry.slug)).toEqual(['eladrin'])
  })

  it('matches every search word and sorts by speed', () => {
    expect(filterPickerSpecies(pool, filters({ search: 'amphibious bully' })).map(entry => entry.slug)).toEqual(['bullywug'])
    const bySpeed = filterPickerSpecies(pool, filters({ sort: 'speed' })).map(entry => entry.slug)
    expect(bySpeed[0]).not.toBe('bullywug')
    expect(bySpeed[bySpeed.length - 1]).toBe('bullywug')
  })
})
