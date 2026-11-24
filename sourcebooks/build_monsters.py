#!/usr/bin/env python3
"""Monster lane. Report by default; --apply writes the index and one chunk per book.

    python3 build_monsters.py
    python3 build_monsters.py --apply

Reads bestiary/*.json for the inventory books. `_copy` is resolved, including
the bestiary `addSpells` mod, and `_versions` become their own creatures.
Within an edition the newest printing wins. Full stat blocks go to
src/data/content/monsters/<SOURCE>.json. src/data/monsterIndex.json is the
name list the gap report and the loader use. Neither file is imported by the
app entry.
"""
from __future__ import annotations

import json
import re
import sys
from collections import Counter

import lanelib as L

INVENTORY = json.loads((L.ROOT / 'sourcebooks' / 'content_inventory.json').read_text())
BOOKS = {code.upper() for code in INVENTORY['source_books']}
INDEX = L.DATA / 'monsterIndex.json'
SRD = L.DATA / 'srd' / '2014' / '5e-SRD-Monsters.json'

SIZES = {'T': 'Tiny', 'S': 'Small', 'M': 'Medium', 'L': 'Large', 'H': 'Huge', 'G': 'Gargantuan'}
TYPES = {
    'aberration', 'beast', 'celestial', 'construct', 'dragon', 'elemental', 'fey', 'fiend',
    'giant', 'humanoid', 'monstrosity', 'ooze', 'plant', 'undead',
}
ALIGN = {
    'L': 'lawful', 'N': 'neutral', 'C': 'chaotic', 'G': 'good', 'E': 'evil',
    'U': 'unaligned', 'A': 'any alignment',
}
SAVES = {'str': 'STR', 'dex': 'DEX', 'con': 'CON', 'int': 'INT', 'wis': 'WIS', 'cha': 'CHA'}
SKILLS = {
    'acrobatics': 'Acrobatics', 'animal handling': 'Animal Handling', 'arcana': 'Arcana',
    'athletics': 'Athletics', 'deception': 'Deception', 'history': 'History',
    'insight': 'Insight', 'intimidation': 'Intimidation', 'investigation': 'Investigation',
    'medicine': 'Medicine', 'nature': 'Nature', 'perception': 'Perception',
    'performance': 'Performance', 'persuasion': 'Persuasion', 'religion': 'Religion',
    'sleight of hand': 'Sleight of Hand', 'stealth': 'Stealth', 'survival': 'Survival',
}
SPEEDS = ('walk', 'fly', 'swim', 'climb', 'burrow')
SENSES = ('darkvision', 'blindsight', 'tremorsense', 'truesight')
# CR string -> (number, xp, proficiency bonus). The 5e experience table.
CR_TABLE = {
    '0': (0, 10, 2), '1/8': (0.125, 25, 2), '1/4': (0.25, 50, 2), '1/2': (0.5, 100, 2),
    '1': (1, 200, 2), '2': (2, 450, 2), '3': (3, 700, 2), '4': (4, 1100, 2),
    '5': (5, 1800, 3), '6': (6, 2300, 3), '7': (7, 2900, 3), '8': (8, 3900, 3),
    '9': (9, 5000, 4), '10': (10, 5900, 4), '11': (11, 7200, 4), '12': (12, 8400, 4),
    '13': (13, 10000, 5), '14': (14, 11500, 5), '15': (15, 13000, 5), '16': (16, 15000, 5),
    '17': (17, 18000, 6), '18': (18, 20000, 6), '19': (19, 22000, 6), '20': (20, 25000, 6),
    '21': (21, 33000, 7), '22': (22, 41000, 7), '23': (23, 50000, 7), '24': (24, 62000, 7),
    '25': (25, 75000, 8), '26': (26, 90000, 8), '27': (27, 105000, 8), '28': (28, 120000, 8),
    '29': (29, 135000, 9), '30': (30, 155000, 9),
}
HIT_RE = re.compile(r'\{@hit\s+([+-]?\d+)')
SPELL_LISTS = ('will', 'constant', 'ritual')
SPELL_FREQ = {'daily': 'day', 'rest': 'rest', 'weekly': 'week', 'yearly': 'year'}


def published_dates() -> dict[str, str]:
    found: dict[str, str] = {}
    for rel, key in (('books.json', 'book'), ('adventures.json', 'adventure')):
        for book in L.fetch(rel).get(key, []):
            found.setdefault(book['id'].upper(), book.get('published', ''))
    return found


