---
name: build
description: The amp execution stage (Superpowers subagent-driven development, made lean). Executes an amp plan in the current session, running tasks that don't depend on each other and share no file in parallel git worktrees. Per task, one amp:implementer writes tests, code, docs and one atomic commit, and one amp:reviewer gives spec, quality and lean verdicts, with a capped fix loop re-checked by the resumed reviewer. A crash-proof ledger tracks progress, and a final whole-branch review closes it. Runs autonomously with no check-ins. Run by amp:phase after amp:plan.
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
   If no ledger exists (amp:build run on its own), create it with the header
   `# amp ledger — <NN>-<slug>` and the lines `Branch: <branch>` and `Plan: <plan path>`.
   Either way, append `Stage: build`.
3. Read the plan once (and the spec sections it leans on). Create one todo per task.
4. **Preflight**, written to the ledger as a table. Each task's `**Depends on:**` line names the
   earlier tasks it needs. A plan with no `Depends on` line (an older plan): each task depends on
   the one before it, with no rulings. A plan with only some lines: rule each missing line as
   depending on the previous task, and ledger the ruling. Then:
   - **Graph check:** every listed id is a task in the plan, and it comes earlier than the task
     listing it (that alone rules out cycles). Each violation, and each consumed interface or
     touched created file that isn't listed, gets a ruling that corrects the dependency. A graph
     the spec can't repair is amp:phase's "broken plan" stop.
   - **Exclusive pairs:** one row per pair of tasks whose Files or Docs lines share a path
     (compared without `:lines` suffixes). A pair where neither depends on the other, directly or
     transitively, never runs at the same time.
   - **Conflicts:** one row per pair of tasks sharing an interface (what one produces vs what the
     other consumes, or both producing the same thing), and one row per task (do its tests match
     its code, and its created files match its later touches).

   Rule on every conflict, with the spec as the authority:
   `Ruling: <decision> — <why> — <cost if wrong>`. When the **Scheduling** cap is 1, ledger
   `Parallel: off — Parallel tasks: 1`.

## The task loop (per task, in its tree; never two implementers in the same tree)

**Scheduling** below starts each task. Its **tree** is the repo root or its worktree `$WT`, and its
**head** is `HEAD` or `amp-wt-<N>`. Per task N, in its tree:

1. **Start:** `bash "$S/task-brief" <plan> N $WS`. A main-tree task sets
   `BASE=$(git rev-parse HEAD)` and ledgers `Task N: started (main tree, base <BASE>)`; a worktree
   task starts as in **Worktree tasks**.
2. **Implement:** dispatch `amp:implementer` with `prompts/implement.md`, `Work in:` naming its
   tree. Record its agent id (fix rounds 1–3 resume it).
3. **Handle the contract:**
   - `DONE`: go to review.
   - `DONE_WITH_CONCERNS`: resolve correctness or scope concerns first, then review. A
     shared-resource flake (a port, a database, a fixed temp path) counts as resolved once the test
     passes when it is run alone.
   - `NEEDS_CONTEXT`: answer precisely and resume.
   - `BLOCKED`: change something before retrying (more context, split the task, the escalation
     model (amp:phase, Model routing), or a ledgered ruling that corrects the plan). Never retry unchanged.
4. **Review:** `bash "$S/review-package" $WS <BASE> <task head>`, then dispatch `amp:reviewer` with
   `prompts/task-review.md`, `Tree:` naming its tree. Record the reviewer's agent id (fix-round
   re-reviews resume it). Don't read the package yourself. Resolve each ⚠️ item yourself (you hold
   cross-task context); a confirmed gap counts as a spec ❌.
5. **Fix loop** (triggers: spec ❌, Critical or Important). Minor findings and lean tags never loop;
   ledger them as `Task N: minor (deferred): <one-liner>`. A finding that conflicts with the plan
   text gets a ledgered ruling first. Up to **5 rounds**, each round one fix plus one scoped
   re-review:
   - Rounds 1–3 resume the same implementer. Rounds 4–5 dispatch a **fresh** implementer with
     the escalation model (amp:phase, Model routing) ("you own it now; read the report for what was tried").
   - Before each round, `FIX_BASE=$(git rev-parse <task head>)`. After it, confirm the fix report
     has tests, command and output, run `review-package $WS $FIX_BASE <task head>`, and resume the
     task's reviewer with `prompts/re-review.md` (as its header says). Only if the resume fails,
     dispatch `amp:checker` with the full template and ledger
     `Re-review: checker (reviewer not resumable: <why>)`. New Critical/Important breakage joins
     the open list; out-of-scope observations become deferred minors.
   - Ledger `Task N: fix round R/5 (X addressed, Y open — <one-liners>; commits a..b)`.
   - **Breaker at round 5:** adjudicate every open finding. If it is wrong or contestable, or real
     but nothing builds on it, record `Task N: parked — <finding> — Ruling: <why>`. If it is real
     and load-bearing, rule the smallest unblocking change and carry it into the next dispatch.
     Adjudicate only at the cap; every adjudication is a ledger line and nothing is discarded
     silently.
6. **Complete:** a worktree task goes through **Integration**, which writes its line. A main-tree
   task ledgers `Task N: complete (commits <BASE7>..<head7>, review clean | K parked)`. Then tick
   the task's checkboxes in the plan file and go to the next scheduling point without asking
   anything.

**Batching:** tasks the plan marks as one batch of same-shape edits get one dispatch and one review,
and count as one task in scheduling.

## Scheduling

- **Cap** = the amp configuration's `Parallel tasks`, else 3. A value that isn't an integer ≥ 1 is
  ruled to 3 and ledgered.
