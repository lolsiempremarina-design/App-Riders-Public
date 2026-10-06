"""Italian municipalities for the registration page (tax code calculation), from app/data/municipalities.json."""
import json
from functools import lru_cache
from pathlib import Path

from flask import jsonify

from app.api import api_bp

DATA_FILE = Path(__file__).resolve().parent.parent / 'data' / 'municipalities.json'


@lru_cache(maxsize=1)
def load_municipalities():
    """Official ISTAT list (built by scripts/build_municipalities.py): [name, province, cadastral code]."""
    return json.loads(DATA_FILE.read_text(encoding='utf-8'))


@api_bp.get('/municipalities')
def municipalities():
    """Public and identical for everyone: the browser may keep it for a day."""
    response = jsonify(load_municipalities())
    response.headers['Cache-Control'] = 'public, max-age=86400'
    return response