def add_spells(obj: dict, _prop: str, mod: dict) -> None:
    """Merge an addSpells mod into the creature's first spellcasting block."""
    casting = obj.get('spellcasting')
    if isinstance(casting, dict):
        casting = [casting]
        obj['spellcasting'] = casting
    if not isinstance(casting, list) or not casting or not isinstance(casting[0], dict):
        casting = [{}]
        obj['spellcasting'] = casting
    block = casting[0]
    for key, value in mod.items():
        if key == 'mode':
            continue
        block[key] = _merge(block.get(key), value)


def _merge(old, new):
    if old is None:
        return json.loads(json.dumps(new))
    if isinstance(new, list) and isinstance(old, list):
        return old + new
    if isinstance(new, dict) and isinstance(old, dict):
        out = dict(old)
        for key, value in new.items():
            out[key] = _merge(out.get(key), value)
        return out
    return json.loads(json.dumps(new))


def legendary_groups() -> dict[tuple[str, str], dict]:
    data = L.fetch('bestiary/legendarygroups.json')
    return {
        (group['name'].lower(), (group.get('source') or '').lower()): group
        for group in data.get('legendaryGroup', [])
        if group.get('name')
    }


def all_monsters() -> list[dict]:
    found = []
    for data in L.fetch_dir('bestiary').values():
        found.extend(data.get('monster', []))
    return found


def srd_slugs() -> dict[str, str]:
    """Normalized name -> the slug the 2014 SRD file already uses."""
    return {L.norm(row['name']): row['index'] for row in json.loads(SRD.read_text())}


def cr_of(raw, notes: list[str]) -> tuple[float, int, int]:
    xp_override = None
    if isinstance(raw, dict):
        if raw.get('lair') is not None:
            notes.append(f"Lair challenge {raw['lair']}.")
        if raw.get('coven') is not None:
            notes.append(f"Coven challenge {raw['coven']}.")
        xp_override = raw.get('xp')
        raw = raw.get('cr')
    if raw is None:
        return 0, 0, 2
    key = str(raw).strip()
    if key in CR_TABLE:
        number, xp, bonus = CR_TABLE[key]
        return number, int(xp_override) if isinstance(xp_override, int) else xp, bonus
    try:
        number = float(key)
    except ValueError:
        return 0, 10, 2
    bonus = 2 + int(number >= 5) + int(number >= 9) + int(number >= 13) + int(number >= 17) + int(number >= 21) + int(number >= 25) + int(number >= 29)
    return number, int(xp_override) if isinstance(xp_override, int) else 0, bonus


def size_of(raw, notes: list[str]) -> str:
    codes = raw if isinstance(raw, list) else [raw]
    names = [SIZES.get(str(code), '') for code in codes if code]
    names = [name for name in names if name]
    if len(names) > 1:
        notes.append('Size: ' + ' or '.join(names) + '.')
    return names[0] if names else 'Medium'


def type_of(raw, notes: list[str]) -> tuple[str, str | None]:
    subtype = None
    if isinstance(raw, dict):
        if raw.get('choose'):
            chosen = [str(item) for item in raw['choose']]
            notes.append('Type is one of: ' + ', '.join(chosen) + '.')
            kind = chosen[0] if chosen else 'monstrosity'
        else:
            kind = str(raw.get('type') or 'monstrosity')
        tags = [str(tag) for tag in raw.get('tags') or [] if isinstance(tag, str)]
        if raw.get('swarmSize'):
            swarm = SIZES.get(str(raw['swarmSize']), str(raw['swarmSize']))
            tags.insert(0, f'swarm of {swarm} creatures')
        if tags:
            subtype = ', '.join(tags)
    else:
        kind = str(raw or 'monstrosity')
    if kind not in TYPES:
        notes.append(f'Type: {kind}.')
        kind = 'monstrosity'
    return kind, subtype


def alignment_of(raw) -> str:
    if not raw:
        return 'unaligned'
    if isinstance(raw, str):
        return L.strip_tags(raw)
    parts = []
    for item in raw:
        if isinstance(item, str):
            parts.append(ALIGN.get(item, item.replace('_', ' ')))
        elif isinstance(item, dict):
            if item.get('special'):
                parts.append(L.strip_tags(str(item['special'])))
            elif item.get('alignment'):
                text = alignment_of(item['alignment'])
                if item.get('chance') is not None:
                    text = f'{text} ({item["chance"]}%)'
                parts.append(text)
    if not parts:
        return 'unaligned'
    if set(parts) <= {'lawful', 'neutral', 'chaotic', 'good', 'evil'}:
        return ' '.join(parts)
    return ' or '.join(parts) if len(parts) > 1 and any(' ' in part or part in ('unaligned', 'any alignment') for part in parts) else ' '.join(parts)


