---
name: build
description: The amp execution stage (Superpowers subagent-driven development, made lean). Executes an amp plan task by task in the current session. Per task, one amp:implementer writes tests, code, docs and one atomic commit, and one amp:reviewer gives spec, quality and lean verdicts, with a capped fix loop re-checked by the resumed reviewer. A crash-proof ledger tracks progress, and a final whole-branch review closes it. Runs autonomously with no check-ins. Run by amp:phase after amp:plan.
effort: high
---

# amp:build

You are the orchestrator. You never write product code here: every change comes from an
`amp:implementer` and passes a review. Your context stays for coordination: paths in, contracts
out (`amp:lean` §2).

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
   Confirm or override each `**Independent:** yes` mark with a ruling: the task consumes nothing
   the previous task produces and shares no file with it.

## The task loop (never two implementers in the same tree)

For each task N:

1. `BASE=$(git rev-parse HEAD)`, then `bash "$S/task-brief" <plan> N $WS`.
2. **Implement:** dispatch `amp:implementer` with `prompts/implement.md`. Record its agent id (fix
   rounds 1–3 resume it).
3. **Handle the contract:**
   - `DONE`: go to review (and start **Pipelining** below when task N+1 is Independent).
   - `DONE_WITH_CONCERNS`: resolve correctness or scope concerns first, then review.
   - `NEEDS_CONTEXT`: answer precisely and resume.
   - `BLOCKED`: change something before retrying (more context, split the task, the escalation
     model (amp:phase, Model routing), or a ledgered ruling that corrects the plan). Never retry unchanged.
4. **Review:** `bash "$S/review-package" $WS $BASE HEAD`, then dispatch `amp:reviewer` with
   `prompts/task-review.md`. Record the reviewer's agent id (fix-round re-reviews resume it).
   Don't read the package yourself. Resolve each ⚠️ item yourself (you hold cross-task context);
   a confirmed gap counts as a spec ❌.
5. **Fix loop** (triggers: spec ❌, Critical or Important). Minor findings and lean tags never loop;
   ledger them as `Task N: minor (deferred): <one-liner>`. A finding that conflicts with the plan
   text gets a ledgered ruling first. Up to **5 rounds**, each round one fix plus one scoped
   re-review:
   - Rounds 1–3 resume the same implementer. Rounds 4–5 dispatch a **fresh** implementer with
     the escalation model (amp:phase, Model routing) ("you own it now; read the report for what was tried").
   - Before each round, `FIX_BASE=$(git rev-parse HEAD)`. After it, confirm the fix report has
     tests, command and output, run `review-package $WS $FIX_BASE HEAD`, and resume the task's
     reviewer with `prompts/re-review.md` (as its header says). Only if the resume fails, dispatch
     `amp:checker` with the full template and ledger
     `Re-review: checker (reviewer not resumable: <why>)`. New Critical/Important breakage joins
     the open list; out-of-scope observations become deferred minors.
   - Ledger `Task N: fix round R/5 (X addressed, Y open — <one-liners>; commits a..b)`.
   - **Breaker at round 5:** adjudicate every open finding. If it is wrong or contestable, or real
     but nothing builds on it, record `Task N: parked — <finding> — Ruling: <why>`. If it is real
     and load-bearing, rule the smallest unblocking change and carry it into the next dispatch.
     Adjudicate only at the cap; every adjudication is a ledger line and nothing is discarded
     silently.
6. **Complete:** ledger `Task N: complete (commits a..b, review clean | K parked)`, tick the task's
   checkboxes in the plan file, and move on without asking anything.

**Batching:** tasks the plan marks as one batch of same-shape edits get one dispatch and one review.

**Pipelining** (opt-in through the plan's confirmed Independent marks; at most one task runs
ahead). When task N's implementer reports DONE (or DONE_WITH_CONCERNS once resolved) and task N+1
is Independent, set `WT="$WS/wt-<N+1>"`:

