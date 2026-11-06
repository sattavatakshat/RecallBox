"""Review bundle construction and honest benchmark scoring (standard library only).

No AI network calls happen in this module. ChatGPT can score exported blind packets.
"""
from __future__ import annotations

import hashlib
import json
from collections import defaultdict

AI_WEIGHTS = {"fidelity": 25.0, "completeness": 20.0, "structure": 8.0, "grounding": 7.0}
META_FIELDS = ("title", "author", "published_at", "description")
LATENCY_TARGETS = {
    "article": 3.0, "javascript": 10.0, "youtube": 8.0,
    "instagram": 8.0, "reddit": 6.0, "pdf": 15.0,
}


def _normalized(value: object) -> str:
    return " ".join(str(value or "").casefold().split())


def prepare_case(case: dict, *, seed: str = "beta-v1", max_chars: int = 25000) -> tuple[dict, dict]:
    """Create a blinded evaluator packet and private metrics/mapping record."""
    case_id = str(case.get("case_id", "")).strip()
    category = str(case.get("category", "")).strip().lower()
    reference = case.get("reference") or {}
    if not case_id or not category or not reference.get("content"):
        raise ValueError("case_id, category and reference.content are required")
    candidates = case.get("candidates") or []
    if not candidates:
        raise ValueError("At least one candidate is required")

    packet = {
        "case_id": case_id,
        "category": category,
        "reference": {"content": str(reference["content"])[:max_chars],
                      "metadata": reference.get("metadata", {})},
        "candidates": [],
        "reference_truncated": len(str(reference["content"])) > max_chars,
    }
    private = {"case_id": case_id, "category": category, "candidates": {}}
    for candidate in candidates:
        engine = str(candidate.get("engine", "")).strip()
        if not engine or engine in (x["engine"] for x in private["candidates"].values()):
            raise ValueError("Engine names must be unique and nonempty per case")
        candidate_id = "C-" + hashlib.sha256(f"{seed}:{case_id}:{engine}".encode()).hexdigest()[:10]
        if candidate_id in private["candidates"]:
            raise ValueError("Candidate ID collision")
        content = str(candidate.get("content") or "")
        packet["candidates"].append({
            "candidate_id": candidate_id, "status": candidate.get("status", "unknown"),
            "content": content[:max_chars], "metadata": candidate.get("metadata", {}),
            "truncated": len(content) > max_chars,
        })
        private["candidates"][candidate_id] = {
            "engine": engine,
            "status": candidate.get("status", "unknown"),
            "metadata": candidate.get("metadata", {}),
            "reference_metadata": reference.get("metadata", {}),
            "reference_truncated": len(str(reference["content"])) > max_chars,
            "candidate_truncated": len(content) > max_chars,
            "duration_seconds": candidate.get("duration_seconds"),
            "attempts": candidate.get("attempts"),
            "successes": candidate.get("successes"),
        }
    # Deterministically reorder to avoid presenting input order as a ranking.
    packet["candidates"].sort(key=lambda c: c["candidate_id"])
    return packet, private


def ai_quality_score(review: dict) -> float:
    total = 0.0
    for field, weight in AI_WEIGHTS.items():
        if field not in review or isinstance(review[field], bool):
            raise ValueError(f"Missing/invalid AI rating: {field}")
        val = review[field]
        if not isinstance(val, (int, float)) or not 0 <= val <= 5:
            raise ValueError(f"AI rating must be a number from 0 to 5: {field}")
        total += val / 5.0 * weight
    return round(total, 2)


def deterministic_metrics(details: dict, category: str) -> tuple[dict, list[str]]:
    """Return component points and the reasons a full score cannot be computed."""
    metrics, missing = {}, []
    ref = details.get("reference_metadata") or {}
    pred = details.get("metadata") or {}
    provided = [key for key in META_FIELDS if _normalized(ref.get(key))]
    if provided:
        matches = sum(_normalized(pred.get(k)) == _normalized(ref.get(k)) for k in provided)
        metrics["metadata_10"] = round(10.0 * matches / len(provided), 2)
    else:
        metrics["metadata_10"] = None
        missing.append("reference metadata")

    attempts, successes = details.get("attempts"), details.get("successes")
    if (isinstance(attempts, int) and not isinstance(attempts, bool)
            and isinstance(successes, int) and not isinstance(successes, bool)
            and attempts >= 3 and 0 <= successes <= attempts):
        metrics["reliability_20"] = round(20.0 * successes / attempts, 2)
    else:
        metrics["reliability_20"] = None
        missing.append("at least 3 measured attempts/successes")

    duration = details.get("duration_seconds")
    if (isinstance(duration, (int, float)) and not isinstance(duration, bool)
            and duration >= 0 and category in LATENCY_TARGETS):
        target = LATENCY_TARGETS[category]
        metrics["performance_10"] = round(min(10.0, 10.0 * target / max(duration, target)), 2)
    else:
        metrics["performance_10"] = None
        missing.append("measured duration / known category target")
    return metrics, missing


def score_reviews(maps: list[dict], reviews: list[dict]) -> list[dict]:
    by_key = {}
    for review in reviews:
        key = (str(review.get("case_id", "")), str(review.get("candidate_id", "")))
        if key in by_key:
            raise ValueError(f"Duplicate AI review for {key}")
        by_key[key] = review

    results = []
    for case in maps:
        category, case_id = case["category"], case["case_id"]
        for candidate_id, details in case["candidates"].items():
            status = details.get("status")
            if status == "unsupported":
                results.append({"case_id": case_id, "category": category,
                                "candidate_id": candidate_id, "engine": details["engine"],
                                "status": "not_applicable", "ai_60": None, "final_100": None,
                                "missing": "engine does not support content category"})
                continue
            review = by_key.get((case_id, candidate_id))
            ai = ai_quality_score(review) if review and not review.get("insufficient_reference") else None
            measurements, missing = deterministic_metrics(details, category)
            if review is None:
                missing.append("AI assessment")
            if details.get("reference_truncated") or details.get("candidate_truncated"):
                missing.append("review packet truncation: verify full reference/content")
            if review and review.get("insufficient_reference"):
                missing.append("inadequate ground truth")
                ai = None
            total = None if missing else round(ai + sum(measurements.values()), 2)
            results.append({
                "case_id": case_id, "category": category, "candidate_id": candidate_id,
                "engine": details["engine"], "status": status,
                "ai_60": ai, **measurements, "final_100": total,
                "missing": "; ".join(missing),
                "ai_notes": (review or {}).get("notes", ""),
            })
    unknown = set(by_key) - {(m["case_id"], c) for m in maps for c in m["candidates"]}
    if unknown:
        raise ValueError(f"Unknown AI candidate IDs: {sorted(unknown)!r}")
    return results


def summarise_by_category(rows: list[dict]) -> list[dict]:
    by_pair = defaultdict(list)
    for row in rows:
        if row.get("final_100") is not None:
            by_pair[(row["category"], row["engine"])].append(row["final_100"])
    return [{"category": category, "engine": engine, "scored_cases": len(values),
             "mean_score": round(sum(values) / len(values), 2)}
            for (category, engine), values in sorted(by_pair.items())]


def read_jsonl(path):
    with open(path, encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]


def write_jsonl(path, records):
    with open(path, "w", encoding="utf-8") as f:
        for record in records:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")
