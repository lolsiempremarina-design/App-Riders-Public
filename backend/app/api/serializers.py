"""Convert database models into JSON-friendly dictionaries."""
from app.auth.models import EmailCode
from app.auth.tax_id import split_legacy_full_name
from extensions import db


def user_to_dict(user):
    first_name = user.first_name
    last_name = user.last_name
    if not first_name or not last_name:
        inferred = split_legacy_full_name(user.full_name or '', user.tax_id_code)
        if inferred:
            first_name, last_name = inferred
    roles = sorted(role.name for role in (user.roles or []))
    code = db.session.get(EmailCode, user.id)
    return {
        'id': user.id,
        'username': user.username,
        'email': user.email,
        # False: the app shows the page where the code sent by email is typed (app/auth/email_confirmation.py)
        'email_confirmed': user.email_confirmed_at is not None,
        # new address of the profile waiting for its code (the old one stays until then)
        'pending_email': code.email if code and code.email.lower() != (user.email or '').lower() else None,
        'first_name': first_name or '',
        'last_name': last_name or '',
        'full_name': user.full_name,
        'phone_number': user.phone_number,
        'tax_id_code': user.tax_id_code,
        'date_of_birth': user.date_of_birth.isoformat() if user.date_of_birth else None,
        'gender': user.gender,
        'birth_city_country': user.birth_city_country,
        'language': user.language,
        'sensors_enabled': bool(user.sensors_enabled),
        'share_location_with_groups': bool(user.share_location_with_groups),
        'avatar': user.avatar,
        'roles': roles,
        'is_admin': 'admin' in roles,
    }


def sos_contact_to_dict(contact):
    return {
        'id': contact.id,
        'name': contact.name,
        'phone': contact.phone,
        'email': contact.email,
        'relationship': contact.relationship,
        'priority': contact.priority,
        'created_at': contact.created_at.isoformat() if contact.created_at else None,
    }
