#!/usr/bin/env python3
"""Build the offline choice-effect catalogue from Shinycolors Wiki tables.

Uses only Python's standard library. Cached responses make interrupted updates
resumable; the checked-in catalogue is replaced only after all requests succeed.
"""
import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
import html
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import time
from urllib.parse import quote, unquote, urlencode
from urllib.request import Request, urlopen

WIKI = 'https://shinycolors.wiki'
ROOT = Path(__file__).resolve().parent.parent
CHARACTERS = json.loads((ROOT / 'src/data/choice-characters.json').read_text(encoding='utf-8'))


class Tables(HTMLParser):
    def __init__(self, source=''):
        super().__init__(convert_charrefs=True)
        self.source = source
        self.tables = []
        self.links = set()
        self.stack = []
        self.cell = None
        self.skip = 0

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if 'data-sczh-source' in attrs:
            self.source = attrs['data-sczh-source']
        if tag == 'a' and attrs.get('href', '').startswith('/wiki/P-'):
            self.links.add(unquote(attrs['href'][6:]).replace('_', ' '))
        if tag == 'table':
            self.stack.append({'rows': [], 'row': [], 'source': self.source})
        if not self.stack:
            return
        if tag == 'tr':
            self.stack[-1]['row'] = []
        if tag in ('td', 'th'):
            self.cell = {'text': '', 'rowspan': int(attrs.get('rowspan', 1)),
                         'colspan': int(attrs.get('colspan', 1))}
            self.stack[-1]['row'].append(self.cell)
        if tag == 'sup':
            self.skip += 1
        if tag == 'br' and self.cell:
            self.cell['text'] += ' '

    def handle_endtag(self, tag):
        if tag == 'sup':
            self.skip = max(0, self.skip - 1)
        if not self.stack:
            return
        if tag in ('td', 'th'):
            self.cell = None
        if tag == 'tr':
            self.stack[-1]['rows'].append(self.stack[-1]['row'])
        if tag == 'table':
            self.tables.append(self.stack.pop())
            self.cell = None

    def handle_data(self, data):
        if self.cell is not None and not self.skip:
            self.cell['text'] += data


def grid(rows):
    """Expand merged table cells, including effects shared by three options."""
    pending = {}
    result = []
    for cells in rows:
        row = {col: value for col, (left, value) in pending.items()}
        following = {col: (left - 1, value) for col, (left, value) in pending.items() if left > 1}
        col = 0
        for cell in cells:
            while col in row:
                col += 1
            value = re.sub(r'\s+', ' ', cell['text']).strip()
            for offset in range(cell['colspan']):
                row[col + offset] = value
                if cell['rowspan'] > 1:
                    following[col + offset] = (cell['rowspan'] - 1, value)
            col += cell['colspan']
        result.append([row.get(i, '') for i in range(max(row, default=-1) + 1)])
        pending = following
    return result


def parse_tables(parser):
    groups = []
    for table in parser.tables:
        rows = grid(table['rows'])
        if not rows:
            continue
        headers = [s.lower() for s in rows[0]]
        source = WIKI + '/wiki/' + quote(table['source'].replace(' ', '_'), safe='/')
        character = table['source'].split('/')[0].replace(' ', '_')
        if 'perfect answer' in headers or 'tension up answer' in headers:
            morning = 'perfect answer' in headers
            columns = {'normal answer': 'normal', 'good answer': 'good', 'perfect answer': 'perfect'} if morning else {
                'tension down answer': 'down', 'neutral answer': 'neutral', 'tension up answer': 'up'}
            for row in rows[1:]:
                if len(row) != len(headers):
                    continue
                choices = [{'text': row[index], 'grade': columns[key]} for index, key in enumerate(headers)
                           if key in columns and row[index] and row[index] not in ('?', '???', 'TBA', '-')]
                if len(choices) == 3:
                    group = {'kind': 'morning' if morning else 'audition', 'title': row[0],
                             'source': source, 'choices': choices}
                    if character in CHARACTERS:
                        group['character'] = character
                    groups.append(group)
        elif 'choice' in headers and all(key in headers for key in ('vocal', 'dance', 'visual', 'mental', 'sp')):
            choice_index = headers.index('choice')
            name_index = headers.index('event name') if 'event name' in headers else None
            events = {}
            for row in rows[1:]:
                if len(row) != len(headers):
                    continue
                text = row[choice_index]
                if not text or text in ('---', '—', '-', 'None', 'N/A', 'なし', '?', '???'):
                    continue
                effects = {}
                valid = True
                for key in ('vocal', 'dance', 'visual', 'mental', 'sp'):
                    value = row[headers.index(key)].replace('−', '-').replace('＋', '+').strip()
                    if re.fullmatch(r'[+-]?\d+', value):
                        if int(value):
                            effects[key] = int(value)
                    elif value not in ('', '-', '—', '0'):
                        valid = False
                if valid and effects:
                    name = row[name_index] if name_index is not None else ''
                    events.setdefault(name, []).append({'text': text, 'effects': effects})
            for title, choices in events.items():
                if 2 <= len(choices) <= 3:
                    groups.append({'kind': 'event', 'title': title, 'source': source, 'choices': choices})
    return groups


