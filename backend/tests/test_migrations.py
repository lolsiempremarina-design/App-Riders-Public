"""Every model table must be created by an Alembic migration.

The test suite builds the schema with ``db.create_all()`` on SQLite, so a model
without a migration passes here but breaks on PostgreSQL (e.g. deleting a user
failed because ``bikes`` did not exist).
"""
import re
from pathlib import Path

from extensions import db

MIGRATIONS_DIR = Path(__file__).resolve().parents[1] / 'migrations' / 'versions'

# Created in a loop (not a literal create_table call) by migration e5b8d3f9a2c4_create_map_tables.
TABLES_CREATED_BY_IMPORT = {'stations', 'toilets', 'bicycle_repair', 'bicycle_parkings'}


def test_map_tables_migration_covers_the_map_models():
    text = (MIGRATIONS_DIR / 'e5b8d3f9a2c4_create_map_tables.py').read_text(encoding='utf-8')
    for table in TABLES_CREATED_BY_IMPORT:
        assert f"'{table}':" in text


def _tables_created_by_migrations():
    pattern = re.compile(r"create_table\(\s*['\"]([A-Za-z0-9_]+)['\"]")
    tables = set()
    for path in MIGRATIONS_DIR.glob('*.py'):
        tables.update(pattern.findall(path.read_text(encoding='utf-8')))
    return tables


def test_every_model_table_has_a_migration(app):
    model_tables = set(db.metadata.tables)
    missing = model_tables - _tables_created_by_migrations() - TABLES_CREATED_BY_IMPORT
    assert not missing, f'Tables without an Alembic migration: {sorted(missing)}'


def test_migration_chain_is_linear():
    revisions, parents = set(), []
    for path in MIGRATIONS_DIR.glob('*.py'):
        text = path.read_text(encoding='utf-8')
        revision = re.search(r"^revision\s*=\s*['\"]([^'\"]+)['\"]", text, re.M)
        down = re.search(r"^down_revision\s*=\s*['\"]?([^'\"\n]+)['\"]?", text, re.M)
        if revision:
            revisions.add(revision.group(1))
            parents.append(down.group(1).strip() if down else 'None')
    heads = revisions - set(parents)
    assert len(heads) == 1, f'Expected a single migration head, found {sorted(heads)}'
    assert len(parents) == len(set(parents)), 'Two migrations share the same down_revision'
