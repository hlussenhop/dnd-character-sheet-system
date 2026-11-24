import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getSpellsForClass, getSubclass, getSubclassesByClass, SUBCLASS_DATABASE } from '../services/dataService'

/**
 * Subclass lane rules (sourcebooks/build_subclasses.py): one record per subclass and edition,
 * saved 2014 slugs kept, 2024 twins suffixed `-2024`, every subclass has feature text, and
 * subclass spell lists resolve to spell slugs.
 */
const CLASSES = ['artificer', 'barbarian', 'bard', 'cleric', 'druid', 'fighter', 'monk', 'paladin', 'ranger', 'rogue', 'sorcerer', 'warlock', 'wizard']
const features = JSON.parse(readFileSync(join(__dirname, 'subclassFeaturesByLevel.json'), 'utf8')) as Record<string, Record<string, { features: unknown[] }>>

describe('subclass data integrity', () => {
  it('keeps one record per subclass and edition, with the saved slugs', () => {
    const slugs = SUBCLASS_DATABASE.map(subclass => subclass.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
    expect(SUBCLASS_DATABASE.length).toBe(193)
    expect(SUBCLASS_DATABASE.filter(subclass => subclass.edition === '2014').length).toBe(117)
    expect(SUBCLASS_DATABASE.filter(subclass => subclass.edition === '2024').length).toBe(76)

    expect(getSubclass('berserker')).toMatchObject({ name: 'Path of the Berserker', edition: '2014', class: 'barbarian' })
    expect(getSubclass('life')?.slug).toBe('life')
    expect(getSubclass('evocation')?.subclassLevel).toBe(2)
    expect(getSubclass('abjurer-2024')).toMatchObject({ name: 'Abjurer', edition: '2024' })
    expect(getSubclass('necromancer-2024')?.name).toBe('Necromancer')
    expect(getSubclassesByClass('wizard', '2014').some(subclass => subclass.edition === '2024')).toBe(false)
    expect(getSubclassesByClass('cleric', '2014').every(subclass => subclass.edition === '2014')).toBe(true)

    for (const subclass of SUBCLASS_DATABASE) {
      expect(CLASSES).toContain(subclass.class)
      expect(subclass.edition === '2014' || subclass.edition === '2024').toBe(true)
      expect(subclass.description?.length).toBeGreaterThan(0)
      expect(features[subclass.class]?.[subclass.slug]?.features.length).toBeGreaterThan(0)
    }
  })

  it('resolves domain spells and the dunamancy list', () => {
    const life = getSubclass('life')
    expect(life?.grantedSpells?.[0]).toEqual({ level: 1, slugs: ['bless-2014', 'cure-wounds-2014'] })

    const plain = getSpellsForClass('wizard', '2014').map(spell => spell.slug)
    const chronurgy = getSpellsForClass('wizard', '2014', undefined, 'chronurgy-magic').map(spell => spell.slug)
    expect(plain).not.toContain('fortunes-favor')
    expect(chronurgy).toContain('fortunes-favor')
    expect(chronurgy).toContain('gift-of-alacrity')

    const arcana = getSpellsForClass('cleric', '2014', undefined, 'arcana').map(spell => spell.slug)
    expect(arcana).toContain('magic-missile-2014')
  })
})
