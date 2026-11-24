#!/usr/bin/env python3
"""
build_backgrounds.py: backgrounds lane (fast-lane plan, step 3).

Regenerates src/data/backgrounds.json from the 5etools mirror for every book in
content_inventory.json:

  * one record per background and edition (2014 slug `acolyte`, 2024 slug `acolyte-2024`)
  * skills, tools and languages from the structured proficiencies, including choices
  * 2024 ability-score lists and Origin Feat refs (resolved against feats.json)
  * starting equipment, using equipment.json names when they match and the book text otherwise
  * the feature, and flavor text (the long form loads lazily from src/data/content/backgrounds/)

Usage:
    python3 sourcebooks/build_backgrounds.py          # report only
    python3 sourcebooks/build_backgrounds.py --apply  # write the data
"""

from __future__ import annotations

import json
import re
import sys
from collections import Counter

import lanelib as L

OUT = L.DATA / 'backgrounds.json'
INVENTORY = json.loads((L.ROOT / 'sourcebooks' / 'content_inventory.json').read_text())

ABILITY = {'str': 'STR', 'dex': 'DEX', 'con': 'CON', 'int': 'INT', 'wis': 'WIS', 'cha': 'CHA'}
SKILL = {
    'acrobatics': 'Acrobatics', 'animal handling': 'Animal Handling', 'arcana': 'Arcana', 'athletics': 'Athletics',
    'deception': 'Deception', 'history': 'History', 'insight': 'Insight', 'intimidation': 'Intimidation',
    'investigation': 'Investigation', 'medicine': 'Medicine', 'nature': 'Nature', 'perception': 'Perception',
    'performance': 'Performance', 'persuasion': 'Persuasion', 'religion': 'Religion',
    'sleight of hand': 'Sleight of Hand', 'stealth': 'Stealth', 'survival': 'Survival',
}
FEAT_CATEGORY = {
    'O': 'origin', 'G': 'general', 'EB': 'epic_boon', 'FS': 'fighting_style', 'FS:P': 'fighting_style',
    'FS:R': 'fighting_style', 'D': 'dragonmark', 'DG': 'dark_gift',
}
TRAIT_COLUMN = (
    ('personality', 'personalityTraits'), ('ideal', 'ideals'), ('bond', 'bonds'), ('flaw', 'flaws'),
)
GP = re.compile(r'^(\d+) gp$')


def inventory_sources() -> set[str]:
    return {s.upper() for s in INVENTORY['data']['Backgrounds']}


def published() -> dict[str, str]:
    dates: dict[str, str] = {}
    for rel, key in (('books.json', 'book'), ('adventures.json', 'adventure')):
        for book in L.fetch(rel).get(key, []):
            dates.setdefault(book['id'].upper(), book.get('published', ''))
    return dates


def load_names(path: str) -> dict[str, str]:
    """norm(name) -> the app's display name, from a name-keyed or category-keyed JSON file."""
    data = json.loads((L.DATA / path).read_text())
    names: dict[str, str] = {}

    def take(node: object) -> None:
        if isinstance(node, dict):
            if isinstance(node.get('name'), str):
                names.setdefault(L.norm(node['name']), node['name'])
            for value in node.values():
                take(value)
        elif isinstance(node, list):
            for value in node:
                take(value)

    take(data)
    return names


def inorm(text: str) -> str:
    """Comparison key that treats apostrophes as nothing, so "traveler's" matches "travelers"."""
    return L.norm(text.replace("'", '').replace('’', ''))


EQUIPMENT_TYPE = {
    'setGaming': 'Gaming set',
    'toolArtisan': "Artisan's tools",
    'instrumentMusical': 'Musical instrument',
}
# Gear that means "the tool you chose", not a row in equipment.json.
CATEGORY_GEAR = {inorm(v) for v in EQUIPMENT_TYPE.values()}


def title_key(key: str) -> str:
    """`thieves' tools` -> `Thieves' Tools`; keeps the text inside parentheses lower case."""
    text = key.strip()
    paren = ''
    if '(' in text:
        text, paren = text.split('(', 1)
        paren = '(' + paren.lower()
    words = [w[:1].upper() + w[1:] for w in text.split()]
    return (' '.join(words) + (' ' + paren if paren else '')).strip()


