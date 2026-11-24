#!/usr/bin/env python3
"""Optional class features. Report by default; --apply writes the catalog.

Invocations, maneuvers, metamagic, infusions, pact boons, and the other
optionalfeature records, plus how many of each a class knows at each level.
A picker is a later step. This script only writes the data.
"""

from __future__ import annotations

import json
import sys
from collections import defaultdict
from pathlib import Path

import lanelib as L

ROOT = Path(__file__).resolve().parents[1]
SPELLS = ROOT / "src" / "data" / "srd" / "5e-SRD-Spells-Merged.json"
SUBCLASSES = ROOT / "src" / "data" / "subclasses.json"
OUT = ROOT / "src" / "data" / "optionalFeatures.json"
PROGRESS = ROOT / "src" / "data" / "optionalFeatureProgression.json"

PLAYERS = {
    "artificer", "barbarian", "bard", "cleric", "druid", "fighter", "monk",
    "paladin", "ranger", "rogue", "sorcerer", "warlock", "wizard",
}
TYPE_CLASS = {
    "EI": "warlock",
    "MM": "sorcerer",
    "MV:B": "fighter",
    "ED": "monk",
    "AI": "artificer",
    "AS": "fighter",
    "RN": "fighter",
    "PB": "warlock",
    "FS:F": "fighter",
    "FS:P": "paladin",
    "FS:R": "ranger",
    "FS:B": "bard",
}
TYPE_NAME = {
    "EI": "Eldritch Invocation",
    "MM": "Metamagic",
    "MV:B": "Maneuver",
    "ED": "Elemental Discipline",
    "AI": "Artificer Infusion",
    "AS": "Arcane Shot",
    "RN": "Rune",
    "RP": "House Renown",
    "PB": "Pact Boon",
    "FS:F": "Fighting Style",
    "FS:P": "Fighting Style",
    "FS:R": "Fighting Style",
    "FS:B": "Fighting Style",
}
SKILLS = {
    "acrobatics": "Acrobatics",
    "animal handling": "AnimalHandling",
    "arcana": "Arcana",
    "athletics": "Athletics",
    "deception": "Deception",
    "history": "History",
    "insight": "Insight",
    "intimidation": "Intimidation",
    "investigation": "Investigation",
    "medicine": "Medicine",
    "nature": "Nature",
    "perception": "Perception",
    "performance": "Performance",
    "persuasion": "Persuasion",
    "religion": "Religion",
    "sleight of hand": "SleightOfHand",
    "stealth": "Stealth",
    "survival": "Survival",
}


def load_spells() -> dict[tuple[str, str], str]:
    found: dict[tuple[str, str], str] = {}
    for spell in json.loads(SPELLS.read_text()):
        slug = spell.get("slug") or spell["index"]
        found[(L.norm(spell["name"]), spell["source"])] = slug
    return found


def totals(progression) -> list[int] | None:
    """Running total known at levels 1-20. A '*' entry is a grant, not a table."""
    if isinstance(progression, dict) and set(progression) == {"*"}:
        return None
    known = [0] * 20
    if isinstance(progression, list):
        for index, value in enumerate(progression[:20]):
            known[index] = int(value) if isinstance(value, int) else 0
        return known
    if isinstance(progression, dict):
        points = sorted((int(level), int(value)) for level, value in progression.items())
        current = 0
        cursor = 0
        for level in range(1, 21):
            while cursor < len(points) and points[cursor][0] <= level:
                current = points[cursor][1]
                cursor += 1
            known[level - 1] = current
        return known
    return None


