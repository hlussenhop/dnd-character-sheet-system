#!/usr/bin/env python3
"""Species lane, batch B6: the nine 2024 species from Eberron: Forge of the Artificer (Changeling,
Kalashtar, Khoravar, Shifter, Warforged) and Ravenloft: The Horrors Within (Dhampir, Hexblood,
Lupin, Reborn).

2024 conventions (spec section 6): slug `<name>-2024`, empty `ability_bonuses` (bonuses come from the
Background), expanded not core, `legacy: false`, languages `['Common']`. Trait text follows the
edition rule from the edition-conformance pass: a trait name whose stored (2014) text differs gets a
`"<Name> [2024]"` override; a stored `[2024]` text is reused; wording-only differences are accepted
(`ACCEPT_KEEP_EXISTING`). Grants for a name that 2014 species also use go under `[2024]` so the 2014
mechanics are untouched.

Usage:
  python3 sourcebooks/build_species_b6.py            # draft + conflict report only
  python3 sourcebooks/build_species_b6.py --apply
"""
import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_species_b1 import CACHE, DATA, entry_text, find_race, load_races, norm  # noqa: E402

SKIP = {'Size', 'Age', 'Alignment', 'Languages', 'Language', 'Creature Type'}
BOOKS = {'EFA': 'Eberron: Forge of the Artificer', 'RHW': 'Ravenloft: The Horrors Within'}

SPECIES = [
    dict(slug='changeling-2024', canon='Changeling', src='EFA', size='Medium or Small', ctype='Fey', tags=['eberron', 'fey'],
         roles=['Bard', 'Rogue', 'Warlock', 'Sorcerer'],
         description="Changelings are shape-shifting fey descendants who can reshape their face, voice and build at will."),
    dict(slug='kalashtar-2024', canon='Kalashtar', src='EFA', size='Medium', ctype='Aberration', tags=['eberron'],
         roles=['Cleric', 'Monk', 'Wizard', 'Bard'],
         description="Kalashtar are people bonded to spirits from the plane of dreams, linked mind to mind and shielded from psychic harm."),
    dict(slug='khoravar-2024', canon='Khoravar', src='EFA', size='Medium or Small', ctype='Humanoid', tags=['eberron'],
         roles=['Bard', 'Ranger', 'Wizard', 'Rogue'],
         description="Khoravar are the children of elves and humans in Eberron: versatile, fey-touched and at home in two worlds."),
    dict(slug='shifter-2024', canon='Shifter', src='EFA', size='Medium or Small', ctype='Humanoid', tags=['eberron'],
         roles=['Barbarian', 'Ranger', 'Fighter', 'Druid'], choice='shifting',
         description="Shifters carry the blood of lycanthropes and can take on a more bestial form for a short time."),
    dict(slug='warforged-2024', canon='Warforged', src='EFA', size='Medium or Small', ctype='Construct', tags=['eberron', 'construct'],
         roles=['Fighter', 'Paladin', 'Artificer', 'Barbarian'],
         description="Warforged are living constructs built for war. They do not sleep or tire as others do and weave armor into their own bodies.",
         renames={'Specialized Design': 'Specialized Design (Skill and Tool)'}),
    dict(slug='dhampir-2024', canon='Dhampir', src='RHW', size='Medium or Small', ctype='Humanoid', tags=['ravenloft', 'undead'],
         roles=['Rogue', 'Fighter', 'Barbarian', 'Monk'], speed=35, extra_sources=['ABH'],
         description="Dhampirs carry the curse of vampire blood: quick, keen-eyed and able to drain life with a bite."),
    dict(slug='hexblood-2024', canon='Hexblood', src='RHW', size='Medium or Small', ctype='Fey', tags=['ravenloft', 'fey'],
         roles=['Warlock', 'Wizard', 'Sorcerer', 'Bard'],
         description="Hexbloods are touched by a hag's magic, bearing an eerie token that lets them speak and see across distance."),
    dict(slug='lupin-2024', canon='Lupin', src='RHW', size='Medium or Small', ctype='Humanoid', tags=['ravenloft'],
         roles=['Barbarian', 'Ranger', 'Fighter', 'Rogue'],
         description="Lupins carry the blood of werewolves: sharp senses, slashing claws and a chilling howl."),
    dict(slug='reborn-2024', canon='Reborn', src='RHW', size='Medium or Small', ctype='Humanoid', tags=['ravenloft', 'undead'],
         roles=['Fighter', 'Cleric', 'Rogue', 'Wizard'], extra_sources=['PL'],
         description="The reborn have died and returned, resisting death's touch and remembering glimpses of a past life."),
]