- **Ready** (a task, against a set F of tasks in flight) = not started, not dropped, every
  `Depends on` task **complete** (merged into the phase branch, never merely `DONE`), and no
  exclusive pair with any task in F.
- A **scheduling point** comes at build start, after each completion and after each drop. At each:
  1. **Redo first.** If a dropped task awaits its redo, start nothing until nothing is in flight.
     Then run the lowest-numbered dropped task alone in the main tree, and go to the next
     scheduling point when it completes.
  2. **Pick.** Otherwise S = the starts so far (empty). Repeat: take the lowest-numbered task ready
     against F ∪ S and add it to S, while |F ∪ S| < cap and one is ready.
  3. **Place.** If F is empty and S holds exactly one task, it runs in the main tree. Otherwise
     every task in S gets a worktree.
- A main-tree task is therefore alone in flight: a new start needs a scheduling point, and the only
  task in flight to complete or drop is that one.
- Dispatch the agents of different tasks together (several implementers in one message, or one
  task's reviewer next to another's implementer) and handle each contract as it arrives.
- While worktree tasks are in flight, the main tree stays on the phase branch. Its only uncommitted
  edits are the plan's ticked checkboxes, which no task touches. Git writes go only to task
  worktrees, their `amp-wt-*` branches and the fast-forward merges.

## Worktree tasks

- **Start:** `BASE=$(git rev-parse HEAD)` (the phase branch head), `WT="$WS/wt-<N>"`,
  `git worktree add "$WT" -b amp-wt-<N>`, then run the project's documented install or setup in
  `$WT` if its tests need one. Ledger `Task N: started (worktree <WT>, base <BASE>)`.
- **Setup failure** (the worktree add, or setup the project doesn't document): clean up, ledger
  `Parallel: off — <why>`, and run every task not yet started sequentially in the main tree once
  the in-flight tasks finish (cap 1 from then on).
- **Dispatches:** the implementer gets `Work in: <WT> on branch amp-wt-<N>`, and the reviewer and
  checker get `Tree: <WT>`. The task head is `amp-wt-<N>`. Every dispatch while other tasks are
  in flight states that `.amp/` holds other tasks' worktrees, outside its scope.
- The worktrees sit under the git-ignored `.amp/`, which some tools don't honor. While worktree
  tasks are in flight, reference and dead-code checks use `git grep` (tracked files only), and a
  test or lint failure whose path is under `.amp/` (outside the task's own tree) is another task's
  worktree: re-run with `.amp` excluded, never a finding. The agents carry the same rule.

## Integration

A worktree task integrates once its review is clean or its breaker has ruled.
Only one task integrates at a time. Others queue in the order they became ready to integrate.

1. `git -C "$WT" status --porcelain` must be empty. If it isn't, resume the implementer to commit
   or discard its leftovers, then run this check again. Committing them is a fix round of the same
   loop, counted against the same 5-round cap and re-reviewed as usual (the task leaves the queue
   as in step 2); discarding them needs no review.
2. If the phase branch head ≠ BASE: `git -C "$WT" rebase <phase branch>`. On failure, run
   `git -C "$WT" rebase --abort` (ignore its error) and **drop**. On success, set
   `BASE=$(git rev-parse <phase branch>)`, ledger `Task N: rebased (base <BASE>)`, and resume the
   implementer with the re-test variant of `prompts/implement.md`. A failing re-test is a fix round
   of the same loop, counted against the same 5-round cap and re-reviewed as usual. The task leaves
   the queue during the fix, then re-queues and restarts at step 1. At the cap, the breaker
   adjudicates as usual.
3. **Check:** `git rev-list --count <BASE>..amp-wt-<N>` ≥ 1, and
   `git merge-base --is-ancestor <phase branch> amp-wt-<N>`. If either fails, **drop**.
4. From the main tree: `git merge --ff-only amp-wt-<N>`. A failure is a **drop**. On success, at
   once ledger `Task N: complete (commits <BASE7>..<head7>, review clean | K parked)`, then clean
   up.

**Drop:** clean up, then ledger `Task N: dropped — <why>` and
`Ruling: Task N dropped and redone alone — <why> — its work is redone`, so the drop reaches the
PR. Scheduling step 1 redoes the task from scratch, with its old brief and a fresh implementer.

**Cleanup** (every exit of a worktree task): `git worktree remove --force "$WT"`, then
`git branch -D amp-wt-<N>` (`-D`: after a drop the branch is unmerged). An error for an item
already gone is harmless. On a failed remove (a locked file), `git worktree prune` and retry once;
ledger anything left.

## Resume after a crash

A task is **in flight** when its last state line is `started`, `rebased` or a fix round. Its BASE
is the one on its last `started` or `rebased` line. For each in-flight task, the first case that
holds:

1. **Main-tree task** (a task with no `started (worktree` line, such as one a 1.4.0 ledger
   holds): resume from its last line, as in Setup step 2.
2. **Worktree task, already merged:** `amp-wt-<N>` exists,
   `git rev-list --count <BASE>..amp-wt-<N>` ≥ 1 and
   `git merge-base --is-ancestor amp-wt-<N> HEAD`; or the branch is gone and
   `git log --format=%s <BASE>..HEAD` holds the task's plan Commit line. Either way, write its
   `complete` line and clean up.
3. **Worktree task, worktree present:** continue from its last line in that worktree. Agents that
   are gone are re-dispatched fresh with the brief and report paths.
4. **Otherwise:** clean up and drop it (`Task N: dropped — resume`, with its Ruling line).

Then clean up any `$WS/wt-*` worktree or `amp-wt-*` branch whose task is not in flight, and go to
a scheduling point.

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
