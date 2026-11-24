#!/usr/bin/env python3
"""Species lane, batch B2: the 14 standalone species new in Mordenkainen Presents: Monsters of the Multiverse.

Reads the 5etools `races.json` mirror (cached), builds a record per species, reports trait-name
conflicts against what is already stored (featureDescriptions.json is keyed by trait name, shared
across species and editions), and with --apply appends the records to species.json and the texts
to featureDescriptions.json / speciesLanguages.json.

Usage:
  python3 sourcebooks/build_species_b2.py            # draft + conflict report only
  python3 sourcebooks/build_species_b2.py --apply    # write app data (refuses while conflicts remain)
"""
import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_species_b1 import (  # noqa: E402
    ALL_PATTERNS, CACHE, DATA, SKIP_ENTRIES, entry_text, find_race, load_races, norm,
)

BOOK = 'Mordenkainen Presents: Monsters of the Multiverse'

# slug, canonical race name, app name, tags, typical roles, description (hand-written flavor)
SPECIES = [
    dict(slug='aarakocra', canon='Aarakocra', tags=['exotic', 'elemental'],
         roles=['Ranger', 'Monk', 'Druid', 'Rogue'],
         description="Aarakocra are bird-folk native to the Elemental Plane of Air. With feathered wings and "
                     "taloned hands, they are scouts and skirmishers who prize the freedom of the open sky."),
    dict(slug='centaur', canon='Centaur', tags=['exotic', 'fey'],
         roles=['Ranger', 'Druid', 'Fighter', 'Barbarian'],
         description="Centaurs have the upper body of a humanoid and the lower body of a horse. Swift and "
                     "powerful, they are creatures of the wilds who charge into battle and run the plains."),
    dict(slug='changeling', canon='Changeling', tags=['exotic', 'fey'],
         roles=['Rogue', 'Bard', 'Warlock', 'Sorcerer'],
         description="Changelings are fey shapeshifters who can alter their faces and voices at will. "
                     "They blend into any society, and many guard their true selves closely."),
    dict(slug='deep-gnome', canon='Deep Gnome', tags=['exotic'],
         roles=['Rogue', 'Wizard', 'Artificer', 'Ranger'],
         description="Deep gnomes, or svirfneblin, live in the Underdark. They are small, stone-gray and wary, "
                     "with a talent for hiding among rock and for resisting magic."),
    dict(slug='duergar', canon='Duergar', tags=['exotic'],
         roles=['Fighter', 'Cleric', 'Rogue', 'Wizard'],
         description="Duergar, or gray dwarves, are dwarves of the Underdark whose spirit was bent by mind flayer "
                     "psionics. They are grim, resilient and gifted with innate magic."),
    dict(slug='eladrin', canon='Eladrin', tags=['exotic', 'fey'],
         roles=['Wizard', 'Bard', 'Ranger', 'Sorcerer'],
         description="Eladrin are elves of the Feywild whose moods shift with the seasons. They can step through "
                     "space in a flash of fey magic."),
    dict(slug='githzerai', canon='Githzerai', tags=['monstrous', 'planar'],
         roles=['Monk', 'Wizard', 'Psion', 'Fighter'],
         description="Githzerai are disciplined ascetics from the chaos of Limbo. They hone their minds to "
                     "shield themselves from psychic harm and shape their surroundings by will."),
    dict(slug='lizardfolk', canon='Lizardfolk', tags=['monstrous'],
         roles=['Barbarian', 'Ranger', 'Druid', 'Fighter'],
         description="Lizardfolk are reptilian survivors of swamps and rivers. Practical and unsentimental, they "
                     "hunt with tooth and claw and read the wild with a keen instinct."),
    dict(slug='minotaur', canon='Minotaur', tags=['monstrous'],
         roles=['Barbarian', 'Fighter', 'Paladin', 'Ranger'],
         description="Minotaurs are bull-headed warriors of great strength. They charge into foes with their "
                     "horns and rarely lose their way, however twisting the path."),
    dict(slug='satyr', canon='Satyr', tags=['exotic', 'fey'],
         roles=['Bard', 'Rogue', 'Druid', 'Warlock'],
         description="Satyrs are fey revelers with goat legs and horns. They love music, wine and good company, "
                     "and are hard for magic to bend."),
    dict(slug='sea-elf', canon='Sea Elf', tags=['exotic', 'fey'],
         roles=['Ranger', 'Fighter', 'Druid', 'Bard'],
         description="Sea elves are elves of the ocean depths. They breathe the sea's secrets, swim with ease and "
                     "can speak with creatures that live below the waves."),
    dict(slug='shadar-kai', canon='Shadar-Kai', name='Shadar-Kai', tags=['exotic', 'fey'],
         roles=['Rogue', 'Warlock', 'Fighter', 'Monk'],
         description="Shadar-kai are elves of the Shadowfell, touched by the Raven Queen. They are austere and "
                     "pale, and they can slip briefly through the shadows."),
    dict(slug='shifter', canon='Shifter', tags=['exotic'],
         roles=['Ranger', 'Barbarian', 'Rogue', 'Druid'],
         description="Shifters carry lycanthropic ancestry that lets them assume a more bestial form for a short "
                     "time. Each shifter's instincts favor a particular beast-like gift."),
    dict(slug='tortle', canon='Tortle', tags=['exotic'],
         roles=['Druid', 'Monk', 'Cleric', 'Ranger'],
         description="Tortles are turtle-like wanderers with a protective shell. They carry their home on their "
                     "backs and travel in search of new places to understand."),
]

