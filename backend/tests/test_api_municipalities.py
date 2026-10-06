"""Municipalities for the registration page, served by the app instead of a third-party site (phase 6.1)."""
import re


def test_municipalities_are_public_and_cacheable(client):
    response = client.get('/api/municipalities')
    assert response.status_code == 200
    assert response.headers['Cache-Control'] == 'public, max-age=86400'
    data = response.get_json()
    assert data['source'].startswith('ISTAT')
    assert re.fullmatch(r'\d{4}-\d{2}-\d{2}', data['updated'])
    rows = data['municipalities']
    assert len(rows) > 7000
    assert all(len(row) == 3 and re.fullmatch(r'[A-Z]\d{3}', row[2]) and len(row[1]) == 2 for row in rows)
    assert len({row[2] for row in rows}) == len(rows)  # one cadastral code per municipality
    by_name = {(row[0], row[1]): row[2] for row in rows}
    assert by_name[('Roma', 'RM')] == 'H501'
    assert by_name[('Milano', 'MI')] == 'F205'
    assert by_name[('Forlì', 'FC')] == 'D704'  # accents decoded from the ISTAT file (Latin-1)
