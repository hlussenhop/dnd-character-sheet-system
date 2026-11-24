#!/usr/bin/env python3
"""Species lane, batch B1: repair the 18 existing 2014 species from their canonical source.

Reads the 5etools `races.json` mirror (downloaded on demand), and:
  * builds a draft for each species (traits + text, ability scores, variants, languages),
  * reports trait-name conflicts against featureDescriptions.json,
  * with --apply, rewrites src/data/species.json, featureDescriptions.json, speciesLanguages.json.

Usage:
  python3 sourcebooks/build_species_b1.py            # draft + conflict report only
  python3 sourcebooks/build_species_b1.py --apply    # write app data
"""
import argparse
import copy
import json
import re
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / 'src' / 'data'
CACHE = Path(__file__).resolve().parent / '.cache'
RACES_URL = 'https://raw.githubusercontent.com/5etools-mirror-3/5etools-src/main/data/races.json'

BOOK_NAMES = {
    'MPMM': "Mordenkainen Presents: Monsters of the Multiverse",
    'GGR': "Guildmasters' Guide to Ravnica",
    'SCC': 'Strixhaven: A Curriculum of Chaos',
}

# existing slug -> config.
#   canon: (race name, source) in races.json
#   slug/name: new slug and display name (only Yuan-Ti changes)
#   fixed: fixed ability bonuses (otherwise the MPMM flexible choice is used)
SPECIES = [
    dict(old='aasimar', canon=('Aasimar', 'MPMM')),
    dict(old='bugbear', canon=('Bugbear', 'MPMM')),
    dict(old='fairy', canon=('Fairy', 'MPMM')),
    dict(old='firbolg', canon=('Firbolg', 'MPMM')),
    dict(old='genasi', canon=('Genasi', 'MPMM')),
    dict(old='githyanki', canon=('Githyanki', 'MPMM')),
    dict(old='goblin', canon=('Goblin', 'MPMM')),
    dict(old='goliath', canon=('Goliath', 'MPMM')),
    dict(old='harengon', canon=('Harengon', 'MPMM')),
    dict(old='hobgoblin', canon=('Hobgoblin', 'MPMM')),
    dict(old='kenku', canon=('Kenku', 'MPMM')),
    dict(old='kobold', canon=('Kobold', 'MPMM')),
    dict(old='loxodon', canon=('Loxodon', 'GGR'), fixed={'CON': 2, 'WIS': 1}),
    dict(old='orc', canon=('Orc', 'MPMM')),
    dict(old='owlin', canon=('Owlin', 'SCC')),
    dict(old='tabaxi', canon=('Tabaxi', 'MPMM')),
    dict(old='triton', canon=('Triton', 'MPMM')),
    dict(old='yuan-ti-pureblood', canon=('Yuan-Ti', 'MPMM'), slug='yuan-ti', name='Yuan-Ti'),
]

# Entries that carry no mechanics the app displays, or that the app models elsewhere.
SKIP_ENTRIES = {'Size', 'Age', 'Alignment', 'Languages', 'Creature Type'}

# Trait-name conflicts: (species slug, canonical trait name) -> name to use in the app.
# Needed because featureDescriptions.json is keyed by name only and is shared by every
# edition/book. Filled in after reading the conflict report.
RENAMES = {
    # MPMM goblinoids: charm only (the 2014 PHB elf version also protects against magical sleep)
    ('bugbear', 'Fey Ancestry'): 'Fey Ancestry (Charmed Only)',
    ('goblin', 'Fey Ancestry'): 'Fey Ancestry (Charmed Only)',
    ('hobgoblin', 'Fey Ancestry'): 'Fey Ancestry (Charmed Only)',
    # Speed lines carry the swim/climb speed; they differ per species
    ('tabaxi', 'Speed'): 'Climbing Speed',
    ('triton', 'Speed'): 'Swimming Speed',
    ('genasi', 'Speed'): 'Swimming Speed',  # Water Genasi
    # Owlin's darkvision is 120 ft
    ('owlin', 'Darkvision'): 'Darkvision (120 ft)',
}

# Names shared with other species/editions where the new text only rewords (or corrects) the
# stored text, so the shared entry is rewritten. Every use of the name stays accurate.
ACCEPT_OVERWRITE = {'Darkvision', 'Healing Hands', "Stone's Endurance"}
# Names shared with other species where the stored text already says the same thing: keep it.
ACCEPT_KEEP_EXISTING = {'Relentless Endurance'}
# Several B1 species have the same trait with only wording differences: use this species' text.
PREFERRED_TEXT_FROM = {'Amphibious': 'triton', 'Darkvision': 'aasimar', 'Flight': 'fairy'}