VARIANT_DESCRIPTION = {
    'beasthide': "Tough and resilient: you gain extra temporary hit points and +1 AC while shifted.",
    'longtooth': "Fierce and aggressive: you gain a fanged bite attack while shifted.",
    'swiftstride': "Graceful and quick: you gain extra speed and can move without provoking while shifted.",
    'wildhunt': "Sharp-eyed and attuned: you gain advantage on Wisdom checks and saves while shifted.",
}

# Conflicts: (slug, canonical trait name) -> name to use in the app
RENAMES = {
    ('lizardfolk', 'Speed'): 'Swimming Speed',
    ('sea-elf', 'Speed'): 'Swimming Speed',
    # MPMM elves protect against charm only; the sleep immunity moved into Trance
    ('eladrin', 'Fey Ancestry'): 'Fey Ancestry (Charmed Only)',
    ('sea-elf', 'Fey Ancestry'): 'Fey Ancestry (Charmed Only)',
    ('shadar-kai', 'Fey Ancestry'): 'Fey Ancestry (Charmed Only)',
    ('sea-elf', 'Trance'): 'Trance (4-Hour Rest)',
    ('shadar-kai', 'Trance'): 'Trance (4-Hour Rest)',
    ('eladrin', 'Trance'): 'Trance (Change Season)',
    ('deep-gnome', 'Darkvision'): 'Darkvision (120 ft)',
    ('duergar', 'Darkvision'): 'Darkvision (120 ft)',
    # same name, different numbers (Loxodon keeps the plain `Natural Armor`)
    ('lizardfolk', 'Natural Armor'): 'Natural Armor (13 + Dex)',
    ('tortle', 'Natural Armor'): 'Natural Armor (Shell, AC 17)',
    ('lizardfolk', 'Hold Breath'): 'Hold Breath (15 Minutes)',
    ('tortle', 'Hold Breath'): 'Hold Breath (1 Hour)',
    ('lizardfolk', "Nature's Intuition"): "Nature's Intuition (Two Skills)",
    ('tortle', "Nature's Intuition"): "Nature's Intuition (One Skill)",
}
# Names already stored whose existing text says the same thing: keep it.
ACCEPT_KEEP_EXISTING = {'Dwarven Resilience', 'Keen Senses', 'Swimming Speed', 'Darkvision', 'Darkvision (120 ft)'}
PREFERRED_TEXT_FROM = {}


def slugify(s):
    return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')


def build(races):
    drafts = []
    for cfg in SPECIES:
        race = find_race(races, cfg['canon'], 'MPMM')
        slug = cfg['slug']

        def app_name(n, slug=slug):
            return RENAMES.get((slug, n), n)

        # base entries replaced by a version are rendered per version instead
        replaced = set()
        versions = race.get('_versions') or []
        if isinstance(versions, dict):
            versions = [versions]
        for v in versions:
            mod = v['_mod']['entries']
            mods = mod if isinstance(mod, list) else [mod]
            replaced |= {m['replace'] for m in mods if isinstance(m, dict) and m.get('mode') == 'replaceArr'}

        traits = [(app_name(e['name']), entry_text(e)) for e in race['entries']
                  if isinstance(e, dict) and e.get('name') not in SKIP_ENTRIES and e['name'] not in replaced]

        variants = []
        for v in versions:
            vname = v['name'].split(';', 1)[1].strip()
            mod = v['_mod']['entries']
            mods = mod if isinstance(mod, list) else [mod]
            items = []
            for m in mods:
                its = m['items'] if isinstance(m['items'], list) else [m['items']]
                items += [(app_name(i['name']), entry_text(i)) for i in its]
            variants.append(dict(slug=slugify(vname), name=vname, traits=items))

        speed = race['speed']['walk'] if isinstance(race['speed'], dict) else race['speed']
        ref = f"{cfg['canon']}|MPMM".lower()
        sources = ['MPMM'] + sorted({
            x['source'] for k in ('race', 'subrace') for x in races[k]
            if x['source'] not in ('MPMM', 'DMG')
            and ref in [(y if isinstance(y, str) else y['uid']).lower() for y in x.get('reprintedAs', [])]
        })
        drafts.append(dict(cfg, name=cfg.get('name', cfg['canon']), speed=speed, traits=traits, variants=variants,
                           sources=sources, size=race.get('size')))
    return drafts


