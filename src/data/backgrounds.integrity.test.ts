import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Background } from '../types/dnd'
import backgrounds from './backgrounds.json'
import feats from './feats.json'
import { resolveBackgroundSlug } from '../services/dataService'
import { toSkillName } from '../utils/backgroundUtils'

/**
 * Backgrounds lane rules (sourcebooks/build_backgrounds.py): one record per background and edition,
 * 2024 slugs end in `-2024`, feat refs resolve, and every background has text.
 */
const BACKGROUNDS = backgrounds as unknown as Background[]
const BY_SLUG = new Map(BACKGROUNDS.map(b => [b.slug, b]))
const FEATS = new Map((feats as Array<{ slug: string; edition: string }>).map(f => [f.slug, f]))

const CHUNK_DIR = join(__dirname, 'content', 'backgrounds')
const CHUNKS = new Map<string, { description: string }>(
  readdirSync(CHUNK_DIR).flatMap(file =>
    (JSON.parse(readFileSync(join(CHUNK_DIR, file), 'utf8')) as Array<{ slug: string; description: string }>)
      .map(r => [r.slug, r] as [string, { description: string }])),
)

describe('backgrounds data integrity', () => {
  it('has unique slugs, and 2024 slugs end in -2024', () => {
    expect(BY_SLUG.size).toBe(BACKGROUNDS.length)
    expect(BACKGROUNDS.length).toBeGreaterThan(100)
    BACKGROUNDS.forEach(b => {
      expect(b.edition === '2014' || b.edition === '2024', b.slug).toBe(true)
      expect(b.slug.endsWith('-2024'), b.slug).toBe(b.edition === '2024')
    })
  })

  it('gives every background text, inline or in its source chunk', () => {
    BACKGROUNDS.forEach(b => {
      expect(b.description || CHUNKS.get(b.slug)?.description, b.slug).toBeTruthy()
    })
    expect([...CHUNKS.keys()].every(slug => BY_SLUG.has(slug))).toBe(true)
  })

  it('uses real skill names', () => {
    BACKGROUNDS.forEach(b => {
      ;[...b.skill_proficiencies, ...(b.skillChoices?.from ?? [])].forEach(skill => {
        expect(toSkillName(skill), `${b.slug} ${skill}`).toBeTruthy()
      })
    })
  })

  it('resolves every background feat to a feat of the same edition', () => {
    BACKGROUNDS.forEach(b => {
      ;[b.originFeat, ...(b.originFeatOptions ?? [])].filter(Boolean).forEach(slug => {
        expect(FEATS.get(slug!)?.edition, `${b.slug} -> ${slug}`).toBe(b.edition)
      })
    })
  })

  it('keeps the book Origin Feats for the 2024 core backgrounds', () => {
    expect(BY_SLUG.get('acolyte-2024')?.originFeat).toBe('magic-initiate-cleric-2024')
    expect(BY_SLUG.get('sage-2024')?.originFeat).toBe('magic-initiate-wizard-2024')
    expect(BY_SLUG.get('criminal-2024')?.originFeat).toBe('alert-2024')
    expect(BY_SLUG.get('farmer-2024')?.originFeat).toBe('tough-2024')
    expect(resolveBackgroundSlug('guild-artisan-2024')).toBe('artisan-2024')
  })
})
