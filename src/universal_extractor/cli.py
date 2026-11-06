"""Extractor and Benchmark Lab command-line interface."""
from __future__ import annotations

import argparse
import asyncio
import csv
import json
from pathlib import Path

from .benchmark_models import AIScoreInput, BenchmarkRequest, DatasetEntry
from .benchmark_runner import BenchmarkRunner
from .categories import classify_content
from .config import Settings
from .evaluation import SCORING_PROMPT, build_review_packet, import_ai_scores
from .experiment_store import ExperimentStore
from .models import ExtractRequest
from .scoring import build_leaderboard
from .service import ExtractionService


def _json(value) -> None:
    print(json.dumps(value, indent=2, ensure_ascii=False))


def _lab(settings: Settings) -> tuple[ExperimentStore, BenchmarkRunner]:
    store = ExperimentStore(settings.benchmark_path)
    return store, BenchmarkRunner(settings, store)


async def _run_benchmark(args, settings: Settings) -> dict:
    store, runner = _lab(settings)
    reference = None
    if args.reference:
        path = Path(args.reference).resolve()
        reference = {"content": path.read_text(encoding="utf-8"), "metadata": {},
                     "source": str(path), "verified": args.reference_verified}
    request = BenchmarkRequest(url=args.url, category=args.category,
                               engines=args.engines or "all_eligible",
                               evaluation_mode=args.evaluation_mode,
                               repetitions=args.repetitions,
                               dataset_version=args.dataset_version,
                               reference=reference)
    run_id = store.create_run(
        url=request.url, category=classify_content(request.url, request.category),
        evaluation_mode=request.evaluation_mode, dataset_version=request.dataset_version,
        repetitions=request.repetitions,
        requested_engines=None if request.engines == "all_eligible" else request.engines,
        tags=request.tags, reference=request.reference.model_dump() if request.reference else None,settings=settings,
    )
    await runner.execute(run_id)
    return {"run": store.get_run(run_id), "results": store.get_results(run_id, include_artifacts=True),
            'attempts':store.attempts(run_id),'snapshot':store.snapshot(run_id),
            "regressions": store.get_regressions(run_id)}


