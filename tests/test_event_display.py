"""催事ページの文字表示と、構造化データの内容を維持する。"""

import importlib.util
import json
from html.parser import HTMLParser
from pathlib import Path
import unittest


spec = importlib.util.spec_from_file_location(
    'event_pages', Path(__file__).resolve().parents[1] / 'scripts' / 'generate_event_lps.py',
)
pages = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pages)


class PageReader(HTMLParser):
    def __init__(self, html):
        super().__init__()
        self.schemas = []
        self.in_schema = False
        self.feed(html)

    def handle_starttag(self, tag, attrs):
        if tag == 'script' and dict(attrs).get('type') == 'application/ld+json':
            self.in_schema = True
            self.schemas.append('')

    def handle_endtag(self, tag):
        if tag == 'script':
            self.in_schema = False

    def handle_data(self, data):
        if self.in_schema:
            self.schemas[-1] += data


class EventDisplayTests(unittest.TestCase):
    def render(self, name):
        return pages.render_event_lp({
            'id': 123, 'name': name, 'venue': name, 'address': '確認用住所',
            'area': '九州', 'start': '2026-11-05', 'end': '2026-11-08',
        })

    def test_normal_event_keeps_structured_fields(self):
        schema = json.loads(PageReader(self.render('確認会場')).schemas[0])
        self.assertEqual(schema['@type'], 'Event')
        self.assertEqual(schema['location']['name'], '確認会場')
        self.assertEqual(schema['startDate'], '2026-11-05')
        self.assertIn('eventStatus', schema)
        self.assertIn('organizer', schema)
        self.assertIn('offers', schema)

    def test_venue_punctuation_round_trips_in_json_and_html(self):
        name = '確認会場 <本館> & "東口"'
        html = self.render(name)
        reader = PageReader(html)
        self.assertEqual(len(reader.schemas), 1)
        self.assertEqual(json.loads(reader.schemas[0])['location']['name'], name)
        self.assertIn('確認会場 &lt;本館&gt; &amp; &quot;東口&quot;', html)
        self.assertNotIn('<本館>', html)

    def test_script_delimiter_remains_inside_the_json_value(self):
        name = '確認会場 </script> 本館'
        reader = PageReader(self.render(name))
        self.assertEqual(len(reader.schemas), 1)
        self.assertEqual(json.loads(reader.schemas[0])['location']['name'], name)


if __name__ == '__main__':
    unittest.main()
