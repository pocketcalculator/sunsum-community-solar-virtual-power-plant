from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "SunSum-Solar-MVP.zip"
INCLUDED_FILES = {
    ".dockerignore",
    ".env.example",
    ".gitignore",
    "Dockerfile",
    "README.md",
    "pyproject.toml",
    ".github/workflows/ci.yml",
    "docs/DEMO_TESTING.md",
    "docs/ENGINEERING.md",
    "docs/FRONTEND_HANDOFF.md",
    "scripts/__init__.py",
    "scripts/build_share_package.py",
    "scripts/smoke_test.py",
}
INCLUDED_DIRECTORIES = ("app", "config", "data/sample", "infra", "tests")
EXCLUDED_PARTS = {"__pycache__", ".pytest_cache", ".ruff_cache", ".mypy_cache"}


def package_files() -> list[Path]:
    files = [ROOT / relative_path for relative_path in INCLUDED_FILES]
    for relative_directory in INCLUDED_DIRECTORIES:
        files.extend(path for path in (ROOT / relative_directory).rglob("*") if path.is_file())
    return sorted(
        path
        for path in files
        if not EXCLUDED_PARTS.intersection(path.relative_to(ROOT).parts)
        and path.suffix not in {".pyc", ".db", ".sqlite", ".sqlite3"}
        and path.name != ".DS_Store"
    )


def main() -> None:
    files = package_files()
    missing = sorted(path.relative_to(ROOT).as_posix() for path in files if not path.exists())
    if missing:
        raise FileNotFoundError(f"Missing package files: {', '.join(missing)}")
    with ZipFile(OUTPUT, "w", ZIP_DEFLATED) as archive:
        for path in files:
            archive.write(path, path.relative_to(ROOT).as_posix())
    with ZipFile(OUTPUT) as archive:
        invalid = archive.testzip()
        if invalid:
            raise RuntimeError(f"Invalid archive member: {invalid}")
    print(f"Created {OUTPUT.name} with {len(files)} files ({OUTPUT.stat().st_size} bytes).")


if __name__ == "__main__":
    main()
