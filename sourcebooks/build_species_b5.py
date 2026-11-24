#!/usr/bin/env python3
"""Species lane, batch B5: the 2014 variants (Dragonmarks, SCAG, MTF, EGW).

Representation (see docs/content-integration/species-lane-phase-a-spec.md, "B5 notes"):
  * Subrace-level options with no single parent record in the app (Dragonmarked Dwarf/Elf/Gnome/
    Halfling/Human/Half-Elf/Half-Orc, Pallid Elf, Ghostwise and Lotusden Halfling, Draconblood and
    Ravenite Dragonborn) become standalone species named "<Parent> (<Option>)" with the parent's
    base traits, exactly like the FTD dragonborn in B4.
  * Options that replace a feature of an existing single record become `variants[]` on it with
    `replacesTraits`: Tiefling bloodlines and SCAG variants (replace Infernal Legacy) and the SCAG
    Half-Elf descents (replace Skill Versatility).

Same pipeline as B2-B4: draft from the cached 5etools `races.json`, conflict report against stored
trait names, `--apply` refuses while conflicts remain.

Usage:
  python3 sourcebooks/build_species_b5.py            # draft + conflict report only
  python3 sourcebooks/build_species_b5.py --apply
"""
import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_species_b1 import CACHE, DATA, entry_text, load_races, norm, strip_tags  # noqa: E402
from build_species_b3 import PHB_TOOLS  # noqa: E402

