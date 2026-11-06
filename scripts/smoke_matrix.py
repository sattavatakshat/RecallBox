"""Run a manual smoke matrix against your local API and save result summary.

Usage: python scripts/smoke_matrix.py urls.txt results.csv
URLs are processed sequentially to keep memory usage low.
"""
import csv
import sys
import time
from pathlib import Path
import httpx


def main():
    if len(sys.argv) != 3:
        raise SystemExit("Usage: python scripts/smoke_matrix.py urls.txt results.csv")
    urls = [line.strip() for line in Path(sys.argv[1]).read_text().splitlines()
            if line.strip() and not line.lstrip().startswith("#")]
    with httpx.Client(timeout=90.0) as client, Path(sys.argv[2]).open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["url", "status", "engine", "platform", "chars", "seconds", "error"])
        writer.writeheader()
        for url in urls:
            start = time.monotonic()
            try:
                response = client.post("http://127.0.0.1:8000/v1/extract", json={"url": url})
                response.raise_for_status()
                data = response.json()
                row = dict(url=url, status=data["status"], engine=data.get("engine") or "",
                           platform=data.get("platform") or "", chars=len(data.get("content") or ""),
                           seconds=f"{time.monotonic()-start:.2f}", error=data.get("error") or "; ".join(data.get("warnings", [])))
            except (httpx.HTTPError, ValueError, KeyError) as exc:
                row = dict(url=url, status="ERROR", engine="", platform="", chars=0,
                           seconds=f"{time.monotonic()-start:.2f}", error=str(exc))
            writer.writerow(row)
            print(f"{row['status']:14} {row['engine']:12} {row['seconds']}s  {url}")
    print("Wrote", sys.argv[2])


if __name__ == "__main__":
    main()
