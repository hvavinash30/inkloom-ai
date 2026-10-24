import logging
from pathlib import Path

from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import sessionmaker, declarative_base

from app.core.config import settings

logger = logging.getLogger("inkloom.db")

Base = declarative_base()


def _url_backend() -> str:
    try:
        return make_url(settings.DATABASE_URL).get_backend_name()
    except Exception:
        return "unknown"


def ensure_sqlite_directory() -> None:
    """Create the parent directory for a file-backed SQLite database."""
    try:
        url = make_url(settings.DATABASE_URL)
    except Exception:
        return
    if url.get_backend_name() != "sqlite" or not url.database or url.database == ":memory:":
        return
    parent = Path(url.database).expanduser().parent
    if str(parent) not in ("", "."):
        parent.mkdir(parents=True, exist_ok=True)


def driver_available() -> tuple[bool, str]:
    """Check that a driver exists for the configured database backend."""
    backend = _url_backend()
    if backend == "postgresql":
        try:
            import psycopg  # noqa: F401

            return True, "psycopg"
        except Exception:
            pass
        try:
            import psycopg2  # noqa: F401

            return True, "psycopg2"
        except Exception:
            return (
                False,
                "No PostgreSQL driver is installed. Install 'psycopg[binary]' "
                "before pointing DATABASE_URL at Postgres.",
            )
    return True, backend


ensure_sqlite_directory()
_ok, _driver_message = driver_available()
if not _ok:
    raise RuntimeError(_driver_message)

connect_args = {}
if _url_backend() == "sqlite":
    connect_args = {"check_same_thread": False}

engine = create_engine(
    settings.DATABASE_URL,
    connect_args=connect_args,
    pool_pre_ping=True,
    future=True,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def verify_connection() -> tuple[bool, str]:
    """Run a cheap connectivity check. Returns a safe error label, never a DSN."""
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
        return True, ""
    except Exception as exc:  # noqa: BLE001 - reported by type only
        return False, type(exc).__name__


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()