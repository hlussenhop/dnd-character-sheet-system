#!/usr/bin/env python3
"""Tests for lanelib.py. Run with: python3 -m unittest sourcebooks/test_lanelib.py

The "real data" tests use the cached mirror files in sourcebooks/.cache and are skipped when absent.
"""
import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import lanelib as L  # noqa: E402


def lookup_of(*entities):
    return L.make_lookup(entities)


class StripTagsTest(unittest.TestCase):
    def test_common_tags(self):
        self.assertEqual(L.strip_tags('{@spell fireball|XPHB}'), 'fireball')
        self.assertEqual(L.strip_tags('{@spell fireball|XPHB|Fireball!}'), 'Fireball!')
        self.assertEqual(L.strip_tags('{@dc 15} or {@damage 2d6}'), 'DC 15 or 2d6')
        self.assertEqual(L.strip_tags('{@hit 5} to hit'), '+5 to hit')
        self.assertEqual(L.strip_tags('{@quickref difficult terrain||3}'), 'difficult terrain')
        self.assertEqual(L.strip_tags('{@book chapter 2|PHB|2}'), 'chapter 2')
        self.assertEqual(L.strip_tags('{@atk mw} {@hit 4}'), 'Melee Weapon Attack: +4')

    def test_nested_tags(self):
        self.assertEqual(L.strip_tags('{@b {@spell shield}}'), 'shield')


class RenderTest(unittest.TestCase):
    def test_list_and_table(self):
        entry = {'name': 'X', 'entries': [
            'Intro {@skill Stealth}.',
            {'type': 'list', 'items': [{'type': 'item', 'name': 'A', 'entry': 'first'}, 'plain']},
            {'type': 'table', 'caption': 'T', 'colLabels': ['Lvl', 'Spell'], 'rows': [['1st', '{@spell bless}']]},
            {'type': 'inset', 'entries': ['tip text']},
        ]}
        self.assertEqual(L.entry_text(entry), 'Intro Stealth.\nA: first\nplain\nT\nLvl | Spell\n1st | bless')

    def test_insets_kept_when_asked(self):
        entry = {'entries': [{'type': 'inset', 'entries': ['tip']}]}
        self.assertEqual(L.entry_text(entry, drop_insets=False), 'tip')


