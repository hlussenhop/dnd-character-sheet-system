import { describe, it, expect } from 'vitest'
import type { Character, CharacterCreationData } from '../types/dnd'
import { BACKGROUNDS, getFeatBySlug, loadClasses, resolveFeatSlug } from '../services/dataService'
import { loadFeatDescription } from '../services/featDescriptions'
import { calculateCharacterStats } from './characterCreationUtils'
import { applyFeatAbilityIncreases, getFeatChoiceSections, getMissingFeatPicks, resolveFeatGrants } from './featGrantUtils'
import { applyFeatGrants } from './levelUpUtils'

const ctx = { edition: '2024' as const, level: 5, walkSpeed: 30 }
const scores = { STR: 10, DEX: 14, CON: 14, INT: 10, WIS: 10, CHA: 19 }

const fighter = loadClasses('2024').find(c => c.slug.startsWith('fighter')) ?? loadClasses('2024')[0]
const create = (overrides: Partial<CharacterCreationData>) =>
  calculateCharacterStats({
    name: 'Test',
    level: 1,
    edition: '2024',
    classSlug: fighter.slug,
    speciesSlug: 'human-2024',
    abilities: { STR: 10, DEX: 14, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    abilityScoreMethod: 'custom',
    background: 'soldier-2024',
    alignment: 'Neutral Good',
    selectedSkills: [],
    selectedMusicalInstruments: [],
    equipmentChoices: [],
    hpCalculationMethod: 'max',
    spellSelection: { cantrips: [], spells: [] },
    ...overrides,
  } as unknown as CharacterCreationData)

describe('feat slugs', () => {
  it('maps a plain slug to the record of the character edition', () => {
    expect(resolveFeatSlug('alert', '2024')).toBe('alert-2024')
    expect(resolveFeatSlug('alert', '2014')).toBe('alert')
    expect(resolveFeatSlug('alert-2024', '2024')).toBe('alert-2024')
    expect(resolveFeatSlug('dwarf-fortitude', '2014')).toBe('dwarven-fortitude')
    expect(getFeatBySlug('tough', '2024')?.slug).toBe('tough-2024')
  })

  it('loads descriptions from the lazy chunks', async () => {
    const text = await loadFeatDescription(getFeatBySlug('alert-2024')!)
    expect(text).toMatch(/Initiative/)
    expect(await loadFeatDescription(getFeatBySlug('versatile')!)).toBeTruthy()
  })
})

describe('resolveFeatGrants and applyFeatAbilityIncreases', () => {
  it('applies fixed grants', () => {
    expect(resolveFeatGrants(['alert-2024'], ctx).initiativeProficiency).toBe(true)
    expect(resolveFeatGrants(['alert'], { ...ctx, edition: '2014' }).initiativeBonus).toBe(5)
    expect(resolveFeatGrants(['tough-2024'], ctx).hpPerLevel).toBe(2)
    expect(resolveFeatGrants(['speedy-2024'], ctx).speedBonus).toBe(10)
    expect(resolveFeatGrants(['infernal-constitution'], { ...ctx, edition: '2014' }).resistances).toEqual(['cold', 'poison'])
    expect(resolveFeatGrants(['boon-of-poison-mastery-2024'], ctx).damageImmunities).toEqual(['poison'])
  })

  it('applies stored picks and ignores invalid ones', () => {
    const resilient = getFeatBySlug('resilient-2024')!
    expect(getMissingFeatPicks(resilient, undefined).map(s => s.id)).toEqual(['abilityChoice', 'savingThrows'])
    const featChoices = { 'resilient-2024': { abilityChoice: 'CON', savingThrows: ['CON'] } }
    expect(getMissingFeatPicks(resilient, featChoices['resilient-2024'])).toEqual([])
    expect(resolveFeatGrants(['resilient-2024'], { ...ctx, featChoices }).savingThrows).toEqual(['CON'])
    const portal = { 'portal-jumper-2024': { resistances: ['fire', 'psychic'] } }
    expect(resolveFeatGrants(['portal-jumper-2024'], { ...ctx, featChoices: portal }).resistances).toEqual(['psychic'])
  })

  it('raises the chosen ability up to the feat cap', () => {
    const featChoices = { 'fey-touched-2024': { abilityChoice: 'CHA' } }
    expect(applyFeatAbilityIncreases(scores, ['fey-touched-2024'], '2024', featChoices).CHA).toBe(20)
    expect(applyFeatAbilityIncreases({ ...scores, CHA: 20 }, ['fey-touched-2024'], '2024', featChoices).CHA).toBe(20)
    expect(applyFeatAbilityIncreases(scores, ['fey-touched-2024'], '2024')).toEqual(scores)
  })

  it('offers choice sections for multi-option feats', () => {
    expect(getFeatChoiceSections(getFeatBySlug('resilient-2024')).map(s => s.key)).toEqual(['abilityChoice', 'savingThrows'])
    expect(getFeatChoiceSections(getFeatBySlug('tough-2024'))).toEqual([])
  })
})

describe('feats at character creation', () => {
  it('applies the background Origin Feat', () => {
    expect(BACKGROUNDS.find(b => b.slug === 'farmer-2024')?.originFeat).toBe('tough-2024')
    const soldier = create({})
    const outlander = create({ background: 'farmer-2024' })
    expect(outlander.maxHitPoints - soldier.maxHitPoints).toBe(2)
    const criminal = create({ background: 'criminal-2024' })
    expect(criminal.initiative - soldier.initiative).toBe(criminal.proficiencyBonus)
  })

  it('applies feat picks and ability increases', () => {
    const c = create({
      level: 4,
      cumulativeASI: [{ level: 4, type: 'feat', featSlug: 'resilient' }],
      featChoices: { 'resilient-2024': { abilityChoice: 'WIS', savingThrows: ['WIS'] } },
    } as Partial<CharacterCreationData>)
    expect(c.abilities.WIS.score).toBe(11)
    expect(c.savingThrowProficiencies).toEqual(['WIS'])
  })
})

describe('feats at level-up', () => {
  it('applies grants when the feat is gained', () => {
    const c = create({ level: 4 }) as Character
    const before = { hp: c.maxHitPoints, initiative: c.initiative }
    applyFeatGrants(c, 'tough-2024')
    expect(c.maxHitPoints - before.hp).toBe(8)
    applyFeatGrants(c, 'alert-2024')
    expect(c.initiative - before.initiative).toBe(c.proficiencyBonus)
    c.featChoices = { 'dragonscarred-2024': { resistances: 'fire' } }
    applyFeatGrants(c, 'dragonscarred-2024')
    expect(c.damageResistances).toContain('fire')
  })
})