class Names:
    def __init__(self) -> None:
        self.tools = load_names('toolDescriptions.json')
        self.equipment = {inorm(name): name for name in load_names('equipment.json').values()}
        self.languages = load_names('languages.json')
        grants = json.loads((L.DATA / 'speciesTraitGrants.json').read_text())['Specialized Design']['toolChoices']['from']
        self.artisan = [self.tool(n) for n in grants[:17]]
        self.gaming = [self.tool(n) for n in ('Dice set', 'Dragonchess set', 'Playing card set', 'Three-Dragon Ante set')]
        self.instruments = [self.tool(n) for n in grants[grants.index('Bagpipes'):grants.index('Viol') + 1]]
        self.category = {
            'anyartisanstool': self.artisan, 'musical instrument': self.instruments, 'musicalinstrument': self.instruments,
            'gaming set': self.gaming, 'gamingset': self.gaming, 'anygamingset': self.gaming,
            'anymusicalinstrument': self.instruments, "artisan's tools": self.artisan, "artisans' tools": self.artisan,
        }

    def tool(self, key: str) -> str:
        return self.tools.get(L.norm(key), title_key(key))

    def language(self, key: str) -> str | None:
        if key.lower() == 'other':
            return None
        return self.languages.get(L.norm(key), title_key(key))

    def item(self, key: str) -> str | None:
        """The equipment.json name for a 5etools item, including `Traveler's clothes` -> `Clothes, Traveler's`."""
        name = key.strip()
        if inorm(name).startswith('set of '):
            name = name.split(' ', 2)[-1]
        n = inorm(name)
        if n in self.equipment:
            return self.equipment[n]
        words = n.split()
        if len(words) >= 2:
            swapped = words[-1] + ' ' + ' '.join(words[:-1])
            if swapped in self.equipment:
                return self.equipment[swapped]
        if n == 'costume clothes':
            return self.equipment.get('costume')
        return None


class FeatIndex:
    def __init__(self) -> None:
        feats = json.loads((L.DATA / 'feats.json').read_text())
        self.by_key = {(L.norm(f['name']), f['source'].upper()): f for f in feats}
        self.by_name: dict[str, list[dict]] = {}
        for f in feats:
            self.by_name.setdefault(L.norm(f['name']), []).append(f)

    def slug(self, ref: str, edition: str) -> str | None:
        name, _, source = ref.partition('|')
        source = (source or 'PHB').upper()
        if ';' in name:
            base, version = (p.strip() for p in name.split(';', 1))
            display = f'{title_key(base)} ({title_key(version)})'
        else:
            display = title_key(name)
        feat = self.by_key.get((L.norm(display), source))
        if feat is None:
            same = [f for f in self.by_name.get(L.norm(display), []) if f['edition'] == edition]
            feat = same[0] if len(same) == 1 else None
        return feat['slug'] if feat and feat['edition'] == edition else None

    def category(self, code: str, edition: str) -> list[str]:
        cat = FEAT_CATEGORY.get(code, code)
        return [f['slug'] for f in json.loads((L.DATA / 'feats.json').read_text())
                if f.get('category') == cat and f['edition'] == edition]


# The index is built once; category() re-reads the file, so cache the records.
def load_feats() -> list[dict]:
    return json.loads((L.DATA / 'feats.json').read_text())


# ---------------------------------------------------------------------------------------------
# Proficiencies
# ---------------------------------------------------------------------------------------------

def skills_of(blocks: list[dict], flags: list[str], name: str) -> tuple[list[str], dict | None]:
    fixed: list[str] = []
    choice = None
    for block in blocks:
        for key, val in block.items():
            if key == 'choose':
                count = val.get('count', 1)
                options = []
                for skill in val.get('from', []):
                    label = SKILL.get(skill.lower())
                    if label:
                        options.append(label)
                    else:
                        flags.append(f'{name}: unknown skill {skill!r}')
                choice = {'count': count, **({'from': options} if options else {})}
            elif key == 'any' and isinstance(val, int):
                choice = {'count': val}
            elif val is True:
                label = SKILL.get(key.lower())
                if label:
                    fixed.append(label)
                else:
                    flags.append(f'{name}: unknown skill {key!r}')
    return fixed, choice


