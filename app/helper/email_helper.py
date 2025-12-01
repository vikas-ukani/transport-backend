from app.config.settings import settings
from fastapi_mail import ConnectionConfig

emailConfiguration = ConnectionConfig(
    MAIL_SERVER=settings.SMTP_SERVER,
    MAIL_USERNAME=settings.SMTP_USERNAME,
    MAIL_PASSWORD=settings.SMTP_PASSWORD,
    MAIL_FROM=settings.SMTP_FROM,
    MAIL_FROM_NAME=settings.SMTP_FROM_NAME,
    MAIL_PORT=settings.SMTP_PORT,
    MAIL_STARTTLS=True,  # Set to True for STARTTLS
    MAIL_SSL_TLS=False,  # Set to True for SSL/TLS (and adjust port accordingly)
    USE_CREDENTIALS=True,
    VALIDATE_CERTS=False,  # Disable certificate validation
)
