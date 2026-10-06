"""Tax codes shared with the frontend tests: what the registration form computes, the server must accept."""
import json
from datetime import date
from pathlib import Path

import pytest

from app.auth.tax_id import ODD_VALUES, _check_character, validate_personal_tax_id

CASES = json.loads((Path(__file__).parent / 'data' / 'fiscal_codes.json').read_text(encoding='utf-8'))['cases']


@pytest.mark.parametrize('case', CASES, ids=[c['note'] for c in CASES])
def test_the_codes_computed_by_the_app_are_accepted(case):
    """Before, Ł, Đ, Ø and Æ were dropped by the app and refused by the server: those riders could not register."""
    error = validate_personal_tax_id(case['code'], case['name'], case['surname'],
                                     date.fromisoformat(case['birth_date']), case['gender'])
    assert error is None, f"{case['name']} {case['surname']}: {error}"


def test_a_name_in_another_alphabet_is_still_refused():
    partial = 'XXXXXX90A01H501'
    code = partial + _check_character(partial)  # a valid code: only the name rule can refuse it
    assert set(partial) <= set(ODD_VALUES)
    error = validate_personal_tax_id(code, 'Иван', 'Петров', date(1990, 1, 1), 'M')
    assert error == 'Enter first and last names using Latin letters.'
