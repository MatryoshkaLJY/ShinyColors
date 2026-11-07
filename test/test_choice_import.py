import importlib.util
import json
from copy import deepcopy
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('importer', Path(__file__).resolve().parent.parent / 'script/updateChoiceEffects.py')
importer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(importer)


class ImportTest(unittest.TestCase):
    def test_merged_effects_and_blank_cells(self):
        parser = importer.Tables('P-SSR1 Mano')
        parser.feed('''<table><tr><th>Event Name</th><th>Choice</th><th>Vocal</th><th>Dance</th>
        <th>Visual</th><th>Mental</th><th>SP</th></tr>
        <tr><td rowspan="3">event</td><td>choice A</td><td>+20</td><td></td><td></td><td rowspan="3">+5</td><td rowspan="3">+10</td></tr>
        <tr><td>choice B</td><td></td><td>+20</td><td></td></tr>
        <tr><td>choice C</td><td></td><td></td><td>+20</td></tr></table>''')
        groups = importer.parse_tables(parser)
        self.assertEqual(len(groups), 1)
        self.assertEqual(groups[0]['choices'][1]['effects'], {'dance': 20, 'mental': 5, 'sp': 10})
        self.assertEqual(groups[0]['choices'][2]['effects'], {'visual': 20, 'mental': 5, 'sp': 10})

    def test_unknown_values_are_not_imported_as_zero(self):
        parser = importer.Tables('page')
        parser.feed('''<table><tr><th>Event Name</th><th>Choice</th><th>Vocal</th><th>Dance</th><th>Visual</th><th>Mental</th><th>SP</th></tr>
        <tr><td>event</td><td>A</td><td>+20</td><td></td><td></td><td>?</td><td>+10</td></tr></table>''')
        self.assertEqual(importer.parse_tables(parser), [])

    def test_morning_rows_preserve_character_and_verified_corrections(self):
        parser = importer.Tables('Mei Izumi/Commus')
        parser.feed('''<table><tr><th>#</th><th>Normal Answer</th><th>Good Answer</th><th>Perfect Answer</th></tr>
        <tr><td>1</td><td>文句を言っても始まらないぞ</td><td>得意な物からやっていこう</td><td>少しなら教えられるかも</td></tr></table>''')
        groups = importer.parse_tables(parser)
        self.assertEqual(groups[0]['character'], 'Mei_Izumi')
        correction = {'kind': 'morning', 'character': 'Mei_Izumi', 'title': '1', 'grade': 'good',
                      'text': '得意なものからやっていこう', 'source': 'https://wikiwiki.jp/shinycolors/Morningイベント_和泉愛依'}
        importer.apply_corrections(groups, [correction])
        choice = next(c for c in groups[0]['choices'] if c['grade'] == 'good')
        self.assertEqual(choice['text'], correction['text'])
        self.assertEqual(choice['source'], correction['source'])
        with self.assertRaises(ValueError):
            importer.apply_corrections(groups, [{**correction, 'title': '1000'}])

    def test_event_corrections_preserve_effects_and_target_the_verified_card(self):
        source = 'https://shinycolors.wiki/wiki/P-SSR1_Hana'
        group = {'kind': 'event', 'title': 'メモなんだが', 'source': source, 'choices': [
            {'text': '役に立てばいいんだけど', 'effects': {'vocal': 20, 'mental': 5, 'sp': 10}},
            {'text': '羽那のための秘密兵器だ', 'effects': {'dance': 20, 'mental': 5, 'sp': 10}},
            {'text': '飾メモなんだが……', 'effects': {'visual': 20, 'mental': 5, 'sp': 10}}]}
        other_card = deepcopy(group)
        other_card['source'] = 'https://shinycolors.wiki/wiki/another_card'
        other_event = deepcopy(group)
        other_event['title'] = 'another event'
        groups = [deepcopy(group), other_card, other_event]
        correction = {'kind': 'event', 'title': group['title'], 'groupSource': source,
                      'matchText': '飾メモなんだが……', 'text': 'メモなんだが……',
                      'source': 'https://wikiwiki.jp/shinycolors/【Eyes On You】鈴木羽那'}
        importer.apply_corrections(groups, [correction])
        fixed = groups[0]['choices'][2]
        self.assertEqual(fixed['text'], correction['text'])
        self.assertEqual(fixed['source'], correction['source'])
        self.assertEqual(fixed['effects'], group['choices'][2]['effects'])
        self.assertEqual(groups[0]['choices'][:2], group['choices'][:2])
        self.assertEqual(other_card['choices'], group['choices'])
        self.assertEqual(other_event['choices'], group['choices'])
        # Rebuilding also works once the upstream Wiki has fixed its own typo.
        importer.apply_corrections(groups, [correction])
        with self.assertRaises(ValueError):
            importer.apply_corrections(groups, [{**correction, 'matchText': 'unknown', 'text': 'unknown'}])


    def test_amana_audition_correction_is_scoped_and_survives_rebuilds(self):
        corrections = json.loads((Path(__file__).resolve().parent.parent /
            'src/data/choice-effect-corrections.json').read_text(encoding='utf-8'))
        correction = next(c for c in corrections if c['kind'] == 'audition' and c.get('character') == 'Amana_Osaki')
        group = {'kind': 'audition', 'character': 'Amana_Osaki', 'title': '6',
                 'source': correction['groupSource'], 'choices': [
                     {'text': '少し力を抜こう', 'grade': 'down'},
                     {'text': 'その気持ちがあれば大丈夫だ！', 'grade': 'neutral'},
                     {'text': 'これを見てくれ', 'grade': 'up'}]}
        other_character = {**deepcopy(group), 'character': 'Tenka_Osaki'}
        other_title = {**deepcopy(group), 'title': '5'}
        other_source = {**deepcopy(group), 'source': 'another source'}
        groups = [deepcopy(group), other_character, other_title, other_source]
        before = deepcopy(groups)
        importer.apply_corrections(groups, [correction])
        self.assertEqual(groups[0]['choices'][0], {
            'text': '少し力を抜こう！', 'grade': 'down', 'source': correction['source']})
        self.assertEqual(groups[0]['choices'][1:], before[0]['choices'][1:])
        self.assertEqual(groups[1:], before[1:])
        rebuilt = deepcopy(groups)
        importer.apply_corrections(groups, [correction])
        self.assertEqual(groups, rebuilt)


if __name__ == '__main__':
    unittest.main()
