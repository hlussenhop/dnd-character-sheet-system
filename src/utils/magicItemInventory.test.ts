import { describe, it, expect } from 'vitest'
import type { Character, EquippedItem } from '../types/dnd'
import { getMagicItemIndexSync, setMagicItemIndexCache } from '../services/magicItems'
import { recalculateAC } from './equipmentUtils'
import {
  addMagicItem,
  attunementSlotCount,
  magicEquipmentSlug,
  magicItemSummary,
  removeMagicItem,
  setMagicAttunement,
} from './magicItemInventory'

const character = (patch: Partial<Character> = {}): Character => ({
  class: 'Fighter',
  level: 5,
  abilities: { DEX: { modifier: 2 } },
  inventory: [],
  armorClass: 12,
  ...patch,
} as Character)

const row = (slug: string, attuned = false): EquippedItem => ({
  equipmentSlug: magicEquipmentSlug(slug),
  magicItemSlug: slug,
  quantity: 1,
  equipped: false,
  attuned,
})

describe('magic item inventory', () => {
  it('keeps three attunement slots, and more for an artificer', () => {
    expect(attunementSlotCount(character())).toBe(3)
    expect(attunementSlotCount(character({ class: 'Artificer', level: 9 }))).toBe(3)
    expect(attunementSlotCount(character({ class: 'Artificer', level: 10 }))).toBe(4)
    expect(attunementSlotCount(character({ class: 'Artificer', level: 14 }))).toBe(5)
    expect(attunementSlotCount(character({ class: 'Artificer', level: 18 }))).toBe(6)
  })

  it('stacks a repeated item and removes it by the catalog slug', () => {
    const once = addMagicItem(character(), 'potion-of-healing')
    const twice = addMagicItem(once, 'potion-of-healing')
    expect(twice.inventory).toEqual([
      expect.objectContaining({ magicItemSlug: 'potion-of-healing', quantity: 2, equipmentSlug: 'magic:potion-of-healing' }),
    ])
    expect(removeMagicItem(twice, 'potion-of-healing').inventory?.[0].quantity).toBe(1)
    expect(removeMagicItem(once, 'potion-of-healing').inventory).toEqual([])
  })

  it('stops attunement at the slot cap and allows it only when the item requires it', () => {
    const full = character({
      inventory: [row('a', true), row('b', true), row('c', true), row('d')],
    })
    expect(setMagicAttunement(full, 'd', true, true).error).toMatch(/Already attuned/)
    expect(setMagicAttunement(full, 'd', true, false).error).toMatch(/does not require/)
    const freed = setMagicAttunement(full, 'a', false, true).character
    expect(setMagicAttunement(freed, 'd', true, true).character.inventory?.find(item => item.magicItemSlug === 'd')?.attuned).toBe(true)
  })

  it('adds an attuned AC bonus on top of armor class', () => {
    const prior = getMagicItemIndexSync()
    setMagicItemIndexCache([
      { slug: 'ring-of-protection', attunement: true, bonusAc: 1, bonusSavingThrow: 1 },
      { slug: 'cloak', attunement: false, bonusAc: 1 },
    ] as never)
    try {
      const carried = character({ inventory: [row('ring-of-protection')] })
      expect(recalculateAC(carried)).toBe(12)
      expect(recalculateAC(character({ inventory: [row('ring-of-protection', true)] }))).toBe(13)
      expect(recalculateAC(character({ inventory: [row('cloak')] }))).toBe(13)
    } finally {
      setMagicItemIndexCache(prior)
    }
  })

  it('labels structured bonuses without rewriting the description', () => {
    expect(magicItemSummary({
      bonusAc: 1,
      bonusSavingThrow: 1,
      abilityScoreSet: { CON: 19 },
      resist: ['poison'],
      charges: 20,
      recharge: 'dawn',
      rechargeAmount: '2d8 + 4',
    })).toEqual([
      '+1 AC',
      '+1 saving throws',
      'CON becomes 19',
      'Resistance: poison',
      '20 charges, regains 2d8 + 4 at dawn',
    ])
  })
})
