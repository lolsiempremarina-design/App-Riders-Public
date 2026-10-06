"""Management commands (`flask ror --help`): admins, password reset, GPX cleanup, retention, SMTP and push tests."""
import click
from flask.cli import AppGroup
from sqlalchemy import func

from app.auth.models import User, user_datastore
from extensions import db

ror_cli = AppGroup('ror', help='RoR management commands.')
TMP_GPX_MAX_AGE_SEC = 7 * 24 * 3600  # a ride in progress (.gpx.tmp) untouched for a week is abandoned
# The GPS worker writes the .gpx just before saving its route: a newer file without a route is not an orphan yet
# (when Docker starts, the worker closes the queued rides while this cleanup runs).
NEW_GPX_GRACE_SEC = 3600


def _user(email):
    user = User.query.filter(func.lower(User.email) == email.strip().lower()).first()
    if user is None:
        raise click.ClickException(f'No user with email {email}.')
    return user


@ror_cli.command('grant-admin')
@click.argument('email')
def grant_admin(email):
    """Give the admin role (access to /web/admin/)."""
    user = _user(email)
    role = user_datastore.find_or_create_role(name='admin', description='Admin Role')
    user_datastore.add_role_to_user(user, role)
    db.session.commit()
    click.echo(f'{user.email} is now an admin.')


@ror_cli.command('reset-password')
@click.argument('email')
def reset_password(email):
    """Set a temporary password (the rider changes it from Profilo) and close all sessions of the account."""
    import re
    import secrets
    import uuid

    from flask_security.utils import hash_password

    from app.messaging.models import DeviceToken
    from extensions import redis_client

    user = _user(email)
    temporary = secrets.token_urlsafe(9)
    user.password = hash_password(temporary)
    # sessions and "remember me" cookies are tied to fs_uniquifier: the old ones stop working, and the
    # phones logged out stop receiving the account's pushes (the app registers again at the next login)
    user.fs_uniquifier = uuid.uuid4().hex
    DeviceToken.query.filter_by(user_id=user.id).delete(synchronize_session=False)
    db.session.commit()
    try:
        for identity in {user.email.lower(), (user.username or '').lower()} - {''}:
            pattern = re.sub(r'([*?\[\]\\])', r'\\\1', identity)  # literal match in the Redis glob
            for key in redis_client.scan_iter(f'login_failures:*:{pattern}'):
                redis_client.delete(key)
    except Exception:  # noqa: BLE001
        click.echo('Could not clear the login lockout (Redis unavailable): it expires by itself in 15 minutes.',
                   err=True)
    click.echo(f'Temporary password for {user.email}: {temporary}')
    click.echo('Give it to the rider in person or by phone; they should change it from Profilo right away.')


@ror_cli.command('confirm-email')
@click.argument('email')
def confirm_email(email):
    """Confirm the email of a new account by hand (the rider did not receive the code: check the address first)."""
    from datetime import datetime, timezone

    user = _user(email)
    if user.email_confirmed_at is not None:
        click.echo(f'{user.email} is already confirmed.')
        return
    user.email_confirmed_at = datetime.now(timezone.utc).replace(tzinfo=None)
    if user.email_code is not None and user.email_code.email.lower() == user.email.lower():
        db.session.delete(user.email_code)
    db.session.commit()
    click.echo(f'{user.email} confirmed: the account can use the app.')


@ror_cli.command('delete-account')
@click.argument('email')
@click.confirmation_option(prompt='Permanently delete this account and all its data?')
def delete_account(email):
    """Delete an account on request (e.g. by email, from the public page /eliminazione-account)."""
    from flask import current_app

    from app.auth.account import delete_user_account

    user = _user(email)
    address = user.email
    # delete_user_account also logs out the current session: it needs a request context
    with current_app.test_request_context():
        delete_user_account(user)
    click.echo(f'{address} deleted with all personal data (delivered orders are kept without the rider).')


@ror_cli.command('cleanup-gpx')
@click.option('--dry-run', is_flag=True, help='Only list the files that would be deleted.')
def cleanup_gpx(dry_run):
    """Delete GPX files not referenced by any route (written over an hour ago) and .gpx.tmp left untouched for a week.

    A .gpx.tmp is the ride in progress: the app keeps a paused session on the phone and the rider can
    resume and end it the next day; with the old 24 hours limit the points before the pause were lost.
    """
    import time
    from pathlib import Path

    from flask import current_app

    from app.auth.models import RiderShift

    root = Path(current_app.config['GPX_STORAGE_DIR'])
    if not root.is_dir():
        raise click.ClickException(f'{root} does not exist.')
    referenced = {Path(p).name for (p,) in db.session.query(RiderShift.gpx_path) if p}
    now = time.time()
    orphans = [
        f for f in root.iterdir()
        if f.is_file() and (
            (f.suffix == '.gpx' and f.name not in referenced and now - f.stat().st_mtime > NEW_GPX_GRACE_SEC)
            or (f.name.endswith('.gpx.tmp') and now - f.stat().st_mtime > TMP_GPX_MAX_AGE_SEC)
        )
    ]
    for f in orphans:
        click.echo(f'{"would delete" if dry_run else "deleting"} {f.name}')
        if not dry_run:
            try:
                f.unlink()
            except OSError as error:
                click.echo(f'  cannot delete: {error}', err=True)
    click.echo(f'{len(orphans)} orphan file(s).')


