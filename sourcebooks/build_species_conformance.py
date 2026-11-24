#!/usr/bin/env python3
"""Species lane: make each edition's species match its own book.

  * 2014: the 14 PHB species (speeds, full trait lists, book trait names, PHB text).
  * 2024: XPHB trait text. `featureDescriptions.json` is keyed by trait name only, so where a
    2024 trait shares a name with a 2014 trait but reads differently, the 2024 text is stored
    under "<Name> [2024]" (see getFeatureDescription in src/utils/featureDescriptions.ts).
    2024-only names get a plain key.
  * 2024 Dragonborn: no species feat (the book grants none), Orc: no Powerful Build.

Not idempotent over already-applied data in every detail, but safe to re-run: it only writes
text where the stored value differs and reports every change.

Usage:
  python3 sourcebooks/build_species_conformance.py            # report only
  python3 sourcebooks/build_species_conformance.py --apply    # write app data
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_species_b1 import entry_text, load_races, norm  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / 'src' / 'data'

PHB = "Player's Handbook"
PHB24 = "Player's Handbook (2024)"
SKIP = {'Size', 'Age', 'Alignment', 'Languages', 'Creature Type', 'Ability Score Increase'}

# app slug -> (race, subrace or None)
PHB_SPECIES = {
    'mountain-dwarf': ('Dwarf', 'Mountain'),
    'hill-dwarf': ('Dwarf', 'Hill'),
    'high-elf': ('Elf', 'High'),
    'wood-elf': ('Elf', 'Wood'),
    'drow': ('Elf', 'Drow'),
    'lightfoot-halfling': ('Halfling', 'Lightfoot'),
    'stout-halfling': ('Halfling', 'Stout'),
    'forest-gnome': ('Gnome', 'Forest'),
    'rock-gnome': ('Gnome', 'Rock'),
    'dragonborn': ('Dragonborn', None),
    'half-elf': ('Half-Elf', None),
    'half-orc': ('Half-Orc', None),
    'tiefling': ('Tiefling', None),
}
# Book trait name -> app name (the book's bare "Speed" would collide with every other species)
PHB_TRAIT_RENAME = {'Speed': 'Dwarven Speed'}
# Left generic on purpose: the PHB opens each species' Darkvision with a flavor sentence, but the
# rule is identical and the shared entry also serves MPMM species.
KEEP_GENERIC = {'Darkvision'}

# ---- 2024 -------------------------------------------------------------------------------
# species slug -> {old trait name: new trait name} (also applied to variants)
RENAMES_2024 = {
    'dwarf-2024': {'Darkvision': 'Darkvision (120 ft)'},
    'orc-2024': {'Darkvision': 'Darkvision (120 ft)'},
    'halfling-2024': {'Lucky': 'Luck'},
    'dragonborn-2024': {'Draconic Flight (cannot fly while wearing medium or heavy armor)': 'Draconic Flight'},
    'elf-2024': {'Mask of the Wild': 'Wood Elf Magic'},
    'gnome-2024': {'Speak with Small Beasts': 'Speak with Animals'},
    'goliath-2024': {'Cloud Jaunt': "Cloud's Jaunt"},
}
REMOVE_TRAITS_2024 = {'orc-2024': ['Powerful Build']}  # not an XPHB Orc trait

# Lineage-label traits are written by hand from the XPHB lineage text.
CAST = ("You always have the spell prepared and can cast it once without a spell slot, regaining "
        "that ability when you finish a Long Rest; you can also cast it with spell slots. "
        "Intelligence, Wisdom, or Charisma is your spellcasting ability for it (choose when you select the lineage).")
LABEL_2024 = {
    # elf lineages
    'Superior Darkvision': "The range of your Darkvision increases to 120 feet.",
    'Drow Magic': "You know the Dancing Lights cantrip. At character level 3 you learn Faerie Fire, and at level 5 "
                  "Darkness. " + CAST,
    'Cantrip': "You know the Prestidigitation cantrip. Whenever you finish a Long Rest, you can replace that cantrip "
               "with a different cantrip from the Wizard spell list.",
    'Detect Magic': "At character level 3 you learn Detect Magic, and at level 5 Misty Step. " + CAST,
    'Fleet of Foot': "Your Speed increases to 35 feet.",
    'Wood Elf Magic': "You know the Druidcraft cantrip. At character level 3 you learn Longstrider, and at level 5 "
                      "Pass without Trace. " + CAST,
    # gnome lineages
    'Minor Illusion': "You know the Minor Illusion cantrip.",
    'Speak with Animals': "You always have the Speak with Animals spell prepared. You can cast it without a spell slot "
                          "a number of times equal to your Proficiency Bonus, and you regain all expended uses when "
                          "you finish a Long Rest. You can also use any spell slots you have to cast the spell.",
    'Mending': "You know the Mending cantrip.",
    'Tinker': "You can spend 10 minutes casting Prestidigitation to create a Tiny clockwork device (AC 5, 1 HP), such "
              "as a toy, fire starter, or music box. When you create the device, you choose one effect from "
              "Prestidigitation; the device produces that effect whenever you or another creature takes a Bonus "
              "Action to activate it with a touch. If the chosen effect has options, you choose one when you create "
              "the device (for example, ignite or extinguish fire, not both). You can have three such devices at a "
              "time, and each falls apart 8 hours after its creation or when you dismantle it with a touch as a "
              "Utilize action.",
    'Prestidigitation': "You know the Prestidigitation cantrip.",
    # tiefling legacies
    'Abyssal Fortitude': "You have Resistance to Poison damage. You also know the Poison Spray cantrip.",
    'Abyssal Arcana': "At character level 3 you learn Ray of Sickness, and at level 5 Hold Person. " + CAST,
    'Chthonic Resistance': "You have Resistance to Necrotic damage. You also know the Chill Touch cantrip.",
    'Chthonic Arcana': "At character level 3 you learn False Life, and at level 5 Ray of Enfeeblement. " + CAST,
    'Infernal Legacy': "You know the Fire Bolt cantrip. At character level 3 you learn Hellish Rebuke, and at level 5 "
                       "Darkness. " + CAST,
    'Hellish Resistance': "You have Resistance to Fire damage.",
}
# Version items of the form "Name: text" inside the Goliath Giant Ancestry versions
GIANT_LABELS = ["Cloud's Jaunt", "Fire's Burn", "Frost's Chill", "Hill's Tumble", "Stone's Endurance", "Storm's Thunder"]


def race_entries(race):
    return [(e['name'], entry_text(e).replace(' (see chapter 5)', '')) for e in race['entries']
            if isinstance(e, dict) and e.get('name') and e['name'] not in SKIP]


def find(races, kind, name, source, raceName=None):
    for r in races[kind]:
        if r['name'] == name and r['source'] == source and (raceName is None or r.get('raceName') == raceName):
            return r
    raise KeyError((kind, name, source, raceName))


def find_sub(races, race, sub):
    for r in races['subrace']:
        if r.get('raceName') == race and r.get('raceSource') == 'PHB' and r.get('name') == sub:
            return r
    raise KeyError((race, sub))


def merge_ability(*sources):
    out = {}
    for s in sources:
        for a in s.get('ability', []) or []:
            for k, v in a.items():
                if k in ('choose',):
                    continue
                out[k.upper()] = out.get(k.upper(), 0) + v
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--apply', action='store_true')
    args = ap.parse_args()

    races = load_races()
    species_doc = json.loads((DATA / 'species.json').read_text())
    species = {s['slug']: s for s in species_doc['species']}
    fd = json.loads((DATA / 'featureDescriptions.json').read_text())
    enhanced = json.loads((DATA / 'enhancedSpeciesData.json').read_text())
    log = []

    def set_text(key, text, source):
        cur = fd.get(key)
        if cur and cur['description'] == text:
            return
        log.append(f"  {'ADD ' if not cur else 'EDIT'} {key}")
        fd[key] = {'description': text, 'source': source}

    def users_of(name, exclude=()):
        out = []
        for s in species.values():
            if s['slug'] in exclude:
                continue
            names = list(s['species_traits']) + [t for v in s.get('variants', []) for t in v['species_traits']]
            if name in names:
                out.append(s['slug'])
        return out

    # ---------------- 2014 PHB ----------------
    print('== 2014 PHB')
    phb_slugs = set(PHB_SPECIES) | {'human'}
    for slug, (race_name, sub_name) in PHB_SPECIES.items():
        rec = species[slug]
        race = find(races, 'race', race_name, 'PHB')
        sub = find_sub(races, race_name, sub_name) if sub_name else None
        pieces = [race] + ([sub] if sub else [])

        speed = (sub or {}).get('speed') or race.get('speed')
        if isinstance(speed, dict):
            speed = speed.get('walk', 30)
        if rec['speed'] != speed:
            log.append(f"  {slug}: speed {rec['speed']} -> {speed}")
            rec['speed'] = speed

        book_asi = merge_ability(*pieces)
        app_asi = dict(rec['ability_bonuses'])
        if book_asi and not app_asi:
            log.append(f"  {slug}: ability bonuses {{}} -> {book_asi}")
            rec['ability_bonuses'] = book_asi
        elif book_asi and book_asi != app_asi:
            print(f"  !! {slug}: ability book={book_asi} app={app_asi} (left unchanged)")

        book = []
        for p in pieces:
            for name, text in race_entries(p):
                book.append((PHB_TRAIT_RENAME.get(name, name), text))
        # book order: race traits first then subrace traits, de-duplicated (subrace may restate)
        seen, ordered = set(), []
        for n, t in book:
            if n not in seen:
                seen.add(n)
                ordered.append((n, t))
        new_traits = [n for n, _ in ordered]
        if new_traits != rec['species_traits']:
            log.append(f"  {slug}: traits {rec['species_traits']} -> {new_traits}")
            rec['species_traits'] = new_traits

        for n, t in ordered:
            if n in KEEP_GENERIC:
                continue
            cur = fd.get(n)
            if cur and norm(cur['description']) == norm(t):
                continue
            other = users_of(n, exclude=phb_slugs - {slug})  # users outside the PHB-14
            other = [o for o in users_of(n) if o not in phb_slugs and species[o]['edition'] == '2014']
            if other:
                print(f"  !! {n}: also used by {other}; PHB text not applied")
                continue
            set_text(n, t, PHB)

    # drop description keys orphaned by the renames above
    used = set()
    for s in species.values():
        used.update(s['species_traits'])
        for v in s.get('variants', []):
            used.update(v['species_traits'])
    for old in ['Superior Darkvision (120ft)', 'Stout Resilience (poison advantage)', 'Skill Versatility (2 skills)',
                'Menacing (Intimidation)', 'Hellish Resistance (fire)']:
        if old in fd and old not in used:
            log.append(f"  DROP {old}")
            del fd[old]

    # ---------------- 2024 XPHB ----------------
    print('== 2024 XPHB')
    xphb = {}  # (app species slug) -> {trait name: text}
    pairs = {'human-2024': 'Human', 'dwarf-2024': 'Dwarf', 'elf-2024': 'Elf', 'gnome-2024': 'Gnome',
             'halfling-2024': 'Halfling', 'dragonborn-2024': 'Dragonborn', 'orc-2024': 'Orc',
             'tiefling-2024': 'Tiefling', 'aasimar-2024': 'Aasimar', 'goliath-2024': 'Goliath'}
    for slug, name in pairs.items():
        race = find(races, 'race', name, 'XPHB')
        xphb[slug] = dict(race_entries(race))
    # XPHB trait names that differ from the app's
    xphb['dwarf-2024']['Darkvision (120 ft)'] = xphb['dwarf-2024'].pop('Darkvision')
    xphb['orc-2024']['Darkvision (120 ft)'] = xphb['orc-2024'].pop('Darkvision')
    # Goliath giant labels: the Giant Ancestry list items
    giant = {}
    for line in xphb['goliath-2024']['Giant Ancestry'].split('\n'):
        for label in GIANT_LABELS:
            if line.startswith(label):
                giant[label] = line.split(': ', 1)[1]
    xphb['goliath-2024'].update(giant)

    for slug, ren in RENAMES_2024.items():
        rec = species[slug]
        rec['species_traits'] = [ren.get(n, n) for n in rec['species_traits']]
        for v in rec.get('variants', []):
            v['species_traits'] = [ren.get(n, n) for n in v['species_traits']]
    for slug, names in REMOVE_TRAITS_2024.items():
        species[slug]['species_traits'] = [n for n in species[slug]['species_traits'] if n not in names]

    # 2024 text per name, checking that two 2024 species never disagree
    wanted = {}
    for slug, rec in species.items():
        if rec['edition'] != '2024':
            continue
        names = list(rec['species_traits']) + [t for v in rec.get('variants', []) for t in v['species_traits']]
        for n in names:
            text = LABEL_2024.get(n) or xphb.get(slug, {}).get(n)
            if text is None:
                print(f"  !! no XPHB text for {slug}: {n}")
                continue
            if n in wanted and norm(wanted[n]) != norm(text):
                print(f"  !! 2024 conflict for {n}")
            wanted.setdefault(n, text)

    for n, text in sorted(wanted.items()):
        plain = fd.get(n)
        if plain is None:
            set_text(n, text, PHB24)
        elif norm(plain['description']) != norm(text):
            set_text(f"{n} [2024]", text, PHB24)
        else:
            if f"{n} [2024]" in fd:
                log.append(f"  DROP {n} [2024] (now identical)")
                del fd[f"{n} [2024]"]

    # Dragonborn: the book gives no species feat
    db = enhanced['dragonborn']
    if db.pop('speciesFeatOptions', None) is not None:
        log.append("  enhanced dragonborn: removed speciesFeatOptions")
    for key in ('speciesFeat', 'speciesFeatOptions'):
        if species['dragonborn-2024'].pop(key, None) is not None:
            log.append(f"  dragonborn-2024: removed {key}")

    print('\n'.join(log) or '  (no changes)')
    if args.apply:
        (DATA / 'species.json').write_text(json.dumps(species_doc, indent=2, ensure_ascii=False) + '\n')
        (DATA / 'featureDescriptions.json').write_text(json.dumps(fd, indent=2, ensure_ascii=False) + '\n')
        (DATA / 'enhancedSpeciesData.json').write_text(json.dumps(enhanced, indent=2, ensure_ascii=False) + '\n')
        print('written')


if __name__ == '__main__':
    main()
