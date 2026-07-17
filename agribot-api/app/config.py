"""Typed settings from environment / .env."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # SQLite for local dev/tests; PostgreSQL in production (docker-compose / k8s).
    database_url: str = "sqlite:///./agribot.db"
    api_title: str = "AGRIBOT Sensor API"
    api_version: str = "1.0.0"


settings = Settings()
