"""Email confirmation with a 6-digit code (02/10/2026).

- user.email_confirmed_at: NULL for an account registered while the email service is on, until it types the
  code sent to its address. The accounts that already exist are confirmed (they keep working as before);
- user.created_at: when the account was created (NULL for the older rows): the accounts never confirmed are
  deleted after 48 hours by `flask ror purge-expired`, so that their email and tax code can be used again;
- email_codes: the code (only its HMAC) waiting for confirmation, one per account.

Revision ID: d4b7e9a2c6f1
Revises: c3f8a1d6e2b9
"""
import sqlalchemy as sa
from alembic import op


revision = 'd4b7e9a2c6f1'
down_revision = 'c3f8a1d6e2b9'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('user', schema=None) as batch_op:
        batch_op.add_column(sa.Column('created_at', sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column('email_confirmed_at', sa.DateTime(), nullable=True))
    op.execute("UPDATE \"user\" SET email_confirmed_at = CURRENT_TIMESTAMP")

    op.create_table(
        'email_codes',
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('email', sa.String(length=255), nullable=False),
        sa.Column('code_hash', sa.String(length=64), nullable=False),
        sa.Column('sent_at', sa.DateTime(), nullable=False),
        sa.Column('expires_at', sa.DateTime(), nullable=False),
        sa.Column('attempts', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['user.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('user_id'),
    )


def downgrade():
    op.drop_table('email_codes')
    with op.batch_alter_table('user', schema=None) as batch_op:
        batch_op.drop_column('email_confirmed_at')
        batch_op.drop_column('created_at')