def ac_of(raw) -> list[dict]:
    entries = []
    for item in raw or []:
        if isinstance(item, (int, float)):
            entries.append({'type': 'dex', 'value': int(item)})
            continue
        if not isinstance(item, dict):
            continue
        if 'special' in item:
            entries.append({'type': 'condition', 'value': 0, 'desc': L.strip_tags(str(item['special']))})
            continue
        if not isinstance(item.get('ac'), (int, float)):
            continue
        names = [L.strip_tags(str(name)) for name in item.get('from') or []]
        if item.get('condition'):
            names.append(L.strip_tags(str(item['condition'])))
        entry: dict = {
            'type': 'natural' if any('natural' in name.lower() for name in names) else ('armor' if names else 'dex'),
            'value': int(item['ac']),
        }
        if names:
            entry['armor'] = [{'name': name, 'url': ''} for name in names]
        entries.append(entry)
    return entries or [{'type': 'dex', 'value': 10}]


def hp_of(raw) -> tuple[int, str, str]:
    if not isinstance(raw, dict):
        return 0, '', ''
    if raw.get('special'):
        text = L.strip_tags(str(raw['special']))
        return 0, '', text
    formula = str(raw.get('formula') or '')
    dice = formula.split('+')[0].strip() if formula else ''
    average = raw.get('average')
    return int(average) if isinstance(average, (int, float)) else 0, dice, formula


def speed_of(raw) -> dict:
    if not isinstance(raw, dict):
        return {'walk': '0 ft.'}
    out: dict = {}
    hover = bool(raw.get('canHover'))
    for key in SPEEDS:
        value = raw.get(key)
        if isinstance(value, dict):
            number = value.get('number', value.get('walk'))
            if 'hover' in str(value.get('condition') or '').lower():
                hover = True
            if isinstance(number, (int, float)):
                out[key] = f'{int(number)} ft.'
        elif isinstance(value, (int, float)):
            out[key] = f'{int(value)} ft.'
        elif isinstance(value, bool) and value:
            continue
        elif isinstance(value, str) and value:
            out[key] = value if 'ft' in value else f'{value} ft.'
    if hover:
        out['hover'] = True
    if not any(key in out for key in SPEEDS):
        out['walk'] = '0 ft.'
    return out


def bonus(value) -> int | None:
    if value is None:
        return None
    text = str(value).strip()
    if text[:1] in '+-':
        try:
            return int(text)
        except ValueError:
            return None
    try:
        return int(text)
    except ValueError:
        return None


def proficiencies(raw: dict) -> list[dict]:
    found = []
    for key, value in (raw.get('save') or {}).items():
        number = bonus(value)
        if number is None or key not in SAVES:
            continue
        ability = SAVES[key]
        found.append({
            'value': number,
            'proficiency': {
                'index': f'saving-throw-{ability.lower()}',
                'name': f'Saving Throw: {ability}',
                'url': '',
            },
        })
    for key, value in (raw.get('skill') or {}).items():
        number = bonus(value)
        if number is None:
            continue
        name = SKILLS.get(key, SKILLS.get(key.replace('_', ' '), key.replace('_', ' ').title()))
        found.append({
            'value': number,
            'proficiency': {'index': f'skill-{L.slugify(name)}', 'name': f'Skill: {name}', 'url': ''},
        })
    return found


def damage_list(raw, key: str) -> list[str]:
    found = []
    for item in raw or []:
        if isinstance(item, str):
            found.append(L.strip_tags(item))
        elif isinstance(item, dict):
            if item.get('special'):
                found.append(L.strip_tags(str(item['special'])))
                continue
            names = [L.strip_tags(str(part)) for part in item.get(key) or []]
            text = ', '.join(names)
            pre = item.get('preNote')
            note = item.get('note')
            if pre:
                text = f'{L.strip_tags(str(pre))} {text}'.strip()
            if note:
                text = f'{text} {L.strip_tags(str(note))}'.strip()
            if text:
                found.append(text)
    return found


