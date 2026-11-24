#!/usr/bin/env python3
"""Species lane, batch B3: AAG + MOT + GGR + VRGR + AI standalone species (13).

Astral Elf, Autognome, Giff, Hadozee, Plasmoid, Thri-kreen (Astral Adventurer's Guide),
Leonin (Mythic Odysseys of Theros), Simic Hybrid and Vedalken (Guildmasters' Guide to Ravnica),
Dhampir, Hexblood and Reborn (Van Richten's Guide to Ravenloft), Verdan (Acquisitions Incorporated).

Same pipeline as B2: draft from the cached 5etools `races.json`, conflict report against the
trait names already stored, `--apply` refuses while conflicts remain. It also appends the
mechanical grants (speciesTraitGrants.json) and the Simic Hybrid choice (speciesChoices.json).

Usage:
  python3 sourcebooks/build_species_b3.py            # draft + conflict report only
  python3 sourcebooks/build_species_b3.py --apply
"""
import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_species_b1 import ALL_PATTERNS, CACHE, DATA, entry_text, find_race, load_races, norm  # noqa: E402

SKIP = {'Size', 'Age', 'Alignment', 'Languages', 'Language', 'Creature Type'}

BOOKS = {
    'AAG': "Astral Adventurer's Guide",
    'MOT': 'Mythic Odysseys of Theros',
    'GGR': "Guildmasters' Guide to Ravnica",
    'VRGR': "Van Richten's Guide to Ravenloft",
    'AI': 'Acquisitions Incorporated',
}

PHB_TOOLS = [
    "Alchemist's supplies", "Brewer's supplies", "Calligrapher's supplies", "Carpenter's tools",
    "Cartographer's tools", "Cobbler's tools", "Cook's utensils", "Glassblower's tools", "Jeweler's tools",
    "Leatherworker's tools", "Mason's tools", "Painter's supplies", "Potter's tools", "Smith's tools",
    "Tinker's tools", "Weaver's tools", "Woodcarver's tools", 'Disguise kit', 'Forgery kit', 'Herbalism kit',
    "Navigator's tools", "Poisoner's kit", "Thieves' tools", 'Dice set', 'Dragonchess set', 'Playing card set',
    'Three-Dragon Ante set', 'Bagpipes', 'Drum', 'Dulcimer', 'Flute', 'Horn', 'Lute', 'Lyre', 'Pan flute',
    'Shawm', 'Viol', 'Land vehicles', 'Water vehicles',
]

