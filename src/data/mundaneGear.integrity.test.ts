import { describe, it, expect } from 'vitest'
import equipment from './equipment.json'
import mundaneGear from './mundaneGear.json'
import { loadEquipment } from '../services/dataService'
import type { Equipment } from '../types/dnd'

const gear = mundaneGear as Equipment[]
const existingSlugs = new Set(equipment.map(row => ('index' in row && row.index) || ('slug' in row && row.slug)))
const existingNames = new Set(equipment.map(row => row.name.toLowerCase()))

describe('mundane gear', () => {
  it('stores the book rows that equipment.json does not already cover for that edition', () => {
    const slugs = gear.map(item => item.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
    expect(gear).toHaveLength(730)
    expect(gear.filter(item => item.year === 2014)).toHaveLength(475)
    expect(gear.filter(item => item.year === 2024)).toHaveLength(255)
    expect(gear.every(item => item.slug === item.index && !existingSlugs.has(item.slug))).toBe(true)
    expect(gear.some(item => item.year === 2024 && existingNames.has(item.name.toLowerCase()))).toBe(false)
    expect(gear.every(item => item.cost && typeof item.weight === 'number' && item.description)).toBe(true)

    expect(gear.find(item => item.slug === 'alexandrite')).toMatchObject({
      year: 2014,
      cost: { quantity: 500, unit: 'gp' },
      equipment_category: 'Treasure',
    })
    expect(gear.find(item => item.slug === 'airship')?.description).toMatch(/AC 13/)
    expect(gear.find(item => item.slug === 'airship-2024')?.cost).toEqual({ quantity: 40000, unit: 'gp' })
    expect(gear.find(item => item.slug === 'longsword-2014')).toMatchObject({
      year: 2014,
      weapon_category: 'Martial',
      damage: { damage_dice: '1d8', damage_type: 'Slashing' },
      two_handed_damage: { damage_dice: '1d10', damage_type: 'Slashing' },
    })
    expect(gear.find(item => item.slug === 'spiked-armor')?.armor_class).toEqual({
      base: 14,
      dex_bonus: true,
      max_bonus: 2,
    })
    expect(gear.find(item => item.slug === 'arrow')?.name).toBe('Arrow')
    expect(gear.find(item => item.slug === 'assassins-blood')?.description).toMatch(/DC 10/)

    const all = loadEquipment()
    expect(all).toHaveLength(equipment.length + gear.length)
    expect(all.find(item => item.slug === 'acid')?.year).toBe(2024)
    expect(all.find(item => item.slug === 'longsword')?.year).toBe(2024)
    expect(all.find(item => item.slug === 'longsword-2014')?.year).toBe(2014)
  })
})
