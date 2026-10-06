"""Outgoing email (SMTP) used by SOS alerts.

Configured with the MAIL_* settings; when MAIL_SERVER is empty nothing is sent and
callers report it honestly instead of pretending a notification went out.
"""
import smtplib
from email.message import EmailMessage

from flask import current_app

SMTP_TIMEOUT_SEC = 10


def mail_configured():
    config = current_app.config
    return bool(config.get('MAIL_SERVER') and config.get('MAIL_FROM'))


def send_emails(recipients, subject, body):
    """Send one message per recipient (addresses are not disclosed to each other).

    Returns ``(sent, failed)``. Never raises: an emergency flow must not break
    because the mail server is unreachable.
    """
    recipients = [r for r in dict.fromkeys(recipients) if r]
    if not recipients or not mail_configured():
        return 0, 0
    config = current_app.config
    # a header holds one line: a line break (e.g. in a name) made EmailMessage raise and the SOS fail
    subject = ' '.join(str(subject).split())
    sent = failed = 0
    try:
        smtp_class = smtplib.SMTP_SSL if config.get('MAIL_USE_SSL') else smtplib.SMTP
        with smtp_class(config['MAIL_SERVER'], config.get('MAIL_PORT', 587), timeout=SMTP_TIMEOUT_SEC) as smtp:
            if config.get('MAIL_USE_TLS') and not config.get('MAIL_USE_SSL'):
                smtp.starttls()
            if config.get('MAIL_USERNAME'):
                smtp.login(config['MAIL_USERNAME'], config.get('MAIL_PASSWORD', ''))
            for recipient in recipients:
                try:
                    message = EmailMessage()
                    message['From'] = config['MAIL_FROM']
                    message['To'] = recipient
                    message['Subject'] = subject
                    message.set_content(body)
                    smtp.send_message(message)
                    sent += 1
                except (smtplib.SMTPException, ValueError):
                    current_app.logger.exception('Unable to send email to %s', recipient)
                    failed += 1
    except (OSError, smtplib.SMTPException, ValueError):
        current_app.logger.exception('SMTP server unavailable')
        failed = len(recipients) - sent
    return sent, failed
