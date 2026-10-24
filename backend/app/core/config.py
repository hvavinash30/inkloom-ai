import json
from pathlib import Path
from typing import List, Union

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


BASE_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    PROJECT_NAME: str = "Inkloom AI — Brand Governance Platform"
    API_V1_STR: str = "/api/v1"
    ENVIRONMENT: str = "development"
    PORT: int = 8000
    HOST: str = "127.0.0.1"

    CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://inkloom-ai.vercel.app",
    ]

    @field_validator("CORS_ORIGINS", mode="before")
    def assemble_cors_origins(cls, v: Union[str, List[str]]) -> List[str]:
        if isinstance(v, str) and not v.startswith("["):
            return [i.strip() for i in v.split(",") if i.strip()]
        if isinstance(v, str):
            try:
                return json.loads(v)
            except Exception:
                return ["*"]
        return v

    DATABASE_URL: str = "sqlite:///./inkloom.db"
    SUPABASE_URL: str = ""
    SUPABASE_SERVICE_ROLE_KEY: str = ""

    # Demo identity. This build uses an explicit role switcher rather than
    # production authentication; see README for the integration boundary.
    DEMO_MODE: bool = True
    DEFAULT_WORKSPACE_ID: str = "00000000-0000-0000-0000-000000000001"
    DEFAULT_WORKSPACE_NAME: str = "Acme Cloud Technologies"

    # File handling
    UPLOAD_DIR: str = str(BASE_DIR / "data" / "uploads")
    MAX_UPLOAD_BYTES: int = 25 * 1024 * 1024
    MAX_VIDEO_UPLOAD_BYTES: int = 120 * 1024 * 1024
    MAX_PDF_PAGES: int = 120

    # Optional AI integrations
    LLM_PROVIDER: str = "mock"  # mock | openai | gemini
    OPENAI_API_KEY: str = ""
    GEMINI_API_KEY: str = ""
    LLM_MODEL: str = "gpt-4o-mini"
    LLM_TEMPERATURE: float = 0.0
    OCR_PROVIDER: str = "none"  # none | tesseract (not bundled)
    TRANSCRIPTION_PROVIDER: str = "none"  # none | openai_whisper
    FFMPEG_PATH: str = ""

    model_config = SettingsConfigDict(
        env_file=str(BASE_DIR / ".env"),
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="allow",
    )

    @property
    def upload_path(self) -> Path:
        path = Path(self.UPLOAD_DIR)
        path.mkdir(parents=True, exist_ok=True)
        return path

    @property
    def llm_configured(self) -> bool:
        return bool(
            (self.LLM_PROVIDER == "openai" and self.OPENAI_API_KEY)
            or (self.LLM_PROVIDER == "gemini" and self.GEMINI_API_KEY)
        )

    @property
    def ocr_configured(self) -> bool:
        return self.OCR_PROVIDER.lower() == "tesseract"

    @property
    def transcription_configured(self) -> bool:
        return bool(self.TRANSCRIPTION_PROVIDER == "openai_whisper" and self.OPENAI_API_KEY)


settings = Settings()