# Flavor copy (hand-written paraphrase; the rules text comes from the book). Species-level
# overrides replace stale descriptions; variant descriptions are shown in the variant picker.
SPECIES_DESCRIPTION = {
    'genasi': "Genasi are descended from genies and mortals, and carry the power of an elemental plane in their blood. "
              "Air, earth, fire and water genasi each manifest that heritage differently.",
    'yuan-ti': "Yuan-ti are serpentine humanoids shaped by ancient, dark magic. Those who walk among other peoples "
               "pair snake-like features with innate magic and a resistance to poison and spells.",
}
VARIANT_DESCRIPTION = {
    'air-genasi': "Descended from djinn: swift (35 ft walking speed), resistant to lightning, and able to hold your breath indefinitely.",
    'earth-genasi': "Descended from dao or marids of stone: unimpeded by difficult terrain and able to merge into rock.",
    'fire-genasi': "Descended from efreet: resistant to fire and able to produce flame and burning hands.",
    'water-genasi': "Descended from marids: resistant to acid, amphibious, and able to shape water.",
    'necrotic-shroud': "Your Celestial Revelation unleashes a shroud of necrotic energy that frightens nearby foes.",
    'radiant-consumption': "Your Celestial Revelation sears nearby creatures with searing radiant light.",
    'radiant-soul': "Your Celestial Revelation gives you spectral wings and a flying speed.",
    'craftiness': "Gain proficiency in one of Arcana, Investigation, Medicine, Sleight of Hand or Survival.",
    'defiance': "Advantage on saving throws to avoid or end the frightened condition on yourself.",
    'draconic-sorcery': "Learn one cantrip from the sorcerer spell list.",
}

ABILITY = {'str': 'STR', 'dex': 'DEX', 'con': 'CON', 'int': 'INT', 'wis': 'WIS', 'cha': 'CHA'}
ALL_PATTERNS = [[2, 1], [1, 1, 1]]

TAG_RE = re.compile(r'\{@(\w+)\s*([^{}]*)\}')


def strip_tags(text):
    """Turn 5etools {@tag a|b|c} markup into plain text."""
    def sub(m):
        tag, body = m.group(1), m.group(2)
        parts = body.split('|')
        if tag == 'dc':
            return f'DC {parts[0]}'
        if tag == 'dice' or tag == 'damage' or tag == 'd20':
            return parts[0]
        if tag == 'hit':
            return f'+{parts[0]}'
        if tag == 'filter':
            return parts[0]
        if tag == 'quickref':  # {@quickref text||section}: the 3rd segment is a section number, not display text
            return parts[0]
        if tag == 'book':  # {@book text|source|chapter|anchor}: only the first segment is shown
            return parts[0]
        # tags with a display text as 3rd segment
        if len(parts) >= 3 and parts[2]:
            return parts[2]
        return parts[0]
    prev = None
    while prev != text:
        prev = text
        text = TAG_RE.sub(sub, text)
    return text


def render(entry, depth=0):
    """Flatten a 5etools entry into a list of plain-text paragraphs."""
    if isinstance(entry, str):
        return [strip_tags(entry)]
    if isinstance(entry, list):
        return [p for sub in entry for p in render(sub, depth + 1)]
    t = entry.get('type')
    out = []
    if t == 'list':
        for item in entry.get('items', []):
            if isinstance(item, dict) and item.get('type') == 'item':
                body = item.get("entry") or " ".join(render(item.get("entries", [])))
                out.append(f"{item['name']}: {strip_tags(body)}")
            else:
                out.extend(render(item, depth + 1))
        return out
    if t in ('entries', 'inset', 'insetReadaloud', 'section'):
        for sub in entry.get('entries', []):
            out.extend(render(sub, depth + 1))
        return out
    if t == 'item':
        return [f"{entry.get('name', '')}: {strip_tags(entry.get('entry', ''))}"]
    return []


def entry_text(entry):
    # Drop the "Tip" insets (rules reminders, not trait text)
    cleaned = copy.deepcopy(entry)
    cleaned['entries'] = [e for e in cleaned.get('entries', [])
                          if not (isinstance(e, dict) and e.get('type') == 'inset')]
    return '\n'.join(render(cleaned))


def load_races():
    CACHE.mkdir(exist_ok=True)
    path = CACHE / 'races.json'
    if not path.exists():
        tmp = Path('/tmp/races.json')
        if tmp.exists():
            path.write_bytes(tmp.read_bytes())
        else:
            print('downloading races.json ...', file=sys.stderr)
            urllib.request.urlretrieve(RACES_URL, path)
    return json.loads(path.read_text())


