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

    model_config = SettingsConfigDict(env_file=".env")


settings = Settings()
