from pydantic_settings import BaseSettings, SettingsConfigDict  # type: ignore
from typing import Literal

class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_ignore_empty=True, extra="ignore"
    )

    APP_NAME: str = "Application Name"
    DEBUG: bool = True
    ENVIRONMENT: Literal["local", "staging", "production"] = "local"

    DATABASE_URL: str = "postgres://USER:PASSWORD@db.prisma.io:5432/?sslmode=require"
    DIRECT_URL: str = "postgres://USER:PASSWORD@db.prisma.io:5432/?sslmode=require"

    ACCESS_TOKEN_EXPIRES_IN_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRES_IN: int = 60
    JWT_ALGORITHM: str = "HS256"

    JWT_SECRET_KEY: str = "Transport App SECRET key"
    JWT_PRIVATE_KEY: str = "Transport App private KEY"
    JWT_PUBLIC_KEY: str = "Transport App public key"

    CLIENT_ORIGIN: str = "*"
    # CLIENT_ORIGIN: str = "http://localhost:8081"

    # MAIL CONFIGURATION
    SMTP_SERVER: str = "sandbox.smtp.mailtrap.io"
    SMTP_PORT: int = 587
    SMTP_USERNAME: str = "username"  # replace with your email
    SMTP_PASSWORD: str = "password"  # replace with your app password
    SMTP_FROM: str = "email@gmail.com"  # replace with your app password
    SMTP_FROM_NAME: str = "from name"  # replace with your app password


settings = Settings()
