from logging.config import fileConfig

from sqlalchemy import engine_from_config, pool

from alembic import context

# --- classm8: metadata y URL desde la app, no desde alembic.ini ---
from src.config import settings
from src.database import Base
import src.models  # noqa: F401  (importa TODOS los modelos -> pobla Base.metadata)

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# La URL sale de backend/.env (vía pydantic-settings), no del .ini.
config.set_main_option("sqlalchemy.url", settings.DATABASE_URL)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    context.configure(
        url=config.get_main_option("sqlalchemy.url"),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
