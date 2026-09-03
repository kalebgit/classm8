from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    DATABASE_URL: str
    PROJECT_NAME: str = "classm8 API"
    API_V1_PREFIX: str = "/api/v1"

    # --- OAuth / auth ---
    GOOGLE_CLIENT_ID: str
    GOOGLE_CLIENT_SECRET: str
    # A dónde redirige Google después del consentimiento (debe coincidir EXACTO
    # con lo registrado en Google Cloud).
    GOOGLE_REDIRECT_URI: str = "http://localhost:8000/api/v1/auth/google/callback"
    # A dónde mandamos al usuario en el front cuando el login termina bien/mal.
    FRONTEND_LOGIN_SUCCESS_URL: str = "http://localhost:4000/"
    FRONTEND_LOGIN_FAILURE_URL: str = "http://localhost:4000/login?error=oauth"

    # --- Google Classroom (autorización incremental, aparte del login) ---
    # Callback del consentimiento extra para leer Classroom. Debe estar
    # registrado en Google Cloud igual que GOOGLE_REDIRECT_URI.
    GOOGLE_CLASSROOM_REDIRECT_URI: str = (
        "http://localhost:8000/api/v1/classroom/callback"
    )
    # A dónde vuelve el front cuando el usuario termina de conectar Classroom.
    FRONTEND_CLASSROOM_RETURN_URL: str = "http://localhost:4000/"
    # Clave Fernet (urlsafe base64, 32 bytes) para cifrar el refresh_token de
    # Google en la DB. Genera una: python -c "from cryptography.fernet import
    # Fernet; print(Fernet.generate_key().decode())"
    FERNET_KEY: str

    # Firma del JWT propio. GENERA UNO LARGO Y ALEATORIO (ver §6).
    JWT_SECRET: str
    JWT_ALG: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 días

    # Cookie de sesión
    SESSION_COOKIE_NAME: str = "classm8_session"
    # dominio de la cookie en prod, p.ej. ".tudominio.com" para compartir entre
    # app.tudominio.com y api.tudominio.com. En dev déjalo en None.
    SESSION_COOKIE_DOMAIN: str | None = None
    COOKIE_SECURE: bool = False  # True en prod (HTTPS)

    # CORS: orígenes del front permitidos
    CORS_ORIGINS: list[str] = ["http://localhost:4000"]

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
