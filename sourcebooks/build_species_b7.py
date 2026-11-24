#!/usr/bin/env python3
"""Species lane, batch B7: the Lorwyn: First Light (LFL) species, 2024 rules.

  * Boggart (copy of MPMM Goblin), Faerie (MPMM Fairy), Flamekin (MPMM Genasi + Fire Resistance and
    Reach to the Blaze) and Kithkin (XPHB Halfling) are `_copy` entries in 5etools, so (spec R5) their
    traits are built from the source each one copies. Faerie and Kithkin add a Lorwyn/Shadowmoor
    lineage choice (Shadowmoor: Darkvision 120 ft), using the 2024 lineage mechanism (`lineages` in
    enhancedSpeciesData.json + `lineageGrants` in speciesChoices.json).
  * Lorwyn Changeling and Rimekin are new species printed in the book.
  * The existing `elf-2024` record gains the Lorwyn and Shadowmoor lineages (an edit, not a new species).

Trait text follows the edition rule (see build_species_b6.py): stored plain text that differs gets a
`"<Name> [2024]"` override, stored `[2024]` text is reused, wording-only differences are accepted.

Usage:
  python3 sourcebooks/build_species_b7.py            # draft + conflict report only
  python3 sourcebooks/build_species_b7.py --apply
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_species_b1 import CACHE, DATA, entry_text, find_race, load_races, norm  # noqa: E402

DARKVISION_60 = 'You have Darkvision with a range of 60 feet.'  # MPMM wording -> 2024 wording (same rule)
SKIP = {'Size', 'Age', 'Alignment', 'Languages', 'Language', 'Creature Type'}
BOOK = 'Lorwyn: First Light'

SPECIES = [
    dict(slug='boggart-2024', name='Boggart', copy=('Goblin', 'MPMM'), size='Small', ctype='Humanoid', tags=['lorwyn', 'monstrous'],
         roles=['Rogue', 'Warlock', 'Artificer', 'Bard'],
         description="Boggarts are goblin-like natives of Lorwyn who love mischief, novelty and odd alchemy."),
    dict(slug='faerie-2024', name='Faerie', copy=('Fairy', 'MPMM'), size='Small', ctype='Fey', tags=['lorwyn', 'fey'],
         roles=['Druid', 'Bard', 'Wizard', 'Rogue'], lineage=True,
         description="Faeries are tiny winged tricksters of Lorwyn and Shadowmoor, with innate nature magic."),
    dict(slug='flamekin-2024', name='Flamekin', copy=('Genasi', 'MPMM'), size='Medium or Small', ctype='Humanoid', tags=['lorwyn', 'elemental'],
         roles=['Sorcerer', 'Fighter', 'Bard', 'Wizard'], extra=['Fire Resistance', 'Reach to the Blaze'],
         description="Flamekin are genasi-like people of Lorwyn marked by fire: expressive, resistant to flame and gifted at conjuring it."),
    dict(slug='kithkin-2024', name='Kithkin', copy=('Halfling', 'XPHB'), size='Small', ctype='Humanoid', tags=['lorwyn'],
         roles=['Rogue', 'Fighter', 'Cleric', 'Artificer'], lineage=True,
         description="Kithkin are halfling-like folk of Lorwyn, close-knit, lucky and skilled at crafting."),
    dict(slug='lorwyn-changeling-2024', name='Lorwyn Changeling', book=('Lorwyn Changeling', 'LFL'), size='Medium or Small', ctype='Fey',
         tags=['lorwyn', 'fey'], roles=['Bard', 'Rogue', 'Ranger', 'Warlock'],
         renames={'Darkvision': 'Darkvision (120 ft)'},
         description="Lorwyn changelings take any guise: harbingers of good luck who can reshape into a humanoid or a four-legged beast."),
    dict(slug='rimekin-2024', name='Rimekin', book=('Rimekin', 'LFL'), size='Medium or Small', ctype='Humanoid', tags=['lorwyn', 'elemental'],
         roles=['Wizard', 'Sorcerer', 'Monk', 'Fighter'],
         description="Rimekin are genasi-like people of Lorwyn shaped by ice and cold fire, who shrug off the cold."),
]

# Wording-only differences from the stored text are accepted (the stored text stays)
ACCEPT_KEEP_EXISTING = {'Darkvision', 'Fey Ancestry', 'Nimble Escape', 'Fury of the Small', 'Fairy Magic', 'Flight'}

LINEAGES = {
    'Faerie': ('faerie', {'Lorwyn': {}, 'Shadowmoor': {'traits': ['Darkvision (120 ft)']}}),
    'Kithkin': ('kithkin', {'Lorwyn': {}, 'Shadowmoor': {'traits': ['Darkvision (120 ft)']}}),
}
ELF_LINEAGES = {
    'Lorwyn': {'traits': ['Thorn Whip cantrip (swap on a Long Rest for a Druid cantrip)'],
               'spells': ['Thorn Whip', 'Command', 'Silence']},
    'Shadowmoor': {'traits': ['Darkvision (120 ft)', 'Starry Wisp cantrip'],
                   'spells': ['Starry Wisp', 'Heroism', 'Gentle Repose']},
}
SHADOWMOOR_GRANT = {'senses': {'darkvision': 120}}

GRANTS_PLAIN = {
    'Cold Resistance': {'resistances': ['cold']},
    'Delightful Imitator': {'skillChoices': {'count': 1, 'from': ['Deception', 'Performance']}},
}


def entries_of(race):
    return [(e['name'], entry_text(e)) for e in race['entries'] if isinstance(e, dict) and e['name'] not in SKIP]


def copy_traits(cfg, races):
    name, src = cfg['copy']
    base = find_race(races, name, src)
    traits = entries_of(base)
    lfl = find_race(races, cfg['name'], 'LFL')
    mod = lfl['_copy'].get('_mod', {}).get('entries')
    if mod and mod.get('mode') == 'appendArr' and cfg.get('extra'):
        items = mod['items'] if isinstance(mod['items'], list) else [mod['items']]
        traits += [(i['name'], entry_text(i)) for i in items if i['name'] in cfg.get('extra', [i['name']])]
    return traits


def build(races):
    out = []
    for cfg in SPECIES:
        if 'copy' in cfg:
            traits = copy_traits(cfg, races)
            speed_src = find_race(races, *cfg['copy'])
        else:
            race = find_race(races, *cfg['book'])
            traits = entries_of(race)
            speed_src = race
        speed = speed_src['speed'] if isinstance(speed_src['speed'], int) else speed_src['speed']['walk']
        assert speed == 30, (cfg['slug'], speed)
        traits = [(cfg.get('renames', {}).get(n, n), DARKVISION_60 if (n == 'Darkvision' and 'copy' in cfg) else t) for n, t in traits]
        out.append(dict(cfg, traits=traits))
    return out


def classify(drafts, fd):
    plan, problems = {}, 0
    by_name = {}
    for d in drafts:
        for n, t in d['traits']:
            by_name.setdefault(n, {}).setdefault(norm(t), (t, set()))[1].add(d['slug'])
    for n, variants in sorted(by_name.items()):
        if len(variants) > 1:
            problems += 1
            print(f'!! "{n}" has {len(variants)} different texts within B7:')
            for t, who in variants.values():
                print(f'     {sorted(who)}: {t[:100]}')
        text = next(iter(variants.values()))[0]
        plain, over = fd.get(n), fd.get(f'{n} [2024]')
        old = over if over is not None else plain
        if old is None:
            plan[n] = ('new', text)
        elif norm(old['description']) == norm(text):
            plan[n] = ('reuse', text)
        elif n in ACCEPT_KEEP_EXISTING:
            plan[n] = ('accept', text)
            print(f'   accept "{n}":\n     stored: {old["description"][:170]}\n     book  : {text[:170]}')
        elif over is not None:
            problems += 1
            print(f'?? "{n} [2024]" is stored and differs:\n     old: {over["description"][:140]}\n     new: {text[:140]}')
        else:
            plan[n] = ('override', text)
    return plan, problems


def apply(drafts, plan, species_doc, fd, languages, grants, choices, enhanced):
    species = species_doc['species']
    existing = {s['slug'] for s in species}
    for d in drafts:
        assert d['slug'] not in existing, d['slug']
        species.append({
            'slug': d['slug'], 'name': d['name'], 'edition': '2024', 'source': 'LFL', 'speed': 30,
            'creatureType': d['ctype'], 'size': d['size'], 'ability_bonuses': {},
            'species_traits': [n for n, _ in d['traits']], 'description': d['description'], 'typicalRoles': d['roles'],
            'sources': ['LFL'], 'core': False, 'expanded': True, 'legacy': False, 'tags': d['tags'],
        })
        languages['SPECIES_LANGUAGE_MAP'][d['slug']] = ['Common']
        if d.get('lineage'):
            slug, lineages = LINEAGES[d['name']]
            enhanced[slug] = {'lineages': lineages}
            choices['lineageGrants'][d['slug']] = {'Shadowmoor': SHADOWMOOR_GRANT}
    for n, (action, text) in plan.items():
        if action == 'new':
            fd[n] = {'description': text, 'source': BOOK}
        elif action == 'override':
            fd[f'{n} [2024]'] = {'description': text, 'source': BOOK}
    for k, v in GRANTS_PLAIN.items():
        assert k not in grants or grants[k] == v, k
        grants[k] = v
    # Elf: the Lorwyn and Shadowmoor lineages join the PHB 2024 elf (edit of an existing record)
    elf = next(s for s in species if s['slug'] == 'elf-2024')
    if 'LFL' not in elf['sources']:
        elf['sources'].append('LFL')
    enhanced['elf']['lineages'].update(ELF_LINEAGES)
    choices['lineageGrants']['elf-2024'].update({'Shadowmoor': SHADOWMOOR_GRANT})
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
    enhanced = json.loads((DATA / 'enhancedSpeciesData.json').read_text())
    drafts = build(races)
    for d in drafts:
        print(f"{d['slug']:<24} {d['ctype']:<9} {d['size']:<16} {[n for n, _ in d['traits']]}")
    print()
    plan, problems = classify(drafts, fd)
    for n, (action, _) in plan.items():
        if action in ('override',):
            print(f'-- {n}: {action}')
    print(f'\n{problems} conflicts')
    (CACHE / 'species_b7_draft.json').write_text(json.dumps(drafts, indent=1, default=list))
    if args.apply:
        if problems:
            print('refusing to --apply with unresolved conflicts', file=sys.stderr)
            sys.exit(1)
        apply(drafts, plan, species_doc, fd, languages, grants, choices, enhanced)
        for name, obj in (('species.json', species_doc), ('featureDescriptions.json', fd), ('speciesLanguages.json', languages),
                          ('speciesTraitGrants.json', grants), ('speciesChoices.json', choices),
                          ('enhancedSpeciesData.json', enhanced)):
            (DATA / name).write_text(json.dumps(obj, indent=2, ensure_ascii=False) + '\n')
        print('applied')


if __name__ == '__main__':
    main()
