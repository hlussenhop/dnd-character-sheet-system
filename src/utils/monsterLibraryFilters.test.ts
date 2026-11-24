import { describe, it, expect } from 'vitest'
import type { Monster, UserMonster } from '../types/dnd'
import { applyMonsterFilters, type MonsterListFilters } from './monsterLibraryFilters'

const filters = (over: Partial<MonsterListFilters> = {}): MonsterListFilters => ({
  search: '',
  types: [],
  sizes: [],
  crMin: 0,
  crMax: 30,
  movement: [],
  sort: 'name',
  hasLegendaryActions: null,
  showFavoritesOnly: false,
  showCustomOnly: false,
  showSRDOnly: false,
  edition: 'all',
  source: '',
  ...over,
})

const creature = (over: Partial<Monster> & Pick<Monster, 'index' | 'name'>): Monster => ({
  size: 'Medium',
  type: 'beast',
  alignment: 'unaligned',
  armor_class: [{ type: 'dex', value: 10 }],
  hit_points: 10,
  hit_dice: '2d8',
  hit_points_roll: '2d8+2',
  speed: { walk: '30 ft.' },
  strength: 10,
  dexterity: 10,
  constitution: 10,
  intelligence: 10,
  wisdom: 10,
  charisma: 10,
  proficiencies: [],
  damage_vulnerabilities: [],
  damage_resistances: [],
  damage_immunities: [],
  condition_immunities: [],
  senses: {},
  languages: '',
  challenge_rating: 1,
  proficiency_bonus: 2,
  xp: 200,
  ...over,
})

const custom = (name: string): UserMonster => ({
  ...creature({ index: 'custom-1', name }),
  id: 'custom-1',
  isCustom: true,
  createdAt: 0,
  updatedAt: 0,
})

const aboleth2014 = creature({
  index: 'aboleth',
  name: 'Aboleth',
  edition: '2014',
  source: 'MM',
  challenge_rating: 10,
  legendary_actions: [{ name: 'Detect', desc: '' }],
})

const aboleth2024 = creature({
  index: 'aboleth-2024',
  name: 'Aboleth',
  edition: '2024',
  source: 'XMM',
  challenge_rating: 10,
})

describe('applyMonsterFilters', () => {
  const monsters = [aboleth2014, aboleth2024, custom('My Beast')]
  const srd = new Set(['aboleth'])

  it('keeps both editions as separate rows', () => {
    const found = applyMonsterFilters(monsters, filters({ search: 'aboleth' }), [], srd)
    expect(found.map(monster => monster.index)).toEqual(['aboleth', 'aboleth-2024'])
  })

  it('filters by edition and source without the other printing', () => {
    expect(applyMonsterFilters(monsters, filters({ edition: '2024' }), [], srd).map(monster => monster.index)).toEqual(['aboleth-2024'])
    expect(applyMonsterFilters(monsters, filters({ source: 'MM' }), [], srd).map(monster => monster.index)).toEqual(['aboleth'])
  })

  it('limits SRD Only to the 2014 SRD slugs and keeps custom on its own', () => {
    expect(applyMonsterFilters(monsters, filters({ showSRDOnly: true }), [], srd).map(monster => monster.index)).toEqual(['aboleth'])
    expect(applyMonsterFilters(monsters, filters({ showCustomOnly: true, edition: '2024' }), [], srd).map(monster => monster.name)).toEqual(['My Beast'])
    expect(applyMonsterFilters(monsters, filters({ showCustomOnly: true, showSRDOnly: true }), [], srd)).toEqual([])
  })

  it('uses the legendary list on the card row', () => {
    const found = applyMonsterFilters(monsters, filters({ hasLegendaryActions: true }), [], srd)
    expect(found.map(monster => monster.index)).toEqual(['aboleth'])
  })

  it('matches every search word against name, subtype, or type', () => {
    const hawk = creature({
      index: 'hawk',
      name: 'Hawk',
      type: 'beast',
      subtype: 'bird',
      challenge_rating: 0,
      speed: { walk: '10 ft.', fly: '60 ft.' },
    })
    const list = [...monsters, hawk]
    expect(applyMonsterFilters(list, filters({ search: 'bird beast' }), [], srd).map(monster => monster.index)).toEqual(['hawk'])
    expect(applyMonsterFilters(list, filters({ search: 'aboleth dragon' }), [], srd)).toEqual([])
  })

  it('keeps fractional challenge ratings inside a real CR band', () => {
    const hawk = creature({ index: 'hawk', name: 'Hawk', challenge_rating: 0.125 })
    const found = applyMonsterFilters([hawk, aboleth2014], filters({ crMin: 0.125, crMax: 0.5 }), [], srd)
    expect(found.map(monster => monster.index)).toEqual(['hawk'])
  })

  it('filters by a movement speed and sorts by challenge rating', () => {
    const hawk = creature({
      index: 'hawk',
      name: 'Hawk',
      challenge_rating: 0,
      speed: { fly: '60 ft.' },
    })
    const found = applyMonsterFilters(
      [aboleth2014, hawk],
      filters({ movement: ['fly'], sort: 'cr-desc' }),
      [],
      srd,
    )
    expect(found.map(monster => monster.index)).toEqual(['hawk'])

    const ranked = applyMonsterFilters([hawk, aboleth2014], filters({ sort: 'cr-desc' }), [], srd)
    expect(ranked.map(monster => monster.index)).toEqual(['aboleth', 'hawk'])
  })
})
