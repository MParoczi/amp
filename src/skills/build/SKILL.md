---
name: build
description: The amp execution stage (Superpowers subagent-driven development, made lean). Executes an amp plan task by task in the current session. Per task, one amp:implementer writes tests, code, docs and one atomic commit, and one amp:reviewer gives spec, quality and lean verdicts, with a capped fix loop re-checked by amp:checker. A crash-proof ledger tracks progress, and a final whole-branch review closes it. Runs autonomously with no check-ins. Run by amp:phase after amp:plan.
effort: high
---

# amp:build

You are the orchestrator. You never write product code here: every change comes from an
`amp:implementer` and passes a review. Your context stays for coordination: paths in, contracts
out (`amp:lean` §2).

<!-- codex -->
`<skills>` is the folder that holds this skill's folder (the parent of this SKILL.md's directory); use its absolute path.

Every dispatch below is a `spawn_agent` call made as amp:phase, Model routing says:
`agent_type: "amp-<role>"`, the filled template as `message`, `reasoning_effort: "high"`, `model`
only when `amp-install.json` pins the role, and in v2 also a `task_name` from amp:phase's naming
scheme (`implementer_<N>`, `checker_<N>_r<R>`, `reviewer_final`, …) and `fork_turns: "none"`.
Collect each contract with `wait_agent` (in v2 it arrives as a message; wait again until it has).
Resume a live implementer with `followup_task` (v2) or `send_input` (v1). Where `close_agent`
exists, close each reviewer and checker once its result is read, and the implementer when its
task's fix loop ends or before any fresh implementer spawn for that task.

<!-- /codex -->
Scripts (run with `bash`, from any cwd inside the repo):
`S="${CLAUDE_PLUGIN_ROOT}/skills/build/scripts"` (keep the quotes: on Windows the path has backslashes): `$S/amp-workspace KEY`,
`$S/task-brief PLAN N WS`, `$S/review-package WS BASE HEAD`.
Dispatch templates: `${CLAUDE_SKILL_DIR}/prompts/`.

## Setup

1. `WS=$(bash "$S/amp-workspace" <NN>-<slug>)`. amp:phase normally created it already.
2. **Ledger** `$WS/progress.md`. If it exists, trust it and `git log` over your memory: tasks with
   `Task N: complete` are done, and a task whose last line is a fix round resumes at the next round.
   Otherwise create it with the first line `# amp ledger — plan: <plan path> — branch: <branch>`.
3. Read the plan once (and the spec sections it leans on). Create one todo per task.
4. **Preflight conflict scan**, written to the ledger as a table: one row per pair of tasks
   sharing a file or interface (what one produces vs what the other consumes, or both producing the
   same thing), and one row per task
   (do its tests match its code, and its created files match its later touches). Rule on every
   conflict, with the spec as the authority: `Ruling: <decision> — <why> — <cost if wrong>`.

## The task loop (strictly sequential: never two implementers at once)

For each task N:

1. `BASE=$(git rev-parse HEAD)`, then `bash "$S/task-brief" <plan> N $WS`.
2. **Implement:** dispatch `amp:implementer` with `prompts/implement.md`. Record its agent id (fix
   rounds 1–3 resume it).
3. **Handle the contract:**
   - `DONE`: go to review.
   - `DONE_WITH_CONCERNS`: resolve correctness or scope concerns first, then review.
   - `NEEDS_CONTEXT`: answer precisely and resume.
   - `BLOCKED`: change something before retrying (more context, split the task, the escalation
     {{claude: model}}{{codex: spawn}} (amp:phase, Model routing), or a ledgered ruling that corrects the plan). Never retry unchanged.
4. **Review:** `bash "$S/review-package" $WS $BASE HEAD`, then dispatch `amp:reviewer` with
   `prompts/task-review.md`. Don't read the package yourself. Resolve each ⚠️ item yourself (you
   hold cross-task context); a confirmed gap counts as a spec ❌.
5. **Fix loop** (triggers: spec ❌, Critical or Important). Minor findings and lean tags never loop;
   ledger them as `Task N: minor (deferred): <one-liner>`. A finding that conflicts with the plan
   text gets a ledgered ruling first. Up to **5 rounds**, each round one fix plus one scoped
   re-review:
   - Rounds 1–3 resume the same implementer. Rounds 4–5 dispatch a **fresh** implementer with
     the escalation {{claude: model}}{{codex: effort}} (amp:phase, Model routing) ("you own it now; read the report for what was tried").
   - Before each round, `FIX_BASE=$(git rev-parse HEAD)`. After it, confirm the fix report has
     tests, command and output, run `review-package $WS $FIX_BASE HEAD`, and dispatch `amp:checker`
     with `prompts/re-review.md`. New Critical/Important breakage joins the open list;
     out-of-scope observations become deferred minors.
   - Ledger `Task N: fix round R/5 (X addressed, Y open — <one-liners>; commits a..b)`.
   - **Breaker at round 5:** adjudicate every open finding. If it is wrong or contestable, or real
     but nothing builds on it, record `Task N: parked — <finding> — Ruling: <why>`. If it is real
     and load-bearing, rule the smallest unblocking change and carry it into the next dispatch.
     Adjudicate only at the cap; every adjudication is a ledger line and nothing is discarded
     silently.
6. **Complete:** ledger `Task N: complete (commits a..b, review clean | K parked)`, tick the task's
   checkboxes in the plan file, and move on without asking anything.

**Batching:** tasks the plan marks as one batch of same-shape edits get one dispatch and one review.

## Final review

1. `MB=$(git merge-base origin/<default> HEAD)`, then `review-package $WS $MB HEAD`. Dispatch
   `amp:reviewer` with `prompts/final-review.md`.
2. If it returns findings (including ledger items triaged must-fix), send **ONE** `amp:implementer`
   dispatch with the complete list (never one fixer per finding), then one scoped `amp:checker`
   re-review of that range. Adjudicate residuals as at the breaker. There is no second wave.
3. Commit the plan's ticked checkboxes if they aren't committed yet:
   `docs(<NN>): mark plan tasks complete`.
4. Hand off to **amp:ship**. The workspace stays until the merge (amp:ship reads the ledger for the
   PR body and deletes it).

## Model fallback

<!-- claude -->
On any dispatch that fails because the model is unavailable (rate limit, usage limit,
overloaded), re-dispatch the same prompt immediately with the fallback model (amp:phase, Model
routing). Ledger `Fallback: <role> → <model> (<error class>)` and keep that role on it for the
rest of this run. Don't ask the user; this is pre-authorized.
<!-- /claude -->
<!-- codex -->
On any spawn that fails because the model is unavailable (rate limit, usage limit, overloaded),
re-spawn the same message immediately without `model`, so the agent runs on the session model
(amp:phase, Model routing). Ledger `Fallback: <role> → session model (<error class>)` and keep
that role on it for the rest of this run. If the failed spawn already had no `model`, wait briefly
and retry once, then stop and tell the user. Don't ask the user otherwise; this is pre-authorized.
<!-- /codex -->

## Red flags

| Thought | Reality |
|---|---|
| "Tiny fix, I'll do it myself" | Orchestrator edits skip review and bloat context. Resume the implementer. |
| "Skip the re-review, the fix was small" | Unreviewed fixes are how regressions land. |
| "The reviewer is obviously wrong, drop it" | Adjudication happens only at the cap, as a ledger ruling. |
| "Should I continue?" | The grill gate was the approval. Continue. |
| "I'll paste the task text" | Brief file path. Always. |
| "HEAD~1 is the base" | The recorded BASE. Multi-commit tasks lose commits otherwise. |
