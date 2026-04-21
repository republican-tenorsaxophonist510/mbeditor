from pydantic_settings import BaseSettings


APP_VERSION = "5.0.0"
GITHUB_REPO = "AAAAAnson/mbeditor"


class Settings(BaseSettings):
    MAX_UPLOAD_SIZE: int = 50 * 1024 * 1024

    model_config = {"env_prefix": ""}


settings = Settings()
