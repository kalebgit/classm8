# classm8
```
mi-proyecto/
├── backend/
│   ├── src/
│   │   ├── auth/
│   │   │   ├── __init__.py
│   │   │   ├── router.py          # endpoints de auth
│   │   │   ├── schemas.py         # modelos pydantic
│   │   │   ├── models.py          # modelos SQLAlchemy
│   │   │   ├── service.py         # lógica de negocio
│   │   │   ├── dependencies.py    # dependencias propias del dominio
│   │   │   ├── constants.py
│   │   │   └── exceptions.py
│   │   ├── users/
│   │   │   ├── __init__.py
│   │   │   ├── router.py
│   │   │   ├── schemas.py
│   │   │   ├── models.py
│   │   │   ├── service.py
│   │   │   ├── dependencies.py
│   │   │   ├── constants.py
│   │   │   └── exceptions.py
│   │   ├── items/
│   │   │   └── ... (misma estructura)
│   │   ├── config.py               # BaseSettings global
│   │   ├── database.py             # engine + session factory
│   │   ├── models.py                # Base declarativa compartida
│   │   ├── exceptions.py            # excepciones globales
│   │   └── main.py                  # app FastAPI + monta routers
│   ├── alembic/
│   │   └── versions/
│   ├── alembic.ini
│   ├── pyproject.toml
│   ├── uv.lock
│   ├── Dockerfile
│   ├── .env
│   └── tests/
│       ├── auth/
│       └── users/
├── frontend/
│   ├── src/
│   │   └── app/
│   │       ├── core/
│   │       │   ├── interceptors/
│   │       │   ├── guards/
│   │       │   └── services/
│   │       ├── shared/
│   │       │   ├── components/
│   │       │   └── pipes/
│   │       └── features/
│   │           ├── users/
│   │           └── auth/
│   ├── src/environments/
│   ├── Dockerfile
│   ├── angular.json
│   └── package.json
├── docker-compose.yml
└── README.md
```