def tools_of(blocks: list[dict], names: Names, flags: list[str], who: str) -> tuple[list[str], list[dict]]:
    """One block grants its tools. Several blocks are alternatives (House Agent's house table)."""
    if len(blocks) > 1:
        return [], []  # handled as packages

    def choice_from(tokens: list[str], count: int) -> dict:
        expands = [names.category.get(L.norm(t).replace(' ', '')) or names.category.get(t.lower()) for t in tokens]
        if count > 1 and any(item is not None for item in expands):
            flags.append(f'{who}: choose {count} of {", ".join(tokens)} (the pick is the category, not one item)')
            return {'count': count, 'from': [names.tool(t) if names.category.get(t.lower()) is None
                                              and names.category.get(L.norm(t).replace(" ", "")) is None else title_key(t)
                                              for t in tokens]}
        options: list[str] = []
        for token, expanded in zip(tokens, expands):
            options.extend(expanded if expanded is not None else [names.tool(token)])
        return {'count': count, 'from': list(dict.fromkeys(options))}

    fixed: list[str] = []
    choices: list[dict] = []
    for block in blocks:
        for key, val in block.items():
            if key == 'choose':
                choices.append(choice_from(val.get('from', []), val.get('count', 1)))
            elif key.lower().startswith('any') and isinstance(val, int):
                options = names.category.get(key.lower())
                if options is None:
                    flags.append(f'{who}: unknown tool category {key!r}')
                else:
                    choices.append({'count': val, 'from': options})
            elif val is True:
                fixed.append(names.tool(key))
    return fixed, choices


def block_needles(block: dict) -> set[str]:
    needles = set()
    for key, val in block.items():
        if val is True:
            needles.add(inorm(key))
        elif key.lower() == 'anygamingset':
            needles.add('gaming set')
        elif key.lower() == 'anymusicalinstrument':
            needles.add('musical instrument')
        elif key.lower().startswith('vehicles'):
            needles.add(inorm(key))
    return needles


def row_covers(text: str, needle: str) -> bool:
    hay = inorm(L.strip_tags(text)).replace('sea', 'water')
    if needle in hay:
        return True
    # "vehicles (sea and air)" names the water and air vehicles in one phrase
    return needle.startswith('vehicles ') and needle.split()[-1] in hay


def packages_of(blocks: list[dict], rows: list[tuple[str, str]], names: Names, flags: list[str], who: str) -> list[dict]:
    """Several tool blocks are alternatives. Match each table row (Orien repeats Deneith) to its block."""
    built = []
    for block in blocks:
        fixed, choices = tools_of([block], names, flags, who)
        built.append((block_needles(block), {'tools': fixed, **({'choices': choices} if choices else {})}))
    if not rows:
        return [{'label': f'Option {i + 1}', **pkg} for i, (_needles, pkg) in enumerate(built)]
    packages = []
    for label, text in rows:
        matches = [(needles, pkg) for needles, pkg in built if needles and all(row_covers(text, n) for n in needles)]
        if not matches:
            flags.append(f'{who}: no tool package matches {label}')
            continue
        _needles, pkg = max(matches, key=lambda m: len(m[0]))
        packages.append({'label': label, **pkg})
    return packages


