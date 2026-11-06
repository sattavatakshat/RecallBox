"""Generate blind review packets and a PRIVATE engine/metrics mapping.

Usage: python scripts/create_ai_review_bundle.py benchmarks/example_cases.jsonl benchmarks/review_packet.jsonl benchmarks/private_map.jsonl
"""
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'src'))
from universal_extractor.benchmarking import prepare_case, read_jsonl, write_jsonl


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('cases')
    parser.add_argument('review_packet')
    parser.add_argument('private_map')
    args = parser.parse_args()
    packets, private = [], []
    for case in read_jsonl(args.cases):
        packet, mapping = prepare_case(case)
        packets.append(packet)
        private.append(mapping)
    write_jsonl(args.review_packet, packets)
    write_jsonl(args.private_map, private)
    print(f'Exported {len(packets)} cases. Upload ONLY {args.review_packet} to ChatGPT; keep {args.private_map} local.')


if __name__ == '__main__':
    main()
