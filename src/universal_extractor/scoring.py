"""Auditable v0.3 deterministic/AI aggregation and leaderboard analysis."""
from __future__ import annotations

from collections import defaultdict
import math
import statistics
from typing import Any

AI_WEIGHTS = {"fidelity": 25.0, "completeness": 20.0, "structure": 8.0, "grounding": 7.0}
LATENCY_TARGETS = {
    "article": 3.0, "javascript": 10.0, "youtube": 8.0,
    "instagram": 8.0, "reddit": 6.0, "pdf": 15.0,
}
METADATA_FIELDS = ("title", "author", "published_at", "description")


def ai_score(values: dict[str, Any]) -> float:
    total = 0.0
    for name, weight in AI_WEIGHTS.items():
        value = values.get(name)
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not 0 <= value <= 5:
            raise ValueError(f"{name} must be a number from 0 to 5")
        total += float(value) / 5 * weight
    return round(total, 2)


def deterministic_score(*, category: str, predicted_metadata: dict,
                        reference_metadata: dict, attempts: int, successes: int,
                        median_latency: float | None, min_reliability_runs: int = 3) -> dict:
    reasons: list[str] = []
    fields = [field for field in METADATA_FIELDS if str(reference_metadata.get(field, "")).strip()]
    metadata = None
    if fields:
        def norm(value: object) -> str:
            return " ".join(str(value or "").casefold().split())
        matches = sum(norm(predicted_metadata.get(field)) == norm(reference_metadata.get(field)) for field in fields)
        metadata = round(10 * matches / len(fields), 2)
    else:
        reasons.append("verified reference metadata is unavailable")

    reliability = None
    if attempts >= min_reliability_runs and 0 <= successes <= attempts:
        reliability = round(20 * successes / attempts, 2)
    else:
        reasons.append(f"reliability requires at least {min_reliability_runs} measured repetitions")

    latency = None
    target = LATENCY_TARGETS.get(category)
    if median_latency is not None and median_latency >= 0 and target:
        latency = round(10 * min(1.0, target / max(target, median_latency)), 2)
    else:
        reasons.append("latency measurement or category threshold is unavailable")

    values = (metadata, reliability, latency)
    return {
        "metadata_score": metadata,
        "reliability_score": reliability,
        "latency_score": latency,
        "deterministic_score": round(sum(v for v in values if v is not None), 2),
        "deterministic_complete": all(v is not None for v in values),
        "reasons": reasons,
    }


def aggregate_score(deterministic: dict, ai: dict | None, *, reference_verified: bool) -> dict:
    reasons = list(deterministic.get("reasons", []))
    ai_value = ai.get("ai_score") if ai else None
    ai_status = ai.get("evaluation_status") if ai else None
    if ai is None:
        reasons.append("AI evaluation has not been imported")
    elif ai_status == "PROVISIONAL":
        reasons.append("AI review is provisional because no verified reference was available")
    elif ai_status == "INSUFFICIENT_EVIDENCE":
        reasons.append("AI evaluator reported insufficient evidence")
    if not reference_verified:
        reasons.append("reference content is not verified")
    complete = (deterministic.get("deterministic_complete") and ai_value is not None
                and ai_status == "VERIFIED" and reference_verified)
    if complete:
        status, final = "VERIFIED", round(deterministic["deterministic_score"] + ai_value, 2)
    elif ai_status == "PROVISIONAL":
        status, final = "PROVISIONAL", None
    elif ai_status == "INSUFFICIENT_EVIDENCE" or not reference_verified:
        status, final = "INSUFFICIENT_EVIDENCE", None
    elif ai_value is not None or deterministic["deterministic_score"]:
        status, final = "PARTIAL", None
    else:
        status, final = "PENDING", None
    return {"status": status, "final_score": final, "ai_score": ai_value, "reasons": list(dict.fromkeys(reasons))}


