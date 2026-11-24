#!/usr/bin/env python3
"""Subclass lane. Report by default; --apply writes the catalog.

One record per subclass and edition. A 2014 slug stays as it is saved today.
The 2024 copy of that subclass gets "-2024". Spell names become slugs from
the merged spell file. A "any spell of this level" filter is already the
class list, so it is counted and not copied onto the subclass.
"""

from __future__ import annotations

import json
import re
import sys
from collections import defaultdict
from pathlib import Path

import lanelib as L

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "sourcebooks" / ".cache" / "class"
OUT = ROOT / "src" / "data" / "subclasses.json"
FEATURES = ROOT / "src" / "data" / "subclassFeaturesByLevel.json"
OUT_2024 = ROOT / "src" / "data" / "srd" / "2024" / "5e-SRD-Subclasses.json"
SPELLS = ROOT / "src" / "data" / "srd" / "5e-SRD-Spells-Merged.json"

PLAYERS = {
    "artificer", "barbarian", "bard", "cleric", "druid", "fighter", "monk",
    "paladin", "ranger", "rogue", "sorcerer", "warlock", "wizard",
}
FLAVOR = {
    "artificer": "Artificer Specialist",
    "barbarian": "Primal Path",
    "bard": "Bard College",
    "cleric": "Divine Domain",
    "druid": "Druid Circle",
    "fighter": "Martial Archetype",
    "monk": "Monastic Tradition",
    "paladin": "Sacred Oath",
    "ranger": "Ranger Archetype",
    "rogue": "Roguish Archetype",
    "sorcerer": "Sorcerous Origin",
    "warlock": "Otherworldly Patron",
    "wizard": "Arcane Tradition",
}
CORE_PREFIX = re.compile(
    r"^(?:the\s+)?(?:path|college|circle|way|school|oath|domain|order|conclave|"
    r"archetype|tradition|warrior|patron|origin|bloodline)\s+of\s+(?:the\s+)?",
    re.I,
)
CORE_SUFFIX = re.compile(r"\s+(?:domain|patron|tradition|bloodline|sorcery)$", re.I)
CORE_THE = re.compile(r"^the\s+", re.I)


def core_name(name: str) -> str:
    text = CORE_PREFIX.sub("", name.strip())
    text = CORE_SUFFIX.sub("", text)
    text = CORE_THE.sub("", text)
    return text.strip() or name.strip()


def load_old_slugs() -> dict[tuple[str, str], str]:
    """(class, normalized short name) -> slug already saved in the app."""
    found: dict[tuple[str, str], str] = {}
    for year in ("2014", "2018", "2020", "2020-egtw"):
        path = ROOT / "src" / "data" / "srd" / year / "5e-SRD-Subclasses.json"
        for record in json.loads(path.read_text()):
            found[(record["class"]["index"], L.norm(record["name"]))] = record["index"]
    return found


def load_spells() -> tuple[list[dict], dict[tuple[str, str], str]]:
    rows = json.loads(SPELLS.read_text())
    found: dict[tuple[str, str], str] = {}
    for spell in rows:
        slug = spell.get("slug") or spell["index"]
        found[(L.norm(spell["name"]), spell["source"])] = slug
        found.setdefault((L.norm(spell["name"].split("'s ", 1)[-1]), spell["source"]), slug)
    return rows, found


def resolve_one(record: dict, parents: list[dict]) -> dict | None:
    ref = record.get("_copy")
    if not ref:
        return record
    name = str(ref.get("name", "")).lower()
    source = str(ref.get("source", "")).lower()
    class_source = str(ref.get("classSource") or record.get("classSource") or "").lower()
    matches = [
        parent for parent in parents
        if str(parent.get("name", "")).lower() == name
        and str(parent.get("source", "")).lower() == source
        and "_copy" not in parent
    ]
    if class_source:
        same = [parent for parent in matches if str(parent.get("classSource", "")).lower() == class_source]
        matches = same or matches
    if not matches:
        return None

    def lookup(wanted_name: str, wanted_source: str) -> dict | None:
        if wanted_name.lower() == name and wanted_source.lower() == source:
            return matches[0]
        return None

    try:
        return L.resolve_copy(record, lookup, strict=False)
    except L.ModError:
        return None


