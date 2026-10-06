"""Build app/data/municipalities.json from the official ISTAT list of Italian municipalities.

The registration page needs name, province and cadastral code of the birth municipality to calculate the
tax code; the app gets them from GET /api/municipalities instead of a third-party site.

Update (from backend/):
    curl -L -o /tmp/comuni.csv https://www.istat.it/storage/codici-unita-amministrative/Elenco-comuni-italiani.csv
    python -m scripts.build_municipalities /tmp/comuni.csv 2024-01-26
(the date is the "last-modified" of the ISTAT file, shown to the users as the data update).
"""
import csv
import json
import sys
from pathlib import Path

OUTPUT = Path(__file__).resolve().parent.parent / 'app' / 'data' / 'municipalities.json'
SOURCE_URL = 'https://www.istat.it/it/archivio/6789'


def _column(header, prefix):
    for index, name in enumerate(header):
        if ' '.join(name.split()).startswith(prefix):
            return index
    raise SystemExit(f'Column "{prefix}" not found in the ISTAT file')


def build(csv_path, updated):
    with open(csv_path, encoding='latin-1', newline='') as handle:
        rows = list(csv.reader(handle, delimiter=';'))
    header, body = rows[0], rows[1:]
    name_col = _column(header, 'Denominazione in italiano')
    province_col = _column(header, 'Sigla automobilistica')
    code_col = _column(header, 'Codice Catastale del comune')
    municipalities = sorted(
        {(row[name_col].strip(), row[province_col].strip(), row[code_col].strip().upper())
         for row in body if len(row) > code_col and row[code_col].strip()},
        key=lambda item: (item[0].lower(), item[1]),
    )
    for name, province, code in municipalities:
        if not (name and len(province) == 2 and len(code) == 4 and code[0].isalpha() and code[1:].isdigit()):
            raise SystemExit(f'Unexpected row: {name!r} {province!r} {code!r}')
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps({
        'source': 'ISTAT - Elenco dei comuni italiani',
        'source_url': SOURCE_URL,
        'updated': updated,
        # [name, province (car plate code), cadastral code]
        'municipalities': [list(item) for item in municipalities],
    }, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    return len(municipalities)


if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit('Usage: python -m scripts.build_municipalities <Elenco-comuni-italiani.csv> <YYYY-MM-DD>')
    print(f'{build(sys.argv[1], sys.argv[2])} municipalities written to {OUTPUT}')
