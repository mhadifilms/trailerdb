"""Master export script that runs all distribution exports.

Usage:
    python scripts/export_all.py
"""

import shutil
import time
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent
DIST_DIR = PROJECT_ROOT / "dist"


def main():
    print("=" * 60)
    print("  TrailerDB - Full Export")
    print("=" * 60)
    print()

    # Clean dist directory (preserve huggingface/kaggle metadata)
    for subdir in ["parquet", "csv"]:
        target = DIST_DIR / subdir
        if target.exists():
            shutil.rmtree(target)
    for gz_file in DIST_DIR.glob("*.gz"):
        gz_file.unlink()
    for db_file in DIST_DIR.glob("*.db"):
        db_file.unlink()

    start = time.time()

    # SQLite export
    print()
    from scripts.export_sqlite import export_sqlite
    export_sqlite()

    # Parquet export
    print()
    from scripts.export_parquet import export_parquet
    export_parquet()

    # CSV export
    print()
    from scripts.export_csv import export_csv
    export_csv()

    elapsed = time.time() - start

    print()
    print("=" * 60)
    print(f"  All exports complete in {elapsed:.1f}s")
    print()

    # Summary of dist/ contents
    total_size = 0
    for f in sorted(DIST_DIR.rglob("*")):
        if f.is_file() and not f.name.startswith("."):
            size = f.stat().st_size
            total_size += size
            rel = f.relative_to(DIST_DIR)
            print(f"  dist/{rel}: {size / 1024 / 1024:.1f} MB")
    print()
    print(f"  Total dist size: {total_size / 1024 / 1024:.1f} MB")
    print("=" * 60)


if __name__ == "__main__":
    main()
