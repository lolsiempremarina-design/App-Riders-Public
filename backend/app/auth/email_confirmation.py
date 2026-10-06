"""Confirmation of email addresses with a 6-digit code, sent with the SMTP of the SOS emails (MAIL_* in .env).

With the email service on, a new account can use the app only after typing the code sent to its address,
and a new address from the profile replaces the old one only once confirmed. Before, anybody could register
(or move their account) to somebody else's email, and that person could no longer use it. Without SMTP nothing
changes: no code could arrive. Accounts never confirmed are deleted after UNCONFIRMED_ACCOUNT_HOURS by
`flask ror purge-expired`, so that their email and tax code can be used again.
"""
import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone

from flask import current_app

from app.auth.models import EmailCode
from app.messaging.texts import text_language
from app.notifications import mail_configured, send_emails
from extensions import db

CODE_TTL = timedelta(hours=24)
RESEND_AFTER = timedelta(seconds=60)
MAX_ATTEMPTS = 5
UNCONFIRMED_ACCOUNT_HOURS = 48

EMAILS = {
    'it': ('Il tuo codice RoR: {code}',
           'Ciao {name},\n\nil codice per confermare l\'indirizzo email del tuo account RoR è {code}.\n'
           'Scade tra 24 ore.\n\nSe non hai chiesto tu questo codice, ignora il messaggio: senza il codice '
           'l\'indirizzo non viene usato.\n'),
    'en': ('Your RoR code: {code}',
           'Hi {name},\n\nthe code to confirm the email address of your RoR account is {code}.\n'
           'It expires in 24 hours.\n\nIf it was not you, ignore this message: without the code '
           'the address is not used.\n'),
    'es': ('Tu código de RoR: {code}',
           'Hola, {name}:\n\nel código para confirmar la dirección de email de tu cuenta RoR es {code}.\n'
           'Caduca en 24 horas.\n\nSi no has sido tú, ignora este mensaje: sin el código '
           'la dirección no se usa.\n'),
}


def utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def confirmation_required():
    """Codes are asked only when they can be sent."""
    return mail_configured()


def pending_code(user, lock=False):
    """The code waiting for this account; ``lock`` keeps its row locked until the commit (and reads it again)."""
    if lock:
        return db.session.get(EmailCode, user.id, with_for_update=True, populate_existing=True)
    return db.session.get(EmailCode, user.id)


def _hash(user_id, email, code):
    key = current_app.config['SECRET_KEY'].encode()
    return hmac.new(key, f'{user_id}:{email.lower()}:{code}'.encode(), hashlib.sha256).hexdigest()


def resend_wait_sec(user, now=None):
    """Seconds before a new code can be sent to this account (0 = now)."""
    row = pending_code(user)
    if row is None:
        return 0
    wait = (row.sent_at + RESEND_AFTER - (now or utcnow())).total_seconds()
    return max(0, int(wait + 0.999))


def send_code(user, email):
    """New code for ``email`` (it replaces the previous one) and email to that address. True if it left."""
    code = f'{secrets.randbelow(10**6):06d}'
    now = utcnow()
    row = pending_code(user) or EmailCode(user_id=user.id)
    row.email, row.code_hash, row.attempts = email, _hash(user.id, email, code), 0
    row.sent_at, row.expires_at = now, now + CODE_TTL
    db.session.add(row)
    db.session.commit()
    subject, body = EMAILS[text_language(user.language)]
    sent, _failed = send_emails([email], subject.format(code=code),
                                body.format(code=code, name=user.first_name or user.username))
    return sent == 1


def check_code(user, code):
    """'ok', 'wrong', 'expired' (too old or too many attempts: a new one is needed) or 'none'.

    A wrong code counts as an attempt (caller commits). The row stays locked until then: before, codes
    sent together all read the same count of attempts (more than MAX_ATTEMPTS guesses), and the right
    code sent twice (double tap) deleted the row twice, the second time with an error 500.
    """
    row = pending_code(user, lock=True)
    if row is None:
        return 'none'
    if row.expires_at <= utcnow() or row.attempts >= MAX_ATTEMPTS:
        return 'expired'
    if hmac.compare_digest(row.code_hash, _hash(user.id, row.email, code)):
        return 'ok'
    row.attempts += 1
    return 'expired' if row.attempts >= MAX_ATTEMPTS else 'wrong'