def find_race(races, name, source):
    for r in races['race']:
        if r['name'] == name and r['source'] == source:
            return r
    raise KeyError((name, source))


def norm(s):
    return re.sub(r'[^a-z0-9]+', ' ', s.lower()).strip()


def version_entries(race, version):
    """Apply a `_versions` replaceArr to a race's entries -> (trait list of (name, text))."""
    mod = version['_mod']['entries']
    items = mod['items'] if isinstance(mod['items'], list) else [mod['items']]
    return [(i['name'], entry_text(i)) for i in items]


def build(races, existing_species, feature_desc):
    drafts = []
    all_texts = {}  # app trait name -> {text: set(species slugs)}
    for cfg in SPECIES:
        race = find_race(races, *cfg['canon'])
        old = next(s for s in existing_species if s['slug'] == cfg['old'])
        slug = cfg.get('slug', cfg['old'])
        name = cfg.get('name', old['name'])

        def app_name(trait_name):
            return RENAMES.get((slug, trait_name)) or RENAMES.get((cfg['old'], trait_name)) or trait_name

        traits = []
        for e in race['entries']:
            if not isinstance(e, dict) or e.get('name') in SKIP_ENTRIES:
                continue
            if e.get('name') in ('Celestial Revelation', 'Kobold Legacy') and race.get('_versions'):
                continue  # replaced per version below
            traits.append((app_name(e['name']), entry_text(e)))

        speed = race['speed']['walk'] if isinstance(race['speed'], dict) else race['speed']

        variants = []
        if race.get('_versions'):
            for v in race['_versions']:
                vname = v['name'].split(';', 1)[1].strip()
                variants.append(dict(slug=re.sub(r'[^a-z0-9]+', '-', vname.lower()).strip('-'),
                                     name=vname, traits=[(app_name(n), t) for n, t in version_entries(race, v)],
                                     speed=None))
        subraces = [s for s in races['subrace'] if s.get('raceName') == race['name'] and s.get('raceSource') == race['source']]
        for s in subraces:
            variants.append(dict(slug=f"{s['name'].lower()}-genasi", name=f"{s['name']} Genasi",
                                 traits=[(app_name(e['name']), entry_text(e)) for e in s['entries'] if isinstance(e, dict)],
                                 speed=s.get('speed')))

        canon_ref = f"{race['name']}|{race['source']}".lower()
        sources = [race['source']] + sorted({
            r['source'] for r in races['race']
            if r['source'] != race['source'] and r['source'] != 'DMG'
            and canon_ref in [x.lower() if isinstance(x, str) else x['uid'].lower() for x in r.get('reprintedAs', [])]
        } | ({'VGM'} if cfg['old'] == 'yuan-ti-pureblood' else set()))
        draft = dict(old=cfg['old'], slug=slug, name=name, source=cfg['canon'][1], sources=sources,
                     speed=speed, fixed=cfg.get('fixed'), traits=traits, variants=variants,
                     size=race.get('size'), page=race.get('page'))
        drafts.append(draft)

        for tname, text in traits + [t for v in variants for t in v['traits']]:
            all_texts.setdefault(tname, {}).setdefault(norm(text), (text, set()))[1].add(slug)
    return drafts, all_texts


def report_conflicts(drafts, all_texts, feature_desc, species_json):
    """Print names whose new text differs from what is stored, and who else uses the name."""
    users = {}
    b1_slugs = {d['old'] for d in drafts}
    for s in species_json:
        for t in s['species_traits']:
            users.setdefault(t, set()).add(s['slug'])
        for v in s.get('variants', []):
            for t in v['species_traits']:
                users.setdefault(t, set()).add(s['slug'])
    problems = 0
    for tname, variants in sorted(all_texts.items()):
        if len(variants) > 1 and tname not in PREFERRED_TEXT_FROM:
            problems += 1
            print(f'!! "{tname}" has {len(variants)} different new texts within B1:')
            for _, (text, who) in variants.items():
                print(f'     {sorted(who)}: {text[:110]}')
        new_text = next(iter(variants.values()))[0]
        cur = feature_desc.get(tname, {}).get('description')
        outside = sorted(u for u in users.get(tname, set()) if u not in b1_slugs)
        if (cur is not None and norm(cur) != norm(new_text) and outside
                and tname not in ACCEPT_OVERWRITE and tname not in ACCEPT_KEEP_EXISTING):
            problems += 1
            print(f'?? "{tname}" is also used by {outside} and its text would change:')
            print(f'     old: {cur[:140]}')
            print(f'     new: {new_text[:140]}')
    print(f'\n{problems} conflicts')
    return problems


