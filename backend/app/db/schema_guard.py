"""Additive schema updates for databases created before a column existed.

The project has no migration tool. New tables are created by
``Base.metadata.create_all``; new columns on existing tables are not. This
module applies the small, additive changes that are safe on SQLite and
PostgreSQL so an existing deployment keeps working after an upgrade.
"""
from __future__ import annotations

import logging

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

logger = logging.getLogger("inkloom.db")

# table -> [(column, DDL type)]
ADDITIVE_COLUMNS: dict[str, list[tuple[str, str]]] = {
    "audit_findings": [("source_type", "VARCHAR(20)")],
}


def ensure_columns(engine: Engine) -> list[str]:
    added: list[str] = []
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())
    for table, columns in ADDITIVE_COLUMNS.items():
        if table not in tables:
            continue
        existing = {column["name"] for column in inspector.get_columns(table)}
        for name, ddl in columns:
            if name in existing:
                continue
            with engine.begin() as connection:
                connection.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}"))
            added.append(f"{table}.{name}")
    if added:
        logger.info("Applied additive schema updates: %s", ", ".join(added))
    return added
