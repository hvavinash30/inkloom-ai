import json
from pathlib import Path
from typing import List, Optional, Union
from urllib.parse import urlsplit

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
    # Operator-declared durability. Leave unset to infer from the backend:
    # Postgres is treated as durable, SQLite as ephemeral unless it sits on a
    # mounted disk. Set these to true after attaching a Render disk or another
    # persistent volume so health reporting stays honest.
    DATABASE_PERSISTENT: Optional[bool] = None
    UPLOADS_PERSISTENT: Optional[bool] = None

    # Demo identity. A judge (or demo user) signs in as a seeded account; the
    # server issues an expiring bearer token and resolves role/workspace from the
    # database on every request. See README for the production auth boundary.
    DEMO_MODE: bool = True
    SESSION_TTL_HOURS: int = 12
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
    # Request controls for AI-assisted operations. These bound cost and latency
    # and keep the deterministic engine authoritative when a provider fails.
    LLM_TIMEOUT_SECONDS: float = 20.0
    LLM_MAX_OUTPUT_TOKENS: int = 700
    LLM_MAX_INPUT_CHARS: int = 6000
    AI_RATE_LIMIT_PER_MINUTE: int = 12
    # OCR runs locally with RapidOCR (bundled ONNX models, no external service).
    # "auto" uses the engine when its package is installed; "none" disables it.
    OCR_PROVIDER: str = "auto"  # auto | rapidocr | none
    OCR_MAX_PAGES: int = 12
    OCR_RENDER_DPI: int = 150
    OCR_MAX_IMAGE_PIXELS: int = 20_000_000
    OCR_TIMEOUT_SECONDS: float = 60.0
    OCR_MIN_NATIVE_CHARS: int = 12
    OCR_MAX_PAGE_CHARS: int = 40_000
    TRANSCRIPTION_PROVIDER: str = "none"  # none | openai_whisper
    # Speech-to-text runs server-side only. An OpenAI-compatible endpoint is used;
    # keep the key out of the browser and out of logs.
    TRANSCRIPTION_MODEL: str = "whisper-1"
    TRANSCRIPTION_API_BASE: str = "https://api.openai.com/v1"
    TRANSCRIPTION_API_KEY: str = ""  # falls back to OPENAI_API_KEY when empty
    TRANSCRIPTION_TIMEOUT_SECONDS: float = 180.0
    TRANSCRIPTION_MAX_AUDIO_BYTES: int = 24 * 1024 * 1024
    TRANSCRIPTION_LANGUAGE: str = ""  # optional ISO-639-1 hint
    # FFMPEG_PATH overrides the binary. When empty the server uses a system
    # ffmpeg, then the binary bundled by the imageio-ffmpeg package.
    FFMPEG_PATH: str = ""

    # Video frame sampling for on-screen text. Frames are capped and downscaled
    # so a long video cannot turn into hundreds of OCR calls.
    VIDEO_FRAME_INTERVAL_SECONDS: float = 10.0
    VIDEO_MAX_FRAMES: int = 24
    VIDEO_MAX_DURATION_SECONDS: int = 900
    VIDEO_FRAME_MAX_WIDTH: int = 960
    VIDEO_PROCESSING_TIMEOUT_SECONDS: float = 600.0
    VIDEO_MIN_FRAME_TEXT_CHARS: int = 3

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

    # ------------------------------------------------------------------
    # Storage reporting. These helpers never include credentials; health
    # endpoints and logs use them to state what actually persists.
    # ------------------------------------------------------------------
    @property
    def database_scheme(self) -> str:
        return (urlsplit(self.DATABASE_URL).scheme or "").split("+")[0].lower()

    @property
    def database_label(self) -> str:
        """A redacted, human-readable database identifier safe to report."""
        url = urlsplit(self.DATABASE_URL)
        if self.database_scheme.startswith("sqlite"):
            name = Path(url.path or "").name or "inkloom.db"
            return f"sqlite:{name}"
        host = url.hostname or "unknown-host"
        database = (url.path or "").lstrip("/") or "database"
        return f"{self.database_scheme}:{host}/{database}"

    @property
    def database_durable(self) -> bool:
        if self.DATABASE_PERSISTENT is not None:
            return bool(self.DATABASE_PERSISTENT)
        return self.database_scheme.startswith("postgres")

    @property
    def database_durability_note(self) -> str:
        if self.database_durable:
            return (
                "Records are stored in a persistent database and survive service "
                "restarts and redeployments."
            )
        return (
            "Records are stored in a local SQLite file. On an ephemeral instance the file "
            "resets on restart or redeploy and the startup seed recreates the fictional "
            "demo workspace. Configure a Postgres DATABASE_URL or attach a persistent disk "
            "for durable records."
        )

    @property
    def upload_dir_writable(self) -> bool:
        try:
            path = self.upload_path
            probe = path / ".inkloom-write-probe"
            probe.write_text("ok", encoding="utf-8")
            probe.unlink(missing_ok=True)
            return True
        except Exception:
            return False

    @property
    def uploads_durable(self) -> bool:
        if self.UPLOADS_PERSISTENT is not None:
            return bool(self.UPLOADS_PERSISTENT)
        return False

    @property
    def upload_durability_note(self) -> str:
        if self.uploads_durable:
            return (
                "Uploaded files are written to a persistent volume and survive restarts. "
                "Database records and files should be backed up together."
            )
        return (
            "Uploaded files are written to the server filesystem under UPLOAD_DIR. On an "
            "ephemeral instance they are lost on restart or redeploy; the stored database "
            "record then reports that the file is no longer available instead of serving "
            "broken content. Attach a persistent disk or an object store for durable uploads."
        )

    @property
    def llm_configured(self) -> bool:
        return bool(
            (self.LLM_PROVIDER == "openai" and self.OPENAI_API_KEY)
            or (self.LLM_PROVIDER == "gemini" and self.GEMINI_API_KEY)
        )

    @property
    def ai_provider_name(self) -> str:
        """The provider that will actually be called, or 'none'."""
        if self.LLM_PROVIDER == "openai" and self.OPENAI_API_KEY:
            return "openai"
        if self.LLM_PROVIDER == "gemini" and self.GEMINI_API_KEY:
            return "gemini"
        return "none"

    @property
    def ai_status_reason(self) -> str:
        if self.ai_provider_name != "none":
            return (
                f"{self.ai_provider_name} is configured. AI suggestions are reviewed by a "
                "human and never replace the deterministic checks or the approval workflow."
            )
        return (
            f"No AI provider is configured (LLM_PROVIDER={self.LLM_PROVIDER!r} with no matching API key). "
            "AI-assisted suggestions are unavailable; deterministic rule-based suggestions and all "
            "audit checks continue to work."
        )

    @property
    def ocr_configured(self) -> bool:
        if self.OCR_PROVIDER.lower() == "none":
            return False
        try:
            import importlib.util

            return importlib.util.find_spec("rapidocr_onnxruntime") is not None
        except Exception:
            return False

    @property
    def ocr_status_reason(self) -> str:
        if self.OCR_PROVIDER.lower() == "none":
            return "OCR is disabled by configuration (OCR_PROVIDER=none)."
        if self.ocr_configured:
            return (
                "OCR runs locally with RapidOCR on the server. Extracted text feeds the same "
                "deterministic audit engine; visual judgments still require a human reviewer."
            )
        return (
            "The OCR engine is not installed on this server. Images and scanned PDF pages are "
            "stored but cannot be read automatically."
        )

    @property
    def transcription_api_key(self) -> str:
        return self.TRANSCRIPTION_API_KEY or self.OPENAI_API_KEY

    @property
    def transcription_configured(self) -> bool:
        return bool(
            self.TRANSCRIPTION_PROVIDER == "openai_whisper"
            and self.transcription_api_key
        )

    @property
    def transcription_status_reason(self) -> str:
        if self.transcription_configured:
            return (
                "Automatic speech-to-text is enabled. Audio is extracted on the server and sent to the "
                "configured provider; extracted transcripts are stored with the upload."
            )
        if self.TRANSCRIPTION_PROVIDER == "openai_whisper":
            return (
                "TRANSCRIPTION_PROVIDER=openai_whisper is set, but no server-side API key is available "
                "(TRANSCRIPTION_API_KEY or OPENAI_API_KEY). Videos are still processed for on-screen "
                "text; speech is not transcribed."
            )
        return (
            "Automatic speech-to-text is not configured (TRANSCRIPTION_PROVIDER=none). Uploads are "
            "still checked for on-screen text, and a manual transcript can always be supplied."
        )


settings = Settings()
