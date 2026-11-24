import { describe, it, expect } from 'vitest'
import { loadSpecies, loadFeats, SPECIES_LANGUAGE_MAP } from '../services/dataService'
import { featureDescriptions, getFeatureDescription } from '../utils/featureDescriptions'
import enhancedSpeciesData from './enhancedSpeciesData.json'

const species = loadSpecies()

const traitNames = (s: (typeof species)[number]) => [
  ...s.species_traits,
  ...(s.variants ?? []).flatMap(v => v.species_traits),
]

describe('species data integrity', () => {
  it('has unique slugs', () => {
    const slugs = species.map(s => s.slug)
    expect(slugs.filter((s, i) => slugs.indexOf(s) !== i)).toEqual([])
  })

  it('edition matches the slug convention (-2024 suffix only on 2024 entries)', () => {
    const wrong = species.filter(s => s.slug.endsWith('-2024') !== (s.edition === '2024')).map(s => s.slug)
    expect(wrong).toEqual([])
  })

  it('only PHB 2014 species are core (2014 books outside the PHB are expanded)', () => {
    const wrong = species
      .filter(s => s.edition === '2014' && s.core && !(s.sources ?? [s.source]).includes('PHB'))
      .map(s => s.slug)
    expect(wrong).toEqual([])
  })

  it('every 2014 species cites a source and lists it in `sources`', () => {
    const wrong = species.filter(s => s.edition === '2014' && !(s.sources ?? []).includes(s.source)).map(s => s.slug)
    expect(wrong).toEqual([])
  })

  it('every trait has a description for its own edition', () => {
    const missing: string[] = []
    species.forEach(s =>
      traitNames(s).forEach(t => {
        if (!getFeatureDescription(t, s.edition)?.description) missing.push(`${s.slug}: ${t}`)
      }),
    )
    expect(missing).toEqual([])
  })

  it('every [2024] override key belongs to a trait a 2024 species uses', () => {
    // Every "<Name> [2024]" key must belong to a name a 2024 species actually uses.
    const used2024 = new Set(species.filter(s => s.edition === '2024').flatMap(traitNames))
    const stray = Object.keys(featureDescriptions)
      .filter(k => k.endsWith(' [2024]'))
      .filter(k => !used2024.has(k.replace(/ \[2024\]$/, '')))
    expect(stray).toEqual([])
  })

  it('2014 species never read a 2024 override', () => {
    const wrong = species
      .filter(s => s.edition === '2014')
      .flatMap(s => traitNames(s).map(t => ({ s, t })))
      .filter(({ s, t }) => getFeatureDescription(t, s.edition) !== featureDescriptions[t])
      .map(({ s, t }) => `${s.slug}: ${t}`)
    expect(wrong).toEqual([])
  })

  it('the 2024 text wins for 2024 species where the book differs', () => {
    expect(getFeatureDescription('Stonecunning', '2024')?.description).toMatch(/Tremorsense/)
    expect(getFeatureDescription('Stonecunning', '2014')?.description).toMatch(/History/)
    expect(getFeatureDescription('Fey Ancestry', '2024')?.description).not.toMatch(/sleep/)
    expect(getFeatureDescription('Fey Ancestry', '2014')?.description).toMatch(/sleep/)
    expect(getFeatureDescription('Darkvision (120 ft)', '2024')?.description).toMatch(/120/)
  })

  it('every species has a language entry', () => {
    const languages = SPECIES_LANGUAGE_MAP as Record<string, string[]>
    expect(species.filter(s => !languages[s.slug]).map(s => s.slug)).toEqual([])
    const known = new Set(species.map(s => s.slug))
    expect(Object.keys(languages).filter(slug => !known.has(slug))).toEqual([])
  })

  it('has no dangling feat references', () => {
    const feats = new Set(loadFeats().map(f => f.slug))
    const dangling: string[] = []
    species.forEach(s => {
      const refs = [
        ...((s as { species_feat_options?: string[] }).species_feat_options ?? []),
        ...(s.speciesFeatOptions ?? []),
        ...(s.speciesFeat ? [s.speciesFeat] : []),
      ]
      refs.filter(r => !feats.has(r)).forEach(r => dangling.push(`${s.slug}: ${r}`))
    })
    Object.entries(enhancedSpeciesData as Record<string, { speciesFeat?: string | null; speciesFeatOptions?: string[] }>).forEach(
      ([key, e]) => {
        ;[...(e.speciesFeatOptions ?? []), ...(e.speciesFeat ? [e.speciesFeat] : [])]
          .filter(r => !feats.has(r))
          .forEach(r => dangling.push(`enhanced ${key}: ${r}`))
      },
    )
    expect(dangling).toEqual([])
  })

  it('2024 Dragonborn grants no species feat (the book gives none)', () => {
    const db = species.find(s => s.slug === 'dragonborn-2024')!
    expect(db.speciesFeat ?? null).toBeNull()
    expect(db.speciesFeatOptions ?? []).toEqual([])
  })

  it('enhanced data only targets species that exist', () => {
    const bases = new Set(species.map(s => s.slug.replace(/-(2014|2024)$/, '')))
    expect(Object.keys(enhancedSpeciesData).filter(k => !bases.has(k) && !species.some(s => s.slug === k))).toEqual([])
  })

  it('2014 records do not inherit 2024-only mechanics from the shared enhanced data', () => {
    const leaked = species
      .filter(s => s.edition === '2014')
      .filter(s => (s as { lineages?: unknown }).lineages || s.speciesFeatOptions || s.baseSpeed !== undefined)
      .map(s => s.slug)
    expect(leaked).toEqual([])
  })

  it('variants: unique slugs, and variants of a flexible-ASI species restate the choice', () => {
    const problems: string[] = []
    species.forEach(s => {
      const slugs = (s.variants ?? []).map(v => v.slug)
      if (new Set(slugs).size !== slugs.length) problems.push(`${s.slug}: duplicate variant slug`)
      if (s.edition === '2014' && s.abilityChoice) {
        ;(s.variants ?? []).forEach(v => {
          if (!v.abilityChoice) problems.push(`${s.slug}/${v.slug}: variant replaces the parent's rules but has no abilityChoice`)
        })
      }
    })
    expect(problems).toEqual([])
  })

  it('every 2014 species grants ability scores (fixed or a choice) unless it has variants (Human)', () => {
    // Kuo-Toa and Merfolk are the DMG rows whose ability modifiers are "None".
    const none = species
      .filter(s => s.edition === '2014' && !s.abilityChoice && Object.keys(s.ability_bonuses ?? {}).length === 0 && !s.variants)
      .map(s => s.slug)
      .sort()
    expect(none).toEqual(['kuo-toa', 'merfolk'])
  })

  it('PHB 2014 species match the Player\'s Handbook (speeds and trait lists)', () => {
    const bySlug = Object.fromEntries(species.map(s => [s.slug, s]))
    expect(['lightfoot-halfling', 'stout-halfling', 'forest-gnome', 'rock-gnome'].map(k => bySlug[k].speed)).toEqual([25, 25, 25, 25])
    expect(['mountain-dwarf', 'hill-dwarf'].map(k => bySlug[k].speed)).toEqual([25, 25])
    expect(bySlug['wood-elf'].speed).toBe(35)
    expect(bySlug['mountain-dwarf'].species_traits).toContain('Dwarven Armor Training')
    expect(bySlug['hill-dwarf'].species_traits).toContain('Dwarven Toughness')
    expect(bySlug['high-elf'].species_traits).toEqual(expect.arrayContaining(['Keen Senses', 'Extra Language']))
    expect(bySlug['drow'].species_traits).toEqual(expect.arrayContaining(['Superior Darkvision', 'Drow Weapon Training']))
    expect(bySlug['half-orc'].ability_bonuses).toEqual({ STR: 2, CON: 1 })
    // book trait names, without app-added qualifiers
    species
      .filter(s => s.edition === '2014' && s.core)
      .flatMap(s => s.species_traits.map(t => ({ s, t })))
      .forEach(({ s, t }) => expect(`${s.slug}: ${t}`).not.toMatch(/\(.*\)/))
  })
})
