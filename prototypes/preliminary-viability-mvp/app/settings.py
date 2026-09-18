from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "SunSum Solar"
    environment: str = "local"
    database_url: str = "sqlite:///./data/sunsum.db"
    upload_dir: Path = Path("data/uploads")
    max_upload_bytes: int = 10 * 1024 * 1024
    azure_maps_key: str | None = None
    azure_maps_client_id: str | None = None
    azure_openai_endpoint: str | None = None
    azure_openai_api_key: str | None = None
    azure_openai_deployment: str | None = None
    azure_openai_api_version: str = "2024-10-21"
    use_azure_identity: bool = False

    model_config = SettingsConfigDict(env_file=".env", env_prefix="SUNSUM_", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()