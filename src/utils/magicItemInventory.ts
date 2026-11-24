import type { Character, EquippedItem, MagicItem } from '../types/dnd'
import { getMagicItemIndexSync } from '../services/magicItems'

/** A character attunes to three magic items. Artificer Magic Item Adept, Savant, and Master raise that. */
const ARTIFICER_SLOTS: { level: number; slots: number }[] = [
  { level: 18, slots: 6 },
  { level: 14, slots: 5 },
  { level: 10, slots: 4 },
]

export interface MagicBonusSource {
  slug: string
  attunement: boolean
  bonusAc?: number
  bonusSavingThrow?: number
}

export const magicEquipmentSlug = (slug: string): string => `magic:${slug}`

export const isArtificer = (character: Character): boolean =>
  character.class?.toLowerCase() === 'artificer'

export const attunementSlotCount = (character: Character): number => {
  if (!isArtificer(character)) return 3
  return ARTIFICER_SLOTS.find(step => character.level >= step.level)?.slots ?? 3
}

export const attunedItemCount = (character: Character): number =>
  character.inventory?.filter(item => item.attuned).length ?? 0

/** An attuned item is active. An item that does not require attunement is active while it is carried. */
export const magicItemIsActive = (row: EquippedItem, source: { attunement: boolean }): boolean => {
  if (!row.magicItemSlug) return false
  return source.attunement ? row.attuned === true : true
}

export const sumMagicBonus = (
  character: Character,
  index: MagicBonusSource[] | null | undefined,
  field: 'bonusAc' | 'bonusSavingThrow',
): number => {
  if (!index?.length) return 0
  const bySlug = new Map(index.map(item => [item.slug, item]))
  let total = 0
  for (const row of character.inventory ?? []) {
    if (!row.magicItemSlug) continue
    const source = bySlug.get(row.magicItemSlug)
    if (!source || !magicItemIsActive(row, source)) continue
    total += source[field] ?? 0
  }
  return total
}

export const magicAcBonus = (character: Character): number =>
  sumMagicBonus(character, getMagicItemIndexSync(), 'bonusAc')

export const magicSavingThrowBonus = (character: Character): number =>
  sumMagicBonus(character, getMagicItemIndexSync(), 'bonusSavingThrow')

export const addMagicItem = (character: Character, slug: string): Character => {
  const inventory = [...(character.inventory ?? [])]
  const existing = inventory.find(row => row.magicItemSlug === slug)
  if (existing) {
    return {
      ...character,
      inventory: inventory.map(row =>
        row.magicItemSlug === slug ? { ...row, quantity: row.quantity + 1 } : row,
      ),
    }
  }
  inventory.push({
    equipmentSlug: magicEquipmentSlug(slug),
    magicItemSlug: slug,
    quantity: 1,
    equipped: false,
  })
  return { ...character, inventory }
}

export const removeMagicItem = (character: Character, slug: string, quantity = 1): Character => {
  const inventory = (character.inventory ?? []).flatMap(row => {
    if (row.magicItemSlug !== slug) return [row]
    const next = row.quantity - quantity
    return next > 0 ? [{ ...row, quantity: next }] : []
  })
  return { ...character, inventory }
}

export const setMagicAttunement = (
  character: Character,
  slug: string,
  attuned: boolean,
  requiresAttunement: boolean,
): { character: Character; error?: string } => {
  const row = character.inventory?.find(item => item.magicItemSlug === slug)
  if (!row) return { character, error: 'That item is not in the inventory.' }
  if (attuned && !requiresAttunement) {
    return { character, error: 'This item does not require attunement.' }
  }
  if (attuned && !row.attuned && attunedItemCount(character) >= attunementSlotCount(character)) {
    const slots = attunementSlotCount(character)
    return { character, error: `Already attuned to ${slots} item${slots === 1 ? '' : 's'}.` }
  }
  return {
    character: {
      ...character,
      inventory: character.inventory?.map(item =>
        item.magicItemSlug === slug ? { ...item, attuned } : item,
      ),
    },
  }
}

const signed = (value: number): string => `${value > 0 ? '+' : ''}${value}`

/** Labels for the structured bonuses. The book text stays on `description`. */
export const magicItemSummary = (item: Pick<
  MagicItem,
  | 'bonusAc' | 'bonusSavingThrow' | 'bonusWeapon' | 'bonusWeaponAttack' | 'bonusWeaponDamage'
  | 'bonusSpellAttack' | 'bonusSpellSaveDc' | 'bonusAbilityCheck' | 'bonusProficiencyBonus'
  | 'bonusSavingThrowConcentration' | 'abilityScoreSet' | 'abilityBonus' | 'resist' | 'immune'
  | 'charges' | 'recharge' | 'rechargeAmount'
>): string[] => {
  const lines: string[] = []
  const add = (value: number | undefined, label: string) => {
    if (value) lines.push(`${signed(value)} ${label}`)
  }
  add(item.bonusAc, 'AC')
  add(item.bonusSavingThrow, 'saving throws')
  add(item.bonusSavingThrowConcentration, 'concentration saves')
  add(item.bonusWeapon, 'weapon attacks and damage')
  add(item.bonusWeaponAttack, 'weapon attack rolls')
  add(item.bonusWeaponDamage, 'weapon damage')
  add(item.bonusSpellAttack, 'spell attack rolls')
  add(item.bonusSpellSaveDc, 'spell save DC')
  add(item.bonusAbilityCheck, 'ability checks')
  add(item.bonusProficiencyBonus, 'proficiency bonus')
  if (item.abilityScoreSet) {
    for (const [ability, score] of Object.entries(item.abilityScoreSet)) {
      if (score !== undefined) lines.push(`${ability} becomes ${score}`)
    }
  }
  if (item.abilityBonus) {
    for (const [ability, bonus] of Object.entries(item.abilityBonus)) {
      if (bonus) lines.push(`${signed(bonus)} ${ability}`)
    }
  }
  if (item.resist?.length) lines.push(`Resistance: ${item.resist.join(', ')}`)
  if (item.immune?.length) lines.push(`Immunity: ${item.immune.join(', ')}`)
  if (item.charges) {
    const recharge = item.recharge ? `, regains ${item.rechargeAmount ? `${item.rechargeAmount} ` : ''}at ${item.recharge}` : ''
    lines.push(`${item.charges} charges${recharge}`)
  }
  return lines
}
