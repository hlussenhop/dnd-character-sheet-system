#!/usr/bin/env python3
"""
build_gap_report.py

Cross-references content_inventory.json (everything the books in
/content-sourcebooks contribute) against the data the app currently ships,
and classifies every inventory entry as one of:

    present              - same name already exists in the app for the same edition
    other_edition        - name exists in the app, but only under the other edition
    missing              - not in the app at all
    fuzzy                - not an exact match, but closely resembles an app entry
                           (needs a human/AI judgment call)

It also flags names that appear in more than one book within the same
edition (e.g. a species reprinted from Volo's into Monsters of the
Multiverse), since only one version should end up in the app, and lists
app entries that matched nothing in the inventory.

Edition is assigned per source book: books published on/after 2024-09-01
(the 2024 Player's Handbook release) are treated as 2024 rules, everything
earlier as 2014.

Output: sourcebooks/gap_report.md and sourcebooks/gap_report.json.
Reads only; does not modify any app files.
"""

from __future__ import annotations

import difflib
import json
import re
import urllib.request
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
REPO = SCRIPT_DIR.parent
DATA = REPO / "src" / "data"
BOOKS_URL = "https://raw.githubusercontent.com/5etools-mirror-3/5etools-src/main/data/books.json"
EDITION_CUTOFF = "2024-09-01"
FUZZY_THRESHOLD = 0.85


