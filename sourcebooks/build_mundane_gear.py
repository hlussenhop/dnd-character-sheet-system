#!/usr/bin/env python3
"""Add the mundane rows the magic-item lane left out.

`build_magic_items.py` skips rarity `none`. Those rows (gems, art, vehicles,
poisons, ammunition, and the 2014 printing of gear the app already stores as
2024) are equipment. This script writes `src/data/mundaneGear.json` in the
app's Equipment shape. `equipment.json` is the 2024 PHB gear already loaded
with year 2024, so a 2024 name that matches it is left alone.

Report by default. `--apply` writes the file.

    python3 build_mundane_gear.py
    python3 build_mundane_gear.py --apply
"""
from __future__ import annotations

import json
import sys

import lanelib as L

INVENTORY = json.loads((L.ROOT / 'sourcebooks' / 'content_inventory.json').read_text())
BOOKS = {code.upper() for code in INVENTORY['source_books']}
GAP = L.ROOT / 'sourcebooks' / 'gap_report.json'
EQUIPMENT = L.DATA / 'equipment.json'
MAGIC = L.DATA / 'magicItems.json'
OUT = L.DATA / 'mundaneGear.json'

DAMAGE = {
    'B': 'Bludgeoning', 'N': 'Necrotic', 'P': 'Piercing', 'R': 'Radiant',
    'S': 'Slashing', 'Y': 'Psychic',
}
ARMOR = {'LA': 'Light', 'MA': 'Medium', 'HA': 'Heavy', 'S': 'Shield'}
CATEGORY = {
    'M': 'Weapon', 'R': 'Weapon', 'A': 'Ammunition',
    'LA': 'Armor', 'MA': 'Armor', 'HA': 'Armor', 'S': 'Armor',
    'G': 'Adventuring Gear', 'FD': 'Adventuring Gear', 'AF': 'Adventuring Gear',
    'SPC': 'Adventuring Gear', 'OTH': 'Adventuring Gear',
    'INS': 'Tools', 'GS': 'Tools', 'SCF': 'Adventuring Gear', 'TB': 'Trade Goods',
    '$G': 'Treasure', '$A': 'Treasure', '$C': 'Treasure', 'TG': 'Treasure',
    'MNT': 'Mount', 'SHP': 'Vehicle', 'VEH': 'Vehicle', 'AIR': 'Vehicle',
    'TAH': 'Tack and Harness', 'EXP': 'Explosive',
}
FILL = (
    'value', 'weight', 'ac', 'dmg1', 'dmg2', 'dmgType', 'property', 'weaponCategory',
    'range', 'stealth', 'strength', 'mastery', 'entries', 'type', 'vehAc', 'vehHp',
    'vehSpeed', 'crew', 'capPassenger', 'capCargo', 'packContents', 'containerCapacity',
)
EQUIPABLE = {'M', 'R', 'LA', 'MA', 'HA', 'S'}


def published_dates() -> dict[str, str]:
    found: dict[str, str] = {}
    for rel, key in (('books.json', 'book'), ('adventures.json', 'adventure')):
        for book in L.fetch(rel).get(key, []):
            found.setdefault(book['id'].upper(), book.get('published', ''))
    return found


def code_of(value) -> str:
    if isinstance(value, dict):
        value = value.get('uid') or value.get('abbreviation') or ''
    if not isinstance(value, str) or not value:
        return ''
    return value.split('|')[0]


def number(value):
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return value
    if isinstance(value, str):
        try:
            return float(value) if '.' in value else int(value)
        except ValueError:
            return None
    return None