# slug, name, canonical race, source, ability ('flex' | fixed dict), abilityChoice override, languages, languageChoices,
# tags, roles, description (hand-written flavor), extra leading traits (name, text)
SPECIES = [
    dict(slug='astral-elf', canon='Astral Elf', src='AAG', ability='flex', langs=['Common'], lang_choices=1,
         tags=['exotic', 'fey', 'planar'], roles=['Wizard', 'Cleric', 'Rogue', 'Bard'],
         description="Astral elves are elves of Wildspace and the Astral Sea, shaped by starlight. They step "
                     "between places in a flash and draw on the shared memory of the Astral Plane."),
    dict(slug='autognome', canon='Autognome', src='AAG', ability='flex', langs=['Common'], lang_choices=1,
         tags=['exotic', 'construct'], roles=['Artificer', 'Fighter', 'Rogue', 'Wizard'],
         description="Autognomes are mechanical gnomes with free will, built by the rock gnomes and others who "
                     "chose to let their creations decide their own purpose."),
    dict(slug='giff', canon='Giff', src='AAG', ability='flex', langs=['Common'], lang_choices=1,
         tags=['exotic', 'planar'], roles=['Fighter', 'Barbarian', 'Ranger', 'Paladin'],
         description="Giff are hippo-headed soldiers of impressive size who love firearms, order and a good "
                     "campaign. They channel a spark of divine power through their weapons.",
         extra=[('Swimming Speed', None)]),
    dict(slug='hadozee', canon='Hadozee', src='AAG', ability='flex', langs=['Common'], lang_choices=1,
         tags=['exotic'], roles=['Rogue', 'Ranger', 'Fighter', 'Monk'],
         description="Hadozee are simian adventurers who adapt well to the hazards of Wildspace. Gliding "
                     "membranes and agile feet make them natural sailors and climbers.",
         extra=[('Climbing Speed', None)]),
    dict(slug='plasmoid', canon='Plasmoid', src='AAG', ability='flex', langs=['Common'], lang_choices=1,
         tags=['exotic'], roles=['Rogue', 'Monk', 'Wizard', 'Warlock'],
         description="Plasmoids are amoeba-like people who can reshape their bodies at will, squeezing through "
                     "narrow gaps and shrugging off acid and poison."),
    dict(slug='thri-kreen', canon='Thri-kreen', src='AAG', ability='flex', langs=['Common'], lang_choices=1,
         tags=['monstrous'], roles=['Ranger', 'Rogue', 'Fighter', 'Monk'],
         description="Thri-kreen are telepathic, insectile hunters with four arms and a chameleon carapace. "
                     "They do not sleep and speak mind to mind."),
    dict(slug='leonin', canon='Leonin', src='MOT', ability={'STR': 1, 'CON': 2}, langs=['Common', 'Leonin'], lang_choices=0,
         tags=['exotic'], roles=['Barbarian', 'Fighter', 'Paladin', 'Ranger'],
         description="Leonin are proud, lion-like people of Theros who live in prides. They are fierce hunters "
                     "with claws and a roar that can frighten their foes."),
    dict(slug='simic-hybrid', canon='Simic Hybrid', src='GGR', ability={'CON': 2},
         ability_choice={'patterns': [[1]], 'from': ['STR', 'DEX', 'INT', 'WIS', 'CHA']},
         langs=['Common'], lang_choices=1,
         tags=['exotic'], roles=['Druid', 'Ranger', 'Wizard', 'Fighter'],
         description="Simic hybrids are humans, elves and vedalken whom the Simic Combine has altered with "
                     "animal traits. Each hybrid chooses enhancements such as gills or climbing limbs."),
    dict(slug='vedalken', canon='Vedalken', src='GGR', ability={'INT': 2, 'WIS': 1}, langs=['Common', 'Vedalken'], lang_choices=1,
         tags=['exotic'], roles=['Wizard', 'Artificer', 'Cleric', 'Rogue'],
         description="Vedalken are tall, blue-skinned and fiercely rational. They pursue perfection with "
                     "dispassionate precision and can breathe underwater for a time."),
    dict(slug='dhampir', canon='Dhampir', src='VRGR', ability='flex', langs=['Common'], lang_choices=1,
         tags=['undead', 'ravenloft'], roles=['Rogue', 'Fighter', 'Warlock', 'Monk'],
         description="Dhampirs are people who carry a vampire's curse. They climb like spiders, see in the dark "
                     "and feed on the life of those they bite."),
    dict(slug='hexblood', canon='Hexblood', src='VRGR', ability='flex', langs=['Common'], lang_choices=1,
         tags=['fey', 'ravenloft'], roles=['Warlock', 'Sorcerer', 'Wizard', 'Rogue'],
         description="Hexbloods are people touched by a hag's magic, often through a bargain or a curse. They "
                     "can cast hexes and see through an eerie token."),
    dict(slug='reborn', canon='Reborn', src='VRGR', ability='flex', langs=['Common'], lang_choices=1,
         tags=['undead', 'ravenloft'], roles=['Fighter', 'Cleric', 'Rogue', 'Paladin'],
         description="The reborn are people who have escaped death, returned with glimpses of past lives and "
                     "a resilience that death itself could not break."),
    dict(slug='verdan', canon='Verdan', src='AI', ability={'CON': 1, 'CHA': 2}, langs=['Common', 'Goblin'], lang_choices=1,
         tags=['exotic'], roles=['Bard', 'Rogue', 'Sorcerer', 'Warlock'],
         description="Verdan are goblins transformed by the magic of That-Which-Endures. They grow from Small to "
                     "Medium over time and speak mind to mind."),
]

# trait names shared with other batches: (slug, canonical name) -> app name
RENAMES = {
    ('astral-elf', 'Fey Ancestry'): 'Fey Ancestry (Charmed Only)',
    ('plasmoid', 'Hold Breath'): 'Hold Breath (1 Hour)',
    ('dhampir', 'Deathless Nature'): 'Deathless Nature (No Breathing)',
    ('leonin', 'Claws'): 'Leonin Claws',
}
# Names whose stored text already says the same thing with different wording: keep it.
ACCEPT_KEEP_EXISTING = {'Darkvision', 'Keen Senses', 'Hold Breath (1 Hour)', 'Swimming Speed', 'Climbing Speed',
                        'Fey Ancestry (Charmed Only)'}

