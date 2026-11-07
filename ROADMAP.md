# Universal URL Extractor Roadmap

This roadmap separates **implemented functionality**, **near-term open-source development**, and the **separate RecallBox product vision**. Planned features are not promises or shipped capabilities. Milestones are intentionally outcome-based, without speculative delivery dates.

## Current baseline — v0.3 (implemented, experimental)

Based on the code and documentation currently in this repository:

- [x] Python/FastAPI endpoint and CLI for normalized URL extraction.
- [x] Lightweight HTML extraction, plus optional Crawl4AI, Agent Reach, and Docling integrations.
- [x] Explicit metadata-only, unsupported, and failed results.
- [x] Independent engine runs and repeated attempts in the Benchmark Lab.
- [x] Local SQLite history, storage migrations, provenance snapshots, and hash-checked artifacts.
- [x] Blinded manual review/export workflow and optional API evaluator.
- [x] Evidence-gated scoring and preliminary leaderboard/export capabilities.
- [ ] Public, permissioned benchmark corpus with verified reference labels and independently reviewed scores.
- [ ] Public-internet deployment hardening and multi-tenant isolation.

**Honesty check:** Implementation of scoring and storage does not mean a verified benchmark dataset or external adoption already exists.

## Next — v0.4: trustworthy beta evidence

- [ ] Curate a permissioned, diverse URL collection across static HTML, JS-heavy pages, PDFs, and supported platform previews.
- [ ] Build a repeatable manual smoke matrix with real outcomes, access constraints, failure categories, and versioned provenance.
- [ ] Expand toward **1,000 URLs** with reliable, attributable references and human/AI quality review before considering ML routing.
- [ ] Publish a bounded, anonymized public results sample only where redistribution is permitted.
- [ ] Improve user-facing diagnostics for disabled adapters, truncation, missing subtitles, and metadata-only responses.
- [ ] Document reproducible performance observations and explicitly stated system constraints.
- [ ] Strengthen local data retention and privacy practices for extraction artifacts.

## Later — v0.5: developer experience and stability

- [ ] Stabilize public API/CLI contracts and packaging instructions.
- [ ] Add adapter extension examples and cross-platform configuration guidance.
- [ ] Improve cancellation, retries/backoff, resource budgets, and recovery behaviors.
- [ ] Introduce small public examples that can be reproduced without paid APIs or social logins.
- [ ] Reassess automated regression coverage when interfaces settle.
- [ ] Maintain honest documentation about shared backends and benchmark comparability.

## Future exploration — not yet scheduled

- [ ] Compare deterministic engine-routing heuristics against benchmark evidence.
- [ ] **Only after sufficiently large, validated datasets (target: 1,000+ URLs)** explore training/validating an ML routing model. Do not mix model-training experiments into the current beta collection workflow.
- [ ] Production-grade isolated workers, restricted network egress, authentication, quotas, audit logs, and multi-tenant security.
- [ ] Clearly documented data-retention policy and safe hosting architecture before public multi-user availability.

## RecallBox — separate planned application

RecallBox is a proposed **personal AI memory library** powered in part by the extraction toolkit. It is not included as a functioning app in this repository.

Candidate future milestones, tracked separately:

- [ ] Standalone, consent-based capture of links, notes, PDFs, and screenshots.
- [ ] Metadata-first support for social links, without implying video transcription or full reel comprehension.
- [ ] OCR/transcription only for user-provided or authorized content, with clear processing states.
- [ ] Personal library, deduplication, and natural-language retrieval.
- [ ] Actions such as study queues, recipe planning, and travel shortlists, only with user approval.
- [ ] Privacy, deletion, permissions, and lightweight local-first deployment model.

See [docs/RECALLBOX_VISION.md](docs/RECALLBOX_VISION.md) for boundaries and the first proposed vertical slice.

## Contribution priorities

The best first contributions are documentation fixes, adapter error reporting, narrow reproducible bugs, authorized benchmark examples, and resource/safety improvements. Discuss substantial feature proposals through GitHub issues before investing in large changes.

We prefer **verified evidence over benchmark claims**, **working vertical slices over broad promises**, and **modular infrastructure over coupling to RecallBox**.