def cost_of(value) -> dict:
    cp = number(value)
    if cp is None:
        return {'quantity': 0, 'unit': 'cp'}
    if cp >= 100 and abs(cp % 100) < 1e-6:
        return {'quantity': int(cp // 100), 'unit': 'gp'}
    if cp >= 10 and abs(cp % 10) < 1e-6:
        return {'quantity': int(cp // 10), 'unit': 'sp'}
    if abs(cp - round(cp)) < 1e-6:
        return {'quantity': int(round(cp)), 'unit': 'cp'}
    return {'quantity': round(cp, 2), 'unit': 'cp'}


def property_names(base: dict) -> dict[str, str]:
    names: dict[str, str] = {}
    for row in base.get('itemProperty', []):
        code = row.get('abbreviation')
        entries = row.get('entries') or []
        title = entries[0].get('name') if entries and isinstance(entries[0], dict) else None
        if not title and row.get('name'):
            title = str(row['name']).title()
        if code and title:
            names[code] = title
    return names


def type_names(base: dict) -> dict[str, str]:
    names: dict[str, str] = {}
    for row in base.get('itemType', []):
        code = row.get('abbreviation')
        if code and row.get('name'):
            names[code] = row['name']
    return names


def mastery_names(base: dict) -> dict[str, str]:
    return {row['name'].lower(): row['name'] for row in base.get('itemMastery', []) if row.get('name')}


def equipment_names() -> set[str]:
    return {L.norm(row['name']) for row in json.loads(EQUIPMENT.read_text())}


def taken_slugs() -> set[str]:
    taken = set()
    for row in json.loads(EQUIPMENT.read_text()):
        taken.add(row.get('index') or row.get('slug') or L.slugify(row['name']))
    return taken


def magic_keys() -> set[tuple[str, str]]:
    return {(L.norm(row['name']), row.get('edition') or '2014') for row in json.loads(MAGIC.read_text())}


def wanted(equipment: set[str], magic: set[tuple[str, str]]) -> list[dict]:
    """Gap rows that are still absent once equipment.json is treated as 2024."""
    report = json.loads(GAP.read_text())
    rows = []
    for entry in report['lanes']['Magic Items']['entries']:
        key = (L.norm(entry['name']), entry['edition'])
        if key in magic:
            continue
        if entry['edition'] == '2024' and L.norm(entry['name']) in equipment:
            continue
        rows.append(entry)
    return rows


def source_rows(dates: dict[str, str]) -> dict[tuple[str, str], list[dict]]:
    grouped: dict[tuple[str, str], list[dict]] = {}
    items = L.fetch('items.json')['item']
    base = L.fetch('items-base.json')['baseitem']
    for row in items:
        source = (row.get('source') or '').upper()
        if source not in BOOKS:
            continue
        rarity = row.get('rarity')
        if rarity == 'none' or row.get('name') == 'Spiked Armor':
            grouped.setdefault((L.norm(row['name']), L.edition_of(source, dates)), []).append(row)
    for row in base:
        source = (row.get('source') or '').upper()
        if source not in BOOKS:
            continue
        grouped.setdefault((L.norm(row['name']), L.edition_of(source, dates)), []).append(row)
    return grouped


def merge(rows: list[dict], dates: dict[str, str]) -> dict:
    ordered = sorted(rows, key=lambda row: (dates.get((row.get('source') or '').upper(), ''), row.get('source') or ''), reverse=True)
    winner = dict(ordered[0])
    for older in ordered[1:]:
        for key in FILL:
            if winner.get(key) in (None, '', [], {}):
                if older.get(key) not in (None, '', [], {}):
                    winner[key] = older[key]
    winner['_sources'] = []
    for row in ordered:
        source = (row.get('source') or '').upper()
        if source and source not in winner['_sources']:
            winner['_sources'].append(source)
    return winner


def slug_for(name: str, edition: str, taken: set[str]) -> str:
    base = L.slugify('plus ' + name[1:] if name.startswith('+') else name)
    if edition == '2024' and (base in taken or f'{base}-2014' in taken):
        candidate = f'{base}-2024'
    elif edition == '2014' and base in taken:
        candidate = f'{base}-2014'
    else:
        candidate = base
    if candidate not in taken:
        taken.add(candidate)
        return candidate
    n = 2
    while f'{candidate}-{n}' in taken:
        n += 1
    taken.add(f'{candidate}-{n}')
    return f'{candidate}-{n}'


def describe(row: dict, category: str) -> str:
    text = L.entry_text(row).strip() if row.get('entries') else ''
    facts = []
    if row.get('vehAc') is not None:
        facts.append(f"AC {row['vehAc']}")
    if row.get('vehHp') is not None:
        facts.append(f"HP {row['vehHp']}")
    if row.get('vehSpeed') is not None:
        facts.append(f"Speed {row['vehSpeed']}")
    if row.get('crew') is not None:
        facts.append(f"Crew {row['crew']}")
    if row.get('capPassenger') is not None:
        facts.append(f"Passengers {row['capPassenger']}")
    if row.get('capCargo') is not None:
        facts.append(f"Cargo {row['capCargo']}")
    parts = [part for part in (text, ', '.join(facts)) if part]
    if parts:
        return '\n'.join(parts)
    stats = []
    damage = row.get('dmg1')
    if damage:
        kind = DAMAGE.get(row.get('dmgType'), '')
        versatile = f" ({row['dmg2']} two-handed)" if row.get('dmg2') else ''
        stats.append(f"{damage}{versatile} {kind}".strip())
    ac = row.get('ac')
    if ac is not None and code_of(row.get('type')) in ARMOR:
        stats.append(f"AC {ac}")
    if stats:
        return f"{category}. {', '.join(stats)}."
    return category


def capacity_of(raw) -> str | None:
    if not isinstance(raw, dict):
        return None
    parts = []
    weight = raw.get('weight')
    volume = raw.get('volume')
    if isinstance(weight, list) and weight:
        parts.append(f"{weight[0]} lb")
    if isinstance(volume, list) and volume:
        parts.append(f"{volume[0]} cubic feet")
    return 'Holds ' + ' and '.join(parts) if parts else None


def contents_of(raw) -> list[dict] | None:
    if not isinstance(raw, list):
        return None
    contents = []
    for entry in raw:
        if not isinstance(entry, dict) or not entry.get('item'):
            continue
        name = str(entry['item']).split('|')[0].strip()
        contents.append({
            'item_index': L.slugify(name),
            'item_name': name.title() if name.islower() else name,
            'quantity': entry.get('quantity') or 1,
        })
    return contents or None


def build(row: dict, edition: str, taken: set[str], props: dict[str, str], types: dict[str, str],
          masteries: dict[str, str], flags: list[str]) -> dict:
    type_code = code_of(row.get('type'))
    category = CATEGORY.get(type_code) or types.get(type_code) or 'Adventuring Gear'
    if type_code and type_code not in CATEGORY and type_code not in types:
        flags.append(f"unknown type {type_code} on {row['name']}")
    record = {
        'index': slug_for(row['name'], edition, taken),
        'name': row['name'],
        'year': 2024 if edition == '2024' else 2014,
        'equipment_category': category,
        'cost': cost_of(row.get('value')),
        'weight': number(row.get('weight')) or 0,
        'description': describe(row, category),
        'source': (row.get('source') or '').upper(),
        'sources': row.get('_sources') or [(row.get('source') or '').upper()],
    }
    record['slug'] = record['index']
    if type_code in EQUIPABLE:
        record['equipable'] = True
    if type_code in ('M', 'R'):
        record['weapon_range'] = 'Melee' if type_code == 'M' else 'Ranged'
        kind = row.get('weaponCategory')
        if kind in ('simple', 'martial'):
            record['weapon_category'] = kind.title()
    if type_code in ARMOR:
        record['armor_category'] = ARMOR[type_code]
        ac = number(row.get('ac'))
        if ac is not None:
            armor = {'base': ac, 'dex_bonus': type_code == 'LA'}
            if type_code == 'MA':
                armor = {'base': ac, 'dex_bonus': True, 'max_bonus': 2}
            record['armor_class'] = armor
        strength = number(row.get('strength'))
        if strength:
            record['str_minimum'] = strength
        if row.get('stealth') is True:
            record['stealth_disadvantage'] = True
    dmg = row.get('dmg1')
    dmg_code = row.get('dmgType')
    if dmg and dmg_code:
        if dmg_code not in DAMAGE:
            flags.append(f"unknown damage {dmg_code} on {row['name']}")
        damage = {'damage_dice': str(dmg), 'damage_type': DAMAGE.get(dmg_code, str(dmg_code))}
        record['damage'] = damage
        if row.get('dmg2'):
            record['two_handed_damage'] = {'damage_dice': str(row['dmg2']), 'damage_type': damage['damage_type']}
    if isinstance(row.get('range'), str) and row['range']:
        parts = [number(part) for part in str(row['range']).split('/')]
        if parts and parts[0] is not None:
            record['range'] = {'normal': parts[0]}
            if len(parts) > 1 and parts[1] is not None:
                record['range']['long'] = parts[1]
    names = []
    for raw in row.get('property') or []:
        code = code_of(raw)
        title = props.get(code)
        if not title:
            if code:
                flags.append(f"unknown property {code} on {row['name']}")
            continue
        names.append({'index': L.slugify(title), 'name': title})
    if names:
        record['properties'] = names
    mastery = row.get('mastery')
    if isinstance(mastery, list) and mastery:
        label = code_of(mastery[0])
        title = masteries.get(label.lower(), label)
        record['mastery'] = {'index': L.slugify(title), 'name': title}
    cap = capacity_of(row.get('containerCapacity'))
    if cap:
        record['capacity'] = cap
    contents = contents_of(row.get('packContents'))
    if contents:
        record['contents'] = contents
    return record


def main() -> None:
    apply = '--apply' in sys.argv
    dates = published_dates()
    base = L.fetch('items-base.json')
    props = property_names(base)
    types = type_names(base)
    masteries = mastery_names(base)
    equipment = equipment_names()
    magic = magic_keys()
    grouped = source_rows(dates)
    taken = taken_slugs()
    flags: list[str] = []
    missing_source = []
    records = []
    rows = wanted(equipment, magic)
    rows.sort(key=lambda entry: (entry['edition'], entry['name'].lower()))
    for entry in rows:
        key = (L.norm(entry['name']), entry['edition'])
        found = grouped.get(key)
        if not found:
            missing_source.append(f"{entry['name']} ({entry['edition']})")
            continue
        records.append(build(merge(found, dates), entry['edition'], taken, props, types, masteries, flags))

    by_year = {'2014': 0, '2024': 0}
    for record in records:
        by_year['2024' if record['year'] == 2024 else '2014'] += 1
    print(f'{len(records)} mundane records ({by_year["2014"]} from 2014, {by_year["2024"]} from 2024)')
    print(f'source rows not found: {len(missing_source)}')
    for name in missing_source[:20]:
        print(f'  {name}')
    unique_flags = sorted(set(flags))
    print(f'flags: {len(unique_flags)}')
    for flag in unique_flags[:30]:
        print(f'  {flag}')
    if apply:
        L.write_json(OUT, records)
        print(f'wrote {OUT.relative_to(L.ROOT)}')


if __name__ == '__main__':
    main()
