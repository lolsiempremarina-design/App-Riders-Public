"""Messages of the JSON API in the language of the app (Accept-Language), English without it."""
import ast
from pathlib import Path

from app.api.messages import translate
from test_api_auth import VALID_REGISTRATION

APP_DIR = Path(__file__).resolve().parents[1] / 'app'
# where the messages shown by the app are written (the admin panel is in Italian, emails and
# notifications have their own texts)
MESSAGE_SOURCES = [*sorted((APP_DIR / 'api').glob('*.py')), APP_DIR / 'auth' / 'tax_id.py',
                   APP_DIR / 'realtime.py', APP_DIR / 'core' / 'routes.py']
NOT_SHOWN = {'debug', 'info', 'warning', 'error', 'exception', 'critical'}  # logger calls


def _user_messages(path):
    """English sentences of ``path`` (values in f-strings become 5), without docstrings, logs and catalogs."""
    tree = ast.parse(path.read_text(encoding='utf-8'))
    skip = set()
    for node in ast.walk(tree):
        body = getattr(node, 'body', None)
        if isinstance(body, list) and body and isinstance(body[0], ast.Expr) and isinstance(body[0].value, ast.Constant):
            skip.add(id(body[0].value))  # docstring
        is_log = isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute) and node.func.attr in NOT_SHOWN
        is_catalog = isinstance(node, ast.Assign) and any(
            isinstance(target, ast.Name) and target.id in ('MESSAGES', 'PATTERNS') for target in node.targets)
        if is_log or is_catalog:
            skip.update(id(sub) for sub in ast.walk(node))
    for node in ast.walk(tree):
        if id(node) in skip:
            continue
        if isinstance(node, ast.JoinedStr):
            skip.update(id(value) for value in node.values)
            text = ''.join(value.value if isinstance(value, ast.Constant) else '5' for value in node.values)
        elif isinstance(node, ast.Constant) and isinstance(node.value, str):
            text = node.value
        else:
            continue
        if len(text) > 8 and text[0].isupper() and ' ' in text and text[-1] in '.!?' and text.isascii():
            yield text


def test_every_message_of_the_api_has_its_italian_and_spanish_text():
    """A new message without translations makes this test fail (before, the app showed them all in English)."""
    messages = {text for path in MESSAGE_SOURCES for text in _user_messages(path)}
    assert len(messages) > 80
    missing = sorted(text for text in messages if translate(text, 'it') == text or translate(text, 'es') == text)
    assert missing == []


def test_registration_errors_in_the_language_of_the_app(client):
    taken = {**VALID_REGISTRATION, 'password_confirm': 'Diversa-123'}
    italian = client.post('/api/auth/register', json=taken, headers={'Accept-Language': 'it'}).get_json()
    assert italian['message'] == 'Alcuni campi non sono validi.'
    assert italian['fields']['password_confirm'] == 'Le password non coincidono.'

    spanish = client.post('/api/auth/register', json=taken, headers={'Accept-Language': 'es-ES,es;q=0.9'}).get_json()
    assert spanish['fields']['password_confirm'] == 'Las contraseñas no coinciden.'

    for headers in ({}, {'Accept-Language': 'en'}, {'Accept-Language': 'de'}):  # German app: English, like the app
        english = client.post('/api/auth/register', json=taken, headers=headers).get_json()
        assert english['fields']['password_confirm'] == 'Passwords do not match.'


def test_messages_with_values_and_other_errors_are_translated(client):
    assert translate('Password must be at least 8 characters.', 'it') == 'La password deve avere almeno 8 caratteri.'
    assert translate('Cannot go from "accepted" to "delivered".', 'es') == 'No se puede pasar de "accepted" a "delivered".'
    assert translate('Something new.', 'it') == 'Something new.'  # unknown: English rather than nothing

    response = client.get('/api/profile', headers={'Accept-Language': 'es'})
    assert response.status_code == 401 and response.get_json()['message'] == 'Es necesario iniciar sesión.'
    response = client.get('/api/does-not-exist', headers={'Accept-Language': 'it'})
    assert response.status_code == 404 and response.get_json()['message'] == 'Indirizzo non trovato.'