def conditions_of(raw) -> list[dict]:
    found = []
    for item in raw or []:
        if isinstance(item, str):
            name = L.strip_tags(item)
        elif isinstance(item, dict):
            names = [L.strip_tags(str(part)) for part in item.get('conditionImmune') or []]
            name = ', '.join(names)
            if item.get('note'):
                name = f'{name} {L.strip_tags(str(item["note"]))}'.strip()
        else:
            continue
        if name:
            found.append({'index': L.slugify(name), 'name': name, 'url': ''})
    return found


def senses_of(raw, passive) -> dict:
    found: dict = {}
    for item in raw or []:
        text = L.strip_tags(str(item))
        head, _, rest = text.partition(' ')
        key = head.lower()
        if key in SENSES:
            found[key] = rest or text
        elif text:
            found[L.slugify(head) or 'sense'] = rest or text
    if passive is not None:
        found['passive_perception'] = passive
    return found


def languages_of(raw) -> str:
    if isinstance(raw, list):
        return ', '.join(L.strip_tags(str(item)) for item in raw if item)
    if isinstance(raw, str):
        return L.strip_tags(raw)
    return ''


def attack_bonus(entry: dict) -> int | None:
    match = HIT_RE.search(json.dumps(entry.get('entries') or entry))
    return int(match.group(1)) if match else None


def spell_lines(block: dict) -> str:
    parts = []
    if block.get('headerEntries'):
        parts.append(L.entry_text({'entries': block['headerEntries']}))
    for key in SPELL_LISTS:
        spells = block.get(key)
        if isinstance(spells, list) and spells:
            label = 'At will' if key == 'will' else key.title()
            parts.append(f"{label}: {', '.join(L.strip_tags(str(spell)) for spell in spells)}")
    for key, unit in SPELL_FREQ.items():
        freqs = block.get(key)
        if not isinstance(freqs, dict):
            continue
        for freq, spells in freqs.items():
            count = str(freq)
            each = count.endswith('e')
            count = count[:-1] if each else count
            label = f'{count}/{unit}' + (' each' if each else '')
            names = spells if isinstance(spells, list) else [spells]
            parts.append(f"{label}: {', '.join(L.strip_tags(str(spell)) for spell in names)}")
    levels = block.get('spells')
    if isinstance(levels, dict):
        for level, info in levels.items():
            spells = info.get('spells') if isinstance(info, dict) else info
            slots = info.get('slots') if isinstance(info, dict) else None
            label = 'Cantrips' if str(level) in ('0', 'cantrip') else f'Level {level}'
            if slots:
                label += f' ({slots} slots)'
            names = spells if isinstance(spells, list) else []
            if names:
                parts.append(f"{label}: {', '.join(L.strip_tags(str(spell)) for spell in names)}")
    if block.get('footerEntries'):
        parts.append(L.entry_text({'entries': block['footerEntries']}))
    return '\n'.join(part for part in parts if part)


def feature(entry, fallback: str) -> dict | None:
    if isinstance(entry, str):
        text = L.strip_tags(entry)
        return {'name': fallback, 'desc': text} if text else None
    if not isinstance(entry, dict):
        return None
    if entry.get('type') == 'spellcasting' or any(key in entry for key in ('will', 'daily', 'spells')):
        text = spell_lines(entry)
    else:
        text = L.entry_text(entry)
    name = L.strip_tags(str(entry.get('name') or fallback))
    if not text and not name:
        return None
    record = {'name': name or fallback, 'desc': text}
    hit = attack_bonus(entry)
    if hit is not None:
        record['attack_bonus'] = hit
    return record


def features(raw, fallback: str) -> list[dict]:
    return [item for item in (feature(entry, fallback) for entry in raw or []) if item]


def lair_features(monster: dict, groups: dict[tuple[str, str], dict]) -> list[dict]:
    ref = monster.get('legendaryGroup')
    if not isinstance(ref, dict) or not ref.get('name'):
        return []
    group = groups.get((ref['name'].lower(), (ref.get('source') or '').lower()))
    if not group:
        return []
    found = []
    for key, title in (('lairActions', 'Lair Actions'), ('regionalEffects', 'Regional Effects')):
        if group.get(key):
            text = L.entry_text({'entries': group[key]})
            if text:
                found.append({'name': title, 'desc': text})
    return found


