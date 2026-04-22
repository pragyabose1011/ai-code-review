import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

# Local dev falls back to SQLite; production uses RDS via env vars
_mysql_user = os.getenv("DB_USER")
_mysql_pass = os.getenv("DB_PASSWORD")
_mysql_host = os.getenv("DB_HOST")
_mysql_port = os.getenv("DB_PORT", "3306")
_mysql_name = os.getenv("DB_NAME", "ai_review")

if _mysql_host:
    DATABASE_URL = (
        f"mysql+pymysql://{_mysql_user}:{_mysql_pass}"
        f"@{_mysql_host}:{_mysql_port}/{_mysql_name}"
        f"?charset=utf8mb4"
    )
    engine = create_engine(
        DATABASE_URL,
        pool_size=10,
        max_overflow=20,
        pool_recycle=3600,   # recycle connections before MySQL's wait_timeout
        pool_pre_ping=True,  # verify connection is alive before using it
    )
else:
    # Local dev: SQLite
    _db_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../data/reviews.db"))
    DATABASE_URL = f"sqlite:///{_db_path}"
    engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    from app.models.db_models import User, Review  # noqa: F401
    Base.metadata.create_all(bind=engine)
