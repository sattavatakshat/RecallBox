# RecallBox — atomic UX task runner (proposed)

**State:** ChatGPT hourly automation is ENABLED (task ID `6af9fed59c8081918d51fbab5d2790ba`, Asia/Kolkata). It orchestrates one queue iteration per run. A direct Codex Cloud launcher is still not exposed; never claim Codex Cloud execution unless observed.
**Queue (editable):** https://docs.google.com/spreadsheets/d/15QBYgQifpm1PgiX6pl2Gap19kq6C6eC2U3Lq115Clk8/edit
**Design baseline:** [Final UX blueprint](RECALLBOX_FINAL_UX_BLUEPRINT_V1.md) and [interactive prototype](RecallBox_Interactive_Prototype.html).
**Repo:** `sattavatakshat/RecallBox`, latest `main`.

## What the user wants

One small screen-level change per run, with a fresh task chosen only after the previous PR is safely completed, no repeated whole-app prompts, and a testable Android build when waking up. The complete feature scope stays intact; this is a UI implementation queue, not permission to fake backend functions.

## Queue contract

The Google Sheet's **Queue** tab has stable `UX-001 ... UX-027` IDs, order, priority, targets, acceptance, dependencies, PR/SHA, status and device-QA columns. Read rows explicitly; **never infer success from the model response**.

States: `TODO → READY → IN_PROGRESS → PR_OPEN → CI_GREEN → MERGED`; on failure use `BLOCKED` or `FAILED` with a concrete reason. `Device QA` is independent of merge.

### One-at-a-time algorithm

1. Fetch latest `main`, the sheet, open PRs and CI. If a task is `IN_PROGRESS`, `PR_OPEN` or `CI_GREEN`, **only resume/reconcile that task**. Do not claim a second one. An active Codex Cloud run also blocks starting a new run. Use a persistent external lock/lease with expiry and owner; Sheets alone is not atomic.
2. If no task is active, pick the earliest `TODO/READY` row with **every dependency `MERGED`**. Update its status to `IN_PROGRESS` before executing. If no task qualifies, report ID/blocker and stop.
3. Start work from latest `main` on branch `ux/<task-id>-<short-name>`. Read the exact row, UX blueprint section and current source. Implement that one task only, with minimum edits in scoped files. Never rewrite another screen just because it is nearby.
4. Run existing Expo typecheck and any affected static checks. Do not add a huge automated test suite during volatile prototype work. Manually smoke-check anything runnable in the cloud; report native device checks as `UNVERIFIED` unless performed.
5. Open a PR with task ID, checklist, relevant screenshot if grounded, actual check results, and remaining limitations; update Sheet status `PR_OPEN`.
6. Check exact PR head SHA, mainline conflicts, code diff, no token/secret leaks, no fake UI, and required CI result. Treat skipped/missing CI as **not green**. On failure mark `BLOCKED`; retry **same task** next run.
7. Only for a narrowly scoped, reviewed, green PR with no unresolved blocker: squash merge, verify GitHub reports merge `merged:true`, verify its commit on `main`, then set `MERGED`, SHA, PR link and last QA result. A merged task is still **not** a phone-verified task.
8. Summarize exact action and stop. Never start a second task during the same scheduled tick.

### Concurrency and safety

- Use **one runner globally**. On GitHub Actions, `concurrency: {group: recallbox-ux-scheduler, cancel-in-progress: false}` would serialize scheduled runs, but **does not itself provide a transactional Sheet claim or a complete Codex Cloud integration**. The live runner must also inspect open PR/active Codex execution and maintain a persistent lease/lock.
- Merge only UI-scoped changes for this unattended workflow; migrations, auth, network egress, deletion, data handling, or credential changes are **blocked for human review**.
- Never grant the LLM access to GitHub write credentials and the OpenAI API key in the same untrusted execution context. Separate unprivileged code generation from trusted CI/merge steps.
- GitHub `main` is authoritative; Sheet is the human-facing execution ledger. If sheet edit fails after a verified merge, reconcile on the next run without double-applying code.
- Preserve all working Auth0/SQL ownership, retries, provenance and independent Universal Extractor modules.
- No visible `Saved` unless durable capture is confirmed. No queued/failed items in finalized Library; retain them in Recently Captured.
- Preserve one prominent Save action and Library, Search, Collections tabs. No empty Actions tab or fake recommendation CTA.
- No automatic merging of privacy/backend/security changes, even if tests are green.

## Small-task Codex Cloud prompt

```
Open sattavatakshat/RecallBox and read docs/UX/ATOMIC_TASK_RUNNER.md.
Read the Google Sheet Queue and Runner Rules at the URL in that file.
Reconcile any active task/PR first. Do not start a new task if one is in progress.
Work on one eligible UX row only. Use the committed UX blueprint and HTML prototype as visual references.
Implement a minimal patch, run the existing checks, open a PR, and report PR URL, exact SHA, passes/failures and mobile QA left to run.
Do not claim merged or update the row to MERGED unless the GitHub merge was verified. If blocked, record the blocker and stop.
Do not change auth, migrations, network worker, data model, or unrelated screens.
```

## Scheduling and cost reality

ChatGPT's built-in task scheduler supports at most **hourly** recurring runs. The user accepted hourly frequency and the **RecallBox Hourly UX Build** automation is enabled. The first scheduled run reported was **2026-11-16 01:19:57 IST**. Each later iteration must inspect the live Sheet and GitHub; do not infer that a scheduled task successfully edited code.

GitHub Actions supports a 30-minute cron (not guaranteed to start exactly on time). The official `openai/codex-action@v1` is a **Responses API-key** integration with separate API billing; it does not consume ChatGPT subscription Codex Cloud credits. There is no Codex Cloud task-launch tool exposed in this chat. **Do not silently enable an API-paid alternative.**

To complete unattended execution, an operator must select an execution surface, provide the necessary authenticated Codex Cloud environment or opt into the separate API-key workflow, and confirm the automation can read/write the Google Sheet and repository. The hourly orchestration is active, but that does not guarantee Codex Cloud code execution or successful merges. Without an authorized launcher, a run may use available connected GitHub tools for a narrowly scoped patch, or report BLOCKED; no paid API alternative is enabled.

## Morning verification

On an actual Android phone, run launch → Library → Save note → Save link → open memory → search → star → add/remove collection → restart/reopen. Record PASS/FAIL and videos/screenshots privately. Report exactly which UX IDs are merged vs device verified. No promise that all 27 tasks can complete in one night.