def spellcasting_features(raw) -> tuple[list[dict], list[dict], list[dict]]:
    traits, actions, legendary = [], [], []
    for block in raw or []:
        if not isinstance(block, dict):
            continue
        made = feature(block, 'Spellcasting')
        if not made:
            continue
        where = block.get('displayAs')
        if where == 'action':
            actions.append(made)
        elif where == 'legendary':
            legendary.append(made)
        else:
            traits.append(made)
    return traits, actions, legendary


def build(raw: dict, dates: dict[str, str], groups: dict, flags: list[str]) -> dict | None:
    name = raw.get('name')
    source = (raw.get('source') or '').upper()
    if not name or source not in BOOKS:
        return None
    notes: list[str] = []
    if raw.get('cr') is None:
        flags.append(f'no cr: {name} ({source})')
    number, xp, proficiency = cr_of(raw.get('cr'), notes)
    kind, subtype = type_of(raw.get('type'), notes)
    record = {
        'name': name,
        'edition': L.edition_of(source, dates),
        'source': source,
        'sources': [source],
        '_date': dates.get(source, ''),
        'size': size_of(raw.get('size'), notes),
        'type': kind,
        'alignment': alignment_of(raw.get('alignment')),
        'armor_class': ac_of(raw.get('ac')),
        'speed': speed_of(raw.get('speed')),
        'strength': int(raw.get('str') or 10),
        'dexterity': int(raw.get('dex') or 10),
        'constitution': int(raw.get('con') or 10),
        'intelligence': int(raw.get('int') or 10),
        'wisdom': int(raw.get('wis') or 10),
        'charisma': int(raw.get('cha') or 10),
        'proficiencies': proficiencies(raw),
        'damage_vulnerabilities': damage_list(raw.get('vulnerable'), 'vulnerable'),
        'damage_resistances': damage_list(raw.get('resist'), 'resist'),
        'damage_immunities': damage_list(raw.get('immune'), 'immune'),
        'condition_immunities': conditions_of(raw.get('conditionImmune')),
        'senses': senses_of(raw.get('senses'), raw.get('passive')),
        'languages': languages_of(raw.get('languages')),
        'challenge_rating': number,
        'proficiency_bonus': proficiency,
        'xp': xp,
    }
    hit_points, hit_dice, hit_roll = hp_of(raw.get('hp'))
    record['hit_points'] = hit_points
    record['hit_dice'] = hit_dice
    record['hit_points_roll'] = hit_roll
    if subtype:
        record['subtype'] = subtype
    spells_trait, spells_action, spells_legendary = spellcasting_features(raw.get('spellcasting'))
    traits = features(raw.get('trait'), 'Trait') + spells_trait + lair_features(raw, groups)
    if isinstance(raw.get('variant'), list):
        traits.extend(features(raw['variant'], 'Variant'))
    actions = features(raw.get('action'), 'Action') + spells_action
    legendary = features(raw.get('legendary'), 'Legendary Action') + spells_legendary
    reactions = features(raw.get('reaction'), 'Reaction')
    if raw.get('legendaryHeader'):
        header = L.entry_text({'entries': raw['legendaryHeader']})
        if header:
            legendary.insert(0, {'name': 'Legendary Actions', 'desc': header})
    if traits:
        record['special_abilities'] = traits
    if actions:
        record['actions'] = actions
    if legendary:
        record['legendary_actions'] = legendary
    if reactions:
        record['reactions'] = reactions
    if notes:
        record['desc'] = notes
    return record


def slug_for(name: str, edition: str, taken: set[str], srd: dict[str, str]) -> str:
    base = L.slugify(name)
    owned = srd.get(L.norm(name))
    if edition == '2014':
        candidate = owned or base
    else:
        candidate = f'{base}-2024'
    # The SRD slug for this same name is reserved for it, not a collision.
    if candidate not in taken or candidate == owned:
        taken.add(candidate)
        return candidate
    n = 2
    while f'{candidate}-{n}' in taken:
        n += 1
    taken.add(f'{candidate}-{n}')
    return f'{candidate}-{n}'


def expand(monster: dict, lookup, groups, dates, flags) -> list[dict]:
    try:
        resolved = L.resolve_copy(monster, lookup, strict=False, handlers={'addSpells': add_spells})
        versions = L.expand_versions(resolved, strict=False, handlers={'addSpells': add_spells}) if '_versions' in resolved else []
    except L.ModError as exc:
        flags.append(str(exc))
        return []
    made = []
    for raw in [resolved, *versions]:
        record = build(raw, dates, groups, flags)
        if record:
            made.append(record)
    return made