def apply(drafts, all_texts, species_doc, feature_desc, languages):
    species = species_doc['species']
    by_slug = {s['slug']: s for s in species}
    for d in drafts:
        old = by_slug[d['old']]
        rec = old
        rec['slug'] = d['slug']
        rec['name'] = d['name']
        rec['source'] = d['source']
        rec['sources'] = d['sources']
        rec['speed'] = d['speed']
        if d['slug'] in SPECIES_DESCRIPTION:
            rec['description'] = SPECIES_DESCRIPTION[d['slug']]
        rec['core'] = False
        rec['expanded'] = True
        rec['legacy'] = True
        tags = [t for t in rec.get('tags', []) if t not in ('core', 'expanded')]
        if 'legacy' not in tags:
            tags.append('legacy')
        rec['tags'] = tags
        if d['old'] != d['slug']:
            rec['legacySlugs'] = sorted(set(rec.get('legacySlugs', []) + [d['old']]))

        fixed = d['fixed']
        rec['ability_bonuses'] = dict(fixed) if fixed else {}
        rec.pop('abilityChoice', None)
        choice = None if fixed else {'patterns': ALL_PATTERNS}
        if choice:
            rec['abilityChoice'] = choice

        rec['species_traits'] = [n for n, _ in d['traits']]
        rec.pop('variants', None)
        rec.pop('variantOptional', None)
        if d['variants']:
            rec['variants'] = []
            for v in d['variants']:
                vrec = {
                    'slug': v['slug'],
                    'name': v['name'],
                    'description': VARIANT_DESCRIPTION.get(v['slug'], ''),
                    'ability_bonuses': dict(fixed) if fixed else {},
                    'species_traits': [n for n, _ in v['traits']],
                    'features': [],
                }
                if choice:
                    vrec['abilityChoice'] = choice
                if v['speed']:
                    vrec['speed'] = v['speed']
                rec['variants'].append(vrec)
        # Species-level cleanup of dangling/cross-edition fields
        rec.pop('species_feat_options', None)
        rec.pop('speciesFeatOptions', None)

        # trait descriptions
        for tname, text in d['traits'] + [t for v in d['variants'] for t in v['traits']]:
            if tname in ACCEPT_KEEP_EXISTING and tname in feature_desc:
                continue
            if tname in PREFERRED_TEXT_FROM and PREFERRED_TEXT_FROM[tname] != d['slug']:
                continue  # the preferred species writes this entry
            feature_desc[tname] = {'description': text, 'source': BOOK_NAMES[d['source']]}

        languages['SPECIES_LANGUAGE_MAP'].pop(d['old'], None)
        languages['SPECIES_LANGUAGE_MAP'][d['slug']] = ['Common'] if d['source'] != 'GGR' else ['Common', 'Loxodon']
    species_doc['metadata']['lastUpdated'] = '2026-11-22'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--apply', action='store_true')
    args = ap.parse_args()

    races = load_races()
    species_doc = json.loads((DATA / 'species.json').read_text())
    feature_desc = json.loads((DATA / 'featureDescriptions.json').read_text())
    languages = json.loads((DATA / 'speciesLanguages.json').read_text())

    drafts, all_texts = build(races, species_doc['species'], feature_desc)
    for d in drafts:
        print(f"{d['slug']:<20} {d['source']:<5} speed={d['speed']} traits={[n for n,_ in d['traits']]}"
              + (f" variants={[v['name'] for v in d['variants']]}" if d['variants'] else ''))
    print()
    problems = report_conflicts(drafts, all_texts, feature_desc, species_doc['species'])

    (CACHE / 'species_b1_draft.json').write_text(json.dumps(
        [dict(d, traits=d['traits'], variants=d['variants']) for d in drafts], indent=1))

    if args.apply:
        if problems:
            print('refusing to --apply with unresolved conflicts', file=sys.stderr)
            sys.exit(1)
        apply(drafts, all_texts, species_doc, feature_desc, languages)
        (DATA / 'species.json').write_text(json.dumps(species_doc, indent=2, ensure_ascii=False) + '\n')
        (DATA / 'featureDescriptions.json').write_text(json.dumps(feature_desc, indent=2, ensure_ascii=False) + '\n')
        (DATA / 'speciesLanguages.json').write_text(json.dumps(languages, indent=2, ensure_ascii=False) + '\n')
        print('applied')


if __name__ == '__main__':
    main()
