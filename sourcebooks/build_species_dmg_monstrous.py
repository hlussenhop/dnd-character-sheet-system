#!/usr/bin/env python3
"""Add the eight 2014 DMG monstrous player species (NPC Features table, DMG p. 282).

Fixed ability modifiers come from the race record. Kuo-Toa and Merfolk have none.
Trait names that already belong to a different rule are renamed. Wording-only
differences keep the stored text. Refuses --apply while a real conflict remains.
"""
import argparse
import json
import sys

from build_species_b1 import DATA, SKIP_ENTRIES, entry_text, find_race, load_races, norm

BOOK = "Dungeon Master's Guide"
SOURCE = 'DMG'

# (slug, book trait name) -> name stored on the species. Used when the book name
# already describes a different rule, or when two of these species share a name
# with different text.
RENAMES = {
    ('gnoll', 'Bite'): 'Gnoll Bite',
    ('troglodyte', 'Natural Armor'): 'Natural Armor (+1)',
    ('skeleton', 'Undead Nature'): 'Undead Nature (Skeleton)',
    ('zombie', 'Undead Nature'): 'Undead Nature (Zombie)',
}
# Same rule, different wording. Keep the description already in the app.
ACCEPT_KEEP_EXISTING = {'Darkvision', 'Sunlight Sensitivity', 'Superior Darkvision'}

SPECIES = [
    ('Bullywug', 'bullywug',
     'Frogfolk of the swamps. They breathe water as easily as air and leap farther than their stride suggests.',
     ['Ranger', 'Druid', 'Fighter'], ['Bullywug']),
    ('Gnoll', 'gnoll',
     'Hyena-folk with a powerful bite. Dropping a foe lets them surge forward and bite again.',
     ['Barbarian', 'Fighter', 'Ranger'], []),
    ('Grimlock', 'grimlock',
     'Eyeless hunters of the Underdark. They sense prey by sound and smell and blend into stone.',
     ['Barbarian', 'Rogue', 'Fighter'], ['Undercommon']),
    ('Kuo-Toa', 'kuo-toa',
     'Fishlike people of the Underdark. They sense creatures others cannot see and slip free of a grapple.',
     ['Cleric', 'Fighter', 'Rogue'], ['Undercommon']),
    ('Merfolk', 'merfolk',
     'People of the sea. They are slow on land, swift in the water, and able to breathe air.',
     ['Druid', 'Ranger', 'Fighter'], ['Common', 'Aquan']),
    ('Skeleton', 'skeleton',
     'An animated skeleton: brittle, tireless, and immune to poison. It cannot speak, but it understands the languages of its former life.',
     ['Fighter', 'Rogue', 'Wizard'], ['Common']),
    ('Troglodyte', 'troglodyte',
     'A cave-dweller with a thick hide and a stench that sickens anything standing close.',
     ['Barbarian', 'Fighter', 'Ranger'], ['Troglodyte']),
    ('Zombie', 'zombie',
     'A walking corpse that sometimes refuses to fall, and that shrugs off poison.',
     ['Fighter', 'Barbarian', 'Cleric'], ['Common']),
]

ABILITY = {'str': 'STR', 'dex': 'DEX', 'con': 'CON', 'int': 'INT', 'wis': 'WIS', 'cha': 'CHA'}


def trait_name(slug, book_name):
    return RENAMES.get((slug, book_name), book_name)


def abilities(race):
    bonuses = {}
    for block in race.get('ability') or []:
        for key, amount in block.items():
            if amount:
                bonuses[ABILITY[key]] = amount
    return bonuses


def walk_and_swim(race):
    speed = race.get('speed') or 30
    if isinstance(speed, dict):
        return speed.get('walk') or 30, speed.get('swim')
    return speed, None


def traits_of(race, slug):
    out = []
    for entry in race.get('entries') or []:
        if not isinstance(entry, dict) or not entry.get('name') or entry['name'] in SKIP_ENTRIES:
            continue
        out.append((trait_name(slug, entry['name']), entry_text(entry)))
    return out


def build(races):
    drafts = []
    for name, slug, description, roles, languages in SPECIES:
        race = find_race(races, name, SOURCE)
        walk, swim = walk_and_swim(race)
        drafts.append({
            'slug': slug,
            'name': name,
            'speed': walk,
            'swimSpeed': swim,
            'ability_bonuses': abilities(race),
            'traits': traits_of(race, slug),
            'description': description,
            'roles': roles,
            'languages': languages,
        })
    return drafts


def report_conflicts(drafts, feature_desc, species_json):
    users = {}
    batch = {d['slug'] for d in drafts}
    for species in species_json:
        for trait in species['species_traits']:
            users.setdefault(trait, set()).add(species['slug'])
        for variant in species.get('variants') or []:
            for trait in variant['species_traits']:
                users.setdefault(trait, set()).add(species['slug'])
    texts = {}
    for draft in drafts:
        for name, text in draft['traits']:
            texts.setdefault(name, {}).setdefault(norm(text), (text, set()))[1].add(draft['slug'])
    problems = 0
    for name, variants in sorted(texts.items()):
        if len(variants) > 1:
            problems += 1
            print(f'!! "{name}" has {len(variants)} different texts in this batch')
        new = next(iter(variants.values()))[0]
        current = feature_desc.get(name, {}).get('description')
        outside = sorted(u for u in users.get(name, set()) if u not in batch)
        if current is not None and norm(current) != norm(new) and name not in ACCEPT_KEEP_EXISTING:
            problems += 1
            print(f'?? "{name}" is stored (used by {outside}) and the new text differs')
            print(f'     old: {current[:140]}')
            print(f'     new: {new[:140]}')
    print(f'\n{problems} conflicts')
    return problems


def apply(drafts, species_doc, feature_desc, languages):
    species = species_doc['species']
    existing = {s['slug'] for s in species}
    for draft in drafts:
        assert draft['slug'] not in existing, draft['slug']
        record = {
            'slug': draft['slug'],
            'name': draft['name'],
            'edition': '2014',
            'source': SOURCE,
            'speed': draft['speed'],
            'ability_bonuses': draft['ability_bonuses'],
            'species_traits': [name for name, _ in draft['traits']],
            'description': draft['description'],
            'typicalRoles': draft['roles'],
            'sources': [SOURCE],
            'core': False,
            'expanded': True,
            'tags': ['monstrous', 'legacy'],
            'legacy': True,
            'monstrousOption': True,
        }
        if draft['swimSpeed']:
            record['swimSpeed'] = draft['swimSpeed']
        species.append(record)
        for name, text in draft['traits']:
            if name in ACCEPT_KEEP_EXISTING and name in feature_desc:
                continue
            feature_desc[name] = {'description': text, 'source': BOOK}
        languages['SPECIES_LANGUAGE_MAP'][draft['slug']] = draft['languages']
    species_doc['metadata']['totalSpecies'] = len(species)
    species_doc['metadata']['lastUpdated'] = '2026-11-23'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()

    drafts = build(load_races())
    species_doc = json.loads((DATA / 'species.json').read_text())
    feature_desc = json.loads((DATA / 'featureDescriptions.json').read_text())
    languages = json.loads((DATA / 'speciesLanguages.json').read_text())
    for draft in drafts:
        print(f"{draft['slug']:<12} speed={draft['speed']} swim={draft['swimSpeed']} asi={draft['ability_bonuses']}")
        print(f"    traits={[name for name, _ in draft['traits']]}")
    print()
    problems = report_conflicts(drafts, feature_desc, species_doc['species'])
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
