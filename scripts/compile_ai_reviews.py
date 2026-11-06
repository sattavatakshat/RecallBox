"""Merge ChatGPT JSONL scores with local observed metrics.

Usage: python scripts/compile_ai_reviews.py benchmarks/private_map.jsonl benchmarks/ai_reviews.jsonl benchmarks/scores.csv benchmarks/category_summary.csv
"""
import argparse
import csv
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'src'))
from universal_extractor.benchmarking import read_jsonl, score_reviews, summarise_by_category


def write_csv(path, rows):
    columns = list(dict.fromkeys(k for row in rows for k in row))
    with open(path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=columns)
        writer.writeheader()
        writer.writerows(rows)


def main():
    parser = argparse.ArgumentParser()
    for name in ('private_map', 'ai_reviews', 'scores_csv', 'summary_csv'):
        parser.add_argument(name)
    args = parser.parse_args()
    scores = score_reviews(read_jsonl(args.private_map), read_jsonl(args.ai_reviews))
    write_csv(args.scores_csv, scores)
    write_csv(args.summary_csv, summarise_by_category(scores))
    print(f'Wrote {len(scores)} scored/pending entries. Missing evidence yields blank final scores, not invented zeros.')


if __name__ == '__main__':
    main()