class ApplyModTest(unittest.TestCase):
    def base(self):
        return {'name': 'Base', 'entries': [{'name': 'A', 'entries': ['a']}, {'name': 'B', 'entries': ['b']}]}

    def names(self, obj):
        return [e['name'] for e in obj['entries']]

    def test_array_modes(self):
        o = self.base()
        L.apply_mod(o, {'entries': [
            {'mode': 'appendArr', 'items': {'name': 'C'}},
            {'mode': 'prependArr', 'items': [{'name': 'Z'}]},
            {'mode': 'replaceArr', 'replace': 'A', 'items': {'name': 'A2'}},
            {'mode': 'insertArr', 'index': 1, 'items': {'name': 'I'}},
            {'mode': 'removeArr', 'names': 'B'},
            {'mode': 'renameArr', 'renames': {'rename': 'C', 'with': 'C2'}},
        ]})
        self.assertEqual(self.names(o), ['Z', 'I', 'A2', 'C2'])

    def test_replace_by_index_and_regex(self):
        o = self.base()
        L.apply_mod(o, {'entries': [{'mode': 'replaceArr', 'replace': {'index': 1}, 'items': {'name': 'X'}},
                                    {'mode': 'replaceArr', 'replace': {'regex': '^a$', 'flags': 'i'}, 'items': {'name': 'Y'}}]})
        self.assertEqual(self.names(o), ['Y', 'X'])

    def test_replace_or_append_and_if_not_exists(self):
        o = {'trait': ['x']}
        L.apply_mod(o, {'trait': [{'mode': 'appendIfNotExistsArr', 'items': ['x', 'y']},
                                  {'mode': 'replaceOrAppendArr', 'replace': 'missing', 'items': {'name': 'm'}}]})
        self.assertEqual(o['trait'], ['x', 'y', {'name': 'm'}])

    def test_missing_targets_raise_when_strict(self):
        with self.assertRaises(L.ModError):
            L.apply_mod(self.base(), {'entries': {'mode': 'replaceArr', 'replace': 'nope', 'items': {'name': 'x'}}})
        with self.assertRaises(L.ModError):
            L.apply_mod(self.base(), {'entries': {'mode': 'removeArr', 'names': ['nope']}})
        lenient = L.apply_mod(self.base(), {'entries': {'mode': 'removeArr', 'names': ['nope']}}, strict=False)
        self.assertEqual(self.names(lenient), ['A', 'B'])

    def test_replace_txt(self):
        o = {'name': 'Goblin', 'entries': ['The goblin attacks.', {'name': 'goblin trick', 'entries': ['goblin!']}],
             'action': [{'name': 'Bite', 'entries': ['The goblin bites.']}]}
        L.apply_mod(o, {'*': {'mode': 'replaceTxt', 'replace': 'goblin', 'with': 'boggart', 'flags': 'i'}})
        self.assertEqual(o['name'], 'Goblin')  # names are identifiers, not text
        self.assertEqual(o['entries'][0], 'The boggart attacks.')
        self.assertEqual(o['entries'][1], {'name': 'goblin trick', 'entries': ['boggart!']})
        self.assertEqual(o['action'][0]['entries'], ['The boggart bites.'])

    def test_scalars_and_set_prop(self):
        o = {'skill': {'stealth': '+4', 'perception': '+2'}, 'hp': {'average': 10}}
        L.apply_mod(o, {'skill': {'mode': 'scalarAddProp', 'prop': '*', 'scalar': 2},
                        'hp': {'mode': 'scalarMultProp', 'prop': 'average', 'scalar': 1.5, 'floor': True},
                        '_': {'mode': 'setProp', 'prop': 'speed.fly', 'value': 30}})
        self.assertEqual(o['skill'], {'stealth': '+6', 'perception': '+4'})
        self.assertEqual(o['hp'], {'average': 15})
        self.assertEqual(o['speed'], {'fly': 30})

    def test_remove_shorthand_and_unknown_mode(self):
        o = {'name': 'x', 'trait': [1]}
        L.apply_mod(o, {'trait': 'remove'})
        self.assertNotIn('trait', o)
        with self.assertRaises(L.ModError):
            L.apply_mod({'name': 'x'}, {'_': {'mode': 'addSpells', 'spells': {}}})
        L.apply_mod({'name': 'x'}, {'_': {'mode': 'addSpells'}}, strict=False)
        self.assertIn('addSpells', L.UNSUPPORTED_MODES)

    def test_lane_handlers(self):
        seen = []
        L.apply_mod({'name': 'x'}, {'_': {'mode': 'addSkills', 'skills': {'stealth': 1}}},
                    handlers={'addSkills': lambda obj, prop, m: seen.append((prop, m['skills']))})
        self.assertEqual(seen, [('_', {'stealth': 1})])


class ResolveCopyTest(unittest.TestCase):
    parent = {'name': 'Goblin', 'source': 'MPMM', 'page': 15, 'srd': True, 'size': ['S'], 'lineage': 'VRGR',
              'reprintedAs': ['Goblin|XMM'], 'entries': [{'name': 'Nimble', 'entries': ['n']}], '_versions': [{}]}

    def test_child_overrides_and_null_deletes(self):
        child = {'name': 'Boggart', 'source': 'LFL', '_copy': {'name': 'Goblin', 'source': 'MPMM'}, 'lineage': None, 'size': ['M']}
        out = L.resolve_copy(child, lookup_of(self.parent))
        self.assertEqual((out['name'], out['source'], out['size']), ('Boggart', 'LFL', ['M']))
        self.assertNotIn('lineage', out)
        for dropped in ('page', 'srd', 'reprintedAs', '_versions', '_copy'):
            self.assertNotIn(dropped, out)
        self.assertEqual(out['entries'], self.parent['entries'])
        self.assertIsNot(out['entries'], self.parent['entries'])  # deep copy

    def test_preserve_and_mod(self):
        child = {'name': 'B', 'source': 'X', '_copy': {'name': 'goblin', 'source': 'mpmm', '_preserve': {'page': True},
                                                       '_mod': {'entries': {'mode': 'appendArr', 'items': {'name': 'Extra'}}}}}
        out = L.resolve_copy(child, lookup_of(self.parent))
        self.assertEqual(out['page'], 15)
        self.assertEqual([e['name'] for e in out['entries']], ['Nimble', 'Extra'])
        self.assertEqual(len(self.parent['entries']), 1)  # parent untouched

    def test_chains_and_missing_parent(self):
        mid = {'name': 'Mid', 'source': 'M', '_copy': {'name': 'Goblin', 'source': 'MPMM', '_mod': {
            'entries': {'mode': 'appendArr', 'items': {'name': 'MidTrait'}}}}}
        leaf = {'name': 'Leaf', 'source': 'L', '_copy': {'name': 'Mid', 'source': 'M', '_mod': {
            'entries': {'mode': 'removeArr', 'names': 'Nimble'}}}}
        out = L.resolve_copy(leaf, lookup_of(self.parent, mid))
        self.assertEqual([e['name'] for e in out['entries']], ['MidTrait'])
        with self.assertRaises(L.ModError):
            L.resolve_copy(leaf, lookup_of(mid))

    def test_no_copy_returns_copy(self):
        out = L.resolve_copy(self.parent, lookup_of())
        self.assertEqual(out, self.parent)
        self.assertIsNot(out, self.parent)