def build_leaderboard(rows: list[dict], *, minimum_samples: int = 3) -> list[dict]:
    groups = defaultdict(list)
    for row in rows:
        groups[(row["category"], row["engine"],row.get('engine_version'),row.get('dataset_version'),row.get('rubric_version'))].append(row)
    output = []
    for (category, engine,engine_version,dataset_version,rubric_version), values in sorted(groups.items(),key=lambda item:str(item[0])):
        finals = [float(v["final_score"]) for v in values if v.get("final_score") is not None]
        latencies = [float(v["latency_seconds"]) for v in values if v.get("latency_seconds") is not None]
        attempts = sum(int(v.get("attempts") or 0) for v in values)
        successes = sum(int(v.get("successes") or 0) for v in values)
        mean = round(statistics.fmean(finals), 2) if finals else None
        margin = None
        if len(finals) >= 2:
            margin = round(1.96 * statistics.stdev(finals) / math.sqrt(len(finals)), 2)
        coverage = round(len(finals) / len(values), 3) if values else 0
        sufficient = len(finals) >= minimum_samples and len({v.get('url') for v in values if v.get('url') and v.get('final_score') is not None}) >= minimum_samples
        backends = sorted({str(v["backend"]) for v in values if v.get("backend")})
        output.append({
            "category": category, "engine": engine, "sample_size": len(values),
            'engine_version':engine_version,'dataset_version':dataset_version,'rubric_version':rubric_version,
            'distinct_url_count':len({v.get('url') for v in values if v.get('url')}),
            "underlying_backends": backends,
            "verified_score_samples": len(finals), "mean_verified_score": mean,
            "score_95pct_margin": margin, "success_rate": round(successes / attempts, 3) if attempts else None,
            "failure_rate": round(1 - successes / attempts, 3) if attempts else None,
            "median_latency_seconds": round(statistics.median(latencies), 3) if latencies else None,
            "evaluation_coverage": coverage, "minimum_samples": minimum_samples,
            "eligible_for_recommendation": sufficient,
            "uncertainty": "low" if len(finals) >= 10 else ("medium" if sufficient else "high"),
        })
    for category,dataset,rubric in {(row['category'],row['dataset_version'],row['rubric_version']) for row in output}:
        context=lambda row: row['category']==category and row['dataset_version']==dataset and row['rubric_version']==rubric
        candidates = [row for row in output if context(row) and row["eligible_for_recommendation"]]
        candidates.sort(key=lambda row: (row["mean_verified_score"] if row['mean_verified_score'] is not None else -1, row["success_rate"] if row['success_rate'] is not None else -1), reverse=True)
        primary = candidates[0] if candidates else None
        fallback = None
        if primary:
            primary_backends = set(primary["underlying_backends"])
            fallback = next((candidate for candidate in candidates[1:]
                             if primary_backends and candidate["underlying_backends"]
                             and primary_backends.isdisjoint(candidate["underlying_backends"])), None)
        for row in output:
            if context(row):
                owners = sorted(other["engine"] for other in output
                                if other["category"] == category and other["engine"] != row["engine"]
                                and set(other["underlying_backends"]) & set(row["underlying_backends"]))
                row["shared_backend_with"] = owners
                row["independent_evidence"] = bool(row["underlying_backends"]) and not owners
                row["best_observed_engine"] = primary["engine"] if primary else None
                row["recommended_fallback"] = fallback["engine"] if fallback else None
    return output


def detect_regressions(current_run: dict, current: list[dict], previous_run: dict | None,
                       previous: list[dict]) -> list[dict]:
    if not previous_run:
        return []
    old = {row["engine"]: row for row in previous}
    findings = []
    for row in current:
        before = old.get(row["engine"])
        if not before:
            continue
        checks = []
        old_success = (before.get("successes") or 0) / max(1, before.get("attempts") or 0)
        new_success = (row.get("successes") or 0) / max(1, row.get("attempts") or 0)
        if new_success < old_success:
            checks.append(("success_rate", old_success, new_success, "regression", "high" if new_success == 0 else "medium"))
        elif new_success > old_success:
            checks.append(("success_rate", old_success, new_success, "improvement", "info"))
        old_failure, new_failure = 1 - old_success, 1 - new_success
        if new_failure != old_failure:
            checks.append(("error_frequency", old_failure, new_failure,
                           "regression" if new_failure > old_failure else "improvement",
                           "medium" if new_failure > old_failure else "info"))
        old_latency, new_latency = before.get("latency_seconds"), row.get("latency_seconds")
        if old_latency and new_latency and new_latency > old_latency * 1.3:
            checks.append(("latency_seconds", old_latency, new_latency, "regression", "medium"))
        elif old_latency and new_latency and new_latency < old_latency / 1.3:
            checks.append(("latency_seconds", old_latency, new_latency, "improvement", "info"))
        for metric in ("metadata_score", "fidelity", "completeness"):
            old_metric, new_metric = before.get(metric), row.get(metric)
            threshold = 1.0 if metric == "metadata_score" else 0.5
            if old_metric is not None and new_metric is not None and abs(new_metric - old_metric) >= threshold:
                checks.append((metric, old_metric, new_metric,
                               "regression" if new_metric < old_metric else "improvement",
                               "medium" if new_metric < old_metric else "info"))
        old_score, new_score = before.get("final_score"), row.get("final_score")
        if old_score is not None and new_score is not None and new_score < old_score - 5:
            checks.append(("final_score", old_score, new_score, "regression", "high"))
        elif old_score is not None and new_score is not None and new_score > old_score + 5:
            checks.append(("final_score", old_score, new_score, "improvement", "info"))
        for metric, old_value, new_value, direction, severity in checks:
            findings.append({"previous_run_id": previous_run["id"], "engine": row["engine"],
                             "metric": metric, "old_value": round(old_value, 4),
                             "new_value": round(new_value, 4), "direction": direction,
                             "severity": severity,
                             "details": f"Comparable dataset/rubric: {current_run['dataset_version']} / {current_run['rubric_version']}"})
    return findings
