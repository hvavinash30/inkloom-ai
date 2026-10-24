from contextlib import asynccontextmanager
import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.db.session import engine, Base, SessionLocal
from app.api.v1.api import api_router
from app.services.seed_service import seed_demo_workspace

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("inkloom")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: ensure tables exist and seed demo workspace
    logger.info("Initializing Inkloom AI database schema...")
    try:
        Base.metadata.create_all(bind=engine)
        db = SessionLocal()
        try:
            seed_demo_workspace(db)
        finally:
            db.close()
        logger.info("Database schema and demo workspace ready.")
    except Exception as e:
        logger.error(f"Database initialization error: {e}")

    yield

    # Shutdown
    logger.info("Shutting down Inkloom AI Engine.")


app = FastAPI(
    title=settings.PROJECT_NAME,
    description="Enterprise AI brand governance and compliance verification API.",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    lifespan=lifespan
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS if settings.CORS_ORIGINS != ["*"] else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    logger.error(f"Unhandled error processing {request.url.path}: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "An internal server error occurred. Please try again or consult the system logs."}
    )


# Mount API V1
app.include_router(api_router, prefix=settings.API_V1_STR)


@app.get("/")
def root():
    return {
        "name": "Inkloom AI API",
        "version": "1.0.0",
        "docs": "/docs",
        "status": "operational"
    }
