import { describe, it, expect } from 'vitest'
import monsterIndex from './monsterIndex.json'
import type { Monster } from '../types/dnd'
import { getMonster, loadMonsters, monsterFromIndex, type MonsterIndexEntry } from '../services/monsters'

const index = monsterIndex as MonsterIndexEntry[]

const TYPES = new Set([
  'aberration', 'beast', 'celestial', 'construct', 'dragon', 'elemental', 'fey', 'fiend',
  'giant', 'humanoid', 'monstrosity', 'ooze', 'plant', 'undead',
])

describe('monster index', () => {
  it('keeps one creature per name and edition', () => {
    const slugs = index.map(monster => monster.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
    expect(index).toHaveLength(2414)
    expect(index.filter(monster => monster.edition === '2014')).toHaveLength(1646)
    expect(index.filter(monster => monster.edition === '2024')).toHaveLength(768)
    expect(index.every(monster => monster.edition === '2024' ? monster.slug.endsWith('-2024') : !monster.slug.endsWith('-2024'))).toBe(true)
    expect(index.every(monster => monster.sources[0] === monster.source && TYPES.has(monster.type))).toBe(true)
    expect(index.find(monster => monster.slug === 'aboleth')).toMatchObject({
      edition: '2014', source: 'MM', challenge_rating: 10, hit_points: 135, armor_class: 17,
    })
    const card = monsterFromIndex(index.find(monster => monster.slug === 'aboleth') as MonsterIndexEntry)
    expect(card.actions?.find(action => action.name === 'Tentacle')?.desc).toBe('')
    expect(card.legendary_actions?.length).toBeGreaterThan(0)
    expect(index.find(monster => monster.slug === 'aboleth-2024')?.source).toBe('XMM')
    expect(index.find(monster => monster.slug === 'goblin')?.edition).toBe('2014')
    expect(index.find(monster => monster.name === 'Battle Familiar (Brute)')?.source).toBe('AU')
  })

  it('loads a stat block with the book text and the structured attack bonus', async () => {
    const monsters = await loadMonsters(['MM'])
    const aboleth = monsters.find(monster => monster.index === 'aboleth') as Monster
    expect(aboleth.hit_points).toBe(135)
    expect(aboleth.armor_class[0]).toMatchObject({ value: 17 })
    expect(aboleth.speed.swim).toBe('40 ft.')
    const tentacle = aboleth.actions?.find(action => action.name === 'Tentacle')
    expect(tentacle?.attack_bonus).toBe(9)
    expect(tentacle?.desc).toMatch(/bludgeoning damage/)
    expect(tentacle?.desc).not.toMatch(/\{@/)
    expect(aboleth.special_abilities?.some(ability => ability.name === 'Lair Actions')).toBe(true)
    expect(await getMonster('aboleth-2024')).toMatchObject({ hit_points: 150, edition: '2024', source: 'XMM' })
  })
})