async def _run_dataset(args, settings: Settings) -> list[dict]:
    dataset = Path(args.dataset).resolve()
    store, runner = _lab(settings)
    summaries = []
    for line_number, line in enumerate(dataset.read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        try:
            entry = DatasetEntry.model_validate_json(line)
        except ValueError as exc:
            raise SystemExit(f"Invalid dataset line {line_number}: {exc}") from exc
        previous = store.latest_run(entry.url, args.dataset_version)
        if args.resume and previous and previous["status"] in {"COMPLETED", "AWAITING_EVALUATION"}:
            summaries.append({"url": entry.url, "run_id": previous["id"], "status": "RESUMED_SKIP"})
            continue
        reference = None
        if entry.reference_artifact:
            reference_path = (dataset.parent / entry.reference_artifact).resolve()
            if dataset.parent not in reference_path.parents or not reference_path.is_file():
                raise SystemExit(f"Reference on line {line_number} must be a file below {dataset.parent}")
            reference = {"content": reference_path.read_text(encoding="utf-8"),
                         "metadata": entry.expected_metadata, "source": entry.reference_artifact,
                         "verified": entry.reference_verified, "notes": entry.permissions_notes,
                         'verified_by':entry.reference_verifier}
        run_id = store.create_run(
            url=entry.url, category=entry.category, evaluation_mode=args.evaluation_mode,
            dataset_version=args.dataset_version, repetitions=args.repetitions,
            requested_engines=None, tags=entry.tags, reference=reference,settings=settings,
            dataset_id=dataset.name,dataset_manifest_sha256=__import__('hashlib').sha256(dataset.read_bytes()).hexdigest(),
            limitations=entry.expected_limitations,
        )
        await runner.execute(run_id)
        summaries.append({"url": entry.url, "run_id": run_id, "status": store.get_run(run_id)["status"]})
    return summaries


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Extract URLs or run Universal Benchmark Lab v0.3")
    sub = parser.add_subparsers(dest="command")
    extract = sub.add_parser("extract", help="extract one URL using production fallback routing")
    extract.add_argument("url")
    extract.add_argument("--engine", choices=["auto", "html", "crawl4ai", "agent_reach", "docling"], default="auto")

    benchmark = sub.add_parser("benchmark", help="independently execute all eligible engines")
    benchmark.add_argument("url")
    benchmark.add_argument("--category", choices=["article", "javascript", "youtube", "instagram", "reddit", "pdf"])
    benchmark.add_argument("--engine", dest="engines", action="append",
                           choices=["html", "crawl4ai", "agent_reach", "docling"])
    benchmark.add_argument("--repetitions", type=int, default=1, choices=range(1, 6))
    benchmark.add_argument("--evaluation-mode", choices=["manual", "none"], default="manual")
    benchmark.add_argument("--dataset-version", default="ad-hoc")
    benchmark.add_argument("--reference")
    benchmark.add_argument("--reference-verified", action="store_true")

    dataset = sub.add_parser("dataset", help="run a JSONL dataset sequentially")
    dataset.add_argument("dataset")
    dataset.add_argument("--dataset-version", required=True)
    dataset.add_argument("--repetitions", type=int, default=1, choices=range(1, 6))
    dataset.add_argument("--evaluation-mode", choices=["manual", "none"], default="manual")
    dataset.add_argument("--resume", action="store_true")

    export = sub.add_parser("export-review", help="export a blinded JSONL packet and prompt")
    export.add_argument("run_id")
    export.add_argument("output")
    export.add_argument("--prompt-output")

    batch = sub.add_parser("export-review-batch", help="write bounded blinded JSONL upload batches")
    batch.add_argument("output_dir")
    batch.add_argument("run_ids", nargs="+")
    batch.add_argument("--batch-size", type=int, default=5, choices=range(1, 11))

    load = sub.add_parser("import-scores", help="validate/import ChatGPT JSONL scores")
    load.add_argument("run_id")
    load.add_argument("scores")

    leader = sub.add_parser("leaderboard", help="print or export evidence-based rankings")
    leader.add_argument("--category", choices=["article", "javascript", "youtube", "instagram", "reddit", "pdf"])
    leader.add_argument("--minimum-samples", type=int, default=3)
    leader.add_argument("--csv")
    leader.add_argument("--routing-output")
    export_data=sub.add_parser('export-data',help='export separate training features, observations and verified labels')
    export_data.add_argument('output_dir')
    export_data.add_argument('--rubric-version',default='v0.3.0')
    export_data.add_argument('--dataset-version')
    export_data.add_argument('--format',choices=['csv','parquet'],default='csv')
    sub.add_parser('storage-integrity',help='check hashes, references, staged files and running attempts')
    return parser


def main():
    import sys
    argv = sys.argv[1:]
    commands = {"extract", "benchmark", "dataset", "export-review", "export-review-batch",
                "import-scores", "leaderboard",'export-data','storage-integrity'}
    if argv and argv[0] not in commands and not argv[0].startswith("-"):
        argv.insert(0, "extract")
    args = _parser().parse_args(argv)
    settings = Settings.from_env()
    if args.command == 'storage-integrity':
        store,_=_lab(settings);_json(store.integrity_report())
    elif args.command == 'export-data':
        from .data_export import export_training_data
        store,_=_lab(settings)
        _json(export_training_data(store,args.output_dir,rubric_version=args.rubric_version,dataset_version=args.dataset_version,format=args.format))
    elif args.command == "extract":
        result = asyncio.run(ExtractionService(settings).extract(ExtractRequest(url=args.url, engine=args.engine)))
        _json(result.model_dump(mode="json"))
    elif args.command == "benchmark":
        _json(asyncio.run(_run_benchmark(args, settings)))
    elif args.command == "dataset":
        _json(asyncio.run(_run_dataset(args, settings)))
    elif args.command == "export-review":
        store, _ = _lab(settings)
        packet = build_review_packet(store, args.run_id)
        Path(args.output).write_text(json.dumps(packet, ensure_ascii=False) + "\n", encoding="utf-8")
        if args.prompt_output:
            Path(args.prompt_output).write_text(SCORING_PROMPT, encoding="utf-8")
        print(f"Wrote blinded packet to {args.output}; engine identities remain only in SQLite.")
    elif args.command == "export-review-batch":
        store, _ = _lab(settings)
        output = Path(args.output_dir)
        output.mkdir(parents=True, exist_ok=True)
        packets = [build_review_packet(store, run_id) for run_id in args.run_ids]
        written = []
        for index in range(0, len(packets), args.batch_size):
            path = output / f"review-batch-{index // args.batch_size + 1:03d}.jsonl"
            path.write_text("".join(json.dumps(packet, ensure_ascii=False) + "\n"
                                    for packet in packets[index:index + args.batch_size]), encoding="utf-8")
            written.append(str(path))
        (output / "CHATGPT_SCORING_PROMPT.md").write_text(SCORING_PROMPT, encoding="utf-8")
        _json({"batches": written, "packet_count": len(packets), "batch_size": args.batch_size})
    elif args.command == "import-scores":
        store, runner = _lab(settings)
        raw=Path(args.scores).read_text(encoding='utf-8')
        if len(raw.encode())>4_000_000:raise SystemExit('Score import exceeds 4 MB')
        scores = [AIScoreInput.model_validate_json(line) for line in raw.splitlines() if line.strip()]
        _json(import_ai_scores(store, runner, args.run_id, scores,raw_submission=raw))
    elif args.command == "leaderboard":
        store, _ = _lab(settings)
        rows = build_leaderboard(store.leaderboard_rows(args.category), minimum_samples=args.minimum_samples)
        if args.csv:
            columns = list(dict.fromkeys(key for row in rows for key in row))
            with Path(args.csv).open("w", newline="", encoding="utf-8") as handle:
                writer = csv.DictWriter(handle, fieldnames=columns)
                writer.writeheader()
                writer.writerows(rows)
        if args.routing_output:
            recommendations = {row["category"]: {"primary": row["best_observed_engine"],
                "fallback": row["recommended_fallback"], "review_required": True}
                for row in rows if row.get("best_observed_engine")}
            Path(args.routing_output).write_text(json.dumps({"generated_from": "benchmark-v0.3",
                "auto_apply": False, "recommendations": recommendations}, indent=2), encoding="utf-8")
        _json(rows)
    else:
        _parser().print_help()


if __name__ == "__main__":
    main()