def main() -> None:
    apply = '--apply' in sys.argv
    L.UNSUPPORTED_MODES.clear()
    dates = published_dates()
    groups = legendary_groups()
    monsters = all_monsters()
    lookup = L.make_lookup(monsters)
    flags: list[str] = []
    built = []
    for monster in monsters:
        if (monster.get('source') or '').upper() not in BOOKS:
            continue
        built.extend(expand(monster, lookup, groups, dates, flags))

    grouped: dict[tuple[str, str], list[dict]] = {}
    for record in built:
        grouped.setdefault((L.norm(record['name']), record['edition']), []).append(record)
    kept = []
    clashes = 0
    for group in grouped.values():
        group.sort(key=lambda record: (record['_date'], record['source'], len(record.get('actions') or [])))
        winner = group[-1]
        sources = []
        for record in sorted(group, key=lambda item: (item['_date'], item['source']), reverse=True):
            if record['source'] not in sources:
                sources.append(record['source'])
        if len(group) > 1 and any(item['challenge_rating'] != winner['challenge_rating'] for item in group):
            clashes += 1
            if clashes <= 6:
                print(f"  cr clash {winner['name']} ({winner['edition']}): " +
                      ', '.join(f"{item['source']} cr {item['challenge_rating']}" for item in group))
        winner['sources'] = sources
        winner['source'] = sources[0]
        kept.append(winner)

    srd = srd_slugs()
    taken = set(srd.values())
    kept.sort(key=lambda record: (record['edition'], record['name'].lower()))
    for record in kept:
        slug = slug_for(record['name'], record['edition'], taken, srd)
        record['index'] = slug
        record.pop('_date', None)

    by_source: dict[str, list] = {}
    index = []
    for record in kept:
        by_source.setdefault(record['source'], []).append(record)
        card = {
            'slug': record['index'],
            'name': record['name'],
            'edition': record['edition'],
            'source': record['source'],
            'sources': record['sources'],
            'challenge_rating': record['challenge_rating'],
            'xp': record['xp'],
            'proficiency_bonus': record['proficiency_bonus'],
            'type': record['type'],
            'size': record['size'],
            'hit_points': record['hit_points'],
            'armor_class': record['armor_class'][0]['value'] if record['armor_class'] else 10,
            'speed': record['speed'],
            'strength': record['strength'],
            'dexterity': record['dexterity'],
            'constitution': record['constitution'],
            'intelligence': record['intelligence'],
            'wisdom': record['wisdom'],
            'charisma': record['charisma'],
            'traits': [item['name'] for item in record.get('special_abilities') or []],
            'actions': [item['name'] for item in record.get('actions') or []],
            'reactions': [item['name'] for item in record.get('reactions') or []],
            'legendary': [item['name'] for item in record.get('legendary_actions') or []],
        }
        if record.get('subtype'):
            card['subtype'] = record['subtype']
        index.append(card)

    editions = Counter(record['edition'] for record in kept)
    print(f'{len(kept)} monsters ({editions["2014"]} from 2014, {editions["2024"]} from 2024) in {len(by_source)} books')
    print(f'reprint groups with a different challenge: {clashes}')
    print(f'unsupported mods: {sorted(L.UNSUPPORTED_MODES)}')
    unique_flags = sorted(set(flags))
    print(f'flags: {len(unique_flags)}')
    for flag in unique_flags[:25]:
        print(f'  {flag}')
    aboleth = next((record for record in kept if record['name'] == 'Aboleth' and record['edition'] == '2014'), None)
    if aboleth:
        print(f"Aboleth 2014 hp {aboleth['hit_points']} ac {aboleth['armor_class'][0]['value']} cr {aboleth['challenge_rating']} slug {aboleth['index']}")
    aboleth_2024 = next((record for record in kept if record['name'] == 'Aboleth' and record['edition'] == '2024'), None)
    if aboleth_2024:
        print(f"Aboleth 2024 source {aboleth_2024['source']} slug {aboleth_2024['index']} hp {aboleth_2024['hit_points']}")
    familiar = next((record for record in kept if record['name'] == 'Battle Familiar (Brute)'), None)
    print('Battle Familiar (Brute)', 'yes' if familiar else 'no')
    if apply:
        L.write_json(INDEX, index)
        written = L.write_chunks('monsters', by_source)
        print(f'wrote {INDEX.relative_to(L.ROOT)} and {len(written)} chunks')


if __name__ == '__main__':
    main()