# Synthetic speed traits (the book's Speed line gives a swim/climb speed; races.json keeps it in `speed`)
SPEED_TRAITS = {
    'Swimming Speed': 'Your walking speed is 30 feet, and you have a swimming speed equal to your walking speed.',
    'Climbing Speed': 'Your walking speed is 30 feet, and you have a climbing speed equal to your walking speed.',
}

CHOICE_ALL = {'patterns': ALL_PATTERNS}

# D3 grants for the new trait names (see speciesTraitGrants.json / docs, D3 section)
GRANTS = {
    'Armored Casing': {'naturalArmor': {'base': 13, 'abilities': ['DEX']}},
    'Chameleon Carapace': {'naturalArmor': {'base': 13, 'abilities': ['DEX']}},
    'Mechanical Nature': {'resistances': ['poison'], 'conditionImmunities': ['disease']},
    'Specialized Design': {'toolChoices': {'count': 2, 'from': PHB_TOOLS}},
    'Tireless Precision': {
        'skillChoices': {'count': 1, 'from': ['Arcana', 'History', 'Investigation', 'Medicine', 'Performance', 'SleightOfHand']},
        'toolChoices': {'count': 1, 'from': PHB_TOOLS},
        'note': 'Add a d4 to ability checks with the chosen skill or tool.',
    },
    "Hunter's Instincts": {'skillChoices': {'count': 1, 'from': ['Athletics', 'Intimidation', 'Perception', 'Survival']}},
    'Persuasive': {'skills': ['Persuasion']},
    'Natural Resilience': {'resistances': ['acid', 'poison']},
    'Firearms Mastery': {'weapons': ['Firearms']},
    'Spider Climb': {'movement': {'climb': 'walk'}},
    'Ancestral Legacy': {'skillChoices': {'count': 2}},
    'Deathless Nature': {'resistances': ['poison']},
}

SIMIC_CHOICE = {
    'id': 'animalEnhancement',
    'label': 'Animal Enhancement (1st level)',
    'description': 'Your first animal enhancement. The 5th-level enhancement is described in the trait text.',
    'options': [
        {'value': 'manta-glide', 'label': 'Manta Glide',
         'description': 'Ray-like fins slow your fall: subtract up to 100 feet from falling damage and glide 2 feet per foot descended.'},
        {'value': 'nimble-climber', 'label': 'Nimble Climber',
         'description': 'You have a climbing speed equal to your walking speed.',
         'grants': {'movement': {'climb': 'walk'}}},
        {'value': 'underwater-adaptation', 'label': 'Underwater Adaptation',
         'description': 'You can breathe air and water and have a swimming speed equal to your walking speed.',
         'grants': {'movement': {'swim': 'walk'}}},
    ],
}

ABILITY = {'str': 'STR', 'dex': 'DEX', 'con': 'CON', 'int': 'INT', 'wis': 'WIS', 'cha': 'CHA'}


def build(races):
    drafts = []
    for cfg in SPECIES:
        race = find_race(races, cfg['canon'], cfg['src'])
        slug = cfg['slug']
        name = cfg.get('name', cfg['canon'])

        traits = [(RENAMES.get((slug, e['name']), e['name']), entry_text(e)) for e in race['entries']
                  if isinstance(e, dict) and e.get('name') not in SKIP]
        for n, _ in cfg.get('extra', []):
            traits.insert(0, (n, SPEED_TRAITS[n]))

        speed = race['speed']['walk'] if isinstance(race['speed'], dict) else race['speed']

        # sanity: the fixed ASI in the config must match the source data
        src_ab = race.get('ability')
        if cfg['ability'] == 'flex':
            assert not src_ab and race.get('lineage') == 'VRGR', (slug, src_ab, race.get('lineage'))
        else:
            data = {ABILITY[k]: v for k, v in src_ab[0].items() if k in ABILITY}
            assert data == cfg['ability'], (slug, data, cfg['ability'])
        drafts.append(dict(cfg, name=name, speed=speed, traits=traits, size=race.get('size')))
    return drafts