BOOKS = {
    'ERLW': 'Eberron: Rising from the Last War',
    'SCAG': "Sword Coast Adventurer's Guide",
    'MTF': "Mordenkainen's Tome of Foes",
    'EGW': "Explorer's Guide to Wildemount",
}
ARTISAN_TOOLS = PHB_TOOLS[:17]
NON = lambda *x: [a for a in ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'] if a not in x]  # noqa: E731

# ---------------------------------------------------------------------------------------------
# Standalone species. `base` names the parent's base traits/ability/speed/languages (derived from the
# stored PHB subrace records); `sub` locates the 5etools subrace entry for the added traits.
# ---------------------------------------------------------------------------------------------
MARK = lambda n: f'Spells of the Mark ({n})'  # noqa: E731

STANDALONE = [
    dict(slug='dwarf-mark-of-warding', name='Dwarf (Mark of Warding)', base='dwarf', sub=('Mark of Warding', 'ERLW', 'Dwarf'), src='ERLW',
         add_ability={'INT': 1}, mark='Warding', tags=['eberron', 'dragonmark'], roles=['Artificer', 'Fighter', 'Wizard', 'Rogue'],
         description="Dragonmarked dwarves of House Kundarak bear the Mark of Warding, a gift for locks, wards and protective magic."),
    dict(slug='elf-mark-of-shadow', name='Elf (Mark of Shadow)', base='elf', sub=('Mark of Shadow', 'ERLW', 'Elf'), src='ERLW',
         add_ability={'CHA': 1}, mark='Shadow', tags=['eberron', 'dragonmark'], roles=['Rogue', 'Bard', 'Warlock', 'Wizard'],
         description="Elves of House Phiarlan or Thuranni with the Mark of Shadow are performers and spies who can bend darkness and illusion."),
    dict(slug='gnome-mark-of-scribing', name='Gnome (Mark of Scribing)', base='gnome', sub=('Mark of Scribing', 'ERLW', 'Gnome'), src='ERLW',
         add_ability={'CHA': 1}, mark='Scribing', tags=['eberron', 'dragonmark'], roles=['Wizard', 'Bard', 'Cleric', 'Artificer'],
         description="Gnomes of House Sivis bear the Mark of Scribing, which makes them natural messengers, notaries and translators."),
    dict(slug='halfling-mark-of-healing', name='Halfling (Mark of Healing)', base='halfling', sub=('Mark of Healing', 'ERLW', 'Halfling'), src='ERLW',
         add_ability={'WIS': 1}, mark='Healing', tags=['eberron', 'dragonmark'], roles=['Cleric', 'Druid', 'Bard', 'Artificer'],
         description="Halflings of House Jorasco with the Mark of Healing are the healers of Khorvaire, mending wounds with innate magic."),
    dict(slug='halfling-mark-of-hospitality', name='Halfling (Mark of Hospitality)', base='halfling', sub=('Mark of Hospitality', 'ERLW', 'Halfling'), src='ERLW',
         add_ability={'CHA': 1}, mark='Hospitality', tags=['eberron', 'dragonmark'], roles=['Bard', 'Rogue', 'Cleric', 'Warlock'],
         description="Halflings of House Ghallanda bear the Mark of Hospitality, a gift for welcome, comfort and a good meal."),
    dict(slug='human-mark-of-handling', name='Human (Mark of Handling)', base='human', sub=('Mark of Handling', 'ERLW', 'Human'), src='ERLW',
         ability={'WIS': 2}, ability_choice={'patterns': [[1]], 'from': NON('WIS')}, mark='Handling', tags=['eberron', 'dragonmark'],
         roles=['Druid', 'Ranger', 'Barbarian', 'Cleric'],
         description="Humans of House Vadalis with the Mark of Handling have a bond with beasts and a talent for training them."),
    dict(slug='human-mark-of-making', name='Human (Mark of Making)', base='human', sub=('Mark of Making', 'ERLW', 'Human'), src='ERLW',
         ability={'INT': 2}, ability_choice={'patterns': [[1]], 'from': NON('INT')}, mark='Making', tags=['eberron', 'dragonmark'],
         roles=['Artificer', 'Wizard', 'Fighter', 'Cleric'],
         description="Humans of House Cannith bear the Mark of Making, which lets them craft and mend with magical ease."),
    dict(slug='human-mark-of-passage', name='Human (Mark of Passage)', base='human', sub=('Mark of Passage', 'ERLW', 'Human'), src='ERLW',
         ability={'DEX': 2}, ability_choice={'patterns': [[1]], 'from': NON('DEX')}, speed=35, mark='Passage', tags=['eberron', 'dragonmark'],
         roles=['Rogue', 'Ranger', 'Monk', 'Bard'],
         description="Humans of House Orien with the Mark of Passage are tireless couriers who move faster than others and step through space."),
    dict(slug='human-mark-of-sentinel', name='Human (Mark of Sentinel)', base='human', sub=('Mark of Sentinel', 'ERLW', 'Human'), src='ERLW',
         ability={'CON': 2, 'WIS': 1}, mark='Sentinel', tags=['eberron', 'dragonmark'], roles=['Fighter', 'Paladin', 'Cleric', 'Ranger'],
         description="Humans of House Deneith bearing the Mark of Sentinel are bodyguards who can take a blow meant for an ally."),
    dict(slug='human-mark-of-finding', name='Human (Mark of Finding)', base='human', sub=('Variant; Mark of Finding', 'ERLW', 'Human'), src='ERLW',
         ability={'CON': 1, 'WIS': 2}, mark='Finding', langs=['Common', 'Goblin'], lang_choices=0, tags=['eberron', 'dragonmark'],
         roles=['Ranger', 'Rogue', 'Fighter', 'Druid'],
         description="Humans of House Tharashk with the Mark of Finding are hunters and trackers who can locate nearly anything."),
    dict(slug='half-elf-mark-of-detection', name='Half-Elf (Mark of Detection)', base='half-elf', sub=('Variant; Mark of Detection', 'ERLW', 'Half-Elf'), src='ERLW',
         ability={'WIS': 2}, ability_choice={'patterns': [[1]], 'from': NON('WIS', 'CHA') + ['CHA']}, drop=['Skill Versatility'],
         mark='Detection', tags=['eberron', 'dragonmark'], roles=['Rogue', 'Ranger', 'Cleric', 'Wizard'],
         description="Half-elves of House Medani with the Mark of Detection are investigators who sense magic, poison and hidden things."),
    dict(slug='half-elf-mark-of-storm', name='Half-Elf (Mark of Storm)', base='half-elf', sub=('Variant; Mark of Storm', 'ERLW', 'Half-Elf'), src='ERLW',
         ability={'DEX': 1, 'CHA': 2}, ability_choice=None, drop=['Skill Versatility'], mark='Storm', tags=['eberron', 'dragonmark'],
         roles=['Sorcerer', 'Bard', 'Druid', 'Rogue'],
         description="Half-elves of House Lyrandar bear the Mark of Storm, with command of wind, weather and a resistance to lightning."),
    dict(slug='half-orc-mark-of-finding', name='Half-Orc (Mark of Finding)', base='half-orc', sub=('Variant; Mark of Finding', 'ERLW', 'Half-Orc'), src='ERLW',
         ability={'WIS': 2, 'CON': 1}, drop=['Menacing'], mark='Finding', langs=['Common', 'Goblin'], lang_choices=0,
         tags=['eberron', 'dragonmark'], roles=['Ranger', 'Barbarian', 'Rogue', 'Fighter'],
         description="Half-orcs of the Shadow Marches with the Mark of Finding are hunters and trackers who can locate nearly anything."),
    dict(slug='elf-pallid', name='Elf (Pallid)', base='elf', sub=('Pallid', 'EGW', 'Elf'), src='EGW', add_ability={'WIS': 1}, tags=['wildemount'],
         roles=['Cleric', 'Druid', 'Wizard', 'Monk'],
         description="Pallid elves are pale, moon-touched elves of Xhorhas, shaped by a blessing of the Moon Weaver."),
    dict(slug='halfling-ghostwise', name='Halfling (Ghostwise)', base='halfling', sub=('Ghostwise', 'SCAG', 'Halfling'), src='SCAG',
         add_ability={'WIS': 1}, tags=['faerun'], roles=['Ranger', 'Druid', 'Rogue', 'Barbarian'],
         description="Ghostwise halflings are reclusive, forest-dwelling halflings who speak with their minds."),
    dict(slug='halfling-lotusden', name='Halfling (Lotusden)', base='halfling', sub=('Lotusden', 'EGW', 'Halfling'), src='EGW',
         add_ability={'WIS': 1}, tags=['wildemount'], roles=['Druid', 'Ranger', 'Cleric', 'Rogue'],
         description="Lotusden halflings live in the Lotusden forest of Wildemount and have a quiet magic of the wood."),
]

# Dragonborn subraces (EGW) replace the PHB Dragonborn's traits, so they are built from the book data.
EGW_DRAGONBORN = [
    dict(slug='dragonborn-draconblood', name='Dragonborn (Draconblood)', sub=('Draconblood', 'EGW', 'Dragonborn'),
         ability={'INT': 2, 'CHA': 1}, roles=['Wizard', 'Sorcerer', 'Bard', 'Warlock'],
         description="Draconblood dragonborn are diplomats and scholars, born to the shared bloodlines of the Dragon Empire."),
    dict(slug='dragonborn-ravenite', name='Dragonborn (Ravenite)', sub=('Ravenite', 'EGW', 'Dragonborn'),
         ability={'STR': 2, 'CON': 1}, roles=['Fighter', 'Barbarian', 'Paladin', 'Ranger'],
         description="Ravenite dragonborn are fierce warriors who take vengeance on anyone who wounds them."),
]

# Tiefling variants (replace the ability scores; most replace Infernal Legacy)
TIEFLING_BASE_AB = {'INT': 1, 'CHA': 2}
TIEFLING = [
    # slug, name, sub (name, source), ability, ability_choice, replaces, description
    ('asmodeus', 'Asmodeus', ('Asmodeus', 'MTF'), TIEFLING_BASE_AB, None, [],
     "The bloodline of Asmodeus: the Player's Handbook tiefling, with the standard Infernal Legacy."),
    ('baalzebul', 'Baalzebul', ('Baalzebul', 'MTF'), TIEFLING_BASE_AB, None, ['Infernal Legacy'],
     "Legacy of Maladomini: thaumaturgy, ray of sickness and crown of madness."),
    ('dispater', 'Dispater', ('Dispater', 'MTF'), {'DEX': 1, 'CHA': 2}, None, ['Infernal Legacy'],
     "Legacy of Dis: DEX +1 and thaumaturgy, disguise self and detect thoughts."),
    ('fierna', 'Fierna', ('Fierna', 'MTF'), {'WIS': 1, 'CHA': 2}, None, ['Infernal Legacy'],
     "Legacy of Phlegethos: WIS +1 and friends, charm person and suggestion."),
    ('glasya', 'Glasya', ('Glasya', 'MTF'), {'DEX': 1, 'CHA': 2}, None, ['Infernal Legacy'],
     "Legacy of Malbolge: DEX +1 and minor illusion, disguise self and invisibility."),
    ('levistus', 'Levistus', ('Levistus', 'MTF'), {'CON': 1, 'CHA': 2}, None, ['Infernal Legacy'],
     "Legacy of Stygia: CON +1 and ray of frost, armor of Agathys and darkness."),
    ('mammon', 'Mammon', ('Mammon', 'MTF'), TIEFLING_BASE_AB, None, ['Infernal Legacy'],
     "Legacy of Minauros: mage hand, Tenser's floating disk and arcane lock."),
    ('mephistopheles', 'Mephistopheles', ('Mephistopheles', 'MTF'), TIEFLING_BASE_AB, None, ['Infernal Legacy'],
     "Legacy of Cania: mage hand, burning hands and flame blade."),
    ('zariel', 'Zariel', ('Zariel', 'MTF'), {'STR': 1, 'CHA': 2}, None, ['Infernal Legacy'],
     "Legacy of Avernus: STR +1 and thaumaturgy, searing smite and branding smite."),
    ('devils-tongue', "Devil's Tongue", ("Variant; Devil's Tongue", 'SCAG'), {'INT': 1}, {'patterns': [[2]], 'from': ['DEX', 'CHA']},
     ['Infernal Legacy'], "SCAG variant: INT +1, DEX or CHA +2, vicious mockery, charm person and enthrall."),
    ('hellfire', 'Hellfire', ('Variant; Hellfire', 'SCAG'), {'INT': 1}, {'patterns': [[2]], 'from': ['DEX', 'CHA']},
     ['Infernal Legacy'], "SCAG variant: INT +1, DEX or CHA +2, thaumaturgy, burning hands and darkness."),
    ('infernal-legacy-variant', 'Infernal Legacy (variant)', ('Variant; Infernal Legacy', 'SCAG'), {'INT': 1},
     {'patterns': [[2]], 'from': ['DEX', 'CHA']}, [],
     "SCAG variant: INT +1, DEX or CHA +2 and the standard Infernal Legacy, with an appearance that is more human than fiendish."),
    ('winged', 'Winged', ('Variant; Winged', 'SCAG'), {'INT': 1}, {'patterns': [[2]], 'from': ['DEX', 'CHA']},
     ['Infernal Legacy'], "SCAG variant: INT +1, DEX or CHA +2, and bat-like wings that give a flying speed of 30 feet."),
]

# Half-Elf descent variants (SCAG): each replaces Skill Versatility with one of the descent's options
HALF_ELF = [
    # slug, name, sub name, version item name (in 5etools), app trait name, speed override, description
    ('aquatic-elf-descent-swim', 'Aquatic Elf Descent (Swim Speed)', 'Variant; Aquatic Elf Descent', 'Swim Speed', 'Swimming Speed (Half-Elf)', None,
     "Aquatic elf ancestry: instead of Skill Versatility you have a swimming speed of 30 feet."),
    ('drow-descent-magic', 'Drow Descent (Drow Magic)', 'Variant; Drow Descent', 'Drow Magic', 'Drow Magic (Half-Elf)', None,
     "Drow ancestry: instead of Skill Versatility you know dancing lights and later cast faerie fire and darkness."),
    ('moon-sun-elf-descent-cantrip', 'Moon or Sun Elf Descent (Cantrip)', 'Variant; Moon Elf or Sun Elf Descent', 'Cantrip', 'Cantrip', None,
     "Moon or sun elf ancestry: instead of Skill Versatility you know one wizard cantrip."),
    ('moon-sun-elf-descent-weapons', 'Moon or Sun Elf Descent (Weapon Training)', 'Variant; Moon Elf or Sun Elf Descent', 'Elf Weapon Training', 'Elf Weapon Training', None,
     "Moon or sun elf ancestry: instead of Skill Versatility you gain elf weapon training."),
    ('wood-elf-descent-weapons', 'Wood Elf Descent (Weapon Training)', 'Variant; Wood Elf Descent', 'Elf Weapon Training', 'Elf Weapon Training', None,
     "Wood elf ancestry: instead of Skill Versatility you gain elf weapon training."),
    ('wood-elf-descent-fleet', 'Wood Elf Descent (Fleet of Foot)', 'Variant; Wood Elf Descent', 'Fleet of Foot', 'Fleet of Foot', 35,
     "Wood elf ancestry: instead of Skill Versatility your walking speed is 35 feet."),
    ('wood-elf-descent-mask', 'Wood Elf Descent (Mask of the Wild)', 'Variant; Wood Elf Descent', 'Mask of the Wild', 'Mask of the Wild', None,
     "Wood elf ancestry: instead of Skill Versatility you can hide when only lightly obscured by natural phenomena."),
]

# Same-name traits that differ between options: (slug-or-variant, canonical name) -> app name
RENAMES = {
    ('dragonborn-draconblood', 'Draconic Ancestry'): 'Draconic Ancestry (Breath Only)',
    ('dragonborn-ravenite', 'Draconic Ancestry'): 'Draconic Ancestry (Breath Only)',
}
ACCEPT_KEEP_EXISTING = {'Darkvision'}

GRANTS = {
    "Storm's Boon": {'resistances': ['lightning']},
    "Maker's Gift": {'toolChoices': {'count': 1, 'from': ARTISAN_TOOLS}},
    'Swimming Speed (Half-Elf)': {'movement': {'swim': 30}},
    'Winged': {'movement': {'fly': 30}, 'note': 'No flying speed while wearing heavy armor.'},
}

SKIP = {'Size', 'Age', 'Alignment', 'Languages', 'Language', 'Creature Type'}


def find_sub(races, name, source, race_name):
    for r in races['subrace']:
        if r.get('name') == name and r['source'] == source and r.get('raceName') == race_name:
            return r
    raise KeyError((name, source, race_name))


def table_text(e):
    """Flatten the "Spells of the Mark" spell table (entry_text drops tables) into one sentence."""
    for sub in e.get('entries', []):
        if isinstance(sub, dict) and sub.get('type') == 'table':
            rows = [f"{lvl}: {strip_tags(spells)}" for lvl, spells in sub['rows']]
            return f" {sub.get('caption', 'Spells')} - " + '; '.join(rows) + '.'
    return ''


def sub_traits(sub):
    out = []
    for e in sub.get('entries', []):
        if isinstance(e, dict) and e['name'] not in SKIP:
            out.append((e['name'], entry_text(e) + (table_text(e) if e['name'] == 'Spells of the Mark' else '')))
    return out


def derive_bases(species):
    by = {s['slug']: s for s in species}

    def common(slugs):
        lists = [by[s]['species_traits'] for s in slugs]
        first = [t for t in lists[0] if all(t in l for l in lists[1:])]
        return first

    def common_ab(slugs):
        out = dict(by[slugs[0]]['ability_bonuses'])
        for s in slugs[1:]:
            out = {k: v for k, v in out.items() if by[s]['ability_bonuses'].get(k) == v}
        return out

    bases = {}
    for key, slugs in {'dwarf': ['hill-dwarf', 'mountain-dwarf'], 'elf': ['high-elf', 'wood-elf', 'drow'],
                       'gnome': ['forest-gnome', 'rock-gnome'], 'halfling': ['lightfoot-halfling', 'stout-halfling']}.items():
        bases[key] = dict(traits=common(slugs), ability=common_ab(slugs), speed=by[slugs[0]]['speed'],
                          langs_from=slugs[0], lang_choices=0)
    for key, slug in {'human': 'human', 'half-elf': 'half-elf', 'half-orc': 'half-orc'}.items():
        s = by[slug]
        bases[key] = dict(traits=list(s['species_traits']), ability=dict(s['ability_bonuses']), speed=s['speed'],
                          langs_from=slug, lang_choices=s.get('languageChoices', 0), ability_choice=s.get('abilityChoice'))
    bases['human']['traits'] = []
    bases['human']['ability'] = {}
    return bases


def build(races, species_doc, languages):
    species = species_doc['species']
    bases = derive_bases(species)
    sp_langs = languages['SPECIES_LANGUAGE_MAP']
    drafts = []
    for cfg in STANDALONE:
        base = bases[cfg['base']]
        sub = find_sub(races, *cfg['sub'])
        raw = sub_traits(sub)
        traits = []
        for n, t in raw:
            if n == 'Spells of the Mark':
                n = MARK(cfg['mark'])
            traits.append((RENAMES.get((cfg['slug'], n), n), t))
        base_traits = [t for t in base['traits'] if t not in cfg.get('drop', [])]
        # a sub trait with the same canonical name as a base trait replaces it (e.g. Darkvision)
        sub_names = {n for n, _ in traits}
        base_traits = [t for t in base_traits if t not in sub_names]
        ab = dict(base['ability'])
        if 'ability' in cfg:
            ab = dict(cfg['ability'])
        for k, v in cfg.get('add_ability', {}).items():
            ab[k] = ab.get(k, 0) + v
        langs = cfg.get('langs') or sp_langs[base['langs_from']]
        drafts.append(dict(cfg, kind='standalone', traits=traits, base_traits=base_traits, ability_final=ab,
                           speed_final=cfg.get('speed', base['speed']), langs_final=langs,
                           lang_choices_final=cfg.get('lang_choices', base['lang_choices']),
                           ability_choice_final=cfg.get('ability_choice', base.get('ability_choice'))))

    dragon = next(r for r in species if r['slug'] == 'dragonborn')
    for cfg in EGW_DRAGONBORN:
        sub = find_sub(races, *cfg['sub'])
        raw = sub_traits(sub)
        racial = [(RENAMES.get((cfg['slug'], n), n), t) for n, t in raw]
        abstract = sub['_versions'][0]['_abstract']['_mod']['entries']
        item = next(m for m in abstract if m.get('mode') == 'replaceArr')['items']
        breath = strip_tags('\n'.join(item['entries']))
        breath = (breath.replace('{{area}}', 'the area determined by your Draconic Ancestry')
                        .replace('{{savingThrow}}', 'the saving throw determined by your Draconic Ancestry')
                        .replace('{{damageType}}', 'the damage type determined by your Draconic Ancestry'))
        breath = re.sub(r'a (the area)', r'\1', breath)
        breath = breath.replace('make a the saving throw', 'make the saving throw')
        racial.append(('Breath Weapon (Draconblood and Ravenite)', breath))
        drafts.append(dict(cfg, kind='dragonborn', src='EGW', traits=racial, base_traits=[], ability_final=cfg['ability'],
                           speed_final=dragon['speed'], langs_final=sp_langs['dragonborn'], lang_choices_final=0,
                           ability_choice_final=None, tags=['wildemount', 'draconic']))

    tiefling = next(r for r in species if r['slug'] == 'tiefling')
    tvars = []
    for slug, name, (sname, ssrc), ab, choice, replaces, desc in TIEFLING:
        sub = find_sub(races, sname, ssrc, 'Tiefling')
        raw = sub_traits(sub)
        # the SCAG "Appearance" entry is shared by all four variants: it must stay identical
        tvars.append(dict(slug=slug, name=name, description=desc, ability=ab, ability_choice=choice, replaces=replaces,
                          traits=raw, src=ssrc, speed=None))
    hvars = []
    halfelf = next(r for r in species if r['slug'] == 'half-elf')
    for slug, name, sname, vname, tname, speed, desc in HALF_ELF:
        sub = find_sub(races, sname, 'SCAG', 'Half-Elf')
        item = None
        for v in sub['_versions']:
            m = v['_mod']['entries']
            if m['items']['name'] == f'Variant Feature; {vname}':
                item = m['items']
        assert item, (sname, vname)
        hvars.append(dict(slug=slug, name=name, description=desc, ability=dict(halfelf['ability_bonuses']),
                          ability_choice=halfelf['abilityChoice'], replaces=['Skill Versatility'],
                          traits=[(tname, entry_text(item))], src='SCAG', speed=speed))
    return drafts, tvars, hvars


def report_conflicts(drafts, tvars, hvars, feature_desc, species_json):
    users = {}
    for s in species_json:
        for t in s['species_traits'] + [x for v in s.get('variants', []) for x in v['species_traits']]:
            users.setdefault(t, set()).add(s['slug'])
    texts = {}
    for d in drafts:
        for n, t in d['traits']:
            texts.setdefault(n, {}).setdefault(norm(t), (t, set()))[1].add(d['slug'])
    for v in tvars + hvars:
        for n, t in v['traits']:
            texts.setdefault(n, {}).setdefault(norm(t), (t, set()))[1].add(v['slug'])
    problems = 0
    for n, variants in sorted(texts.items()):
        if len(variants) > 1 and n not in ACCEPT_KEEP_EXISTING:
            problems += 1
            print(f'!! "{n}" has {len(variants)} different new texts in B5:')
            for _, (t, who) in variants.items():
                print(f'     {sorted(who)}: {t[:110]}')
        new = next(iter(variants.values()))[0]
        cur = feature_desc.get(n, {}).get('description')
        if cur is not None and norm(cur) != norm(new):
            if n in ACCEPT_KEEP_EXISTING:
                print(f'-- "{n}" kept as stored (used by {sorted(users.get(n, []))[:4]}...)')
            else:
                problems += 1
                print(f'?? "{n}" is stored and the new text differs:\n     old: {cur[:150]}\n     new: {new[:150]}')
    print(f'\n{problems} conflicts')
    return problems


def dragon_choice(base_species_choices):
    d = json.loads(json.dumps(base_species_choices['dragonborn'][0]))
    d['description'] = 'Your dragon type sets the damage type, shape and saving throw of your breath weapon.'
    for o in d['options']:
        o.pop('grants', None)
        o['description'] = re.sub(r'\s*Resistance to \w+ damage\.', '', o['description'])
    return [d]


def apply(drafts, tvars, hvars, species_doc, feature_desc, languages, grants, choices):
    species = species_doc['species']
    existing = {s['slug'] for s in species}
    for d in drafts:
        assert d['slug'] not in existing, d['slug']
        names = d['base_traits'] + [n for n, _ in d['traits']]
        rec = {
            'slug': d['slug'], 'name': d['name'], 'edition': '2014', 'source': d['src'], 'speed': d['speed_final'],
            'ability_bonuses': d['ability_final'], 'species_traits': names, 'description': d['description'],
            'typicalRoles': d['roles'], 'sources': [d['src']], 'core': False, 'expanded': True,
            'tags': d['tags'] + ['legacy'], 'legacy': True,
        }
        if d.get('ability_choice_final'):
            rec['abilityChoice'] = d['ability_choice_final']
        if d['lang_choices_final']:
            rec['languageChoices'] = d['lang_choices_final']
        species.append(rec)
        for n, t in d['traits']:
            if n in ACCEPT_KEEP_EXISTING and n in feature_desc:
                continue
            feature_desc[n] = {'description': t, 'source': BOOKS[d['src']]}
        languages['SPECIES_LANGUAGE_MAP'][d['slug']] = d['langs_final']
        if d['kind'] == 'dragonborn':
            choices['choices'][d['slug']] = dragon_choice(choices['choices'])

    def add_variants(parent_slug, variants, optional=True):
        parent = next(s for s in species if s['slug'] == parent_slug)
        assert 'variants' not in parent, parent_slug
        out = []
        for v in variants:
            rec = {
                'slug': v['slug'], 'name': v['name'], 'description': v['description'],
                'ability_bonuses': v['ability'], 'species_traits': [n for n, _ in v['traits']],
                'features': [],
            }
            if v['replaces']:
                rec['replacesTraits'] = v['replaces']
            if v.get('ability_choice'):
                rec['abilityChoice'] = v['ability_choice']
            if v.get('speed'):
                rec['speed'] = v['speed']
            out.append(rec)
            for n, t in v['traits']:
                if n in ACCEPT_KEEP_EXISTING and n in feature_desc:
                    continue
                if n in feature_desc and norm(feature_desc[n]['description']) == norm(t):
                    continue
                feature_desc[n] = {'description': t, 'source': BOOKS[v['src']]}
        parent['variants'] = out
        if optional:
            parent['variantOptional'] = True

    add_variants('tiefling', tvars)
    add_variants('half-elf', hvars)
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

    drafts, tvars, hvars = build(races, species_doc, languages)
    for d in drafts:
        print(f"{d['slug']:<28} speed={d['speed_final']} ab={d['ability_final']} choice={d.get('ability_choice_final')} langs={d['langs_final']}+{d['lang_choices_final']}\n"
              f"    base={d['base_traits']}\n    new ={[n for n, _ in d['traits']]}")
    for v in tvars + hvars:
        print(f"variant {v['slug']:<30} ab={v['ability']} choice={v.get('ability_choice')} replaces={v['replaces']} traits={[n for n, _ in v['traits']]}")
    print()
    problems = report_conflicts(drafts, tvars, hvars, feature_desc, species_doc['species'])
    (CACHE / 'species_b5_draft.json').write_text(json.dumps([drafts, tvars, hvars], indent=1))
    if args.apply:
        if problems:
            print('refusing to --apply with unresolved conflicts', file=sys.stderr)
            sys.exit(1)
        apply(drafts, tvars, hvars, species_doc, feature_desc, languages, grants, choices)
        for name, obj in (('species.json', species_doc), ('featureDescriptions.json', feature_desc),
                          ('speciesLanguages.json', languages), ('speciesTraitGrants.json', grants),
                          ('speciesChoices.json', choices)):
            (DATA / name).write_text(json.dumps(obj, indent=2, ensure_ascii=False) + '\n')
        print('applied')


if __name__ == '__main__':
    main()