1. `bash "$S/task-brief" <plan> N+1 $WS`, then `git worktree add "$WT" -b amp-wt-<N+1>` (from
   HEAD, task N's head). Ledger `Task N+1: pipelined (worktree <WT>)`. Run the project's
   documented install or setup in `$WT` if its tests need one. If that fails, or the tests need
   setup the project doesn't document, clean up, ledger `Pipeline: off — <why>`, and run the rest
   of the plan sequentially.
2. Dispatch task N's reviewer (loop step 4) and task N+1's implementer together, the implementer
   with `Work in: <WT> on branch amp-wt-<N+1>`. Every dispatch while the pipeline is open names
   `<WT>` as a pipelined worktree outside its scope. Task N's fix loop runs as usual in the main
   tree.
3. When task N is complete **and** N+1's implementer has returned its contract (wait for it
   otherwise, and handle it as in loop step 3): if N gained fix commits,
   `git -C "$WT" rebase <phase branch>` (N+1's commits are unreviewed, so rewriting them is safe).
   On a conflict, `git -C "$WT" rebase --abort`, clean up, ledger
   `Task N+1: pipeline dropped — <why>`, and run N+1 sequentially from scratch. On a clean rebase,
   resume N+1's implementer to re-run its tests in the worktree.
4. `BASE=$(git rev-parse HEAD)`, ledger `Task N+1: merged (base <BASE>)`, then
   `git merge --ff-only amp-wt-<N+1>` and clean up. Task N+1 continues at loop step 4 (review of
   `BASE..HEAD`).

**Cleanup** (every exit): `git worktree remove --force "$WT"`, then `git branch -D amp-wt-<N+1>`
(`-D`: after a drop the branch is unmerged).

The worktree sits under the git-ignored `.amp/`, which some tools don't honor. While a pipeline is
open, reference and dead-code checks use `git grep` (tracked files only), and a test or lint
failure whose path is under `.amp/` is a pipeline artifact: re-run with `.amp` excluded, never a
finding. The agents carry the same rule.

**Resume after a crash** (a `Task N+1: pipelined` line with no later `Task N+1: complete`): N+1 is
merged only when the ledger has `Task N+1: merged (base <BASE>)` **and** `amp-wt-<N+1>` is an
ancestor of HEAD (`git merge-base --is-ancestor amp-wt-<N+1> HEAD`), or the branch is already gone
and `<BASE>..HEAD` holds N+1's commit. Then clean up what is left and continue N+1 from its last
ledger line (review of `<BASE>..HEAD`). Otherwise clean up, ledger `Pipeline: off — resume`, and
redo N+1 sequentially after task N; that includes a crash while N+1 was still being implemented,
when the temp branch tip is still N's head.

## Final review

1. `MB=$(git merge-base origin/<default> HEAD)`, then `review-package $WS $MB HEAD`. Dispatch
   `amp:reviewer` with `prompts/final-review.md`.
2. If it returns findings (including ledger items triaged must-fix), send **ONE** `amp:implementer`
   dispatch with the complete list (never one fixer per finding), then one scoped re-review of that
   range by the resumed final reviewer, with the fix loop's checker fallback. Adjudicate residuals
   as at the breaker. There is no second wave.
3. Commit the plan's ticked checkboxes if they aren't committed yet:
   `docs(<NN>): mark plan tasks complete`.
4. Hand off to **amp:ship**. The workspace stays until the merge (amp:ship reads the ledger for the
   PR body and deletes it).

## Red flags

| Thought | Reality |
|---|---|
| "Tiny fix, I'll do it myself" | Orchestrator edits skip review and bloat context. Resume the implementer. |
| "Skip the re-review, the fix was small" | Unreviewed fixes are how regressions land. |
| "The reviewer is obviously wrong, drop it" | Adjudication happens only at the cap, as a ledger ruling. |
| "Should I continue?" | The grill gate was the approval. Continue. |
| "I'll paste the task text" | Brief file path. Always. |
| "HEAD~1 is the base" | The recorded BASE. Multi-commit tasks lose commits otherwise. |