def report_conflicts(drafts, feature_desc, species_json):
    users = {}
    for s in species_json:
        for t in s['species_traits'] + [x for v in s.get('variants', []) for x in v['species_traits']]:
            users.setdefault(t, set()).add(s['slug'])
    batch = {d['slug'] for d in drafts}
    texts = {}
    for d in drafts:
        for n, t in d['traits'] + [x for v in d['variants'] for x in v['traits']]:
            texts.setdefault(n, {}).setdefault(norm(t), (t, set()))[1].add(d['slug'])
    problems = 0
    for n, variants in sorted(texts.items()):
        if len(variants) > 1 and n not in ACCEPT_KEEP_EXISTING:
            problems += 1
            print(f'!! "{n}" has {len(variants)} different new texts in B2:')
            for _, (t, who) in variants.items():
                print(f'     {sorted(who)}: {t[:110]}')
        new = next(iter(variants.values()))[0]
        cur = feature_desc.get(n, {}).get('description')
        outside = sorted(u for u in users.get(n, set()) if u not in batch)
        if cur is not None and norm(cur) != norm(new) and n not in ACCEPT_KEEP_EXISTING:
            problems += 1
            print(f'?? "{n}" is stored (used by {outside}) and the new text differs:')
            print(f'     old: {cur[:150]}')
            print(f'     new: {new[:150]}')
        elif cur is not None and norm(cur) != norm(new):
            print(f'-- "{n}" kept as stored (used by {outside}); B2 text differs only in wording:')
            print(f'     stored: {cur[:120]}')
            print(f'     book  : {new[:120]}')
    print(f'\n{problems} conflicts')
    return problems


def apply(drafts, species_doc, feature_desc, languages):
    species = species_doc['species']
    existing = {s['slug'] for s in species}
    for d in drafts:
        assert d['slug'] not in existing, d['slug']
        choice = {'patterns': ALL_PATTERNS}
        rec = {
            'slug': d['slug'],
            'name': d['name'],
            'edition': '2014',
            'source': 'MPMM',
            'speed': d['speed'],
            'ability_bonuses': {},
            'species_traits': [n for n, _ in d['traits']],
            'description': d['description'],
            'typicalRoles': d['roles'],
            'sources': d['sources'],
            'core': False,
            'expanded': True,
            'tags': d['tags'] + ['legacy'],
            'legacy': True,
            'abilityChoice': choice,
        }
        if d['variants']:
            rec['variants'] = [{
                'slug': v['slug'],
                'name': v['name'],
                'description': VARIANT_DESCRIPTION.get(v['slug'], ''),
                'ability_bonuses': {},
                'species_traits': [n for n, _ in v['traits']],
                'features': [],
                'abilityChoice': choice,
            } for v in d['variants']]
        species.append(rec)
        for n, t in d['traits'] + [x for v in d['variants'] for x in v['traits']]:
            if n in ACCEPT_KEEP_EXISTING and n in feature_desc:
                continue
            if n in PREFERRED_TEXT_FROM and PREFERRED_TEXT_FROM[n] != d['slug'] and n in feature_desc:
                continue
            feature_desc[n] = {'description': t, 'source': BOOK}
        languages['SPECIES_LANGUAGE_MAP'][d['slug']] = ['Common']
    species_doc['metadata']['totalSpecies'] = len(species)
    species_doc['metadata']['lastUpdated'] = '2026-11-22'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--apply', action='store_true')
    args = ap.parse_args()

    races = load_races()
    species_doc = json.loads((DATA / 'species.json').read_text())
    feature_desc = json.loads((DATA / 'featureDescriptions.json').read_text())
    languages = json.loads((DATA / 'speciesLanguages.json').read_text())

    drafts = build(races)
    for d in drafts:
        print(f"{d['slug']:<12} speed={d['speed']} size={d['size']} sources={d['sources']}\n"
              f"    traits={[n for n, _ in d['traits']]}"
              + (f"\n    variants={[(v['name'], [n for n, _ in v['traits']]) for v in d['variants']]}" if d['variants'] else ''))
    print()
    problems = report_conflicts(drafts, feature_desc, species_doc['species'])
    (CACHE / 'species_b2_draft.json').write_text(json.dumps(drafts, indent=1))

    if args.apply:
        if problems:
            print('refusing to --apply with unresolved conflicts', file=sys.stderr)
            sys.exit(1)
        apply(drafts, species_doc, feature_desc, languages)
        (DATA / 'species.json').write_text(json.dumps(species_doc, indent=2, ensure_ascii=False) + '\n')
        (DATA / 'featureDescriptions.json').write_text(json.dumps(feature_desc, indent=2, ensure_ascii=False) + '\n')
        (DATA / 'speciesLanguages.json').write_text(json.dumps(languages, indent=2, ensure_ascii=False) + '\n')
        print('applied')


if __name__ == '__main__':
    main()