def main() -> None:
    apply = "--apply" in sys.argv
    inventory = json.loads((ROOT / "sourcebooks/content_inventory.json").read_text())
    books = {book.upper() for book in inventory["data"]["Optional Class Features (invocations, maneuvers, metamagic, etc.)"]}
    spells = load_spells()
    subclasses = json.loads(SUBCLASSES.read_text())
    subclass_slug = {}
    for record in subclasses:
        subclass_slug[(record["class"], record["edition"], L.norm(record["name"]))] = record["slug"]

    raw = [
        record for record in L.fetch("optionalfeatures.json")["optionalfeature"]
        if str(record.get("source", "")).upper() in books
    ]
    used: set[str] = set()
    slugs: dict[tuple[str, str], str] = {}
    for record in sorted(raw, key=lambda item: (L.edition_of(item["source"]), item["name"])):
        edition = L.edition_of(record["source"])
        slug = L.slugify(record["name"]) if edition == "2014" else f"{L.slugify(record['name'])}-2024"
        if slug in used:
            slug = f"{slug}-{str(record['featureType'][0]).lower().replace(':', '')}"
        used.add(slug)
        slugs[(L.norm(record["name"]), str(record["source"]).upper())] = slug

    def spell_slug(token: str, edition: str) -> str | None:
        name = token.split("|", 1)[0].split("#", 1)[0].strip()
        return spells.get((L.norm(name), edition))

    def feature_slug(token: str) -> str | None:
        name, _, source = token.partition("|")
        if source:
            return slugs.get((L.norm(name), source.upper()))
        for (stored_name, _stored_source), slug in slugs.items():
            if stored_name == L.norm(name):
                return slug
        return None

    flags: list[str] = []
    missing_spells: list[str] = []
    missing_features: list[str] = []
    choose_spells = 0
    catalog = []

    def walk_spells(node, edition: str, found: list[str]) -> None:
        nonlocal choose_spells
        if node is None or node == "_":
            return
        if isinstance(node, str):
            slug = spell_slug(node, edition)
            if slug:
                found.append(slug)
            elif node.lower() != "daily":
                missing_spells.append(f"{node} ({edition})")
            return
        if isinstance(node, list):
            for item in node:
                walk_spells(item, edition, found)
            return
        if not isinstance(node, dict):
            return
        if "choose" in node:
            choose_spells += 1
            return
        for key, child in node.items():
            if key in {"ability", "resourceName", "name", "hidden", "type"}:
                continue
            walk_spells(child, edition, found)

    for record in sorted(raw, key=lambda item: (item["name"], L.edition_of(item["source"]))):
        edition = L.edition_of(record["source"])
        types = [str(item) for item in record.get("featureType") or []]
        description = L.entry_text({"entries": record.get("entries") or []}).strip()
        prerequisites = []
        for group in record.get("prerequisite") or []:
            if not isinstance(group, dict):
                continue
            parsed: dict = {}
            level = group.get("level")
            if isinstance(level, dict):
                parsed["level"] = level.get("level")
                class_name = (level.get("class") or {}).get("name")
                if class_name:
                    parsed["classSlug"] = str(class_name).lower()
            if group.get("pact"):
                parsed["pact"] = str(group["pact"]).lower()
            spell_slugs = []
            for token in group.get("spell") or []:
                if isinstance(token, str):
                    # "hex/curse#x" is hex or a curse. Keep the spells that resolve.
                    parts = [part.strip() for part in token.split("#", 1)[0].split("/") if part.strip()]
                    resolved = [slug for slug in (spell_slug(part, edition) for part in parts) if slug]
                    spell_slugs.extend(resolved)
                    if len(resolved) < len(parts):
                        missing = [part for part in parts if not spell_slug(part, edition)]
                        flags.append(
                            f"{record['name']} ({edition}) prerequisite {token} keeps {', '.join(resolved) or 'nothing'}; "
                            f"{', '.join(missing)} is not a spell in this edition"
                        )
                elif isinstance(token, dict) and token.get("choose"):
                    choose_spells += 1
                    parsed["spellChoice"] = token.get("entrySummary") or token.get("entry") or "a spell you choose"
            if spell_slugs:
                parsed["spells"] = spell_slugs
            if group.get("item"):
                parsed["items"] = [str(item) for item in group["item"]]
            feature_slugs = []
            for token in group.get("optionalfeature") or []:
                slug = feature_slug(str(token))
                if slug:
                    feature_slugs.append(slug)
                else:
                    missing_features.append(f"{record['name']}: {token}")
            if feature_slugs:
                parsed["features"] = feature_slugs
            summary = group.get("otherSummary")
            if isinstance(summary, dict):
                parsed["summary"] = L.strip_tags(summary.get("entrySummary") or summary.get("entry") or "")
            if parsed:
                prerequisites.append(parsed)

        granted_spells: list[str] = []
        for block in record.get("additionalSpells") or []:
            walk_spells(block, edition, granted_spells)

        grants = []
        for block in record.get("optionalfeatureProgression") or []:
            amount = (block.get("progression") or {}).get("*")
            if amount:
                grants.append({
                    "featureType": (block.get("featureType") or [""])[0],
                    "name": block.get("name") or TYPE_NAME.get((block.get("featureType") or [""])[0], ""),
                    "count": int(amount),
                })
        feat_grant = None
        for block in record.get("featProgression") or []:
            feat_grant = {
                "count": int((block.get("progression") or {}).get("*") or 1),
                "category": "origin" if "O" in (block.get("category") or []) else "feat",
            }
            flags.append(f"{record['name']} ({edition}) grants {feat_grant['count']} {feat_grant['category']} feat; the feat picker is separate")

        skills = []
        for block in record.get("skillProficiencies") or []:
            if isinstance(block, dict):
                for key, value in block.items():
                    if not value:
                        continue
                    skill = SKILLS.get(key.lower())
                    if skill:
                        skills.append(skill)
                    else:
                        flags.append(f"{record['name']} grants an unmapped skill {key}")

        senses = {}
        for block in record.get("senses") or []:
            if isinstance(block, dict):
                senses.update({key: value for key, value in block.items() if isinstance(value, int)})

        entry = {
            "slug": slugs[(L.norm(record["name"]), str(record["source"]).upper())],
            "name": record["name"],
            "edition": edition,
            "source": str(record["source"]).upper(),
            "featureTypes": types,
            "featureTypeName": TYPE_NAME.get(types[0], types[0] if types else "Optional Feature"),
            "classes": sorted({TYPE_CLASS[item] for item in types if item in TYPE_CLASS}),
            "description": description,
        }
        if prerequisites:
            entry["prerequisites"] = prerequisites
        if granted_spells:
            entry["spells"] = list(dict.fromkeys(granted_spells))
        if record.get("consumes") and record["consumes"].get("name"):
            entry["uses"] = record["consumes"]["name"]
        if grants:
            entry["grants"] = grants
        if feat_grant:
            entry["grantsFeat"] = feat_grant
        if skills:
            entry["skills"] = skills
        if senses:
            entry["senses"] = senses
        if record.get("isClassFeatureVariant"):
            entry["classFeatureVariant"] = True
        catalog.append(entry)

    progressions = []
    unresolved_subclass = []
    for filename in json.loads((ROOT / "sourcebooks/.cache/class/index.json").read_text()).values():
        data = json.loads((ROOT / "sourcebooks/.cache/class" / filename).read_text())
        owners = [("class", record) for record in data.get("class") or []]
        owners += [("subclass", record) for record in data.get("subclass") or [] if "_copy" not in record]
        for kind, record in owners:
            if str(record.get("source", "")).upper() not in books:
                continue
            class_slug = str(record.get("className") or record.get("name") or "").lower()
            if class_slug not in PLAYERS:
                continue
            class_source = record.get("classSource") or record.get("source")
            edition = L.edition_of(class_source)
            subclass = None
            if kind == "subclass":
                subclass = subclass_slug.get((class_slug, edition, L.norm(record.get("name", ""))))
                if not subclass:
                    unresolved_subclass.append(f"{record.get('name')} ({record.get('source')}, {class_slug})")
                    continue
            for block in record.get("optionalfeatureProgression") or []:
                known = totals(block.get("progression"))
                if known is None:
                    continue
                feature_type = (block.get("featureType") or [""])[0]
                required = []
                for level, tokens in (block.get("required") or {}).items():
                    required.append({
                        "level": int(level),
                        "slugs": [slug for slug in (feature_slug(token) for token in tokens) if slug],
                    })
                progressions.append({
                    "classSlug": class_slug,
                    "edition": edition,
                    "subclassSlug": subclass,
                    "featureType": feature_type,
                    "name": block.get("name") or TYPE_NAME.get(feature_type, feature_type),
                    "knownByLevel": known,
                    "required": required,
                })

    variants = sum(1 for item in catalog if item.get("classFeatureVariant"))
    print(f"Optional features: {len(catalog)}")
    print(f"  2014: {sum(1 for item in catalog if item['edition'] == '2014')}")
    print(f"  2024: {sum(1 for item in catalog if item['edition'] == '2024')}")
    print(f"  progression rows: {len(progressions)}")
    print(f"  class feature variants: {variants}")
    print(f"  spell choices left as text: {choose_spells}")
    print(f"  spell names with no slug: {len(missing_spells)}")
    print(f"  feature prerequisites with no record: {len(missing_features)}")
    print(f"  subclass progressions with no subclass: {len(unresolved_subclass)}")
    for line in missing_spells[:40]:
        print(f"    spell {line}")
    for line in missing_features:
        print(f"    {line}")
    for line in unresolved_subclass:
        print(f"    subclass {line}")
    for line in flags:
        print(f"    {line}")

    if not apply:
        print("Dry run. Pass --apply to write.")
        return
    L.write_json(OUT, catalog)
    L.write_json(PROGRESS, progressions)
    print(f"Wrote {OUT.relative_to(ROOT)} and {PROGRESS.relative_to(ROOT)}.")


if __name__ == "__main__":
    main()
