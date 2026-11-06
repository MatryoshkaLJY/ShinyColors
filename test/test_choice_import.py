import importlib.util
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


if __name__ == '__main__':
    unittest.main()
