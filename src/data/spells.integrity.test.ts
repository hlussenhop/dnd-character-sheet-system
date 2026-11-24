import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getSpellsForClass, SPELL_DATABASE } from '../services/dataService'

/**
 * Spells lane rules (sourcebooks/build_spells.py): one record per spell and edition, saved slugs kept
 * (2024 unsuffixed, the 2014 copy suffixed `-2014`), class lists from the same edition, and every
 * spell has text in a lazy chunk.
 */
const CLASSES = ['artificer', 'bard', 'cleric', 'druid', 'monk', 'paladin', 'ranger', 'sorcerer', 'warlock', 'wizard']

const CHUNK_DIR = join(__dirname, 'content', 'spells')
const CHUNKS = new Map<string, { description?: string }>(
  readdirSync(CHUNK_DIR).flatMap(file =>
    (JSON.parse(readFileSync(join(CHUNK_DIR, file), 'utf8')) as Array<{ slug: string; description?: string }>)
      .map(record => [record.slug, record] as [string, { description?: string }])),
)

describe('spells data integrity', () => {
  it('keeps one record per spell and edition, with the saved slugs', () => {
    const slugs = SPELL_DATABASE.map(spell => spell.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
    expect(SPELL_DATABASE.length).toBe(963)
    expect(SPELL_DATABASE.filter(spell => spell.source === '2014').length).toBeGreaterThan(400)
    expect(SPELL_DATABASE.filter(spell => spell.source === '2024').length).toBeGreaterThan(400)

    const fireball = SPELL_DATABASE.filter(spell => spell.name === 'Fireball')
    expect(fireball.map(spell => spell.slug).sort()).toEqual(['fireball', 'fireball-2014'])
    expect(SPELL_DATABASE.find(spell => spell.slug === 'thaumaturgy')?.source).toBe('2024')
    expect(SPELL_DATABASE.find(spell => spell.slug === 'arcane-hand')?.name).toBe("Bigby's Hand")
    expect(SPELL_DATABASE.find(spell => spell.slug === 'jims-magic-missile')?.classes).toContain('wizard')
  })

  it('gives every spell text and a real class list', () => {
    SPELL_DATABASE.forEach(spell => {
      expect(spell.source === '2014' || spell.source === '2024', spell.slug).toBe(true)
      spell.classes.forEach(cls => expect(CLASSES, spell.slug).toContain(cls))
      expect(CHUNKS.get(spell.slug)?.description, spell.slug).toBeTruthy()
    })
  })

  it('puts Xanathar spells on the 2014 list and keeps them off the 2024 list', () => {
    const wizard2014 = getSpellsForClass('wizard', '2014').map(spell => spell.slug)
    const wizard2024 = getSpellsForClass('wizard', '2024').map(spell => spell.slug)
    expect(wizard2014).toContain('absorb-elements')
    expect(wizard2024).not.toContain('absorb-elements')
    expect(wizard2024).toContain('fireball')
    expect(wizard2014).toContain('fireball-2014')
  })

  it('adds a background expanded spell list on top of the class list', () => {
    const plain = getSpellsForClass('wizard', '2014').map(spell => spell.slug)
    const guild = getSpellsForClass('wizard', '2014', 'azorius-functionary').map(spell => spell.slug)
    expect(plain).not.toContain('command-2014')
    expect(guild).toContain('command-2014')
    expect(guild).toContain('friends-2014')
  })
})