class VersionsTest(unittest.TestCase):
    def test_plain_versions(self):
        ent = {'name': 'Shifter', 'entries': [{'name': 'Shifting', 'entries': ['base']}], '_versions': [
            {'name': 'Shifter; Beasthide', '_mod': {'entries': {'mode': 'replaceArr', 'replace': 'Shifting',
                                                               'items': {'name': 'Shifting (Beasthide)'}}}}]}
        (v,) = L.expand_versions(ent)
        self.assertEqual(v['name'], 'Shifter; Beasthide')
        self.assertEqual([e['name'] for e in v['entries']], ['Shifting (Beasthide)'])
        self.assertNotIn('_versions', v)

    def test_abstract_versions(self):
        ent = {'name': 'Dragonborn', 'entries': [{'name': 'Breath', 'entries': ['x']}], '_versions': [{
            '_abstract': {'name': 'Dragonborn ({{color}})', '_mod': {'entries': {
                'mode': 'replaceArr', 'replace': 'Breath', 'items': {'name': 'Breath', 'entries': ['{{damageType}} breath']}}}},
            '_implementations': [{'_variables': {'color': 'Red', 'damageType': 'Fire'}, 'resist': ['fire']},
                                 {'_variables': {'color': 'Blue', 'damageType': 'Lightning'}}],
        }]}
        red, blue = L.expand_versions(ent)
        self.assertEqual(red['name'], 'Dragonborn (Red)')
        self.assertEqual(red['entries'][0]['entries'], ['Fire breath'])
        self.assertEqual(red['resist'], ['fire'])
        self.assertEqual(blue['entries'][0]['entries'], ['Lightning breath'])
        self.assertNotIn('resist', blue)


class EditionTest(unittest.TestCase):
    def test_edition_by_publication_date(self):
        dates = {'PHB': '2014-08-19', 'XPHB': '2024-09-17', 'MPMM': '2022-01-18', 'EFA': '2025-11-11'}
        self.assertEqual([L.edition_of(s, dates) for s in ('PHB', 'xphb', 'MPMM', 'EFA', 'UA')],
                         ['2014', '2024', '2014', '2024', '2014'])


class ClassifyTextTest(unittest.TestCase):
    store = {'Darkvision': {'description': 'Old 60 ft text.'},
             'Darkvision [2024]': {'description': 'You have Darkvision with a range of 60 feet.'},
             'Lucky': {'description': 'You are lucky.'}}

    def test_all_branches(self):
        c = lambda n, t, e, a=frozenset(): L.classify_text(n, t, self.store, e, a)  # noqa: E731
        self.assertEqual(c('New Trait', 'x', '2014'), ('new', 'New Trait'))
        self.assertEqual(c('Lucky', 'You are LUCKY!', '2014'), ('reuse', 'Lucky'))
        self.assertEqual(c('Lucky', 'Different.', '2014'), ('conflict', 'Lucky'))
        self.assertEqual(c('Lucky', 'Different.', '2014', {'Lucky'}), ('accept', 'Lucky'))
        self.assertEqual(c('Lucky', 'Different.', '2024'), ('override', 'Lucky [2024]'))
        self.assertEqual(c('Darkvision', 'You have Darkvision with a range of 60 feet', '2024'), ('reuse', 'Darkvision [2024]'))
        self.assertEqual(c('Darkvision', 'Other 2024 text', '2024'), ('conflict', 'Darkvision [2024]'))
        self.assertEqual(c('Darkvision', 'Old 60 ft text', '2014'), ('reuse', 'Darkvision'))