@ror_cli.command('purge-expired')
@click.option('--dry-run', is_flag=True, help='Only count what would be deleted.')
def purge_expired(dry_run):
    """Apply the retention periods (*_RETENTION_DAYS in .env; 0 = keep) and delete the accounts that never
    confirmed their email (UNCONFIRMED_ACCOUNT_HOURS)."""
    from datetime import datetime, timedelta, timezone
    from pathlib import Path

    from flask import current_app

    from app.auth.email_confirmation import UNCONFIRMED_ACCOUNT_HOURS
    from app.auth.models import EmailCode, FallEvent, RiderShift, SOSAlert
    from app.messaging.models import ChatMessage, DeviceToken, Notification

    config = current_app.config
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    def cutoff(key):
        return now - timedelta(days=config[key]) if config[key] else None

    counts = {}
    for key, model, column in (
        ('NOTIFICATION_RETENTION_DAYS', Notification, Notification.created_at),
        ('SOS_RETENTION_DAYS', SOSAlert, SOSAlert.created_at),
        ('CHAT_RETENTION_DAYS', ChatMessage, ChatMessage.created_at),
    ):
        limit = cutoff(key)
        if limit is None:
            continue
        query = model.query.filter(column < limit)
        counts[model.__tablename__] = query.count()
        if not dry_run:
            query.delete(synchronize_session=False)

    limit = cutoff('ROUTE_RETENTION_DAYS')
    if limit is not None:
        root = Path(config['GPX_STORAGE_DIR']).resolve()
        shifts = RiderShift.query.filter(RiderShift.created_at < limit).all()
        counts['rider_shifts'] = len(shifts)
        if not dry_run:
            for shift in shifts:
                FallEvent.query.filter_by(user_id=shift.user_id, session_id=shift.session_id).delete(
                    synchronize_session=False)
                gpx = Path(shift.gpx_path).resolve() if shift.gpx_path else None
                if gpx is not None and root in gpx.parents:
                    try:
                        gpx.unlink(missing_ok=True)
                    except OSError as error:
                        click.echo(f'cannot delete {gpx.name}: {error}', err=True)
                db.session.delete(shift)
        # falls of sessions never closed (no route): they have the same retention as the routes
        orphan_falls = FallEvent.query.filter(FallEvent.timestamp < limit)
        counts['fall_events'] = orphan_falls.count()
        if not dry_run:
            orphan_falls.delete(synchronize_session=False)

    if config['PUSH_TOKEN_STALE_DAYS']:
        # the app confirms its token at every start: an old one belongs to an uninstalled or unused app
        query = DeviceToken.query.filter(DeviceToken.last_seen_at < cutoff('PUSH_TOKEN_STALE_DAYS'))
        counts['device_tokens'] = query.count()
        if not dry_run:
            query.delete(synchronize_session=False)

    # codes of email changes never confirmed
    query = EmailCode.query.filter(EmailCode.expires_at < now)
    counts['email_codes'] = query.count()
    if not dry_run:
        query.delete(synchronize_session=False)
        db.session.commit()

    # accounts that never typed the code sent to their email: their email and tax code can be used again
    unconfirmed = User.query.filter(User.email_confirmed_at.is_(None),
                                    User.created_at < now - timedelta(hours=UNCONFIRMED_ACCOUNT_HOURS)).all()
    counts['unconfirmed_accounts'] = len(unconfirmed)
    if not dry_run:
        from app.auth.account import delete_user_account

        for user in unconfirmed:
            with current_app.test_request_context():  # delete_user_account also logs out: a request is needed
                delete_user_account(user)
    verb = 'would delete' if dry_run else 'deleted'
    click.echo(', '.join(f'{verb} {n} {name}' for name, n in counts.items()) or 'no retention period configured')


@ror_cli.command('send-test-email')
@click.argument('to')
def send_test_email(to):
    """Check the SMTP settings (MAIL_*) used for the SOS emails."""
    from app.notifications import mail_configured, send_emails

    if not mail_configured():
        raise click.ClickException('MAIL_SERVER and MAIL_FROM are not set: SOS emails are disabled.')
    sent, _failed = send_emails([to], 'RoR — email di prova', 'Le email SOS di RoR sono configurate correttamente.')
    if not sent:
        raise click.ClickException('Sending failed: check the MAIL_* settings and the web logs.')
    click.echo(f'Test email sent to {to}.')


@ror_cli.command('send-test-push')
@click.argument('email')
def send_test_push(email):
    """Send a test push to the Android apps where this account is logged in (checks the Firebase key)."""
    from flask import current_app

    from app.messaging.models import DeviceToken
    from app.push import deliver, push_configured

    if not push_configured():
        raise click.ClickException('FCM_SERVICE_ACCOUNT_FILE is not set or missing: push notifications are disabled.')
    user = _user(email)
    devices = DeviceToken.query.filter_by(user_id=user.id).count()
    if not devices:
        raise click.ClickException(f'{user.email} has no Android app registered (log in from the app first).')
    result = deliver(current_app._get_current_object(), [{
        'user_ids': [user.id], 'category': 'sistema', 'title': 'RoR — notifica di prova',
        'body': 'Le notifiche push di RoR funzionano.', 'link': '/notifiche',
    }])
    click.echo(f"{result['sent']} sent, {result['failed']} failed, {result['removed']} invalid token(s) removed "
               f'({devices} device(s)).')
    if not result['sent']:
        raise click.ClickException('No push delivered: see the web logs.')


@ror_cli.command('revoke-admin')
@click.argument('email')
def revoke_admin(email):
    """Remove the admin role."""
    user = _user(email)
    user_datastore.remove_role_from_user(user, 'admin')
    db.session.commit()
    click.echo(f'{user.email} is no longer an admin.')
