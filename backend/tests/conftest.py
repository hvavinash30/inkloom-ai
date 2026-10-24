"""Isolate the test run from the development database and uploads folder."""
import os
import shutil
import tempfile
from pathlib import Path

TEST_ROOT = Path(tempfile.mkdtemp(prefix="inkloom-tests-"))
os.environ["DATABASE_URL"] = f"sqlite:///{(TEST_ROOT / 'test.db').as_posix()}"
os.environ["UPLOAD_DIR"] = str(TEST_ROOT / "uploads")
os.environ["DEMO_MODE"] = "true"


def pytest_sessionfinish(session, exitstatus):
    shutil.rmtree(TEST_ROOT, ignore_errors=True)
