import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AbilityName, Feat, SkillName } from '../types/dnd'
import feats from './feats.json'
import backgrounds from './backgrounds.json'

/**
 * Feats lane rules (sourcebooks/build_feats.py): one record per feat and edition, 2024 slugs end in
 * `-2024`, every reference to a feat resolves (species refs: speciesData.integrity.test.ts), and every feat has text (inline or in a lazy chunk).
 */
const FEATS = feats as unknown as Feat[]
const BY_SLUG = new Map(FEATS.map(f => [f.slug, f]))
/** Records kept by hand (no mirror counterpart) */
const HAND_KEPT = ['versatile']

const CHUNK_DIR = join(__dirname, 'content', 'feats')
const CHUNKS = new Map<string, string>(
  readdirSync(CHUNK_DIR).flatMap(file =>
    (JSON.parse(readFileSync(join(CHUNK_DIR, file), 'utf8')) as Array<{ slug: string; description: string }>)
      .map(r => [r.slug, r.description] as [string, string])),
)

const ABILITIES: AbilityName[] = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA']
const SKILLS: SkillName[] = [
  'Acrobatics', 'AnimalHandling', 'Arcana', 'Athletics', 'Deception', 'History', 'Insight', 'Intimidation',
  'Investigation', 'Medicine', 'Nature', 'Perception', 'Performance', 'Persuasion', 'Religion',
  'SleightOfHand', 'Stealth', 'Survival',
]
const CATEGORIES = ['origin', 'general', 'epic_boon', 'fighting_style', 'dragonmark', 'dark_gift', 'species']

describe('feats data integrity', () => {
  it('has unique slugs', () => {
    expect(BY_SLUG.size).toBe(FEATS.length)
  })

  it('keeps 2014 and 2024 apart: edition matches year, 2024 slugs end in -2024', () => {
    FEATS.forEach(f => {
      expect(String(f.year), f.slug).toBe(f.edition)
      if (HAND_KEPT.includes(f.slug)) return
      expect(f.slug.endsWith('-2024'), f.slug).toBe(f.edition === '2024')
    })
  })

  it('gives every feat a category, benefits and text', () => {
    FEATS.forEach(f => {
      expect(CATEGORIES, f.slug).toContain(f.category)
      expect(f.benefits.length, f.slug).toBeGreaterThan(0)
      expect(f.description ?? CHUNKS.get(f.slug), f.slug).toBeTruthy()
    })
    expect([...CHUNKS.keys()].every(slug => BY_SLUG.has(slug))).toBe(true)
  })

  it('uses valid abilities and skills in increases and grants', () => {
    FEATS.forEach(f => {
      f.abilityScoreIncrease?.options.forEach(a => expect(ABILITIES, f.slug).toContain(a))
      const g = f.grants ?? {}
      ;[...(g.skills ?? []), ...(g.skillChoices?.from ?? []), ...(g.expertise ?? [])]
        .forEach(s => expect(SKILLS, f.slug).toContain(s))
      ;[...(g.savingThrows ?? []), ...(g.savingThrowChoices?.from ?? [])].forEach(a => expect(ABILITIES, f.slug).toContain(a))
    })
  })

  it('resolves feat prerequisites to feats of the same edition', () => {
    FEATS.forEach(f => {
      f.prerequisites?.anyOf?.forEach(g => g.feats?.forEach(slug => {
        expect(BY_SLUG.get(slug)?.edition, `${f.slug} -> ${slug}`).toBe(f.edition)
      }))
    })
  })

  it('resolves every background feat to a feat of the same edition', () => {
    const CORE_2024 = ['acolyte-2024', 'criminal-2024', 'entertainer-2024', 'artisan-2024', 'sage-2024', 'soldier-2024']
    ;(backgrounds as Array<{ slug: string; edition?: string; originFeat?: string; originFeatOptions?: string[] }>)
      .forEach(b => {
        ;[b.originFeat, ...(b.originFeatOptions ?? [])].filter(Boolean).forEach(slug => {
          const feat = BY_SLUG.get(slug!)
          expect(feat, `${b.slug} -> ${slug}`).toBeDefined()
          expect(feat!.edition, b.slug).toBe(b.edition)
        })
      })
    CORE_2024.forEach(slug => {
      const background = (backgrounds as Array<{ slug: string; originFeat?: string }>).find(b => b.slug === slug)
      expect(BY_SLUG.get(background!.originFeat!)?.category, slug).toBe('origin')
    })
  })

})
