import time
from datetime import datetime
import aiosqlite


class JobTracker:
    """Tracks ingestion progress via the ingestion_log table."""

    def __init__(self, db: aiosqlite.Connection):
        self.db = db
        self._start_time: float | None = None
        self._total: int = 0
        self._completed: int = 0

    async def create_jobs(self, phase: str, imdb_ids: list[str], language: str | None = None):
        """Create pending jobs for a batch of movies. Skips already-existing jobs."""
        await self.db.executemany(
            """INSERT OR IGNORE INTO ingestion_log (phase, imdb_id, language, status)
               VALUES (?, ?, ?, 'pending')""",
            [(phase, imdb_id, language) for imdb_id in imdb_ids],
        )
        await self.db.commit()

    async def get_pending(self, phase: str, language: str | None = None, limit: int = 1000) -> list[dict]:
        """Get next batch of pending or retryable jobs, ordered by movie priority."""
        if language is not None:
            cursor = await self.db.execute(
                """SELECT l.id, l.imdb_id, m.tmdb_id, m.title, m.year, m.priority_rank
                   FROM ingestion_log l
                   JOIN movies m ON m.imdb_id = l.imdb_id
                   WHERE l.phase = ? AND l.language = ?
                     AND (l.status = 'pending' OR (l.status = 'failed' AND l.attempts < 3))
                   ORDER BY m.priority_rank ASC
                   LIMIT ?""",
                (phase, language, limit),
            )
        else:
            cursor = await self.db.execute(
                """SELECT l.id, l.imdb_id, m.tmdb_id, m.title, m.year, m.priority_rank
                   FROM ingestion_log l
                   JOIN movies m ON m.imdb_id = l.imdb_id
                   WHERE l.phase = ? AND l.language IS NULL
                     AND (l.status = 'pending' OR (l.status = 'failed' AND l.attempts < 3))
                   ORDER BY m.priority_rank ASC
                   LIMIT ?""",
                (phase, limit),
            )
        rows = await cursor.fetchall()
        return [dict(r) for r in rows]

    async def mark_in_progress(self, job_id: int):
        await self.db.execute(
            "UPDATE ingestion_log SET status = 'in_progress', attempts = attempts + 1 WHERE id = ?",
            (job_id,),
        )

    async def mark_complete(self, job_id: int):
        await self.db.execute(
            "UPDATE ingestion_log SET status = 'completed', completed_at = datetime('now') WHERE id = ?",
            (job_id,),
        )
        self._completed += 1

    async def mark_failed(self, job_id: int, error: str):
        await self.db.execute(
            "UPDATE ingestion_log SET status = 'failed', error = ? WHERE id = ?",
            (error, job_id),
        )

    async def mark_skipped(self, job_id: int):
        await self.db.execute(
            "UPDATE ingestion_log SET status = 'skipped', completed_at = datetime('now') WHERE id = ?",
            (job_id,),
        )

    async def get_progress(self, phase: str, language: str | None = None) -> dict:
        """Get progress stats for a phase."""
        lang_clause = "AND language = ?" if language else "AND language IS NULL"
        params_base = (phase, language) if language else (phase,)

        total_cursor = await self.db.execute(
            f"SELECT COUNT(*) FROM ingestion_log WHERE phase = ? {lang_clause}",
            params_base,
        )
        total = (await total_cursor.fetchone())[0]

        done_cursor = await self.db.execute(
            f"SELECT COUNT(*) FROM ingestion_log WHERE phase = ? {lang_clause} AND status IN ('completed', 'skipped')",
            params_base,
        )
        done = (await done_cursor.fetchone())[0]

        failed_cursor = await self.db.execute(
            f"SELECT COUNT(*) FROM ingestion_log WHERE phase = ? {lang_clause} AND status = 'failed'",
            params_base,
        )
        failed = (await failed_cursor.fetchone())[0]

        return {"total": total, "done": done, "failed": failed, "remaining": total - done}

    def start_timer(self, total: int):
        self._start_time = time.monotonic()
        self._total = total
        self._completed = 0

    def progress_line(self) -> str:
        if self._start_time is None or self._total == 0:
            return ""
        elapsed = time.monotonic() - self._start_time
        pct = (self._completed / self._total) * 100
        rate = self._completed / elapsed if elapsed > 0 else 0
        remaining = (self._total - self._completed) / rate if rate > 0 else 0
        mins, secs = divmod(int(remaining), 60)
        hours, mins = divmod(mins, 60)
        eta = f"{hours}h {mins:02d}m" if hours else f"{mins}m {secs:02d}s"
        return f"{self._completed:,}/{self._total:,} ({pct:.1f}%) — ETA {eta}"
