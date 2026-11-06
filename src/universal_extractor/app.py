import asyncio
from contextlib import asynccontextmanager
import csv
from datetime import datetime, timezone
import io
import json

from fastapi import FastAPI, HTTPException, Query, Response, Request
from .config import Settings
from .models import ExtractRequest, ExtractResponse
from .security import URLRejected
from .security import check_url
from .service import ExtractionService
from .benchmark_models import BenchmarkRequest, AIScoreImport
from .benchmark_runner import BenchmarkManager, BenchmarkRunner
from .capabilities import engine_capabilities
from .categories import CONTENT_CATEGORIES, classify_content
from .evaluation import (OpenAIEvaluator, SCORING_PROMPT, build_review_packet,
                         import_ai_scores)
from .experiment_store import ExperimentStore
from .scoring import build_leaderboard


def create_app(settings: Settings | None = None) -> FastAPI:
    current = settings or Settings.from_env()
    service = ExtractionService(current)

    @asynccontextmanager
    async def lifespan(application: FastAPI):
        _, _, startup_manager = benchmark_lab()
        startup_manager.start(recover_existing=True)
        yield
        manager = getattr(application.state, "benchmark_manager", None)
        if manager is not None:
            await manager.close()

    app = FastAPI(title="Universal URL Extractor", version="0.3.0",
                  description="Local-first extraction API; NOT production hardened for public internet exposure",
                  lifespan=lifespan)
    app.state.benchmark_store = None
    app.state.benchmark_runner = None
    app.state.benchmark_manager = None

    def benchmark_lab() -> tuple[ExperimentStore, BenchmarkRunner, BenchmarkManager]:
        if app.state.benchmark_store is None:
            store = ExperimentStore(current.benchmark_path)
            evaluator = OpenAIEvaluator(current) if current.enable_openai_evaluator else None
            runner = BenchmarkRunner(current, store, automated_evaluator=evaluator)
            manager = BenchmarkManager(runner, current.benchmark_queue_size)
            app.state.benchmark_store = store
            app.state.benchmark_runner = runner
            app.state.benchmark_manager = manager
        return app.state.benchmark_store, app.state.benchmark_runner, app.state.benchmark_manager

    @app.get("/health")
    def health():
        capabilities = engine_capabilities(current)
        return {"ok": True, "engines": {
            "html": True,
            "crawl4ai": current.enable_crawl4ai,
            "agent_reach": current.enable_agent_reach,
            "docling": current.enable_docling,
        }, "capabilities": {name: cap.model_dump() for name, cap in capabilities.items()},
            "benchmark": {"queue_size": current.benchmark_queue_size,
                          "heavy_concurrency": 1,
                          "openai_evaluator_enabled": current.enable_openai_evaluator}}

    @app.post("/v1/extract", response_model=ExtractResponse)
    async def extract(payload: ExtractRequest):
        try:
            return await service.extract(payload)
        except URLRejected as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @app.post("/v1/benchmark", status_code=202)
    async def start_benchmark(payload: BenchmarkRequest):
        try:
            check_url(payload.url)
            category = classify_content(payload.url, payload.category)
        except (URLRejected, ValueError) as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        if payload.repetitions > current.benchmark_max_repetitions:
            raise HTTPException(status_code=400, detail=f"Maximum repetitions is {current.benchmark_max_repetitions}")
        if payload.evaluation_mode == "openai" and not current.enable_openai_evaluator:
            raise HTTPException(status_code=400, detail="OpenAI evaluator is disabled by default")
        if isinstance(payload.engines, list):
            unknown = sorted(set(payload.engines) - set(engine_capabilities(current)))
            if unknown:
                raise HTTPException(status_code=400, detail=f"Unknown engines: {', '.join(unknown)}")
        store, _, manager = benchmark_lab()
        requested = None if payload.engines == "all_eligible" else payload.engines
        reference = payload.reference.model_dump() if payload.reference else None
        try:
            run_id = store.create_run(url=payload.url, category=category,
                                      evaluation_mode=payload.evaluation_mode,
                                      dataset_version=payload.dataset_version,
                                      repetitions=payload.repetitions,
                                      requested_engines=requested, tags=payload.tags,
                                      reference=reference,settings=current,
                                      category_source='explicit' if payload.category else 'url_classifier')
        except ValueError as exc:
            raise HTTPException(status_code=400,detail=str(exc)) from exc
        try:
            await manager.submit(run_id)
        except asyncio.QueueFull as exc:
            store.update_run(run_id, "FAILED", error="Benchmark queue is full")
            raise HTTPException(status_code=503, detail="Benchmark queue is full") from exc
        return {"run_id": run_id, "status": "QUEUED", "category": category,
                "status_url": f"/v1/benchmark/{run_id}"}

    @app.get("/v1/benchmark/{run_id}")
    def benchmark_status(run_id: str):
        store, _, _ = benchmark_lab()
        run = store.get_run(run_id)
        if not run:
            raise HTTPException(status_code=404, detail="Benchmark run not found")
        results = store.get_results(run_id)
        counts = {state: sum(row["state"] == state for row in results)
                  for state in ("PENDING", "RUNNING", "COMPLETED", "FAILED", "SKIPPED", "CANCELLED")}
        return {**run, "engine_counts": counts,
                "engines": [{"engine": row["engine"], "state": row["state"],
                             "extraction_status": row["extraction_status"], "error": row["error"]}
                            for row in results],
                "pending_evaluations": sum(row.get("ai_status") is None
                                           for row in results if row["state"] == "COMPLETED")}

    @app.get("/v1/benchmark/{run_id}/results")
    def benchmark_results(run_id: str):
        store, _, _ = benchmark_lab()
        run = store.get_run(run_id)
        if not run:
            raise HTTPException(status_code=404, detail="Benchmark run not found")
        return {"run": run, "results": store.get_results(run_id, include_artifacts=True),
                'attempts':store.attempts(run_id),'snapshot':store.snapshot(run_id),
                'evaluation_history':store.evaluation_history(run_id),
                "regressions": store.get_regressions(run_id)}

    @app.get("/v1/benchmark/{run_id}/review-packet")
    def review_packet(run_id: str):
        store, _, _ = benchmark_lab()
        try:
            packet = build_review_packet(store, run_id)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Benchmark run not found") from exc
        except ValueError as exc:
            raise HTTPException(status_code=409,detail=str(exc)) from exc
        body = json.dumps(packet, ensure_ascii=False) + "\n"
        return Response(body, media_type="application/x-ndjson",
                        headers={"Content-Disposition": f'attachment; filename="{run_id}-review.jsonl"'})

    @app.get('/v1/storage/integrity')
    def storage_integrity():
        store,_,_=benchmark_lab()
        return store.integrity_report()

    @app.get('/v1/benchmark/{run_id}/history')
    def benchmark_history(run_id: str):
        store,_,_=benchmark_lab()
        if not store.get_run(run_id):raise HTTPException(status_code=404,detail='Benchmark run not found')
        with store.connect() as db:
            scores=[dict(row) for row in db.execute('SELECT * FROM score_events WHERE run_id=? ORDER BY created_at',(run_id,))]
            transitions=[dict(row) for row in db.execute('SELECT * FROM run_transitions WHERE run_id=? ORDER BY occurred_at',(run_id,))]
        return {'attempts':store.attempts(run_id),'evaluations':store.evaluation_history(run_id),'scores':scores,'transitions':transitions}

    @app.get("/v1/benchmark/{run_id}/review-prompt")
    def review_prompt(run_id: str):
        store, _, _ = benchmark_lab()
        if not store.get_run(run_id):
            raise HTTPException(status_code=404, detail="Benchmark run not found")
        return Response(SCORING_PROMPT, media_type="text/plain")

    @app.post("/v1/benchmark/{run_id}/ai-scores")
    async def ai_scores(run_id: str, payload: AIScoreImport,request: Request):
        store, runner, _ = benchmark_lab()
        try:
            body=await request.body()
            if len(body)>4_000_000:raise HTTPException(status_code=413,detail='Score import exceeds 4 MB')
            return import_ai_scores(store, runner, run_id, payload.scores,raw_submission=body.decode('utf-8'))
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Benchmark run not found") from exc
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

    @app.post("/v1/benchmark/{run_id}/cancel", status_code=202)
    def cancel_benchmark(run_id: str):
        store, _, _ = benchmark_lab()
        if not store.get_run(run_id):
            raise HTTPException(status_code=404, detail="Benchmark run not found")
        accepted = store.request_cancel(run_id)
        return {"run_id": run_id, "cancellation_requested": accepted}

    @app.get("/v1/leaderboard")
    def leaderboard(category: str | None = None, minimum_samples: int = Query(3, ge=2, le=100),
                    format: str = Query("json", pattern="^(json|csv)$")):
        if category is not None and category not in CONTENT_CATEGORIES:
            raise HTTPException(status_code=400, detail="Unsupported category")
        store, _, _ = benchmark_lab()
        rankings = build_leaderboard(store.leaderboard_rows(category), minimum_samples=minimum_samples)
        if format == "csv":
            stream = io.StringIO()
            columns = list(dict.fromkeys(key for row in rankings for key in row))
            writer = csv.DictWriter(stream, fieldnames=columns)
            writer.writeheader()
            writer.writerows(rankings)
            return Response(stream.getvalue(), media_type="text/csv",
                            headers={"Content-Disposition": "attachment; filename=leaderboard.csv"})
        return {"generated_at": datetime.now(timezone.utc).isoformat(),
                "minimum_samples": minimum_samples, "rankings": rankings,
                "warning": "No engine is recommended until it has sufficient verified samples."}

    return app


app = create_app()
