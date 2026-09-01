from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    DATABASE_URL: str
    PROJECT_NAME: str = "classm8 API"
    API_V1_PREFIX: str = "/api/v1"

    model_config = SettingsConfigDict(env_file=".env")


settings = Settings()