def languages_of(blocks: list[dict], names: Names, flags: list[str], who: str) -> tuple[list[str], dict | None]:
    granted: list[str] = []
    choice = None
    for block in blocks:
        standard = block.get('anyStandard') or block.get('any')
        if isinstance(standard, int):
            granted.append('Two of your choice' if standard == 2 else 'One of your choice' if standard == 1
                           else f'{standard} of your choice')
            if isinstance(standard, int) and standard > 2:
                flags.append(f'{who}: {standard} language choices (the language step asks for them)')
        picked = block.get('choose')
        if isinstance(picked, dict):
            options = [names.language(k) for k in picked.get('from', [])]
            if any(k.lower() == 'other' for k in picked.get('from', [])):
                choice = {'count': picked.get('count', 1)}
                flags.append(f'{who}: a language list includes "other", so the choice is any language')
            else:
                choice = {'count': picked.get('count', 1), 'from': [o for o in options if o]}
        for key, val in block.items():
            if key in ('anyStandard', 'any', 'choose') or val is not True:
                continue
            label = names.language(key)
            if label:
                granted.append(label)
            else:
                flags.append(f'{who}: unknown language {key!r}')
    return granted, choice


def abilities_of(raw: list[dict] | None, flags: list[str], who: str) -> dict | None:
    if not raw:
        return None
    lists = []
    for alt in raw:
        weighted = (alt.get('choose') or {}).get('weighted')
        if not weighted or weighted.get('weights') not in ([2, 1], [1, 1, 1]):
            flags.append(f'{who}: ability increase is not +2/+1 or +1/+1/+1 ({json.dumps(alt)})')
            return None
        lists.append(tuple(weighted['from']))
    if len(set(lists)) != 1:
        flags.append(f'{who}: the ability alternatives offer different scores')
    return {'choose': 2, 'from': [ABILITY[a] for a in lists[0]]}


def feats_of(raw: list[dict] | None, index: FeatIndex, feats: list[dict], edition: str,
             flags: list[str], who: str) -> list[str]:
    options: list[str] = []
    for obj in raw or []:
        if 'anyFromCategory' in obj:
            for code in obj['anyFromCategory'].get('category', []):
                cat = FEAT_CATEGORY.get(code)
                if cat is None:
                    flags.append(f'{who}: unknown feat category {code}')
                    continue
                options.extend(f['slug'] for f in feats if f.get('category') == cat and f['edition'] == edition)
        else:
            for ref, val in obj.items():
                if val is not True:
                    continue
                slug = index.slug(ref, edition)
                if slug:
                    options.append(slug)
                else:
                    flags.append(f'{who}: feat {ref!r} does not resolve to a {edition} feat')
    return list(dict.fromkeys(options))


# ---------------------------------------------------------------------------------------------
# Equipment and text
# ---------------------------------------------------------------------------------------------

def item_text(entry: object, names: Names) -> tuple[str | None, int]:
    """A starting-equipment entry as (display text, copper pieces). Display text is None for pure coins."""
    if isinstance(entry, str):
        ref = entry.split('|')[0]
        return names.item(ref) or title_key(ref), 0
    if not isinstance(entry, dict):
        return None, 0
    if set(entry) <= {'value'}:
        return None, int(entry['value'])
    if entry.get('equipmentType') and not entry.get('item'):
        label = EQUIPMENT_TYPE.get(entry['equipmentType'], title_key(entry['equipmentType']))
        display = (entry.get('displayName') or '').strip()
        text = label if not display or 'same as' in display.lower() else L.strip_tags(display)
        text = text[:1].upper() + text[1:]
        return text, int(entry.get('containsValue') or 0)
    ref = (entry.get('item') or '').split('|')[0]
    matched = names.item(ref) if ref else None
    if entry.get('displayName'):
        text = L.strip_tags(entry['displayName'].strip())
        text = text[:1].upper() + text[1:]
    elif entry.get('special'):
        text = L.strip_tags(entry['special'].strip())
        text = text[:1].upper() + text[1:]
    elif matched:
        text = matched
    elif entry.get('equipmentType'):
        text = title_key(entry['equipmentType'].replace('set', ''))
    else:
        text = title_key(ref) if ref else None
    qty = entry.get('quantity')
    if text and isinstance(qty, int) and qty > 1 and not re.search(r'\d', text):
        text = f'{text} ({qty})'
    coins = int(entry.get('containsValue') or 0) + int(entry.get('worthValue') or 0)
    return text, coins


def package(entries: list, names: Names) -> tuple[list[str], int]:
    items: list[str] = []
    coins = 0
    for entry in entries:
        text, copper = item_text(entry, names)
        if text:
            items.append(text)
        coins += copper
    gold = coins // 100
    if items and gold:
        items.append(f'{gold} gp')
    return items, gold