# Wording-only differences from the stored text are accepted (the stored text stays)
ACCEPT_KEEP_EXISTING = {'Changeling Instincts', 'Spider Climb', 'Bestial Instincts'}

SKILLS_WEREWOLF = ['Perception', 'Stealth', 'Survival']
RESIST_CHOICE = ['cold', 'necrotic', 'poison']

# New plain grants (names no 2014 species uses with different mechanics)
GRANTS_PLAIN = {
    'Trace of Undeath': {'resistances': ['necrotic']},
    'Construct Resilience': {'resistances': ['poison']},
    'Werewolf Instincts': {'skillChoices': {'count': 1, 'from': SKILLS_WEREWOLF}},
}
# Grants whose name 2014 species also use with a different text: 2024-only overrides
GRANTS_2024 = {
    'Mental Discipline [2024]': {'resistances': ['psychic']},
    'Severed from Dreams [2024]': {'skillChoices': {'count': 1}, 'note': 'You can change this skill each time you finish a Long Rest.'},
    'Skill Versatility [2024]': {'skillChoices': {'count': 1},
                                 'note': 'May instead be a tool proficiency; you can swap it each time you finish a Long Rest.'},
    'Knowledge from a Past Life [2024]': {'skillChoices': {'count': 1}},
}


def trait_entries(race):
    return [(e['name'], entry_text(e)) for e in race['entries'] if isinstance(e, dict) and e['name'] not in SKIP]


def shifting_options(text):
    opts = []
    for name in ('Beasthide', 'Longtooth', 'Swiftstride', 'Wildhunt'):
        m = re.search(rf'^{name}: (.+)$', text, re.M)
        assert m, name
        opts.append((name, m.group(1).strip()))
    return opts


def build(races):
    out = []
    for cfg in SPECIES:
        race = find_race(races, cfg['canon'], cfg['src'])
        assert race['source'] == cfg['src']
        traits = []
        for n, t in trait_entries(race):
            traits.append((cfg.get('renames', {}).get(n, n), t))
        speed = race['speed'] if isinstance(race['speed'], int) else race['speed']['walk']
        assert speed == cfg.get('speed', 30), (cfg['slug'], speed)
        out.append(dict(cfg, traits=traits, speed_final=speed))
    return out


def classify(drafts, fd):
    """Decide per trait: reuse / accept / override ([2024]) / new, and detect intra-batch conflicts."""
    plan = {}  # (name) -> (action, text)
    problems = 0
    by_name = {}
    for d in drafts:
        for n, t in d['traits']:
            by_name.setdefault(n, {}).setdefault(norm(t), (t, set()))[1].add(d['slug'])
    for n, variants in sorted(by_name.items()):
        if len(variants) > 1:
            problems += 1
            print(f'!! "{n}" has {len(variants)} different texts within B6:')
            for t, who in variants.values():
                print(f'     {sorted(who)}: {t[:100]}')
        text = next(iter(variants.values()))[0]
        plain, over = fd.get(n), fd.get(f'{n} [2024]')
        if over is not None:
            if norm(over['description']) == norm(text):
                plan[n] = ('reuse [2024]', text)
            elif n in ACCEPT_KEEP_EXISTING:
                plan[n] = ('accept [2024]', text)
            else:
                problems += 1
                print(f'?? "{n} [2024]" is stored and differs:\n     old: {over["description"][:140]}\n     new: {text[:140]}')
        elif plain is not None:
            if norm(plain['description']) == norm(text):
                plan[n] = ('reuse', text)
            elif n in ACCEPT_KEEP_EXISTING:
                plan[n] = ('accept', text)
            else:
                plan[n] = ('override', text)
        else:
            plan[n] = ('new', text)
    return plan, problems