def report_conflicts(drafts, feature_desc, species_json):
    users = {}
    for s in species_json:
        for t in s['species_traits'] + [x for v in s.get('variants', []) for x in v['species_traits']]:
            users.setdefault(t, set()).add(s['slug'])
    batch = {d['slug'] for d in drafts}
    texts = {}
    for d in drafts:
        for n, t in d['traits']:
            texts.setdefault(n, {}).setdefault(norm(t), (t, set()))[1].add(d['slug'])
    problems = 0
    for n, variants in sorted(texts.items()):
        if len(variants) > 1 and n not in ACCEPT_KEEP_EXISTING:
            problems += 1
            print(f'!! "{n}" has {len(variants)} different new texts in B3:')
            for _, (t, who) in variants.items():
                print(f'     {sorted(who)}: {t[:110]}')
        new = next(iter(variants.values()))[0]
        cur = feature_desc.get(n, {}).get('description')
        outside = sorted(u for u in users.get(n, set()) if u not in batch)
        if cur is not None and norm(cur) != norm(new):
            if n in ACCEPT_KEEP_EXISTING:
                print(f'-- "{n}" kept as stored (used by {outside}):\n     stored: {cur[:110]}\n     book  : {new[:110]}')
            else:
                problems += 1
                print(f'?? "{n}" is stored (used by {outside}) and the new text differs:')
                print(f'     old: {cur[:150]}\n     new: {new[:150]}')
    print(f'\n{problems} conflicts')
    return problems


def apply(drafts, species_doc, feature_desc, languages, grants, choices):
    species = species_doc['species']
    existing = {s['slug'] for s in species}
    for d in drafts:
        assert d['slug'] not in existing, d['slug']
        flex = d['ability'] == 'flex'
        rec = {
            'slug': d['slug'],
            'name': d['name'],
            'edition': '2014',
            'source': d['src'],
            'speed': d['speed'],
            'ability_bonuses': {} if flex else d['ability'],
            'species_traits': [n for n, _ in d['traits']],
            'description': d['description'],
            'typicalRoles': d['roles'],
            'sources': [d['src']],
            'core': False,
            'expanded': True,
            'tags': d['tags'] + ['legacy'],
            'legacy': True,
        }
        if flex:
            rec['abilityChoice'] = CHOICE_ALL
        elif d.get('ability_choice'):
            rec['abilityChoice'] = d['ability_choice']
        if d['lang_choices']:
            rec['languageChoices'] = d['lang_choices']
        species.append(rec)
        for n, t in d['traits']:
            if n in ACCEPT_KEEP_EXISTING and n in feature_desc:
                continue
            feature_desc[n] = {'description': t, 'source': BOOKS[d['src']]}
        languages['SPECIES_LANGUAGE_MAP'][d['slug']] = d['langs']
    for k, v in GRANTS.items():
        assert k not in grants or grants[k] == v, k
        grants[k] = v
    choices['choices']['simic-hybrid'] = [SIMIC_CHOICE]
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
    grants = json.loads((DATA / 'speciesTraitGrants.json').read_text())
    choices = json.loads((DATA / 'speciesChoices.json').read_text())

    drafts = build(races)
    for d in drafts:
        print(f"{d['slug']:<13} speed={d['speed']} size={d['size']} ability={d['ability']}\n"
              f"    traits={[n for n, _ in d['traits']]}")
    print()
    problems = report_conflicts(drafts, feature_desc, species_doc['species'])
    (CACHE / 'species_b3_draft.json').write_text(json.dumps(drafts, indent=1))

    if args.apply:
        if problems:
            print('refusing to --apply with unresolved conflicts', file=sys.stderr)
            sys.exit(1)
        apply(drafts, species_doc, feature_desc, languages, grants, choices)
        for name, obj in (('species.json', species_doc), ('featureDescriptions.json', feature_desc),
                          ('speciesLanguages.json', languages), ('speciesTraitGrants.json', grants),
                          ('speciesChoices.json', choices)):
            (DATA / name).write_text(json.dumps(obj, indent=2, ensure_ascii=False) + '\n')
        print('applied')


if __name__ == '__main__':
    main()
