import { describe, it, expect } from 'vitest'
import type { CharacterCreationData } from '../types/dnd'
import { loadClasses, BACKGROUNDS } from '../services/dataService'
import { calculateCharacterStats } from './characterCreationUtils'
import { applyLevelUp, calculateLevelUpData } from './levelUpUtils'
import { subclassFeatureDescription } from './subclassCatalog'

const create = (overrides: Partial<CharacterCreationData>) => {
  const edition = overrides.edition ?? '2014'
  return calculateCharacterStats({
    name: 'Test',
    level: 1,
    edition,
    classSlug: loadClasses().find(c => c.slug === 'fighter')!.slug,
    abilities: { STR: 10, DEX: 14, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    abilityScoreMethod: 'custom',
    background: (BACKGROUNDS.find(b => b.edition === edition) ?? BACKGROUNDS[0]).slug,
    alignment: 'Neutral Good',
    selectedSkills: [],
    selectedMusicalInstruments: [],
    equipmentChoices: [],
    hpCalculationMethod: 'max',
    spellSelection: { cantrips: [], spells: [] },
    ...overrides,
  } as unknown as CharacterCreationData)
}

describe('species grants on level-up', () => {
  it('adds Dwarven Toughness HP each level', () => {
    const dwarf = create({ speciesSlug: 'hill-dwarf' })
    const data = calculateLevelUpData(dwarf)!
    const leveled = applyLevelUp(dwarf, data, { hpGained: 6 })
    expect(leveled.maxHitPoints).toBe(dwarf.maxHitPoints + 7)
  })

  it('gains 2024 Draconic Flight when reaching level 5', () => {
    const dragonborn = create({ speciesSlug: 'dragonborn-2024', edition: '2024', level: 4 })
    expect(dragonborn.movement?.fly).toBeUndefined()
    const data = calculateLevelUpData(dragonborn)
    expect(data?.toLevel).toBe(5)
    const leveled = applyLevelUp(dragonborn, data!, { hpGained: 6 })
    expect(leveled.movement?.fly).toBe(leveled.speed)
  })

  it('copies subclass features the character has reached, and keeps later ones back', () => {
    const champion = create({ speciesSlug: 'human', classSlug: 'fighter', subclassSlug: 'champion', level: 3 })
    const names = champion.srdFeatures?.subclassFeatures.map(feature => feature.name)
    expect(names).toContain('Improved Critical')
    expect(names).not.toContain('Remarkable Athlete')
    expect(subclassFeatureDescription('fighter', 'champion', 'Improved Critical')).toMatch(/19 or 20/)

    const atSeven = applyLevelUp(
      { ...champion, level: 6 },
      calculateLevelUpData({ ...champion, level: 6 })!,
      { hpGained: 6 },
    )
    expect(atSeven.srdFeatures?.subclassFeatures.map(feature => feature.name)).toContain('Remarkable Athlete')
  })
})