def equipment_of(raw: list[dict] | None, names: Names) -> tuple[list[str], list[dict]]:
    """The gear the background gives, plus A/B (or extra) options. `equipment` is the default package."""
    gear: list[str] = []
    options: list[dict] = []
    for block in raw or []:
        keys = [k for k in block if k != '_']
        if '_' in block and not keys:
            items, _gold = package(block['_'], names)
            gear = items
            continue
        built = []
        for key in block:
            if key == '_':
                continue
            items, gold = package(block[key], names)
            option: dict = {'label': key.upper()}
            if items:
                option['items'] = items
            elif gold:
                option['gold'] = gold
            built.append(option)
        options.extend(built)
        if not gear:
            first = next((o for o in built if o.get('items')), None)
            gear = list(first['items']) if first else []
    # A package plus a small either/or (prayer book or prayer wheel) keeps the first alternative
    # in the default gear. The 2024 A-or-50gp choice is not one of these: its other option is gold.
    if gear and options and not any(o.get('gold') and not o.get('items') for o in options):
        for item in next((o.get('items') or [] for o in options if o.get('items')), []):
            if item not in gear:
                gear.append(item)
    return gear, options


def tables_in(entry: object) -> list[dict]:
    found: list[dict] = []

    def walk(node: object) -> None:
        if isinstance(node, dict):
            if node.get('type') == 'table':
                found.append(node)
            for value in node.values():
                walk(value)
        elif isinstance(node, list):
            for value in node:
                walk(value)

    walk(entry)
    return found


def traits_of(entries: list) -> dict[str, list[str]]:
    traits: dict[str, list[str]] = {'personalityTraits': [], 'ideals': [], 'bonds': [], 'flaws': []}
    for entry in entries or []:
        if not isinstance(entry, dict) or 'suggested characteristics' not in (entry.get('name') or '').lower():
            continue
        for table in tables_in(entry):
            labels = ' '.join(table.get('colLabels') or []).lower()
            key = next((dest for needle, dest in TRAIT_COLUMN if needle in labels), None)
            if key is None:
                continue
            for row in table.get('rows', []):
                cells = row.get('row', []) if isinstance(row, dict) else row
                text = ' '.join(L.strip_tags(str(c)) for c in cells
                                if not re.fullmatch(r'\d+', str(c).strip())).strip()
                if text:
                    traits[key].append(text)
    return traits


def house_rows(entries: list) -> list[tuple[str, str]]:
    """(house, proficiency text) from the House Tool Proficiencies table."""
    for table in tables_in(entries):
        labels = [c.lower() for c in table.get('colLabels') or []]
        if labels and 'house' in labels[0]:
            rows = []
            for row in table.get('rows', []):
                cells = row.get('row', []) if isinstance(row, dict) else row
                text = cells[1] if len(cells) > 1 else ''
                rows.append((L.strip_tags(str(cells[0])), text if isinstance(text, str) else L.entry_text(text)))
            return rows
    return []


def feature_of(entries: list) -> tuple[str | None, str]:
    for entry in entries or []:
        if isinstance(entry, dict) and (entry.get('name') or '').lower().startswith('feature:'):
            return entry['name'].split(':', 1)[1].strip(), L.entry_text(entry.get('entries'))
    return None, ''


def first_paragraph(text: str) -> str:
    for line in text.split('\n'):
        line = line.strip()
        if line and not re.fullmatch(r'\d+', line) and not line.lower().startswith('d8 |'):
            return line
    return ''


# ---------------------------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------------------------

def mirror_backgrounds() -> list[tuple[dict, tuple[str, str] | None]]:
    sources = inventory_sources()
    raw = L.fetch('backgrounds.json')['background']
    lookup = L.make_lookup(raw)
    out = []
    for bg in raw:
        if bg['source'].upper() not in sources:
            continue
        parent = None
        if '_copy' in bg:
            parent = (bg['_copy'].get('name', ''), bg['_copy'].get('source', ''))
            bg = L.resolve_copy(bg, lookup)
        out.append((bg, parent))
    return out


