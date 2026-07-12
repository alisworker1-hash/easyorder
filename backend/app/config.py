from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+asyncpg://localhost/easyorder"
    allowed_origins: str = "http://localhost:8042"

    # Managed auth provider (Clerk / Auth0 / Supabase)
    auth_issuer: str = ""
    auth_audience: str = ""
    auth_jwks_url: str = ""
    dev_auth_bypass: bool = False  # DEV ONLY — never enable in production

    # Stripe (server-side only)
    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""

    @property
    def origins(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]


settings = Settings()
