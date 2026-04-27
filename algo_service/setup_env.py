"""Runtime environment preparation for the AlgoLib service."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path


def ensure_algolib_installed() -> None:
    """Ensure the local ``algolib`` package can be imported by algorithm code."""

    project_root = Path(__file__).resolve().parent.parent
    if str(project_root) not in sys.path:
        sys.path.insert(0, str(project_root))

    try:
        import algolib  # noqa: F401
        return
    except ImportError:
        algolib_path = project_root / "algolib"
        if not algolib_path.exists():
            return
        try:
            subprocess.check_call([
                sys.executable,
                "-m",
                "pip",
                "install",
                "-e",
                str(algolib_path),
            ])
        except subprocess.CalledProcessError:
            if str(project_root) not in sys.path:
                sys.path.insert(0, str(project_root))