class WriteJsonTest(unittest.TestCase):
    def test_format(self):
        self.assertEqual(L.dumps({'a': ['é']}), '{\n  "a": [\n    "é"\n  ]\n}\n')


class WriteChunksTest(unittest.TestCase):
    def test_one_file_per_source_and_stale_files_removed(self):
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            L.write_chunks('monsters', {'mm': [{'name': 'Goblin'}], 'VGM': [{'name': 'Kobold'}]}, root)
            self.assertEqual(sorted(p.name for p in (root / 'monsters').iterdir()), ['MM.json', 'VGM.json'])
            L.write_chunks('monsters', {'MM': [{'name': 'Goblin'}], 'VGM': []}, root)
            self.assertEqual([p.name for p in (root / 'monsters').iterdir()], ['MM.json'])
            self.assertEqual(json.loads((root / 'monsters' / 'MM.json').read_text()), [{'name': 'Goblin'}])


CACHED = (L.CACHE / 'races.json').exists()


@unittest.skipUnless(CACHED, 'mirror cache not present')
class RealDataTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.races = json.loads((L.CACHE / 'races.json').read_text())
        cls.look = staticmethod(L.make_lookup(cls.races['race']))

    def resolve(self, name, source):
        return L.resolve_copy(self.look(name, source), self.look)

    def test_every_race_resolves_strictly(self):
        for race in self.races['race']:
            L.expand_versions(L.resolve_copy(race, self.look))

    def test_lfl_copies(self):
        boggart = self.resolve('Boggart', 'LFL')
        self.assertEqual([e['name'] for e in boggart['entries'] if isinstance(e, dict)],
                         ['Creature Type', 'Darkvision', 'Fey Ancestry', 'Fury of the Small', 'Nimble Escape'])
        self.assertNotIn('lineage', boggart)
        kithkin = self.resolve('Kithkin', 'LFL')
        self.assertEqual([e['name'] for e in kithkin['entries']][-1], 'Kithkin Lineage')
        lorwyn, shadowmoor = L.expand_versions(self.resolve('Faerie', 'LFL'))
        self.assertNotIn('Faerie Lineage', [e['name'] for e in lorwyn['entries']])
        self.assertEqual(shadowmoor['entries'][0]['name'], 'Darkvision')
        self.assertEqual(shadowmoor['darkvision'], 120)

    def test_lfl_elf_replaces_lineage_table(self):
        elf = self.resolve('Elf', 'LFL')
        text = L.entry_text(next(e for e in elf['entries'] if isinstance(e, dict) and e['name'] == 'Elven Lineage'))
        self.assertIn('Lorwyn | You know the Thorn Whip cantrip', text)
        self.assertNotIn('Drow', text)

    def test_egw_dragonborn_abstract_versions(self):
        # subrace versions apply to the race merged with the subrace (as 5etools renders them)
        draconblood = next(s for s in self.races['subrace'] if s.get('name') == 'Draconblood')
        race = self.look(draconblood['raceName'], draconblood['raceSource'])
        merged = {**draconblood, 'entries': race['entries'] + draconblood['entries']}
        versions = L.expand_versions(merged)
        self.assertGreaterEqual(len(versions), 10)
        self.assertTrue(all('{{' not in json.dumps(v) for v in versions))


@unittest.skipUnless((L.CACHE / 'bestiary' / 'index.json').exists(), 'bestiary cache not present')
class BestiaryCoverageTest(unittest.TestCase):
    def test_only_bestiary_specific_modes_remain(self):
        monsters = [m for f in L.fetch_dir('bestiary').values() for m in f.get('monster', [])]
        look = L.make_lookup(monsters)
        L.UNSUPPORTED_MODES.clear()
        for m in monsters:
            L.expand_versions(L.resolve_copy(m, look, strict=False), strict=False)
        self.assertLessEqual(L.UNSUPPORTED_MODES, {'addSpells', 'replaceSpells', 'removeSpells', 'addSkills', 'addSenses',
                                                   'addSaves', 'addAllSaves', 'addAllSkills', 'scalarAddHit', 'scalarAddDc',
                                                   'maxSize', 'scalarMultXp'})


if __name__ == '__main__':
    unittest.main()
