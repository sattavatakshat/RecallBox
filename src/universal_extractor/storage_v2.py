"""Additive SQLite history, immutable artifacts and durable experiment lineage."""
from __future__ import annotations

from dataclasses import asdict
from contextlib import contextmanager
from contextvars import ContextVar
from datetime import datetime, timezone
import hashlib
from importlib import metadata
import json
import os
from pathlib import Path
import platform
import re
import shutil
import sqlite3
import tempfile
import uuid
from urllib.parse import urlsplit, urlunsplit, parse_qsl


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def encode(value) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)


def digest(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sanitize(value):
    """Conservative redaction; no environment values or browser profiles are collected."""
    if isinstance(value, dict):
        return {k: ("[REDACTED]" if re.search(r"(?i)^(authorization|cookie|set-cookie|password|api[_-]?key|access[_-]?token|secret)$", k)
                    else sanitize(v)) for k, v in value.items()}
    if isinstance(value, list):
        return [sanitize(v) for v in value]
    if isinstance(value, str):
        if value.lstrip().startswith(('{','[')):
            try:return encode(sanitize(json.loads(value)))
            except (ValueError,RecursionError):pass
        value = re.sub(r"(?i)(bearer\s+)[A-Za-z0-9._~+/-]+", r"\1[REDACTED]", value)
        value = re.sub(r"(?i)((?:token|api[_-]?key|password|secret|authorization|cookie)\s*[=:]\s*)[^\s&\"<>]+", r"\1[REDACTED]", value)
        value = re.sub(r"\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b", "[REDACTED_JWT]", value)
    return value


SCHEMA = """
CREATE TABLE IF NOT EXISTS run_snapshots (
 run_id TEXT PRIMARY KEY REFERENCES benchmark_runs(id), captured_at TEXT NOT NULL,
 config_json TEXT NOT NULL CHECK(json_valid(config_json)), environment_json TEXT NOT NULL CHECK(json_valid(environment_json)),
 features_json TEXT NOT NULL CHECK(json_valid(features_json)), rubric_version TEXT NOT NULL,
 rubric_json TEXT NOT NULL CHECK(json_valid(rubric_json)), provenance TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS artifacts (
 id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES benchmark_runs(id), path TEXT NOT NULL UNIQUE,
 sha256 TEXT NOT NULL CHECK(length(sha256)=64), byte_size INTEGER NOT NULL CHECK(byte_size>=0),
 created_at TEXT NOT NULL, kind TEXT NOT NULL, schema_version TEXT NOT NULL, encoding TEXT NOT NULL,
 content_type TEXT NOT NULL, provenance TEXT NOT NULL, UNIQUE(run_id,id));
CREATE TABLE IF NOT EXISTS extraction_attempts (
 id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES benchmark_runs(id), engine TEXT NOT NULL,
 engine_version TEXT, backend TEXT, repetition INTEGER NOT NULL CHECK(repetition>=0),
 state TEXT NOT NULL CHECK(state IN ('RUNNING','COMPLETED','PARTIAL','FAILED','TIMEOUT','SKIPPED','CANCELLED','INTERRUPTED')),
 started_at TEXT NOT NULL, completed_at TEXT, duration_seconds REAL CHECK(duration_seconds>=0),
 extraction_status TEXT, error_type TEXT, error TEXT, artifact_id TEXT,
 output_chars INTEGER CHECK(output_chars>=0), truncation_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(truncation_json)),
 metadata_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(metadata_json)), resources_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(resources_json)),
 provenance TEXT NOT NULL, snapshot_id TEXT REFERENCES run_snapshots(run_id),
 UNIQUE(run_id,id), UNIQUE(run_id,id,artifact_id), FOREIGN KEY(run_id,artifact_id) REFERENCES artifacts(run_id,id));
CREATE TABLE IF NOT EXISTS candidate_bindings (
 candidate_id TEXT PRIMARY KEY, run_id TEXT NOT NULL, attempt_id TEXT NOT NULL, artifact_id TEXT NOT NULL,
 UNIQUE(run_id,candidate_id), UNIQUE(run_id,candidate_id,attempt_id,artifact_id),
 FOREIGN KEY(run_id) REFERENCES benchmark_runs(id),
 FOREIGN KEY(run_id,attempt_id,artifact_id) REFERENCES extraction_attempts(run_id,id,artifact_id),
 FOREIGN KEY(run_id,artifact_id) REFERENCES artifacts(run_id,id));
CREATE TABLE IF NOT EXISTS review_packets (
 run_id TEXT PRIMARY KEY REFERENCES benchmark_runs(id), artifact_id TEXT NOT NULL,
 prompt_version TEXT NOT NULL, prompt_sha256 TEXT NOT NULL, rubric_version TEXT NOT NULL,
 reference_artifact_id TEXT, created_at TEXT NOT NULL,
 FOREIGN KEY(run_id,artifact_id) REFERENCES artifacts(run_id,id),
 FOREIGN KEY(run_id,reference_artifact_id) REFERENCES artifacts(run_id,id));
CREATE TABLE IF NOT EXISTS evaluation_events (
 id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES review_packets(run_id), candidate_id TEXT NOT NULL,
 attempt_id TEXT NOT NULL, artifact_id TEXT NOT NULL, reference_artifact_id TEXT,
 packet_artifact_id TEXT NOT NULL, response_artifact_id TEXT NOT NULL,
 evaluator_type TEXT NOT NULL CHECK(evaluator_type IN ('manual','api','unknown')),
 evaluator_model TEXT, prompt_version TEXT NOT NULL, rubric_version TEXT NOT NULL,
 imported_at TEXT NOT NULL, evaluated_at TEXT, idempotency_key TEXT NOT NULL UNIQUE,
 ai_score REAL CHECK(ai_score BETWEEN 0 AND 60), status TEXT NOT NULL CHECK(status IN ('VERIFIED','PROVISIONAL','INSUFFICIENT_EVIDENCE')),
 score_json TEXT NOT NULL CHECK(json_valid(score_json)),
 UNIQUE(run_id,id),
 FOREIGN KEY(run_id,candidate_id,attempt_id,artifact_id) REFERENCES candidate_bindings(run_id,candidate_id,attempt_id,artifact_id),
 FOREIGN KEY(run_id,reference_artifact_id) REFERENCES artifacts(run_id,id),
 FOREIGN KEY(run_id,packet_artifact_id) REFERENCES artifacts(run_id,id),
 FOREIGN KEY(run_id,response_artifact_id) REFERENCES artifacts(run_id,id));
CREATE TABLE IF NOT EXISTS score_events (
 id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES benchmark_runs(id), engine_result_id INTEGER NOT NULL,
 candidate_id TEXT, evaluation_id TEXT, rubric_version TEXT NOT NULL, calculation_version TEXT NOT NULL,
 created_at TEXT NOT NULL, evidence_json TEXT NOT NULL CHECK(json_valid(evidence_json)),
 score_json TEXT NOT NULL CHECK(json_valid(score_json)), event_hash TEXT NOT NULL UNIQUE,
 FOREIGN KEY(engine_result_id) REFERENCES engine_results(id),
 FOREIGN KEY(run_id,candidate_id) REFERENCES candidate_bindings(run_id,candidate_id),
 FOREIGN KEY(run_id,evaluation_id) REFERENCES evaluation_events(run_id,id));
CREATE TABLE IF NOT EXISTS run_claims (
 run_id TEXT PRIMARY KEY REFERENCES benchmark_runs(id), owner TEXT NOT NULL, claimed_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS run_transitions (
 id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES benchmark_runs(id), state TEXT NOT NULL,
 occurred_at TEXT NOT NULL, error TEXT);
CREATE TABLE IF NOT EXISTS migration_log (
 version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL, details TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS legacy_records (
 source_table TEXT NOT NULL, row_key TEXT NOT NULL, payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
 provenance TEXT NOT NULL, PRIMARY KEY(source_table,row_key));
CREATE INDEX IF NOT EXISTS idx_attempt_history ON extraction_attempts(run_id,engine,repetition);
CREATE INDEX IF NOT EXISTS idx_attempt_version ON extraction_attempts(engine,engine_version,state);
CREATE INDEX IF NOT EXISTS idx_eval_history ON evaluation_events(run_id,candidate_id,imported_at);
CREATE INDEX IF NOT EXISTS idx_scores_context ON score_events(run_id,rubric_version,engine_result_id);
CREATE INDEX IF NOT EXISTS idx_runs_history ON benchmark_runs(url,category,dataset_version,created_at);
CREATE TRIGGER IF NOT EXISTS candidate_context_insert BEFORE INSERT ON review_candidates
 WHEN NOT EXISTS(SELECT 1 FROM engine_results WHERE id=NEW.engine_result_id AND run_id=NEW.run_id)
 BEGIN SELECT RAISE(ABORT,'cross-run candidate'); END;
CREATE TRIGGER IF NOT EXISTS candidate_context_update BEFORE UPDATE ON review_candidates
 WHEN NOT EXISTS(SELECT 1 FROM engine_results WHERE id=NEW.engine_result_id AND run_id=NEW.run_id)
 BEGIN SELECT RAISE(ABORT,'cross-run candidate'); END;
CREATE TRIGGER IF NOT EXISTS score_context_insert BEFORE INSERT ON scores
 WHEN NOT EXISTS(SELECT 1 FROM engine_results WHERE id=NEW.engine_result_id AND run_id=NEW.run_id)
 BEGIN SELECT RAISE(ABORT,'cross-run score'); END;
CREATE TRIGGER IF NOT EXISTS score_context_update BEFORE UPDATE ON scores
 WHEN NOT EXISTS(SELECT 1 FROM engine_results WHERE id=NEW.engine_result_id AND run_id=NEW.run_id)
 BEGIN SELECT RAISE(ABORT,'cross-run score'); END;
"""


class ArtifactIntegrityError(ValueError):
    pass


class HardenedStorage:
    @contextmanager
    def connect(self):
        context=getattr(self,'_connection_context',None)
        current=context.get() if context else None
        if current is not None:
            yield current
        else:
            with super().connect() as db:yield db

    @contextmanager
    def transaction(self):
        active=self._connection_context.get()
        if active is not None:
            yield active
            return
        with super().connect() as db:
            db.execute('BEGIN IMMEDIATE')
            token=self._connection_context.set(db)
            try:yield db
            finally:self._connection_context.reset(token)

    def initialize(self):
        self._connection_context=ContextVar('store_connection',default=None)
        if self.database.exists():
            with sqlite3.connect(self.database) as db:
                version = db.execute('PRAGMA user_version').fetchone()[0]
                if version < 3:
                    backup = self.root / 'backups' / now().replace(':', '-')
                    backup.mkdir(parents=True, exist_ok=False,mode=0o700)
                    with sqlite3.connect(backup / 'experiments.sqlite3') as target:
                        db.backup(target)
                    (backup/'experiments.sqlite3').chmod(0o600)
                    shutil.copytree(self.artifact_root, backup / 'artifacts')
        super().initialize()
        with self.connect() as db:
            version = db.execute('PRAGMA user_version').fetchone()[0]
            if version < 2:
                db.executescript('BEGIN IMMEDIATE;\n' + SCHEMA)
                for source in ('benchmark_runs','engine_results','review_candidates','ai_evaluations','scores','regressions'):
                    for row in db.execute(f'SELECT rowid AS source_rowid,* FROM {source}').fetchall():
                        db.execute('INSERT INTO legacy_records VALUES (?,?,?,?)',(source,str(row['source_rowid']),encode(dict(row)),'legacy_unknown'))
                for table in ('run_snapshots','artifacts','candidate_bindings','review_packets','evaluation_events','score_events','legacy_records','run_transitions'):
                    for operation in ('UPDATE','DELETE'):
                        db.execute(f"CREATE TRIGGER IF NOT EXISTS immutable_{table}_{operation} BEFORE {operation} ON {table} BEGIN SELECT RAISE(ABORT,'immutable history'); END")
                db.execute("CREATE TRIGGER IF NOT EXISTS terminal_attempt_update BEFORE UPDATE ON extraction_attempts WHEN OLD.state!='RUNNING' BEGIN SELECT RAISE(ABORT,'terminal attempt is immutable'); END")
                db.execute("CREATE TRIGGER IF NOT EXISTS terminal_attempt_delete BEFORE DELETE ON extraction_attempts BEGIN SELECT RAISE(ABORT,'attempt history is immutable'); END")
                db.execute('CREATE UNIQUE INDEX IF NOT EXISTS idx_single_benchmark_worker ON run_claims((1))')
                db.execute("CREATE TRIGGER IF NOT EXISTS score_event_context BEFORE INSERT ON score_events WHEN NOT EXISTS(SELECT 1 FROM engine_results WHERE id=NEW.engine_result_id AND run_id=NEW.run_id) BEGIN SELECT RAISE(ABORT,'cross-run score history'); END")
                for operation in ('INSERT','UPDATE'):
                    db.execute(f"CREATE TRIGGER IF NOT EXISTS ai_context_{operation} BEFORE {operation} ON ai_evaluations WHEN NOT EXISTS(SELECT 1 FROM review_candidates c WHERE c.run_id=NEW.run_id AND c.engine_result_id=NEW.engine_result_id AND c.candidate_id=NEW.candidate_id) BEGIN SELECT RAISE(ABORT,'cross-run legacy evaluation'); END")
                    db.execute(f"CREATE TRIGGER IF NOT EXISTS result_values_{operation} BEFORE {operation} ON engine_results WHEN NEW.attempts<0 OR NEW.successes<0 OR NEW.successes>NEW.attempts OR NEW.latency_seconds<0 OR NOT json_valid(NEW.metadata_json) OR NOT json_valid(NEW.attempt_details_json) BEGIN SELECT RAISE(ABORT,'invalid engine measurements'); END")
                    db.execute(f"CREATE TRIGGER IF NOT EXISTS run_values_{operation} BEFORE {operation} ON benchmark_runs WHEN julianday(NEW.created_at) IS NULL OR julianday(NEW.updated_at) IS NULL OR NEW.repetitions<1 OR NEW.status NOT IN ('PENDING','QUEUED','RUNNING','PARTIAL','AWAITING_EVALUATION','COMPLETED','FAILED','CANCELLED','INTERRUPTED') BEGIN SELECT RAISE(ABORT,'invalid benchmark values'); END")
                    db.execute(f"CREATE TRIGGER IF NOT EXISTS regression_context_{operation} BEFORE {operation} ON regressions WHEN NOT EXISTS(SELECT 1 FROM benchmark_runs WHERE id=NEW.run_id) OR NOT EXISTS(SELECT 1 FROM benchmark_runs WHERE id=NEW.previous_run_id) BEGIN SELECT RAISE(ABORT,'invalid regression parents'); END")
                db.execute("INSERT INTO migration_log VALUES (2,?,?)", (now(),'Additive history; legacy tables and artifacts preserved; unknown historical snapshots remain absent'))
                db.execute('PRAGMA user_version=2')
        with self.connect() as db:
            if db.execute('PRAGMA user_version').fetchone()[0]<3:
                db.executescript("""BEGIN IMMEDIATE;
CREATE TRIGGER IF NOT EXISTS attempt_snapshot_context BEFORE INSERT ON extraction_attempts
 WHEN NEW.snapshot_id IS NOT NULL AND NEW.snapshot_id!=NEW.run_id
 BEGIN SELECT RAISE(ABORT,'cross-run configuration snapshot'); END;
CREATE TRIGGER IF NOT EXISTS attempt_timestamp_insert BEFORE INSERT ON extraction_attempts
 WHEN julianday(NEW.started_at) IS NULL OR (NEW.completed_at IS NOT NULL AND julianday(NEW.completed_at) IS NULL)
 BEGIN SELECT RAISE(ABORT,'invalid attempt timestamps'); END;
CREATE TRIGGER IF NOT EXISTS attempt_timestamp_update BEFORE UPDATE ON extraction_attempts
 WHEN NEW.completed_at IS NOT NULL AND (julianday(NEW.completed_at) IS NULL OR julianday(NEW.completed_at)<julianday(NEW.started_at))
 BEGIN SELECT RAISE(ABORT,'invalid attempt completion'); END;
CREATE TRIGGER IF NOT EXISTS evaluation_packet_context BEFORE INSERT ON evaluation_events
 WHEN NOT EXISTS(SELECT 1 FROM review_packets p WHERE p.run_id=NEW.run_id AND p.artifact_id=NEW.packet_artifact_id
 AND p.reference_artifact_id IS NEW.reference_artifact_id AND p.prompt_version=NEW.prompt_version AND p.rubric_version=NEW.rubric_version)
 BEGIN SELECT RAISE(ABORT,'evaluation packet/reference context mismatch'); END;
CREATE TRIGGER IF NOT EXISTS score_evaluation_context BEFORE INSERT ON score_events
 WHEN NEW.evaluation_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM evaluation_events v
 JOIN extraction_attempts a ON a.id=v.attempt_id JOIN engine_results e ON e.engine=a.engine AND e.run_id=a.run_id
 WHERE v.id=NEW.evaluation_id AND v.run_id=NEW.run_id AND v.candidate_id=NEW.candidate_id
 AND v.rubric_version=NEW.rubric_version AND e.id=NEW.engine_result_id)
 BEGIN SELECT RAISE(ABORT,'score/evaluation engine context mismatch'); END;
""")
                for metric in ('fidelity','completeness','structure','grounding'):
                    db.execute(f"CREATE TRIGGER IF NOT EXISTS rating_{metric} BEFORE INSERT ON evaluation_events WHEN json_extract(NEW.score_json,'$.{metric}')<0 OR json_extract(NEW.score_json,'$.{metric}')>5 OR json_type(NEW.score_json,'$.{metric}') IN ('true','false') BEGIN SELECT RAISE(ABORT,'invalid AI dimension'); END")
                db.execute('INSERT INTO migration_log VALUES (3,?,?)',(now(),'Additional snapshot, timestamp, packet/reference and score/evaluation context guards'))
                db.execute('PRAGMA user_version=3')
        self._register_legacy_artifacts()

    def _register_legacy_artifacts(self):
        # Register existing bytes without changing files, timestamps, or old result rows.
        with self.connect() as db:
            paths = db.execute("SELECT id,reference_artifact AS path FROM benchmark_runs WHERE reference_artifact IS NOT NULL UNION SELECT run_id,artifact_path FROM engine_results WHERE artifact_path IS NOT NULL").fetchall()
            for row in paths:
                if db.execute('SELECT 1 FROM artifacts WHERE path=?',(row['path'],)).fetchone():
                    continue
                path=(self.root/row['path']).resolve()
                if self.root not in path.parents or not path.is_file():
                    continue
                data=path.read_bytes()
                db.execute('INSERT INTO artifacts VALUES (?,?,?,?,?,?,?,?,?,?,?)',
                           ('legacy-'+uuid.uuid4().hex,row['id'],row['path'],digest(data),len(data),now(),'legacy','unknown','utf-8','application/json','legacy_unknown'))

    def create_run(self,**kwargs):
        with self.transaction():
            return self._create_run(**kwargs)

    def _create_run(self, *, settings=None, dataset_id=None, dataset_manifest_sha256=None,
                   limitations=None,category_source='url_or_explicit_hint', **kwargs):
        from .config import Settings
        from .capabilities import engine_capabilities
        from .router import platform_for
        from .scoring import AI_WEIGHTS,LATENCY_TARGETS
        from . import __version__
        settings=settings or Settings.from_env()
        url=kwargs['url'];parsed=urlsplit(url)
        for key,_ in parse_qsl(parsed.query):
            if re.search(r'(?i)token|password|secret|api[_-]?key|signature|cookie',key):
                raise ValueError('Credential-bearing benchmark URLs are not persisted; use an authorized public URL')
        reference=kwargs.pop('reference',None)
        run_id=super().create_run(reference=None,**kwargs)
        caps={name:cap.model_dump() for name,cap in engine_capabilities(settings).items()}
        config=asdict(settings);config.pop('benchmark_data_dir',None)
        config.update({'requested_engines':kwargs['requested_engines'],'repetitions':kwargs['repetitions'],
                       'heavy_concurrency':1,'dataset_id':dataset_id,'dataset_version':kwargs['dataset_version'],
                       'normalization_version':'storage-v2','engine_availability':caps,'category_source':category_source,
                       'dataset_manifest_sha256':dataset_manifest_sha256,'limitations':limitations})
        versions={}
        for package in ('fastapi','httpx','beautifulsoup4','trafilatura','crawl4ai','playwright','patchright','docling','docling-ibm-models','torch','tld','openai'):
            try:versions[package]=metadata.version(package)
            except metadata.PackageNotFoundError:versions[package]=None
        environment={'python':platform.python_version(),'os':platform.system(),'architecture':platform.machine(),
                     'framework_version':__version__,'code_sha256':digest(b''.join(p.read_bytes() for p in sorted(Path(__file__).parent.rglob('*.py')))),
                     'packages':versions,'tools':caps,
                     'browser_version':{'cached_chromium_builds':[p.name for p in (Path.home()/'Library/Caches/ms-playwright').glob('chromium-*')]},
                     'adapter_version':'storage-v2','captured_at':now()}
        normalized=urlunsplit((parsed.scheme.lower(),parsed.netloc.lower(),parsed.path or '/',parsed.query,''))
        try:
            from tld import get_fld
            domain=get_fld(url,fail_silently=True)
        except ImportError:domain=None
        features={'schema_version':'url-v1','captured_at':now(),'stage':'before_extraction','url_scheme':parsed.scheme.lower(),
                  'hostname':(parsed.hostname or '').lower().rstrip('.'),'normalized_url':normalized,
                  'registrable_domain':domain,'domain_policy':'tld-bundled-list' if domain else 'unknown',
                  'path_length':len(parsed.path),'path_depth':len([p for p in parsed.path.split('/') if p]),
                  'file_extension':Path(parsed.path).suffix.lower(),'query_parameter_count':len(parse_qsl(parsed.query)),
                  'category':kwargs['category'],'category_source':category_source,'platform':platform_for(url),
                  'observed_content_type':None,'http_metadata':None,'engine_availability':caps}
        with self.connect() as db:
            db.execute('INSERT INTO run_snapshots VALUES (?,?,?,?,?,?,?,?)',
                       (run_id,now(),encode(sanitize(config)),encode(environment),encode(features),'v0.3.0',
                        encode({'ai_weights':AI_WEIGHTS,'metadata_points':10,'reliability_points':20,'latency_points':10,'latency_targets':LATENCY_TARGETS}), 'captured_before_extraction'))
        if reference:
            path=self.write_artifact(run_id,'reference',reference)
            with self.connect() as db:
                db.execute('UPDATE benchmark_runs SET reference_artifact=?,reference_metadata_json=?,reference_source=?,reference_verified=?,reference_notes=? WHERE id=?',
                           (path,encode(sanitize(reference.get('metadata',{}))),sanitize(reference.get('source')),int(bool(reference.get('verified'))),sanitize(reference.get('notes')),run_id))
        return run_id

    def snapshot(self,run_id):
        with self.connect() as db:
            row=db.execute('SELECT * FROM run_snapshots WHERE run_id=?',(run_id,)).fetchone()
        if not row:return None
        return {key.removesuffix('_json'):json.loads(row[key]) if key.endswith('_json') else row[key] for key in row.keys()}

    def update_run(self,run_id,status,*,error=None):
        run=self.get_run(run_id)
        if run and run['status']==status and error is None:return
        with self.transaction():
            super().update_run(run_id,status,error=sanitize(error))
            with self.connect() as db:db.execute('INSERT INTO run_transitions VALUES (?,?,?,?,?)',('state-'+uuid.uuid4().hex,run_id,status,now(),sanitize(error)))

    def get_results(self,run_id,*,include_artifacts=False):
        rows=super().get_results(run_id,include_artifacts=include_artifacts)
        chosen=self.ai_evaluations(run_id)
        for row in rows:
            review=chosen.get(row['id'])
            if review:
                row.update(ai_status=review['evaluation_status'],ai_confidence=review['confidence'],ai_notes=review.get('notes'))
                for metric in ('fidelity','completeness','structure','grounding'):row[metric]=review.get(metric)
        return rows

    def write_artifact(self,run_id,name,payload):
        if not self.get_run(run_id):raise ValueError('Artifact requires an existing run')
        clean=sanitize(payload)
        if encode(clean)!=encode(payload):clean={**clean,'storage_redaction':{'applied':True,'policy':'secrets-v1'}}
        data=encode(clean).encode('utf-8');sha=digest(data);artifact_id='art-'+uuid.uuid4().hex
        snapshot=self.snapshot(run_id)
        budget=snapshot['config'].get('benchmark_storage_max_bytes',2_000_000_000) if snapshot else 2_000_000_000
        with self.connect() as db:
            used=db.execute('SELECT COALESCE(SUM(byte_size),0) FROM artifacts').fetchone()[0]
        if used+len(data)>budget:raise ValueError('Artifact storage budget exceeded; export/archive data before continuing')
        folder=self.artifact_root/run_id;folder.mkdir(parents=True,exist_ok=True,mode=0o700)
        path=folder/(artifact_id+'.json');relative=str(path.relative_to(self.root))
        fd,staged=tempfile.mkstemp(prefix='.staged-',dir=folder)
        try:
            with os.fdopen(fd,'wb') as stream:
                stream.write(data);stream.flush();os.fsync(stream.fileno())
            os.link(staged,path)  # Atomic, refuses to replace an existing destination.
            os.unlink(staged)
            directory_fd=os.open(folder,os.O_RDONLY)
            try:os.fsync(directory_fd)
            finally:os.close(directory_fd)
            with self.connect() as db:
                db.execute('INSERT INTO artifacts VALUES (?,?,?,?,?,?,?,?,?,?,?)',
                           (artifact_id,run_id,relative,sha,len(data),now(),name,'2','utf-8','application/json','captured_redacted'))
        finally:
            if os.path.exists(staged):os.unlink(staged)
        return relative

    def artifact_record(self,path):
        with self.connect() as db:row=db.execute('SELECT * FROM artifacts WHERE path=? OR id=?',(path,path)).fetchone()
        return dict(row) if row else None

    def read_artifact(self,relative):
        if not relative:return None
        record=self.artifact_record(relative)
        if not record:raise ArtifactIntegrityError('Unregistered artifact')
        path=(self.root/record['path']).resolve()
        if self.root not in path.parents or not path.is_file():raise ArtifactIntegrityError('Missing or unsafe artifact')
        data=path.read_bytes()
        if len(data)!=record['byte_size'] or digest(data)!=record['sha256']:raise ArtifactIntegrityError('Artifact hash or size mismatch')
        try:return json.loads(data)
        except (ValueError,UnicodeError) as exc:raise ArtifactIntegrityError('Invalid artifact encoding/JSON') from exc

    def integrity_report(self):
        with self.connect() as db:
            records=[dict(r) for r in db.execute('SELECT * FROM artifacts')]
            fk=[list(r) for r in db.execute('PRAGMA foreign_key_check')]
            stale=[dict(r) for r in db.execute("SELECT id,run_id FROM extraction_attempts WHERE state='RUNNING'")]
            broken=[dict(r) for r in db.execute("SELECT id AS run_id,reference_artifact AS path FROM benchmark_runs WHERE reference_artifact IS NOT NULL AND reference_artifact NOT IN (SELECT path FROM artifacts) UNION SELECT run_id,artifact_path FROM engine_results WHERE artifact_path IS NOT NULL AND artifact_path NOT IN (SELECT path FROM artifacts)")]
            used={row[0] for row in db.execute('SELECT artifact_id FROM extraction_attempts UNION SELECT artifact_id FROM review_packets UNION SELECT reference_artifact_id FROM review_packets UNION SELECT artifact_id FROM evaluation_events UNION SELECT response_artifact_id FROM evaluation_events UNION SELECT reference_artifact_id FROM evaluation_events UNION SELECT packet_artifact_id FROM evaluation_events') if row[0]}
            used_paths={row[0] for row in db.execute('SELECT reference_artifact FROM benchmark_runs UNION SELECT artifact_path FROM engine_results') if row[0]}
        issues=[]
        for row in records:
            try:self.read_artifact(row['path'])
            except ValueError as exc:issues.append({'artifact_id':row['id'],'error':str(exc)})
        registered={r['path'] for r in records}
        orphans=[str(p.relative_to(self.root)) for p in self.artifact_root.rglob('*.json') if str(p.relative_to(self.root)) not in registered]
        staged=[str(p.relative_to(self.root)) for p in self.artifact_root.rglob('.staged-*')]
        unused=[r['id'] for r in records if r['id'] not in used and r['path'] not in used_paths]
        return {'artifact_count':len(records),'issues':issues,'broken_references':broken,'orphans':orphans,'unreferenced_artifacts':unused,'staged':staged,'foreign_key_violations':fk,'running_attempts':stale}

    def start_attempt(self,run_id,engine,version,backend,repetition,state='RUNNING',reason=None):
        attempt='at-'+uuid.uuid4().hex
        with self.connect() as db:
            snap=db.execute('SELECT run_id FROM run_snapshots WHERE run_id=?',(run_id,)).fetchone()
            db.execute('INSERT INTO extraction_attempts (id,run_id,engine,engine_version,backend,repetition,state,started_at,completed_at,provenance,snapshot_id,error_type,error) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
                       (attempt,run_id,engine,version,backend,repetition,state,now(),now() if state!='RUNNING' else None,'captured' if snap else 'legacy_unknown',run_id if snap else None,'EligibilitySkip' if state=='SKIPPED' else None,sanitize(reason)))
        return attempt

    def finish_attempt(self,attempt,state,*,duration=None,status=None,error=None,error_type=None,artifact_path=None,output_chars=0,truncation=None,metadata=None,resources=None,backend=None):
        record=self.artifact_record(artifact_path) if artifact_path else None
        with self.connect() as db:
            db.execute('UPDATE extraction_attempts SET state=?,completed_at=?,duration_seconds=?,extraction_status=?,error=?,error_type=?,artifact_id=?,output_chars=?,truncation_json=?,metadata_json=?,resources_json=?,backend=COALESCE(?,backend) WHERE id=? AND state=\'RUNNING\'',
                       (state,now(),duration,status,sanitize(error),error_type,record['id'] if record else None,output_chars,encode(truncation or {}),encode(sanitize(metadata or {})),encode(resources or {}),backend,attempt))

    def attempts(self,run_id):
        with self.connect() as db:rows=db.execute('SELECT * FROM extraction_attempts WHERE run_id=? ORDER BY started_at,id',(run_id,)).fetchall()
        return [dict(row) for row in rows]

    def bind_attempt(self,run_id,attempt_id,artifact_path):
        artifact=self.artifact_record(artifact_path)
        candidate='C-'+digest(attempt_id.encode())[:12]
        with self.connect() as db:
            db.execute('INSERT OR IGNORE INTO candidate_bindings VALUES (?,?,?,?)',(candidate,run_id,attempt_id,artifact['id']))
        return candidate

    def candidate_rows(self,run_id):
        with self.connect() as db:
            rows=db.execute('SELECT c.*,a.engine,a.engine_version,a.backend,a.extraction_status,a.output_chars,a.truncation_json,f.path AS artifact_path,e.id AS engine_result_id FROM candidate_bindings c JOIN extraction_attempts a ON a.id=c.attempt_id JOIN artifacts f ON f.id=c.artifact_id LEFT JOIN engine_results e ON e.run_id=c.run_id AND e.engine=a.engine WHERE c.run_id=? ORDER BY c.candidate_id',(run_id,)).fetchall()
        # Legacy mappings remain readable but are never invented as fully bound attempts.
        return [dict(row) for row in rows] or super().candidate_rows(run_id)

    def save_ai_evaluation(self,run_id,engine_result_id,score):
        raise ValueError('Use append_evaluations with an immutable packet and attempt binding')

    def append_evaluations(self,run_id,scores,raw_submission=None):
        with self.connect() as db:packet=db.execute('SELECT * FROM review_packets WHERE run_id=?',(run_id,)).fetchone()
        if not packet:raise ValueError('Export an immutable review packet before importing')
        with self.connect() as db:
            previous=[db.execute('SELECT id FROM evaluation_events WHERE idempotency_key=?',(digest(encode({'packet':packet['artifact_id'],'score':score}).encode()),)).fetchone() for score in scores]
        if all(previous):return [row[0] for row in previous]
        response=self.write_artifact(run_id,'ai_response',{'scores':scores,'original_submission':raw_submission,
            'representation':'received submission when available, with secrets-v1 redaction'})
        response_id=self.artifact_record(response)['id'];new=[]
        with self.connect() as db:
            for score in scores:
                binding=db.execute('SELECT * FROM candidate_bindings WHERE run_id=? AND candidate_id=?',(run_id,score['candidate_id'])).fetchone()
                if not binding:raise ValueError('Candidate is not an attempt-bound candidate in this run')
                key=digest(encode({'packet':packet['artifact_id'],'score':score}).encode())
                exists=db.execute('SELECT id FROM evaluation_events WHERE idempotency_key=?',(key,)).fetchone()
                if exists:new.append(exists[0]);continue
                eid='ev-'+uuid.uuid4().hex
                db.execute('INSERT INTO evaluation_events VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
                           (eid,run_id,score['candidate_id'],binding['attempt_id'],binding['artifact_id'],packet['reference_artifact_id'],packet['artifact_id'],response_id,score.get('evaluator_type','manual'),score.get('evaluator_model'),score['prompt_version'],packet['rubric_version'],now(),score.get('evaluated_at'),key,score.get('ai_score'),score['evaluation_status'],encode(sanitize(score))))
                new.append(eid)
        return new

    def evaluation_history(self,run_id):
        with self.connect() as db:return [dict(row) for row in db.execute('SELECT * FROM evaluation_events WHERE run_id=? ORDER BY imported_at,id',(run_id,))]

    def ai_evaluations(self,run_id):
        # Engine aggregate selects latest review of its first representative attempt only.
        output={}
        with self.connect() as db:
            rows=db.execute('SELECT v.*,a.engine,e.id AS engine_result_id FROM evaluation_events v JOIN extraction_attempts a ON a.id=v.attempt_id JOIN engine_results e ON e.run_id=v.run_id AND e.engine=a.engine WHERE v.run_id=? ORDER BY v.imported_at,v.id',(run_id,)).fetchall()
            for row in rows:
                selected=db.execute("SELECT a.id FROM extraction_attempts a WHERE a.run_id=? AND a.engine=? AND a.artifact_id IS NOT NULL AND a.state IN ('COMPLETED','PARTIAL') ORDER BY CASE a.state WHEN 'COMPLETED' THEN 0 ELSE 1 END,a.repetition,a.started_at LIMIT 1",(run_id,row['engine'])).fetchone()
                if selected and selected[0]==row['attempt_id']:
                    output[row['engine_result_id']]={**json.loads(row['score_json']),'evaluation_id':row['id']}
        return output

    def save_score(self,run_id,result_id,**values):
        ai=self.ai_evaluations(run_id).get(result_id)
        run=self.get_run(run_id)
        snapshot=self.snapshot(run_id)
        evidence={'attempts':self.attempts(run_id),'reference_artifact':run['reference_artifact'],
                  'snapshot':snapshot,'selection_policy':'first-eligible-attempt/latest-review-v1'}
        event={'result_id':result_id,'rubric':run['rubric_version'],'values':values,'evaluation_id':(ai or {}).get('evaluation_id'),'evidence':evidence}
        key=digest(encode(event).encode())
        with self.connect() as db:
            db.execute('INSERT OR IGNORE INTO score_events VALUES (?,?,?,?,?,?,?,?,?,?,?)',
                       ('sc-'+uuid.uuid4().hex,run_id,result_id,(ai or {}).get('candidate_id'),(ai or {}).get('evaluation_id'),run['rubric_version'],'deterministic-v0.3/storage-v2',now(),encode(evidence),encode(values),key))
        super().save_score(run_id,result_id,**values)

    def recover_interrupted(self,limit):
        # A local PID owner prevents concurrent processes from recovering an active worker.
        with self.connect() as db:
            for row in db.execute('SELECT * FROM run_claims').fetchall():
                try:os.kill(int(row['owner'].split(':')[0]),0);alive=True
                except (OSError,ValueError):alive=False
                if alive:continue
                db.execute('DELETE FROM run_claims WHERE run_id=?',(row['run_id'],))
            db.execute("UPDATE extraction_attempts SET state='INTERRUPTED',completed_at=?,error_type='ProcessInterrupted' WHERE state='RUNNING' AND run_id NOT IN (SELECT run_id FROM run_claims)",(now(),))
            db.execute("UPDATE benchmark_runs SET status='QUEUED',updated_at=? WHERE status IN ('RUNNING','INTERRUPTED') AND id NOT IN (SELECT run_id FROM run_claims)",(now(),))
            db.execute("UPDATE engine_results SET state='INTERRUPTED',completed_at=? WHERE state='RUNNING' AND run_id NOT IN (SELECT run_id FROM run_claims)",(now(),))
            return [row[0] for row in db.execute("SELECT id FROM benchmark_runs WHERE status='QUEUED' AND cancel_requested=0 AND id NOT IN (SELECT run_id FROM run_claims) ORDER BY created_at LIMIT ?",(limit,))]

    def claim(self,run_id,owner):
        with self.connect() as db:
            try:db.execute('INSERT INTO run_claims VALUES (?,?,?)',(run_id,owner,now()));return True
            except sqlite3.IntegrityError:return False

    def leaderboard_rows(self,category=None):
        # Separate contexts rather than pooling rubric/dataset/build versions.
        with self.connect() as db:
            records=db.execute("SELECT r.id,r.url,r.category,r.dataset_version,r.rubric_version,e.id AS result_id,e.engine,e.engine_version,e.backend,e.state,e.extraction_status,e.attempts,e.successes,e.latency_seconds,s.final_score,s.ai_score,s.deterministic_score,s.status AS score_status FROM engine_results e JOIN benchmark_runs r ON r.id=e.run_id LEFT JOIN scores s ON s.engine_result_id=e.id WHERE r.status IN ('AWAITING_EVALUATION','COMPLETED')" + (' AND r.category=?' if category else ''),(category,) if category else ()).fetchall()
        return [dict(r) for r in records]

    def release(self,run_id,owner):
        with self.connect() as db:db.execute('DELETE FROM run_claims WHERE run_id=? AND owner=?',(run_id,owner))