def build(flags: list[str]) -> list[dict]:
    names = Names()
    index = FeatIndex()
    feats = load_feats()
    fluff = {(f['name'].lower(), f['source'].lower()): f for f in L.fetch('fluff-backgrounds.json')['backgroundFluff']}
    records = []
    for bg, parent in mirror_backgrounds():
        edition = L.edition_of(bg['source'])
        who = f"{bg['name']} ({bg['source']})"
        if bg.get('additionalSpells'):
            flags.append(f'{who}: grants spells (additionalSpells); not applied until the spells lane')
        if bg.get('skillToolLanguageProficiencies'):
            flags.append(f'{who}: its language-or-tool swap is text; it grants the skills and languages below')

        fixed_skills, skill_choice = skills_of(bg.get('skillProficiencies') or [], flags, who)
        tool_blocks = bg.get('toolProficiencies') or []
        if len(tool_blocks) > 1:
            packages = packages_of(tool_blocks, house_rows(bg.get('entries')), names, flags, who)
            fixed_tools, tool_choices = [], []
        else:
            packages = []
            fixed_tools, tool_choices = tools_of(tool_blocks, names, flags, who)
        granted_languages, language_choice = languages_of(bg.get('languageProficiencies') or [], names, flags, who)
        gear, options = equipment_of(bg.get('startingEquipment'), names)
        feat_options = feats_of(bg.get('feats'), index, feats, edition, flags, who)
        feature_name, feature_text = feature_of(bg.get('entries'))
        traits = traits_of(bg.get('entries'))

        fluff_entry = fluff.get((bg['name'].lower(), bg['source'].lower()))
        if fluff_entry is None and parent:
            fluff_entry = fluff.get((parent[0].lower(), parent[1].lower()))
        full = L.entry_text(fluff_entry.get('entries')) if fluff_entry else ''
        description = first_paragraph(full) or first_paragraph(feature_text)
        if not description:
            flags.append(f'{who}: no description text')
            description = bg['name']

        for item in gear:
            if GP.match(item) or inorm(item) in CATEGORY_GEAR:
                continue
            bare = re.sub(r'\s*\([^)]*\)$', '', item)
            if names.item(bare) is None and names.item(item) is None:
                flags.append(f'equipment text: {item}')

        rec: dict = {
            'slug': L.slugify(bg['name']) + ('-2024' if edition == '2024' else ''),
            'name': bg['name'],
            'source': bg['source'],
            'edition': edition,
            'description': description,
            'skill_proficiencies': fixed_skills,
            'equipment': gear,
            'personality_traits': [],
            'ideals': [],
            'bonds': [],
            'flaws': [],
        }
        if skill_choice:
            rec['skillChoices'] = skill_choice
        if granted_languages:
            rec['languages'] = granted_languages
        if language_choice:
            rec['languageChoices'] = language_choice
        if fixed_tools:
            rec['tool_proficiencies'] = fixed_tools
        if tool_choices:
            rec['toolChoices'] = tool_choices
        if packages:
            rec['toolPackages'] = packages
        if options:
            rec['equipmentOptions'] = options
        if feature_name:
            rec['feature'] = feature_name
        if feature_text:
            rec['feature_description'] = feature_text
        abilities = abilities_of(bg.get('ability'), flags, who)
        if abilities:
            rec['abilityScores'] = abilities
        if len(feat_options) == 1:
            rec['originFeat'] = feat_options[0]
        elif len(feat_options) > 1:
            rec['originFeatOptions'] = feat_options
        prereq = bg.get('prerequisite') or []
        campaigns = [c for p in prereq for c in (p.get('campaign') or [])]
        if campaigns:
            rec['note'] = 'Campaign: ' + ', '.join(campaigns)
        extras = [s.get('source') for s in bg.get('additionalSources') or [] if s.get('source')]
        if extras:
            rec['sources'] = [bg['source'], *extras]
        rec['_flavor'] = {
            'slug': rec['slug'],
            'description': full or description,
            **traits,
        }
        records.append(rec)
    return dedupe(records, flags)