def load(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def norm(name: str) -> str:
    name = name.lower()
    name = re.sub(r"\((2014|2024|legacy)\)", "", name)
    name = re.sub(r"[’'`]", "", name)
    name = re.sub(r"[^a-z0-9]+", " ", name)
    return name.strip()


_SUBCLASS_PREFIX_RE = re.compile(
    r"^(the\s+)?(path|college|circle|way|school|oath|domain|order|conclave|archetype|"
    r"tradition|warrior|patron|origin|bloodline)\s+of\s+(the\s+)?",
    re.IGNORECASE,
)
_SUBCLASS_SUFFIX_RE = re.compile(r"\s+(domain|patron|tradition|bloodline|sorcery)$", re.IGNORECASE)


def subclass_core(name: str) -> str:
    """'Path of the Berserker' / 'Life Domain' / 'The Fiend' -> 'Berserker' / 'Life' / 'Fiend'."""
    core = _SUBCLASS_PREFIX_RE.sub("", name.strip())
    core = _SUBCLASS_SUFFIX_RE.sub("", core)
    core = re.sub(r"^the\s+", "", core, flags=re.IGNORECASE)
    return core


def spell_core(name: str) -> str:
    """SRD strips eponymous wizards: "Melf's Acid Arrow" -> 'Acid Arrow'."""
    return re.sub(r"^[A-Z][\w-]*['’]s\s+", "", name.strip())


def species_variants(name: str) -> list[str]:
    """'Dwarf (Hill)' -> also try 'Hill Dwarf'; 'Elf (Eladrin)' -> 'Eladrin'."""
    out = [name]
    m = re.match(r"^(.*?)\s*\(([^)]+)\)\s*$", name)
    if m:
        parent, variant = m.group(1).strip(), re.sub(r"^Variant;\s*", "", m.group(2).strip())
        out += [f"{variant} {parent}", variant, f"{parent} {variant}"]
    return out


# ---------------------------------------------------------------------------
# App-side name sets, each a dict: normalized name -> set of editions
# ---------------------------------------------------------------------------

def add(index: dict, name: str, edition: str, label: str | None = None, key_fn=None) -> None:
    key = norm(key_fn(name) if key_fn else name)
    entry = index.setdefault(key, {"editions": set(), "label": label or name})
    entry["editions"].add(edition)


def app_species() -> dict:
    idx: dict = {}
    for s in load(DATA / "species.json")["species"]:
        ed = s.get("edition", "2014")
        add(idx, s["name"], ed)
        for v in s.get("variants") or []:
            vname = v.get("name") if isinstance(v, dict) else v
            if vname:
                add(idx, vname, ed)
    for r in load(DATA / "srd/2014/5e-SRD-Races.json"):
        add(idx, r["name"], "2014")
    return idx


def app_backgrounds() -> dict:
    idx: dict = {}
    for b in load(DATA / "backgrounds.json"):
        add(idx, b["name"], b.get("edition", "2014"))
    return idx


def app_feats() -> dict:
    idx: dict = {}
    for f in load(DATA / "feats.json"):
        year = str(f.get("year", ""))
        add(idx, f["name"], "2024" if year.startswith("2024") else "2014")
    for f in load(DATA / "srd/2014/5e-SRD-Feats.json"):
        add(idx, f["name"], "2014")
    return idx


def app_classes() -> dict:
    idx: dict = {}
    for f, ed in (("srd/2014/5e-SRD-Classes.json", "2014"), ("srd/2024/5e-SRD-Classes.json", "2024")):
        for c in load(DATA / f):
            add(idx, c["name"], ed)
    return idx


def app_subclasses() -> tuple[dict, list[str]]:
    idx: dict = {}
    for s in load(DATA / "subclasses.json"):
        add(idx, s["name"], s.get("edition") or "2014", key_fn=subclass_core)
    return idx, []


def app_optfeatures() -> dict:
    idx: dict = {}
    for f in load(DATA / "optionalFeatures.json"):
        add(idx, f["name"], f.get("edition") or "2014")
    return idx


def app_spells() -> tuple[dict, list[str]]:
    idx: dict = {}
    notes: list[str] = []
    spells = load(DATA / "srd/5e-SRD-Spells-Merged.json")
    counts: dict[str, int] = {}
    for s in spells:
        ed = str(s.get("source", "2014"))
        counts[ed] = counts.get(ed, 0) + 1
        add(idx, s["name"], ed, key_fn=spell_core)
    notes.append(f"`5e-SRD-Spells-Merged.json` has {len(spells)} spells tagged by source as {counts}.")
    if min(counts.values() or [0]) < 50:
        notes.append("One edition has almost no spells; spell edition matches below should be treated as unreliable.")
    return idx, notes


def app_equipment() -> dict:
    idx: dict = {}
    for e in load(DATA / "equipment.json"):
        # The file is the 2024 PHB gear. loadEquipment() stamps every row year 2024.
        add(idx, e["name"], "2024")
    for e in load(DATA / "mundaneGear.json"):
        add(idx, e["name"], "2024" if e.get("year") == 2024 else "2014")
    for item in load(DATA / "magicItems.json"):
        add(idx, item["name"], item.get("edition") or "2014")
    return idx


def app_monsters() -> dict:
    idx: dict = {}
    for m in load(DATA / "srd/2014/5e-SRD-Monsters.json"):
        add(idx, m["name"], "2014")
    index = DATA / "monsterIndex.json"
    if index.exists():
        for m in load(index):
            add(idx, m["name"], m.get("edition") or "2014")
    return idx


# ---------------------------------------------------------------------------
# Classification
# ---------------------------------------------------------------------------

def classify(name: str, edition: str, app_idx: dict, try_names: list[str]) -> tuple[str, str | None]:
    for candidate in try_names:
        hit = app_idx.get(norm(candidate))
        if hit:
            if edition in hit["editions"]:
                return "present", hit["label"]
            return "other_edition", hit["label"]
    best = difflib.get_close_matches(norm(name), list(app_idx.keys()), n=1, cutoff=FUZZY_THRESHOLD)
    if best:
        return "fuzzy", app_idx[best[0]]["label"]
    return "missing", None


def main() -> None:
    inventory = load(SCRIPT_DIR / "content_inventory.json")
    with urllib.request.urlopen(urllib.request.Request(BOOKS_URL, headers={"User-Agent": "gap-report/1.0"}), timeout=30) as r:
        catalog = json.loads(r.read())["book"]
    published = {b["id"].upper(): b.get("published", "") for b in catalog}
    source_names = inventory["source_books"]
    edition_of = {sid: ("2024" if published.get(sid, "") >= EDITION_CUTOFF else "2014") for sid in source_names}

    subclass_idx, subclass_notes = app_subclasses()
    spell_idx, spell_notes = app_spells()
    notes = subclass_notes + spell_notes + [
        "Magic items are read from `magicItems.json` (one record per name and edition). "
        "`equipment.json` is the 2024 PHB gear (`loadEquipment` sets year 2024). "
        "Other mundane rows, including the 2014 printing of that gear, are in `mundaneGear.json`.",
        "Monsters are read from `monsterIndex.json` (one record per name and edition) plus the 2014 SRD file.",
        "Optional class features are read from `optionalFeatures.json`. "
        "2024 fighting styles are feats, so they stay in the feats lane.",
    ]

    lanes = [
        ("Species / Races", app_species(), species_variants),
        ("Backgrounds", app_backgrounds(), None),
        ("Feats", app_feats(), None),
        ("Classes", app_classes(), None),
        ("Subclasses", subclass_idx, lambda n: [subclass_core(n)]),
        ("Optional Class Features (invocations, maneuvers, metamagic, etc.)", app_optfeatures(), None),
        ("Spells", spell_idx, lambda n: [spell_core(n)]),
        ("Magic Items", app_equipment(), None),
        ("Monsters", app_monsters(), None),
    ]

    report: dict = {"editions_by_source": edition_of, "notes": notes, "lanes": {}}
    md: list[str] = ["# Content Gap Report\n"]
    md.append(
        "Cross-reference of `content_inventory.json` against the app's current data. "
        f"Books published on or after {EDITION_CUTOFF} are treated as 2024 rules; earlier books as 2014.\n"
    )
    md.append("## Edition assignment by book\n")
    for ed in ("2014", "2024"):
        books = sorted(source_names[s] + f" ({s})" for s in edition_of if edition_of[s] == ed)
        md.append(f"**{ed}:** " + "; ".join(books) + "\n")
    md.append("## Data issues found in the app\n")
    md += [f"- {n}" for n in notes] + [""]

    summary_rows: list[str] = []
    lane_sections: list[str] = []

    for lane_name, app_idx, variants_fn in lanes:
        by_source = inventory["data"].get(lane_name, {})
        grouped: dict[str, dict[str, dict]] = {"2014": {}, "2024": {}}
        for sid, entries in by_source.items():
            ed = edition_of[sid]
            for e in entries:
                key = norm(e["name"])
                slot = grouped[ed].setdefault(key, {"name": e["name"], "sources": [], "meta": e})
                slot["sources"].append(sid)

        results = []
        matched_app_keys: set[str] = set()
        for ed, entries in grouped.items():
            for key, slot in entries.items():
                if lane_name == "Magic Items" and slot["meta"].get("rarity") in (None, "none"):
                    category = "mundane"
                else:
                    category = None
                tries = variants_fn(slot["name"]) if variants_fn else [slot["name"]]
                status, app_label = classify(tries[0], ed, app_idx, tries)
                if status in ("present", "other_edition", "fuzzy") and app_label:
                    matched_app_keys.add(next(k for k, v in app_idx.items() if v["label"] == app_label))
                results.append({
                    "name": slot["name"],
                    "edition": ed,
                    "sources": sorted(set(slot["sources"])),
                    "status": status,
                    "app_match": app_label,
                    "mundane": category == "mundane",
                    **{k: v for k, v in slot["meta"].items() if k not in ("name",)},
                })

        app_only = sorted(v["label"] for k, v in app_idx.items() if k not in matched_app_keys)
        counts = {s: sum(1 for r in results if r["status"] == s) for s in ("present", "other_edition", "fuzzy", "missing")}
        dupes = [r for r in results if len(r["sources"]) > 1]
        report["lanes"][lane_name] = {"counts": counts, "entries": results, "app_only": app_only}
        summary_rows.append(
            f"| {lane_name} | {len(results)} | {counts['present']} | {counts['other_edition']} | "
            f"{counts['fuzzy']} | {counts['missing']} | {len(dupes)} | {len(app_only)} |"
        )

        sec = [f"## {lane_name}\n"]
        sec.append(
            f"{len(results)} unique entries (after collapsing same-name reprints within an edition): "
            f"{counts['present']} present, {counts['other_edition']} only in the other edition, "
            f"{counts['fuzzy']} fuzzy, {counts['missing']} missing.\n"
        )
        fuzzy = [r for r in results if r["status"] == "fuzzy"]
        if fuzzy:
            sec.append("### Fuzzy matches — need a judgment call\n")
            sec += [f"- [{r['edition']}] **{r['name']}** ≈ app `{r['app_match']}` ({', '.join(r['sources'])})" for r in sorted(fuzzy, key=lambda r: r["name"])]
            sec.append("")
        other = [r for r in results if r["status"] == "other_edition"]
        if other:
            sec.append("### Exists in the app only under the other edition\n")
            sec += [f"- [{r['edition']}] {r['name']} ({', '.join(r['sources'])})" for r in sorted(other, key=lambda r: r["name"])]
            sec.append("")
        if dupes:
            sec.append("### Appears in multiple books within the same edition — pick one canonical source\n")
            sec += [f"- [{r['edition']}] {r['name']}: {', '.join(r['sources'])}" for r in sorted(dupes, key=lambda r: r["name"])]
            sec.append("")
        if app_only:
            sec.append("### In the app but not matched by any inventory entry\n")
            sec.append(", ".join(app_only) + "\n")
        sec.append("_Full per-entry status (including the missing list) is in `gap_report.json`._\n")
        lane_sections += sec

    md.append("## Summary\n")
    md.append("| Lane | Unique entries | Present | Other edition only | Fuzzy | Missing | Multi-book reprints | App-only |")
    md.append("|---|---|---|---|---|---|---|---|")
    md += summary_rows + [""]
    md += lane_sections

    (SCRIPT_DIR / "gap_report.md").write_text("\n".join(md), encoding="utf-8")
    (SCRIPT_DIR / "gap_report.json").write_text(json.dumps(report, indent=2, default=list), encoding="utf-8")
    print("\n".join(["| Lane | Unique | Present | OtherEd | Fuzzy | Missing | Reprints | AppOnly |"] + summary_rows))


if __name__ == "__main__":
    main()
