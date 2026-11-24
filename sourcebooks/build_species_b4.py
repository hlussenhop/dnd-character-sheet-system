#!/usr/bin/env python3
"""Species lane, batch B4: Kalashtar and Warforged (ERLW), Custom Lineage (TCE), and the three
Fizban's Treasury of Dragons dragonborn (Chromatic, Gem, Metallic).

Same pipeline as B2/B3: draft from the cached 5etools `races.json`, conflict report against the
trait names already stored, `--apply` refuses while conflicts remain. Also writes the D3 grants
(speciesTraitGrants.json) and the ancestry choices (speciesChoices.json).

Usage:
  python3 sourcebooks/build_species_b4.py            # draft + conflict report only
  python3 sourcebooks/build_species_b4.py --apply
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_species_b1 import ALL_PATTERNS, CACHE, DATA, entry_text, find_race, load_races, norm  # noqa: E402
from build_species_b3 import PHB_TOOLS, ABILITY  # noqa: E402

SKIP = {'Size', 'Age', 'Alignment', 'Languages', 'Language', 'Creature Type'}

BOOKS = {
    'ERLW': 'Eberron: Rising from the Last War',
    'TCE': "Tasha's Cauldron of Everything",
    'FTD': "Fizban's Treasury of Dragons",
}

NON_CON = ['STR', 'DEX', 'INT', 'WIS', 'CHA']

# Dragonborn ancestry tables (FTD): label -> damage type
ANCESTRY = {
    'chromatic': [('Black', 'acid'), ('Blue', 'lightning'), ('Green', 'poison'), ('Red', 'fire'), ('White', 'cold')],
    'gem': [('Amethyst', 'force'), ('Crystal', 'radiant'), ('Emerald', 'psychic'), ('Sapphire', 'thunder'), ('Topaz', 'necrotic')],
    'metallic': [('Brass', 'fire'), ('Bronze', 'lightning'), ('Copper', 'acid'), ('Gold', 'fire'), ('Silver', 'cold')],
}

SPECIES = [
    dict(slug='kalashtar', canon='Kalashtar', src='ERLW', race_src='ERLW', ability={'WIS': 2, 'CHA': 1},
         langs=['Common', 'Quori'], lang_choices=1, tags=['exotic', 'eberron'],
         roles=['Cleric', 'Monk', 'Wizard', 'Bard'],
         description="Kalashtar are humans bonded to spirits from the plane of dreams, who have fled the nightmare "
                     "tyrants of Dal Quor. They link minds with ease and carry a spirit's quiet discipline."),
    dict(slug='warforged', canon='Warforged', src='ERLW', race_src='ERLW', ability={'CON': 2},
         ability_choice={'patterns': [[1]], 'from': NON_CON}, langs=['Common'], lang_choices=1,
         tags=['construct', 'eberron'], roles=['Fighter', 'Paladin', 'Artificer', 'Barbarian'],
         description="Warforged are living constructs built for the Last War. They do not tire or sleep as others "
                     "do, and they weave armor into their own bodies."),
    dict(slug='custom-lineage', canon='Custom Lineage', src='TCE', race_src='TCE', ability={},
         ability_choice={'patterns': [[2]]}, langs=['Common'], lang_choices=1,
         tags=['custom'], roles=['Any'],
         description="A custom lineage is a way to build the origin you imagine: you gain a +2 to one ability, "
                     "a feat, and either darkvision or a skill proficiency.",
         versions=True),
    dict(slug='dragonborn-chromatic', canon='Dragonborn (Chromatic)', src='FTD', race_src='FTD', ability='flex',
         ancestry='chromatic', langs=['Common'], lang_choices=1, tags=['draconic'],
         roles=['Fighter', 'Paladin', 'Sorcerer', 'Barbarian'],
         description="Chromatic dragonborn descend from evil dragons of acid, lightning, poison, fire or cold. "
                     "Their breath is a 30-foot line, and at 5th level they can ward themselves against their element."),
    dict(slug='dragonborn-gem', canon='Dragonborn (Gem)', src='FTD', race_src='FTD', ability='flex',
         ancestry='gem', langs=['Common'], lang_choices=1, tags=['draconic'],
         roles=['Sorcerer', 'Wizard', 'Psion', 'Cleric'],
         description="Gem dragonborn descend from dragons of psionic crystal and carry that mind-power with them. "
                     "They can send telepathic messages and, at 5th level, sprout spectral wings."),
    dict(slug='dragonborn-metallic', canon='Dragonborn (Metallic)', src='FTD', race_src='FTD', ability='flex',
         ancestry='metallic', langs=['Common'], lang_choices=1, tags=['draconic'],
         roles=['Paladin', 'Cleric', 'Fighter', 'Monk'],
         description="Metallic dragonborn descend from good dragons of brass, bronze, copper, gold or silver. "
                     "At 5th level they gain a second breath weapon that incapacitates or repels foes."),
]

RENAMES = {
    ('warforged', "Sentry's Rest"): "Sentry's Rest (Warforged)",
    ('warforged', 'Specialized Design'): 'Specialized Design (Skill and Tool)',
    ('kalashtar', 'Mental Discipline'): 'Mental Discipline (Psychic Resistance)',
    ('custom-lineage', 'Feat'): 'Custom Lineage Feat',
    ('dragonborn-chromatic', 'Breath Weapon'): 'Breath Weapon (Chromatic)',
    ('dragonborn-gem', 'Breath Weapon'): 'Breath Weapon (Gem)',
    ('dragonborn-metallic', 'Breath Weapon'): 'Breath Weapon (Metallic)',
    ('dragonborn-chromatic', 'Draconic Resistance'): 'Draconic Resistance (Chromatic)',
    ('dragonborn-gem', 'Draconic Resistance'): 'Draconic Resistance (Gem)',
    ('dragonborn-metallic', 'Draconic Resistance'): 'Draconic Resistance (Metallic)',
}
ACCEPT_KEEP_EXISTING = set()

GRANTS = {
    'Mental Discipline (Psychic Resistance)': {'resistances': ['psychic']},
    'Constructed Resilience': {'resistances': ['poison'], 'conditionImmunities': ['disease']},
    'Integrated Protection': {'acBonus': 1},
    'Specialized Design (Skill and Tool)': {
        'skillChoices': {'count': 1},
        'toolChoices': {'count': 1, 'from': PHB_TOOLS},
    },
    'Variable Trait (Skill Proficiency)': {'skillChoices': {'count': 1}},
    'Gem Flight': {'movement': {'fly': 'walk'}, 'minLevel': 5},
}

VARIANTS = {
    'custom-lineage': [
        dict(slug='darkvision', name='Darkvision', traits=['Darkvision'],
             description="Your variable trait is darkvision with a range of 60 feet."),
        dict(slug='skill-proficiency', name='Skill Proficiency', traits=['Variable Trait (Skill Proficiency)'],
             description="Your variable trait is proficiency in one skill of your choice."),
    ],
}
VARIANT_TEXT = {
    'Variable Trait (Skill Proficiency)': 'You gain proficiency in one skill of your choice.',
}


def ancestry_choice(kind):
    title = kind.capitalize()
    return {
        'id': 'ancestry',
        'label': f'{title} Ancestry',
        'description': f'Choose your {kind} dragon ancestor. It sets the damage type of your breath weapon and your resistance.',
        'options': [{
            'value': color.lower(),
            'label': f'{color} ({dmg.capitalize()})',
            'description': f'{dmg.capitalize()} breath and {dmg} resistance',
            'grants': {'resistances': [dmg]},
        } for color, dmg in ANCESTRY[kind]],
    }


def build(races):
    drafts = []
    for cfg in SPECIES:
        race = find_race(races, cfg['canon'], cfg['race_src'])
        slug = cfg['slug']
        replaced = set()
        if cfg.get('versions'):
            for v in race['_versions']:
                m = v['_mod']['entries']
                replaced.add(m['replace'])
        traits = [(RENAMES.get((slug, e['name']), e['name']), entry_text(e)) for e in race['entries']
                  if isinstance(e, dict) and e.get('name') not in SKIP and e['name'] not in replaced]
        speed = race['speed']['walk'] if isinstance(race['speed'], dict) else race['speed']

        src_ab = race.get('ability')
        if cfg['ability'] == 'flex':
            assert not src_ab and race.get('lineage'), (slug, src_ab)
        elif slug == 'custom-lineage':
            assert src_ab[0]['choose']['amount'] == 2
        else:
            data = {ABILITY[k]: v for k, v in src_ab[0].items() if k in ABILITY}
            assert data == cfg['ability'], (slug, data, cfg['ability'])

        if cfg.get('ancestry'):  # sanity check against the book's version tables
            vars_ = race['_versions'][0]['_implementations']
            got = []
            for i in vars_:
                v = i['_variables']
                got.append((v['color'], v['damageType']))
            assert got == ANCESTRY[cfg['ancestry']], (slug, got)
        variants = []
        for v in VARIANTS.get(slug, []):
            vt = []
            for n in v['traits']:
                vt.append((n, VARIANT_TEXT.get(n)))
            variants.append(dict(v, traits=vt))
        drafts.append(dict(cfg, name=cfg.get('name', cfg['canon']), speed=speed, traits=traits,
                           variants=variants, size=race.get('size')))
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
            print(f'!! "{n}" has {len(variants)} different new texts in B4:')
            for _, (t, who) in variants.items():
                print(f'     {sorted(who)}: {t[:110]}')
        new = next(iter(variants.values()))[0]
        cur = feature_desc.get(n, {}).get('description')
        outside = sorted(u for u in users.get(n, set()) if u not in batch)
        if cur is not None and norm(cur) != norm(new):
            if n in ACCEPT_KEEP_EXISTING:
                print(f'-- "{n}" kept as stored (used by {outside})')
            else:
                problems += 1
                print(f'?? "{n}" is stored (used by {outside}) and the new text differs:')
                print(f'     old: {cur[:150]}\n     new: {new[:150]}')
    # variant-only traits that are not generated from the book must exist already or carry text
    for d in drafts:
        for v in d['variants']:
            for n, t in v['traits']:
                if t is None and n not in feature_desc:
                    problems += 1
                    print(f'!! variant trait "{n}" has no stored description and no override text')
    print(f'\n{problems} conflicts')
    return problems


def apply(drafts, species_doc, feature_desc, languages, grants, choices):
    species = species_doc['species']
    existing = {s['slug'] for s in species}
    for d in drafts:
        assert d['slug'] not in existing, d['slug']
        flex = d['ability'] == 'flex'
        base_choice = {'patterns': ALL_PATTERNS} if flex else d.get('ability_choice')
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
        if base_choice:
            rec['abilityChoice'] = base_choice
        if d['lang_choices']:
            rec['languageChoices'] = d['lang_choices']
        if d['variants']:
            rec['variants'] = [{
                'slug': v['slug'],
                'name': v['name'],
                'description': v['description'],
                'ability_bonuses': d['ability'] if d['ability'] != 'flex' else {},
                'species_traits': [n for n, _ in v['traits']],
                'features': [],
                **({'abilityChoice': base_choice} if base_choice else {}),
            } for v in d['variants']]
        species.append(rec)
        for n, t in d['traits']:
            feature_desc[n] = {'description': t, 'source': BOOKS[d['src']]}
        for v in d['variants']:
            for n, t in v['traits']:
                if t is not None:
                    feature_desc[n] = {'description': t, 'source': BOOKS[d['src']]}
        languages['SPECIES_LANGUAGE_MAP'][d['slug']] = d['langs']
        if d.get('ancestry'):
            choices['choices'][d['slug']] = [ancestry_choice(d['ancestry'])]
    for k, v in GRANTS.items():
        assert k not in grants or grants[k] == v, k
        grants[k] = v
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
        print(f"{d['slug']:<22} speed={d['speed']} size={d['size']} ability={d['ability']}\n"
              f"    traits={[n for n, _ in d['traits']]}"
              + (f"\n    variants={[(v['name'], [n for n, _ in v['traits']]) for v in d['variants']]}" if d['variants'] else ''))
    print()
    problems = report_conflicts(drafts, feature_desc, species_doc['species'])
    (CACHE / 'species_b4_draft.json').write_text(json.dumps(drafts, indent=1))

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
