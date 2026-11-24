import { describe, it, expect } from 'vitest'
import equipment from './equipment.json'
import magicItems from './magicItems.json'
import { SPELL_DATABASE } from '../services/dataService'
import type { MagicItem } from '../types/dnd'
import { getMagicItem, loadMagicItems, resolveMagicItemSlug } from '../services/magicItems'

const items = magicItems as MagicItem[]
const gear = new Set(equipment.map(row => ('index' in row && row.index) || ('slug' in row && row.slug)))
const spellSlugs = new Set(SPELL_DATABASE.map(spell => spell.slug))

describe('magic item data', () => {
  it('keeps one record per item and edition, with structured bonuses only', () => {
    const slugs = items.map(item => item.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
    expect(items).toHaveLength(1352)
    expect(items.filter(item => item.edition === '2014')).toHaveLength(820)
    expect(items.filter(item => item.edition === '2024')).toHaveLength(532)
    expect(items.every(item => item.edition === '2024' ? item.slug.endsWith('-2024') : !item.slug.endsWith('-2024'))).toBe(true)
    expect(items.every(item => item.sources[0] === item.source && item.rarity && item.itemType && !item.description)).toBe(true)

    const ring = items.find(item => item.slug === 'ring-of-protection')
    expect(ring).toMatchObject({ edition: '2014', rarity: 'rare', attunement: true, bonusAc: 1, bonusSavingThrow: 1, itemType: 'Ring' })
    expect(items.find(item => item.slug === 'ring-of-protection-2024')?.source).toBe('XDMG')
    expect(items.find(item => item.slug === 'belt-of-dwarvenkind')).toMatchObject({
      abilityBonus: { CON: 2 },
      resist: ['poison'],
    })
    expect(items.find(item => item.slug === 'amulet-of-health')?.abilityScoreSet).toEqual({ CON: 19 })
    expect(items.find(item => item.slug === 'plus-1-moon-sickle')).toMatchObject({
      bonusWeapon: 1,
      baseItem: 'sickle',
      attunementRequirement: 'by a druid or ranger',
    })
    expect(items.find(item => item.slug === 'staff-of-power')).toMatchObject({ charges: 20, recharge: 'dawn', bonusAc: 2 })

    for (const item of items) {
      for (const spell of item.spells ?? []) expect(spellSlugs.has(spell)).toBe(true)
      if (item.baseItem) expect(gear.has(item.baseItem)).toBe(true)
    }
  })

  it('loads the book text from the source chunk', async () => {
    const loaded = await loadMagicItems()
    expect(loaded).toHaveLength(1352)
    expect(loaded.every(item => (item.description ?? '').length > 0)).toBe(true)
    expect((await getMagicItem('ring-of-protection'))?.description).toMatch(/bonus to AC/)
    expect(await resolveMagicItemSlug('ring-of-protection', '2024')).toBe('ring-of-protection-2024')
    expect(await resolveMagicItemSlug('ring-of-protection', '2014')).toBe('ring-of-protection')
  })
})