def feature_text(feature: dict) -> str:
    text = "\n\n".join(part for part in L.render(feature.get("entries")) if part).strip()
    # Maneuvers and similar options point at the optional-feature catalog (step 6a).
    # Keep the names in the feature text so the subclass still lists them.
    names: list[str] = []

    def walk(node) -> None:
        if isinstance(node, dict):
            if node.get("type") == "refOptionalfeature" and node.get("optionalfeature"):
                names.append(str(node["optionalfeature"]))
            for child in node.values():
                walk(child)
        elif isinstance(node, list):
            for child in node:
                walk(child)

    walk(feature.get("entries"))
    if names:
        text = f"{text}\n\nOptions: {', '.join(names)}." if text else f"Options: {', '.join(names)}."
    return text


def card_blurb(description: str) -> str:
    blurb = description.split("\n\n", 1)[0].strip()
    if len(blurb) > 420:
        blurb = blurb[:417].rsplit(" ", 1)[0] + "..."
    return blurb


def main() -> None:
    apply = "--apply" in sys.argv
    inventory = json.loads((ROOT / "sourcebooks/content_inventory.json").read_text())
    books = {book.upper() for book in inventory["data"]["Subclasses"]}
    old_slugs = load_old_slugs()
    spell_rows, spells = load_spells()

    raw_sub: list[dict] = []
    raw_features: list[dict] = []
    for filename in json.loads((CACHE / "index.json").read_text()).values():
        data = json.loads((CACHE / filename).read_text())
        raw_sub.extend(
            record for record in data.get("subclass") or []
            if str(record.get("source", "")).upper() in books
            and str(record.get("className", "")).lower() in PLAYERS
        )
        raw_features.extend(
            record for record in data.get("subclassFeature") or []
            if str(record.get("source", "")).upper() in books
            and str(record.get("className", "")).lower() in PLAYERS
        )

    parents = [record for record in raw_sub if "_copy" not in record]
    resolved: list[tuple[dict, bool]] = []
    unresolved = []
    for record in raw_sub:
        if "_copy" not in record:
            resolved.append((record, False))
            continue
        done = resolve_one(record, parents)
        if done is None:
            unresolved.append(f"{record.get('name')} ({record.get('source')}, {record.get('className')})")
        else:
            resolved.append((done, True))

    # A copy whose book and class already have a real record is the same subclass.
    real_keys = {
        (L.norm(record["name"]), str(record["className"]).lower(), L.edition_of(record.get("source")))
        for record, copied in resolved if not copied
    }
    kept: list[dict] = []
    dropped_copies = 0
    for record, copied in resolved:
        key = (L.norm(record["name"]), str(record["className"]).lower(), L.edition_of(record.get("source")))
        if copied and key in real_keys:
            dropped_copies += 1
            continue
        kept.append(record)

    groups: dict[tuple, list[dict]] = defaultdict(list)
    for record in kept:
        key = (L.norm(record["name"]), str(record["className"]).lower(), L.edition_of(record.get("source")))
        groups[key].append(record)
    winners = []
    for group in groups.values():
        group.sort(key=lambda record: (
            L._publication_dates().get(str(record.get("source", "")).upper(), ""),
            str(record.get("source", "")).upper() == str(record.get("classSource", "")).upper(),
        ))
        winners.append(group[-1])

    feature_parents = [record for record in raw_features if "_copy" not in record]
    features_by_key: dict[tuple, list[dict]] = defaultdict(list)
    unresolved_features = 0
    for record in raw_features:
        done = record if "_copy" not in record else resolve_one(record, feature_parents)
        if done is None:
            unresolved_features += 1
            continue
        key = (
            str(done.get("className", "")).lower(),
            str(done.get("classSource", "")).upper(),
            L.norm(done.get("subclassShortName", "")),
            str(done.get("subclassSource", "")).upper(),
        )
        features_by_key[key].append(done)

    used: set[str] = set()
    catalog = []
    feature_out: dict[str, dict] = defaultdict(dict)
    spell_flags = []
    broad_filters = 0
    choose_filters = 0
    missing_spells = []

    def slug_for(record: dict, edition: str) -> str:
        class_slug = str(record["className"]).lower()
        short = record.get("shortName") or core_name(record["name"])
        saved = old_slugs.get((class_slug, L.norm(short))) or old_slugs.get((class_slug, L.norm(core_name(record["name"]))))
        base = saved or L.slugify(short)
        slug = base if edition == "2014" else f"{base}-2024"
        if slug in used:
            slug = f"{class_slug}-{slug}"
        used.add(slug)
        return slug

    def spell_slug(name: str, edition: str) -> str | None:
        clean = name.split("|", 1)[0].split("#", 1)[0].strip()
        return spells.get((L.norm(clean), edition)) or spells.get((L.norm(clean.split("'s ", 1)[-1]), edition))

    def take_named(node, edition: str, label: str) -> list[str]:
        """Pull spell slugs out of a 5etools spell node, including daily and '_' slots."""
        nonlocal broad_filters, choose_filters
        found = []

        def walk(value) -> None:
            nonlocal broad_filters, choose_filters
            if value is None or value == "_":
                return
            if isinstance(value, str):
                slug = spell_slug(value, edition)
                if slug:
                    found.append(slug)
                elif value.lower() != "daily":
                    missing_spells.append(f"{label}: {value}")
                return
            if isinstance(value, list):
                for item in value:
                    walk(item)
                return
            if not isinstance(value, dict):
                return
            if "all" in value:
                filt = str(value["all"])
                if filt.startswith("source="):
                    sources = set()
                    excluded = set()
                    for part in filt.split(";"):
                        if part.startswith("source="):
                            sources.add(part.split("=", 1)[1].upper())
                        elif part.startswith("!"):
                            excluded.add(part[1:].upper())
                    for spell in spell_rows:
                        book = str(spell.get("book", "")).upper()
                        if spell["source"] == edition and book in sources and book not in excluded:
                            found.append(spell.get("slug") or spell["index"])
                else:
                    broad_filters += 1
                return
            if "choose" in value:
                choose_filters += 1
                return
            for child in value.values():
                walk(child)

        walk(node)
        return list(dict.fromkeys(found))

    for record in sorted(winners, key=lambda item: (item["className"], item["name"], L.edition_of(item.get("source")))):
        edition = L.edition_of(record.get("source"))
        class_slug = str(record["className"]).lower()
        slug = slug_for(record, edition)
        key = (
            class_slug,
            str(record.get("classSource", "")).upper(),
            L.norm(record.get("shortName") or core_name(record["name"])),
            str(record.get("source", "")).upper(),
        )
        features = sorted(features_by_key.get(key, []), key=lambda feature: (feature.get("level") or 0, feature.get("name") or ""))
        rendered = []
        for feature in features:
            text = feature_text(feature)
            if not text:
                continue
            rendered.append({
                "level": feature.get("level") or 1,
                "name": feature.get("name") or record["name"],
                "description": text,
            })
        description = next(
            (feature["description"] for feature in rendered if L.norm(feature["name"]) == L.norm(record["name"])),
            rendered[0]["description"] if rendered else "",
        )
        granted = []
        expanded = []
        blocks = [block for block in record.get("additionalSpells") or [] if isinstance(block, dict)]
        # Several named blocks are a choice (Circle of the Land's lands). Listing
        # every land's spells as available is the choice; none of them is auto-prepared.
        choice = [str(block.get("name")) for block in blocks if block.get("name")]
        choosing = len(choice) >= 2
        if choosing:
            spell_flags.append(
                f"{record['name']} ({class_slug}, {edition}) picks one of {len(choice)} spell lists "
                f"({', '.join(choice)}); each list is available and none is added automatically"
            )
        for block in blocks:
            for bucket in ("prepared", "known"):
                levels = block.get(bucket)
                if isinstance(levels, dict):
                    for level, items in levels.items():
                        if not str(level).isdigit():
                            continue
                        slugs = take_named(items, edition, f"{record['name']} {bucket} {level}")
                        if not slugs:
                            continue
                        if choosing:
                            expanded.extend(slugs)
                        else:
                            granted.append({"level": int(level), "slugs": slugs})
            levels = block.get("expanded")
            if isinstance(levels, dict):
                for level, items in levels.items():
                    expanded.extend(take_named(items, edition, f"{record['name']} expanded {level}"))
        entry = {
            "slug": slug,
            "name": record["name"],
            "class": class_slug,
            "subclassFlavor": FLAVOR[class_slug],
            "desc": [card_blurb(description)] if description else [],
            "description": description,
            "source": str(record.get("source", "")).upper(),
            "edition": edition,
            "subclassLevel": min((feature["level"] for feature in rendered), default=3),
        }
        if granted:
            entry["grantedSpells"] = granted
        if expanded:
            entry["expandedSpells"] = list(dict.fromkeys(expanded))
        catalog.append(entry)
        feature_out[class_slug][slug] = {
            "name": record["name"],
            "description": description,
            "features": rendered,
        }
        if not rendered:
            spell_flags.append(f"{record['name']} ({class_slug}, {edition}) has no feature text")

    no_text = [item for item in catalog if not item["description"]]
    print(f"Subclasses: {len(catalog)}")
    print(f"  2014: {sum(1 for item in catalog if item['edition'] == '2014')}")
    print(f"  2024: {sum(1 for item in catalog if item['edition'] == '2024')}")
    print(f"  copies dropped because the book record exists: {dropped_copies}")
    print(f"  unresolved subclass copies: {len(unresolved)}")
    print(f"  unresolved feature copies: {unresolved_features}")
    print(f"  with granted spells: {sum(1 for item in catalog if item.get('grantedSpells'))}")
    print(f"  with an expanded list: {sum(1 for item in catalog if item.get('expandedSpells'))}")
    print(f"  broad 'any spell of this level' filters left on the class list: {broad_filters}")
    print(f"  choice filters left as text: {choose_filters}")
    print(f"  spell names with no slug: {len(missing_spells)}")
    print(f"  without feature text: {len(no_text)}")
    for line in unresolved[:8]:
        print(f"    unresolved {line}")
    for line in missing_spells[:12]:
        print(f"    {line}")
    print(f"  spell-list choices: {len(spell_flags)}")
    for line in spell_flags:
        print(f"    {line}")
    by_slug = {item["slug"]: item for item in catalog}
    for slug in ("berserker", "life", "battle-master", "lore", "evocation", "abjurer-2024", "necromancer-2024", "draconic-2024", "chronurgy-magic", "graviturgy-magic", "alchemist", "alchemist-2024", "land", "arcane-trickster", "valor"):
        item = by_slug.get(slug)
        if not item:
            print(f"  MISSING SLUG {slug}")
            continue
        features = feature_out[item["class"]][slug]["features"]
        print(
            f"  {slug}: {item['name']} {item['edition']} {item['source']} L{item['subclassLevel']} "
            f"features={len(features)} granted={len(item.get('grantedSpells') or [])} "
            f"expanded={len(item.get('expandedSpells') or [])} names={[f['name'] for f in features[:4]]}"
        )
    chrono = by_slug.get("chronurgy-magic")
    if chrono:
        print("  chronurgy expanded", chrono.get("expandedSpells"))
    life = by_slug.get("life")
    if life:
        print("  life granted", life.get("grantedSpells"))

    if not apply:
        print("Dry run. Pass --apply to write.")
        return
    L.write_json(OUT, catalog)
    L.write_json(FEATURES, feature_out)
    L.write_json(OUT_2024, [
        {
            "index": item["slug"],
            "name": item["name"],
            "class": {"index": item["class"], "name": item["class"].title()},
            "subclass_flavor": item["subclassFlavor"],
            "desc": item["desc"],
            "edition": "2024",
            "source": item["source"],
        }
        for item in catalog if item["edition"] == "2024"
    ])
    print(f"Wrote {OUT.relative_to(ROOT)}, {FEATURES.relative_to(ROOT)}, and the 2024 subclass file.")


if __name__ == "__main__":
    main()
