import os
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine, event
from sqlalchemy.engine import make_url
from sqlalchemy.orm import sessionmaker

BACKEND_DIR = Path(__file__).resolve().parents[1]
load_dotenv(BACKEND_DIR / ".env")


def build_engine(database_url: str | None = None):
    url = make_url(database_url or os.getenv("DATABASE_URL", "sqlite:///./data/showcheck.db"))
    if url.drivername.startswith("sqlite"):
        if url.database and url.database != ":memory:":
            path = Path(url.database)
            if not path.is_absolute():
                path = BACKEND_DIR / path
            path.parent.mkdir(parents=True, exist_ok=True)
            url = url.set(database=str(path))
        engine = create_engine(url, connect_args={"check_same_thread": False})

        @event.listens_for(engine, "connect")
        def enable_foreign_keys(connection, _record):
            cursor = connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

        return engine
    return create_engine(url, pool_pre_ping=True)


def build_session_factory(engine):
    return sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)