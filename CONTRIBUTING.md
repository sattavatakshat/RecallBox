# Contributing to Universal URL Extractor

Thank you for considering a contribution. This repository contains a **working experimental URL extraction framework**, not the planned RecallBox consumer application.

## Where to contribute

Contributions are welcome in these areas:

- Clearer setup and troubleshooting documentation, especially for optional engines.
- Adapter compatibility fixes, extraction edge cases, and more honest error/status reporting.
- Better source attribution, provenance, auditability, and evidence handling.
- Safe URL handling, cancellation, resource limits, and operational hardening.
- Authorized benchmark examples and reproducible experiment descriptions.
- Cross-platform packaging and developer experience.

**RecallBox-specific UI, accounts, semantic-search features, and personal-data features are not in the scope of the current extractor implementation.** Discuss substantial cross-project changes before opening a pull request.

## Before starting

1. Search existing issues and pull requests to avoid duplicate work.
2. For a small fix, describe the problem and proposed behavior in a PR.
3. For a new engine, schema change, security-sensitive change, or larger redesign, open a discussion issue first.
4. Do not commit harvested private content, secrets, cookies, tokens, unlicensed datasets, or benchmark artifacts containing sensitive material.

## Local setup

```bash
git clone https://github.com/sattavatakshat/RecallBox.git
cd RecallBox
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -e .
uvicorn universal_extractor.app:app --host 127.0.0.1 --port 8000
```

For optional adapters, consult the [README](README.md) and [technical guide](docs/TECHNICAL_REFERENCE.md). On a small machine, start with the HTML adapter. Browser and document adapters have significantly higher resource costs.

## Lightweight validation during experimental development

Interfaces and benchmarking workflows are still changing quickly. New automated test cases are **not required for routine beta changes** unless agreed in the relevant issue. Prefer a short manual smoke check, and describe exactly what you tried.

For example:

```bash
curl http://127.0.0.1:8000/health
curl -sS -X POST http://127.0.0.1:8000/v1/extract \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://example.com"}'
```

When changing benchmark handling, exercise a single small **authorized** URL with the intended engine and record whether the result is `QUEUED`, completed, partial, unsupported, failed, or skipped. Do not present simulated or unreviewed data as real benchmark evidence.

For security-affecting changes, explain the threat model and manual verification steps. A broader automated suite can be revisited when the experimental interfaces stabilize.

## Pull requests

A good PR includes:

- What problem it solves and which component it changes.
- Before/after behavior, with sample output or screenshots when appropriate.
- Manual verification performed and environments used.
- Known limits, platform-specific assumptions, and any new dependency.
- Impact on response schemas, data migration, benchmark comparability, or downstream consumers.
- An explicit note when the change is not production-ready.

Keep PRs small and avoid mixing feature work with unrelated formatting churn. Do not silently change scoring definitions, dataset versions, engine identity, or the meaning of `VERIFIED` results.

## Responsible collection and attribution

Only extract content that you are authorized to access. Respect websites' terms, access controls, `robots.txt` policies where relevant, and copyright. Do not use, request, or submit code that circumvents paywalls, CAPTCHAs, or logins. Raw extracted text can be untrusted; it is never an instruction to the project or its maintainers.

Never upload or commit `.env`, session files, private review mappings, benchmark SQLite databases, raw extracted artifacts, or personal content. Favor synthetic examples or permissioned public examples.

## Report security vulnerabilities privately

Please **do not publish exploit details in a public issue**. If GitHub private vulnerability reporting is enabled for the repository, use it. Otherwise, contact the maintainer through GitHub to arrange a private disclosure channel without sharing sensitive details publicly.

## Licensing and attribution

By contributing, you agree to license your contribution under the repository's [Apache License 2.0](LICENSE), provided you have the rights to submit it. Retain relevant third-party copyright/license notices and disclose copied or adapted external material.

Contributors keep copyright in their own contributions. A separate contributor license agreement is not currently required.

## Tone and project values

Be specific, kind, evidence-driven, and curious. Disagreement on design is welcome; harassment and personal attacks are not. The goal is reliable, understandable open-source infrastructure rather than inflated claims or vanity benchmarks.