def apply(drafts, plan, species_doc, fd, languages, grants, choices):
    species = species_doc['species']
    existing = {s['slug'] for s in species}
    for d in drafts:
        assert d['slug'] not in existing, d['slug']
        src = d['src']
        rec = {
            'slug': d['slug'], 'name': d['canon'], 'edition': '2024', 'source': src, 'speed': d['speed_final'],
            'creatureType': d['ctype'], 'size': d['size'], 'ability_bonuses': {},
            'species_traits': [n for n, _ in d['traits']], 'description': d['description'], 'typicalRoles': d['roles'],
            'sources': [src] + d.get('extra_sources', []), 'core': False, 'expanded': True, 'legacy': False, 'tags': d['tags'],
        }
        species.append(rec)
        languages['SPECIES_LANGUAGE_MAP'][d['slug']] = ['Common']
    for n, (action, text) in plan.items():
        src = BOOKS[next(d['src'] for d in drafts if any(n == x for x, _ in d['traits']))]
        if action == 'new':
            fd[n] = {'description': text, 'source': src}
        elif action == 'override':
            fd[f'{n} [2024]'] = {'description': text, 'source': src}
    for k, v in {**GRANTS_PLAIN, **GRANTS_2024}.items():
        assert k not in grants or grants[k] == v, k
        grants[k] = v
    shifter = next(d for d in drafts if d['slug'] == 'shifter-2024')
    opts = shifting_options(dict(shifter['traits'])['Shifting'])
    choices['choices']['shifter-2024'] = [{
        'id': 'shifting', 'label': 'Shifting', 'description': 'Choose the benefit you gain whenever you shift.',
        'options': [{'value': n.lower(), 'label': n, 'description': t} for n, t in opts],
    }]
    choices['choices']['reborn-2024'] = [{
        'id': 'strangeEndurance', 'label': 'Strange Endurance', 'description': 'Choose the damage type you resist.',
        'options': [{'value': r, 'label': r.capitalize(), 'description': f'Resistance to {r} damage.',
                     'grants': {'resistances': [r]}} for r in RESIST_CHOICE],
    }]
    species_doc['metadata']['totalSpecies'] = len(species)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--apply', action='store_true')
    args = ap.parse_args()
    races = load_races()
    species_doc = json.loads((DATA / 'species.json').read_text())
    fd = json.loads((DATA / 'featureDescriptions.json').read_text())
    languages = json.loads((DATA / 'speciesLanguages.json').read_text())
    grants = json.loads((DATA / 'speciesTraitGrants.json').read_text())
    choices = json.loads((DATA / 'speciesChoices.json').read_text())
    drafts = build(races)
    for d in drafts:
        print(f"{d['slug']:<18} {d['ctype']:<11} speed={d['speed_final']} size={d['size']}\n    {[n for n, _ in d['traits']]}")
    print()
    plan, problems = classify(drafts, fd)
    for n, (action, _) in plan.items():
        if action not in ('new', 'reuse', 'reuse [2024]'):
            print(f'-- {n}: {action}')
    print(f'\n{problems} conflicts')
    (CACHE / 'species_b6_draft.json').write_text(json.dumps([d for d in drafts], indent=1, default=list))
    if args.apply:
        if problems:
            print('refusing to --apply with unresolved conflicts', file=sys.stderr)
            sys.exit(1)
        apply(drafts, plan, species_doc, fd, languages, grants, choices)
        for name, obj in (('species.json', species_doc), ('featureDescriptions.json', fd), ('speciesLanguages.json', languages),
                          ('speciesTraitGrants.json', grants), ('speciesChoices.json', choices)):
            (DATA / name).write_text(json.dumps(obj, indent=2, ensure_ascii=False) + '\n')
        print('applied')


if __name__ == '__main__':
    main()
