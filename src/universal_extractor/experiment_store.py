"""SQLite experiment tracking with file-backed extraction artifacts."""
from __future__ import annotations

from contextlib import contextmanager
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import sqlite3
import uuid
from typing import Any, Iterator


SCHEMA_VERSION = 3
RUBRIC_VERSION = "v0.3.0"
_SAFE_ID = re.compile(r"^[A-Za-z0-9_.-]+$")


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class LegacyExperimentStore:
    def __init__(self, root: Path | str):
        self.root = Path(root).expanduser().resolve()
        self.root.mkdir(parents=True, exist_ok=True)
        self.root.chmod(0o700)
        self.artifact_root = self.root / "artifacts"
        self.artifact_root.mkdir(exist_ok=True)
        self.artifact_root.chmod(0o700)
        self.database = self.root / "experiments.sqlite3"
        self.initialize()

    @contextmanager
    def connect(self) -> Iterator[sqlite3.Connection]:
        connection = sqlite3.connect(self.database, timeout=30)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("PRAGMA journal_mode = WAL")
        try:
            yield connection
            connection.commit()
        finally:
            connection.close()

    def initialize(self) -> None:
        with self.connect() as db:
            version = db.execute("PRAGMA user_version").fetchone()[0]
            if version > SCHEMA_VERSION:
                raise RuntimeError(f"Database schema {version} is newer than supported {SCHEMA_VERSION}")
            db.executescript("""
                CREATE TABLE IF NOT EXISTS benchmark_runs (
                    id TEXT PRIMARY KEY, url TEXT NOT NULL, category TEXT NOT NULL,
                    status TEXT NOT NULL, evaluation_mode TEXT NOT NULL,
                    dataset_version TEXT NOT NULL, rubric_version TEXT NOT NULL,
                    repetitions INTEGER NOT NULL, requested_engines_json TEXT NOT NULL,
                    tags_json TEXT NOT NULL, reference_artifact TEXT,
                    reference_metadata_json TEXT NOT NULL DEFAULT '{}',
                    reference_source TEXT, reference_verified INTEGER NOT NULL DEFAULT 0,
                    reference_notes TEXT, error TEXT, cancel_requested INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL, started_at TEXT, completed_at TEXT, updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS engine_results (
                    id INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT NOT NULL,
                    engine TEXT NOT NULL, engine_version TEXT, backend TEXT,
                    state TEXT NOT NULL, extraction_status TEXT, started_at TEXT, completed_at TEXT,
                    latency_seconds REAL, attempts INTEGER NOT NULL DEFAULT 0,
                    successes INTEGER NOT NULL DEFAULT 0, output_chars INTEGER NOT NULL DEFAULT 0,
                    artifact_path TEXT, metadata_json TEXT NOT NULL DEFAULT '{}',
                    final_url TEXT, title TEXT, error TEXT, attempt_details_json TEXT NOT NULL DEFAULT '[]',
                    cpu_seconds REAL, rss_before_bytes INTEGER, rss_after_bytes INTEGER,
                    UNIQUE(run_id, engine), FOREIGN KEY(run_id) REFERENCES benchmark_runs(id) ON DELETE CASCADE
                );
                CREATE TABLE IF NOT EXISTS review_candidates (
                    run_id TEXT NOT NULL, engine_result_id INTEGER NOT NULL,
                    candidate_id TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL,
                    PRIMARY KEY(run_id, engine_result_id),
                    FOREIGN KEY(run_id) REFERENCES benchmark_runs(id) ON DELETE CASCADE,
                    FOREIGN KEY(engine_result_id) REFERENCES engine_results(id) ON DELETE CASCADE
                );
                CREATE TABLE IF NOT EXISTS ai_evaluations (
                    id INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT NOT NULL,
                    engine_result_id INTEGER NOT NULL, candidate_id TEXT NOT NULL,
                    fidelity REAL, completeness REAL, structure REAL, grounding REAL,
                    ai_score REAL, status TEXT NOT NULL, confidence TEXT NOT NULL,
                    missing_json TEXT NOT NULL, unsupported_json TEXT NOT NULL,
                    evidence_json TEXT NOT NULL, notes TEXT NOT NULL,
                    evaluator_model TEXT NOT NULL, prompt_version TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    UNIQUE(run_id, candidate_id),
                    FOREIGN KEY(run_id) REFERENCES benchmark_runs(id) ON DELETE CASCADE,
                    FOREIGN KEY(engine_result_id) REFERENCES engine_results(id) ON DELETE CASCADE
                );
                CREATE TABLE IF NOT EXISTS scores (
                    run_id TEXT NOT NULL, engine_result_id INTEGER NOT NULL,
                    rubric_version TEXT NOT NULL, metadata_score REAL,
                    reliability_score REAL, latency_score REAL, deterministic_score REAL,
                    ai_score REAL, final_score REAL, status TEXT NOT NULL,
                    reasons_json TEXT NOT NULL, updated_at TEXT NOT NULL,
                    PRIMARY KEY(run_id, engine_result_id),
                    FOREIGN KEY(run_id) REFERENCES benchmark_runs(id) ON DELETE CASCADE,
                    FOREIGN KEY(engine_result_id) REFERENCES engine_results(id) ON DELETE CASCADE
                );
                CREATE TABLE IF NOT EXISTS regressions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT NOT NULL,
                    previous_run_id TEXT NOT NULL, engine TEXT NOT NULL,
                    metric TEXT NOT NULL, old_value REAL, new_value REAL,
                    direction TEXT NOT NULL, severity TEXT NOT NULL, details TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    UNIQUE(run_id, previous_run_id, engine, metric)
                );
                CREATE INDEX IF NOT EXISTS idx_runs_category ON benchmark_runs(category, status);
                CREATE INDEX IF NOT EXISTS idx_results_engine ON engine_results(engine, state);
                CREATE INDEX IF NOT EXISTS idx_scores_status ON scores(status);
            """)
            db.execute(f"PRAGMA user_version = {max(version, 1)}")
        self.database.chmod(0o600)

    def create_run(self, *, url: str, category: str, evaluation_mode: str,
                   dataset_version: str, repetitions: int, requested_engines: list[str] | None,
                   tags: list[str], reference: dict | None = None) -> str:
        digest = hashlib.sha256(f"{url}|{category}|{dataset_version}".encode()).hexdigest()[:10]
        run_id = f"br-{digest}-{uuid.uuid4().hex[:12]}"
        reference_path = None
        reference = reference or {}
        if reference.get("content"):
            reference_path = self.write_artifact(run_id, "reference", {
                "content": reference["content"], "metadata": reference.get("metadata", {}),
                "source": reference.get("source", "manual"), "verified": bool(reference.get("verified")),
                "notes": reference.get("notes"),
            })
        now = utc_now()
        with self.connect() as db:
            db.execute("""INSERT INTO benchmark_runs
                (id,url,category,status,evaluation_mode,dataset_version,rubric_version,repetitions,
                 requested_engines_json,tags_json,reference_artifact,reference_metadata_json,
                 reference_source,reference_verified,reference_notes,created_at,updated_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (run_id, url, category, "QUEUED", evaluation_mode, dataset_version, RUBRIC_VERSION,
                 repetitions, json.dumps(requested_engines), json.dumps(tags), reference_path,
                 json.dumps(reference.get("metadata", {})), reference.get("source"),
                 int(bool(reference.get("verified"))), reference.get("notes"), now, now))
        return run_id

    def write_artifact(self, run_id: str, name: str, payload: dict[str, Any]) -> str:
        if not _SAFE_ID.fullmatch(run_id) or not _SAFE_ID.fullmatch(name):
            raise ValueError("Unsafe artifact identifier")
        folder = (self.artifact_root / run_id).resolve()
        if self.artifact_root not in folder.parents:
            raise ValueError("Artifact path escapes storage root")
        folder.mkdir(parents=True, exist_ok=True)
        path = folder / f"{name}.json"
        path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        path.chmod(0o600)
        return str(path.relative_to(self.root))

    def read_artifact(self, relative: str | None) -> dict | None:
        if not relative:
            return None
        path = (self.root / relative).resolve()
        if self.root not in path.parents or not path.is_file():
            raise ValueError("Invalid artifact path")
        return json.loads(path.read_text(encoding="utf-8"))

    def get_run(self, run_id: str) -> dict | None:
        with self.connect() as db:
            row = db.execute("SELECT * FROM benchmark_runs WHERE id=?", (run_id,)).fetchone()
        return self._decode_run(row) if row else None

    def update_run(self, run_id: str, status: str, *, error: str | None = None) -> None:
        now = utc_now()
        start = now if status == "RUNNING" else None
        end = now if status in {"AWAITING_EVALUATION", "COMPLETED", "FAILED", "CANCELLED"} else None
        with self.connect() as db:
            db.execute("""UPDATE benchmark_runs SET status=?, error=COALESCE(?,error),
                started_at=COALESCE(started_at,?), completed_at=COALESCE(?,completed_at), updated_at=? WHERE id=?""",
                       (status, error, start, end, now, run_id))

    def request_cancel(self, run_id: str) -> bool:
        with self.connect() as db:
            changed = db.execute("""UPDATE benchmark_runs SET cancel_requested=1,updated_at=?
                WHERE id=? AND status IN ('QUEUED','RUNNING')""", (utc_now(), run_id)).rowcount
        return bool(changed)

    def is_cancel_requested(self, run_id: str) -> bool:
        with self.connect() as db:
            row = db.execute("SELECT cancel_requested FROM benchmark_runs WHERE id=?", (run_id,)).fetchone()
        return bool(row and row[0])

    def upsert_result(self, run_id: str, engine: str, **values: Any) -> int:
        allowed = {"engine_version", "backend", "state", "extraction_status", "started_at",
                   "completed_at", "latency_seconds", "attempts", "successes", "output_chars",
                   "artifact_path", "metadata_json", "final_url", "title", "error",
                   "attempt_details_json", "cpu_seconds", "rss_before_bytes", "rss_after_bytes"}
        unknown = set(values) - allowed
        if unknown:
            raise ValueError(f"Unknown result fields: {sorted(unknown)}")
        values.setdefault("state", "PENDING")
        columns = ["run_id", "engine", *values]
        params = [run_id, engine, *values.values()]
        updates = ",".join(f"{name}=excluded.{name}" for name in values)
        with self.connect() as db:
            db.execute(f"INSERT INTO engine_results ({','.join(columns)}) VALUES ({','.join('?' for _ in columns)}) "
                       f"ON CONFLICT(run_id,engine) DO UPDATE SET {updates}", params)
            row = db.execute("SELECT id FROM engine_results WHERE run_id=? AND engine=?", (run_id, engine)).fetchone()
        return int(row[0])

    def get_results(self, run_id: str, *, include_artifacts: bool = False) -> list[dict]:
        with self.connect() as db:
            rows = db.execute("""SELECT e.*, s.metadata_score,s.reliability_score,s.latency_score,
                s.deterministic_score,s.ai_score,s.final_score,s.status AS score_status,s.reasons_json,
                a.status AS ai_status,a.confidence AS ai_confidence,a.notes AS ai_notes,
                a.fidelity,a.completeness,a.structure,a.grounding
                FROM engine_results e LEFT JOIN scores s ON s.engine_result_id=e.id
                LEFT JOIN ai_evaluations a ON a.engine_result_id=e.id
                WHERE e.run_id=? ORDER BY e.id""", (run_id,)).fetchall()
        results = []
        for row in rows:
            item = dict(row)
            for key in ("metadata_json", "attempt_details_json", "reasons_json"):
                item[key.removesuffix("_json")] = json.loads(item.pop(key) or ("[]" if key != "metadata_json" else "{}"))
            if include_artifacts:
                item["output"] = self.read_artifact(item.get("artifact_path"))
            results.append(item)
        return results

    def assign_candidate(self, run_id: str, engine_result_id: int) -> str:
        candidate = "C-" + hashlib.sha256(f"v0.3:{run_id}:{engine_result_id}".encode()).hexdigest()[:12]
        with self.connect() as db:
            db.execute("""INSERT OR IGNORE INTO review_candidates
                (run_id,engine_result_id,candidate_id,created_at) VALUES (?,?,?,?)""",
                (run_id, engine_result_id, candidate, utc_now()))
        return candidate

    def candidate_rows(self, run_id: str) -> list[dict]:
        with self.connect() as db:
            rows = db.execute("""SELECT c.candidate_id,c.engine_result_id,e.*
                FROM review_candidates c JOIN engine_results e ON e.id=c.engine_result_id
                WHERE c.run_id=? ORDER BY c.candidate_id""", (run_id,)).fetchall()
        return [dict(row) for row in rows]

    def ai_evaluations(self, run_id: str) -> dict[int, dict]:
        with self.connect() as db:
            rows = db.execute("SELECT * FROM ai_evaluations WHERE run_id=?", (run_id,)).fetchall()
        output = {}
        for row in rows:
            item = dict(row)
            item["evaluation_status"] = item["status"]
            output[item["engine_result_id"]] = item
        return output

    def recover_interrupted(self, limit: int) -> list[str]:
        """Move interrupted work back to QUEUED without creating unbounded work."""
        with self.connect() as db:
            db.execute("""UPDATE benchmark_runs SET status='QUEUED',updated_at=?
                WHERE status='RUNNING'""", (utc_now(),))
            db.execute("UPDATE engine_results SET state='PENDING' WHERE state='RUNNING'")
            rows = db.execute("SELECT id FROM benchmark_runs WHERE status='QUEUED' ORDER BY created_at LIMIT ?",
                              (limit,)).fetchall()
        return [row[0] for row in rows]

    def save_ai_evaluation(self, run_id: str, engine_result_id: int, score: dict) -> None:
        with self.connect() as db:
            db.execute("""INSERT INTO ai_evaluations
                (run_id,engine_result_id,candidate_id,fidelity,completeness,structure,grounding,
                 ai_score,status,confidence,missing_json,unsupported_json,evidence_json,notes,
                 evaluator_model,prompt_version,created_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                ON CONFLICT(run_id,candidate_id) DO UPDATE SET
                 fidelity=excluded.fidelity,completeness=excluded.completeness,
                 structure=excluded.structure,grounding=excluded.grounding,
                 ai_score=excluded.ai_score,status=excluded.status,confidence=excluded.confidence,
                 missing_json=excluded.missing_json,unsupported_json=excluded.unsupported_json,
                 evidence_json=excluded.evidence_json,notes=excluded.notes,
                 evaluator_model=excluded.evaluator_model,prompt_version=excluded.prompt_version,
                 created_at=excluded.created_at""",
                (run_id, engine_result_id, score["candidate_id"], score.get("fidelity"),
                 score.get("completeness"), score.get("structure"), score.get("grounding"),
                 score.get("ai_score"), score["evaluation_status"], score["confidence"],
                 json.dumps(score.get("missing_content", [])),
                 json.dumps(score.get("unsupported_or_fabricated_claims", [])),
                 json.dumps(score.get("evidence", [])), score.get("notes", ""),
                 score.get("evaluator_model", "ChatGPT-manual"),
                 score.get("prompt_version", "chatgpt-v0.3"), utc_now()))

    def save_score(self, run_id: str, result_id: int, **values: Any) -> None:
        with self.connect() as db:
            db.execute("""INSERT INTO scores
                (run_id,engine_result_id,rubric_version,metadata_score,reliability_score,latency_score,
                 deterministic_score,ai_score,final_score,status,reasons_json,updated_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
                ON CONFLICT(run_id,engine_result_id) DO UPDATE SET
                 metadata_score=excluded.metadata_score,reliability_score=excluded.reliability_score,
                 latency_score=excluded.latency_score,deterministic_score=excluded.deterministic_score,
                 ai_score=excluded.ai_score,final_score=excluded.final_score,status=excluded.status,
                 reasons_json=excluded.reasons_json,updated_at=excluded.updated_at""",
                (run_id, result_id, RUBRIC_VERSION, values.get("metadata_score"),
                 values.get("reliability_score"), values.get("latency_score"),
                 values.get("deterministic_score"), values.get("ai_score"), values.get("final_score"),
                 values["status"], json.dumps(values.get("reasons", [])), utc_now()))

    def leaderboard_rows(self, category: str | None = None) -> list[dict]:
        query = """SELECT r.category,e.engine,e.engine_version,e.backend,e.state,e.extraction_status,
            e.attempts,e.successes,e.latency_seconds,s.final_score,s.ai_score,s.deterministic_score,
            s.status AS score_status,a.status AS ai_status
            FROM engine_results e JOIN benchmark_runs r ON r.id=e.run_id
            LEFT JOIN scores s ON s.engine_result_id=e.id
            LEFT JOIN ai_evaluations a ON a.engine_result_id=e.id
            WHERE r.status IN ('AWAITING_EVALUATION','COMPLETED')"""
        params: tuple = ()
        if category:
            query += " AND r.category=?"
            params = (category,)
        with self.connect() as db:
            return [dict(row) for row in db.execute(query, params).fetchall()]

    def previous_comparable_run(self, run: dict) -> dict | None:
        with self.connect() as db:
            row = db.execute("""SELECT * FROM benchmark_runs WHERE id<>? AND url=? AND category=?
                AND dataset_version=? AND rubric_version=? AND created_at<? AND status IN ('AWAITING_EVALUATION','COMPLETED')
                ORDER BY created_at DESC LIMIT 1""",
                (run["id"], run["url"], run["category"], run["dataset_version"], run["rubric_version"],run['created_at'])).fetchone()
        return self._decode_run(row) if row else None

    def latest_run(self, url: str, dataset_version: str) -> dict | None:
        with self.connect() as db:
            row = db.execute("""SELECT * FROM benchmark_runs WHERE url=? AND dataset_version=?
                ORDER BY created_at DESC LIMIT 1""", (url, dataset_version)).fetchone()
        return self._decode_run(row) if row else None

    def replace_regressions(self, run_id: str, rows: list[dict]) -> None:
        with self.connect() as db:
            db.execute("DELETE FROM regressions WHERE run_id=?", (run_id,))
            for row in rows:
                db.execute("""INSERT INTO regressions
                    (run_id,previous_run_id,engine,metric,old_value,new_value,direction,severity,details,created_at)
                    VALUES (?,?,?,?,?,?,?,?,?,?)""",
                    (run_id, row["previous_run_id"], row["engine"], row["metric"],
                     row.get("old_value"), row.get("new_value"), row["direction"],
                     row["severity"], row["details"], utc_now()))

    def get_regressions(self, run_id: str) -> list[dict]:
        with self.connect() as db:
            return [dict(row) for row in db.execute(
                "SELECT * FROM regressions WHERE run_id=? ORDER BY engine,metric", (run_id,)).fetchall()]

    @staticmethod
    def _decode_run(row: sqlite3.Row) -> dict:
        item = dict(row)
        item["requested_engines"] = json.loads(item.pop("requested_engines_json"))
        item["tags"] = json.loads(item.pop("tags_json"))
        item["reference_metadata"] = json.loads(item.pop("reference_metadata_json"))
        item["reference_verified"] = bool(item["reference_verified"])
        item["cancel_requested"] = bool(item["cancel_requested"])
        return item


# Old tables remain compatibility projections; immutable v2 records are authoritative.
from .storage_v2 import HardenedStorage


class ExperimentStore(HardenedStorage, LegacyExperimentStore):
    pass