def dedupe(records: list[dict], flags: list[str]) -> list[dict]:
    dates = published()
    kept: dict[tuple[str, str], dict] = {}
    for rec in records:
        key = (L.norm(rec['name']), rec['edition'])
        prev = kept.get(key)
        if prev is None:
            kept[key] = rec
            continue
        newer = dates.get(rec['source'].upper(), '') > dates.get(prev['source'].upper(), '')
        winner, loser = (rec, prev) if newer else (prev, rec)
        winner.setdefault('sources', [winner['source']])
        if loser['source'] not in winner['sources']:
            winner['sources'].append(loser['source'])
        kept[key] = winner
        flags.append(f"{loser['name']}: reprint {loser['source']} dropped in favor of {winner['source']}")
    return list(kept.values())


def report(records: list[dict], current: list[dict]) -> list[str]:
    lines = []
    by_key = {(L.norm(r['name']), r['edition']): r for r in records}
    for old in current:
        key = (L.norm(old['name']), old.get('edition', '2014'))
        new = by_key.get(key)
        if new is None:
            lines.append(f"- dropped `{old['slug']}` ({old['name']}, {old.get('edition')}): not in the mirror under this name")
            continue
        notes = []
        if old['slug'] != new['slug']:
            notes.append(f"slug {old['slug']} -> {new['slug']}")
        if sorted(old.get('skill_proficiencies') or []) != sorted(new['skill_proficiencies']):
            notes.append(f"skills {old.get('skill_proficiencies')} -> {new['skill_proficiencies']}")
        if (old.get('originFeat') or None) != new.get('originFeat'):
            notes.append(f"originFeat {old.get('originFeat')} -> {new.get('originFeat')}")
        old_from = (old.get('abilityScores') or {}).get('from')
        new_from = (new.get('abilityScores') or {}).get('from')
        if sorted(old_from or []) != sorted(new_from or []):
            notes.append(f"abilities {old_from} -> {new_from}")
        if L.norm(old.get('description', '')) != L.norm(new['description']):
            notes.append('description replaced with the book text')
        if notes:
            lines.append(f"- `{old['slug']}`: " + '; '.join(notes))
    return lines


def main() -> None:
    apply = '--apply' in sys.argv
    flags: list[str] = []
    records = build(flags)
    current = json.loads(OUT.read_text())
    changes = report(records, current)
    slugs = [r['slug'] for r in records]
    dupes = [s for s, c in Counter(slugs).items() if c > 1]
    assert not dupes, dupes

    counts = Counter(r['edition'] for r in records)
    print(f'{len(records)} backgrounds ({counts["2014"]} for 2014, {counts["2024"]} for 2024)')
    print(f'  with a skill choice: {sum(1 for r in records if r.get("skillChoices"))}')
    print(f'  with a tool choice: {sum(1 for r in records if r.get("toolChoices") or r.get("toolPackages"))}')
    print(f'  with an origin feat: {sum(1 for r in records if r.get("originFeat") or r.get("originFeatOptions"))}')
    print('\nChanges to existing backgrounds:')
    print('\n'.join(changes) or '  none')
    equipment = sorted({f.split(': ', 1)[1] for f in flags if f.startswith('equipment text: ')})
    other = sorted({f for f in flags if not f.startswith('equipment text: ')})
    print(f'\nFlags ({len(other)}), plus {len(equipment)} equipment lines kept as text:')
    print('\n'.join(f'  {f}' for f in other))
    print('\n'.join(f'  gear: {f}' for f in equipment))
    if apply:
        chunks: dict[str, list] = {}
        for rec in records:
            chunks.setdefault(rec['source'], []).append(rec.pop('_flavor'))
        final = sorted(records, key=lambda r: (r['name'].lower(), r['edition']))
        L.write_json(OUT, final)
        written = L.write_chunks('backgrounds', chunks)
        print(f'\nwrote {OUT.relative_to(L.ROOT)} and {len(written)} flavor chunks')


if __name__ == '__main__':
    main()