def apply_corrections(groups, corrections):
    """Preserve verified transcription fixes when rebuilding from the Wiki."""
    for correction in corrections:
        applied = False
        for group in groups:
            if all(group.get(key) == correction[key] for key in ('kind', 'character', 'title')):
                for choice in group['choices']:
                    if choice.get('grade') == correction['grade']:
                        choice['text'] = correction['text']
                        choice['source'] = correction['source']
                        applied = True
        if not applied:
            raise ValueError(f'Correction target missing: {correction}')
    return groups


def fetch(url, cache, delay):
    path = cache / (hashlib.sha256(url.encode()).hexdigest() + '.txt')
    if path.exists():
        return path.read_text(encoding='utf-8')
    for attempt in range(4):
        try:
            req = Request(url, headers={'User-Agent': 'Mozilla/5.0 (compatible; ShinyColorsChoiceCatalogue/1.0)'})
            with urlopen(req, timeout=60) as response:
                text = response.read().decode('utf-8')
            path.write_text(text, encoding='utf-8')
            time.sleep(delay)
            return text
        except Exception:
            if attempt == 3:
                raise
            time.sleep(3 * (attempt + 1))


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--cache', type=Path, default=Path('/tmp/sc-choice-wiki-cache'))
    ap.add_argument('--delay', type=float, default=1.0)
    ap.add_argument('--batch-size', type=int, default=10)
    args = ap.parse_args()
    args.cache.mkdir(parents=True, exist_ok=True)
    listing = Tables()
    listing.feed(fetch(WIKI + '/wiki/Card_List/Produce', args.cache, args.delay))
    cards = sorted(p for p in listing.links if re.match(r'^P-(?:UR|SSR|SR|R)\d+ ', p) and '/' not in p)
    catalogue = json.loads(fetch(WIKI + '/w/api.php?' + urlencode({
        'action': 'query', 'list': 'categorymembers', 'cmtitle': 'Category:Character Commus',
        'cmlimit': 500, 'format': 'json'}), args.cache, args.delay))
    commus = [p['title'] for p in catalogue['query']['categorymembers'] if p['ns'] == 0]
    pages = commus + cards
    if len(commus) < 25 or len(cards) < 300:
        raise ValueError('Wiki page listing is incomplete; refusing to replace the catalogue')
    groups = []
    for offset in range(0, len(pages), args.batch_size):
        batch = pages[offset:offset + args.batch_size]
        text = '\n'.join('<div data-sczh-source="' + html.escape(p, quote=True) + '">\n{{:' + p + '}}\n</div>' for p in batch)
        url = WIKI + '/w/api.php?' + urlencode({'action': 'parse', 'text': text, 'prop': 'text',
            'contentmodel': 'wikitext', 'format': 'json', 'formatversion': 2})
        parsed = json.loads(fetch(url, args.cache, args.delay))
        content = parsed['parse']['text']
        if 'post-expand-template-inclusion' in content or 'mw-parser-output' not in content:
            raise ValueError('Wiki template expansion failed; reduce --batch-size')
        parser = Tables()
        parser.feed(content)
        groups.extend(parse_tables(parser))
        print(f'{min(offset + len(batch), len(pages))}/{len(pages)} pages, {len(groups)} choice groups', flush=True)
    corrections = json.loads((ROOT / 'src/data/choice-effect-corrections.json').read_text(encoding='utf-8'))
    apply_corrections(groups, corrections)
    # Exact duplicates are common where several cards share an event.
    unique = {json.dumps(g, ensure_ascii=False, sort_keys=True): g for g in groups}
    groups = list(unique.values())
    counts = Counter(g['kind'] for g in groups)
    if counts['morning'] < 300 or counts['audition'] < 100 or counts['event'] < 500:
        raise ValueError(f'Too few parsed groups: {counts}; existing catalogue preserved')
    output = {'updatedAt': datetime.now(timezone.utc).date().isoformat(),
              'attribution': 'Shinycolors Wiki contributors',
              'license': 'https://creativecommons.org/licenses/by-nc-sa/4.0/', 'groups': groups}
    target = ROOT / 'src/data/choice-effects.json'
    target.parent.mkdir(exist_ok=True)
    target.with_suffix('.json.tmp').write_text(json.dumps(output, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    target.with_suffix('.json.tmp').replace(target)
    print(f'Saved {target}: {dict(counts)}')


if __name__ == '__main__':
    main()
