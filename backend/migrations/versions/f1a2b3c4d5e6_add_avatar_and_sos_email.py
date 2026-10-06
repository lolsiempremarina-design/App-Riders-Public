"""Add the profile photo to users and an optional email to SOS contacts.

Revision ID: f1a2b3c4d5e6
Revises: e8a1c4d6f209
"""

import sqlalchemy as sa
from alembic import op


revision = 'f1a2b3c4d5e6'
down_revision = 'e8a1c4d6f209'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('user', sa.Column('avatar', sa.Text(), nullable=True))
    op.add_column('sos_contacts', sa.Column('email', sa.String(length=120), nullable=True))


def downgrade():
    op.drop_column('sos_contacts', 'email')
    op.drop_column('user', 'avatar')
