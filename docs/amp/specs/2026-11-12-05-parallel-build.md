# Phase 05 — parallel build: Spec

## 1. Goal

Phase 05 (`framework/05-parallel-build`) makes amp:build run as many plan tasks at once as is
safe. A task runs alongside others only when it doesn't build on them and shares no file with them.
This replaces the one-task-ahead pipelining from phase 03 (spec 03 D6).

The request was a plain one, not a roadmap phase. This repo has no roadmap, so the phase id follows
the specs before it (02–04).

## 2. Decisions

| # | Decision | Source |
|---|---|---|
| S1 | Edit `src/`; `scripts/render` produces `skills/`, `agents/`, `codex/` | spec 02 §5.1 |
| S2 | Never two implementers in one tree; task worktrees live under the git-ignored `.amp/<key>/wt-*` on `amp-wt-*` branches | spec 03 |
| S3 | Codex v1 allows 6 open agents per session by default | `src/skills/phase/SKILL.md:155` |
| S4 | The ledger drives the status line, `/amp-run` pane and resume guard | `hooks/run.ts` |
| S5 | A release is a minor bump plus a CHANGELOG entry | 1.3.0, 1.4.0 |
| S6 | amp:ship lists the ledger's `Ruling:` lines in the PR | `src/skills/ship/SKILL.md` |
| D1 | Every plan task carries `**Depends on:** none` or `**Depends on:** Task a, Task b`, naming the tasks whose output it consumes. amp:build starts a task once its dependencies are done. | user |
| D2 | A task starts only after all its dependencies are **complete**: reviewed, fixed and merged into the phase branch | user |
| D3 | At most 3 tasks in flight by default; the project's amp configuration key `Parallel tasks` overrides it | user |
| D4 | Two tasks that share any file, docs included, never run at the same time | user |
| D5 | A parallel task runs its whole lifecycle (implement, review, fix rounds) in its own worktree. Once it's complete, it's rebased onto the phase branch, its tests re-run if the rebase moved it, and it's fast-forwarded in. A task that would be the only one in flight runs in the main tree. | user |
| D6 | The one-task-ahead pipelining and the `**Independent:** yes` mark are deleted. A plan with no `Depends on` line runs fully sequentially. | user |
| D7 | The status line lists every active task with its fix round. The `/amp-run` pane lists each task with its state, fix round and worktree. | user |

## 3. Architecture

amp:build's task loop becomes a **scheduler** over the plan's dependency graph. The per-task
lifecycle stays as it is (implement → contract → review → fix loop up to 5 rounds → complete).
What changes is that each task carries its own **tree**: the repo root, or its worktree
`$WS/wt-<N>`. The tree is where its implementer edits and commits, and where its reviewer or
checker reads, greps and runs focused tests.

```
plan Depends on lines ─► preflight: graph check + exclusive pairs ─► ledger
                    scheduling point (build start, each completion, each drop) ─► start tasks (§5.3)
   main-tree task (alone in flight)        worktree task (two or more in flight)
   commits land on the phase branch        commits on amp-wt-<N>; when its review is done:
                                           integrate, one task at a time (§5.5) → complete → next scheduling point
```

Agents for different tasks run concurrently: one message dispatches several implementers, or one
task's reviewer next to another task's implementer. The orchestrator handles each contract as it
arrives. While worktree tasks are in flight, the main tree stays on the phase branch. Its only
uncommitted edits are the plan's ticked checkboxes, which no task touches, so a fast-forward still
applies. Git writes go only to task worktrees, their `amp-wt-*` branches and the fast-forward
merges.

## 4. Components

- `src/skills/plan/SKILL.md`: **extend.** Replace the `Independent` line and paragraph with
  `**Depends on:**` (§5.1). Self-review item 7 checks the lines.
- `src/skills/build/prompts/document-review.md`: **extend.** In plan mode, check that every
  `Depends on` line names only earlier tasks, and that no consumed interface or touched created
  file is missing from it.
- `src/skills/build/SKILL.md`: **extend.** Setup step 4 becomes §5.2. The task loop runs per task
  in its tree. Scheduling, worktree tasks, integration, drops, cleanup and resume (§5.3–5.8)
  replace Pipelining. The rules for the fix loop, breaker, batching, final review and red flags
  stay. The Codex block gains the thread-limit and close-timing rules (§5.4).
- `src/skills/build/prompts/implement.md`: **extend.** `Work in:` names the task's tree, plus a
  re-test variant (§5.5).
- `src/skills/build/prompts/task-review.md`, `re-review.md`: **extend.** Both gain
  `Tree: <tree>`: "read, grep and run any focused test in this tree".
- `src/agents/implementer.md`, `reviewer.md`, `checker.md`: **extend.** "(a pipelined worktree)"
  becomes "(another task's worktree)". Reviewer and checker: "When the dispatch names a `Tree:`,
  read code, `git grep` and run tests there (`git -C <tree>`, absolute paths)". Implementer: "A
  test failure that passes when the test is re-run alone and involves a shared resource (a port, a
  database, a fixed temp path) is reported as `DONE_WITH_CONCERNS`, not fixed". The orchestrator
  treats such a concern as resolved once the test passes when it is run alone, and reviews as usual.
- `src/skills/phase/SKILL.md`: **extend.** The pre-authorized set says "amp:build's own task
  worktrees (`$WS/wt-*`) and `amp-wt-*` branches", and the configuration table gains
  `Parallel tasks` with a default of 3. In the Codex Closing rule, "when its task's fix loop ends"
  becomes "when its task is complete or dropped" (§5.4).
- `hooks/run.ts`: **extend.** §5.6, §5.7.
- `hooks/register.tsx` (`runLines`): **extend.** §5.7.
- `hooks/run.test.ts`, `hooks/run-hooks.test.ts`, `scripts/test`: **extend.** §7.
- `README.md`, `CHANGELOG.md`, `.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`:
  **extend.** §8.
- Scripts `task-brief`, `review-package`, `amp-workspace`: **reuse, unchanged.** A worktree
  task's commits sit in the shared object store, so the orchestrator runs
  `review-package $WS <BASE> amp-wt-<N>` from the main tree.

**Deletions** (the change orphans them; `git grep -n "pipelin\|Independent:"` in `src/`,
`hooks/`, `scripts/` and `README.md` finds them, and no document claims them for later):
- The build skill's Pipelining section, its pipelined resume rule and the `Independent` override
  in setup step 4.
- The plan skill's `**Independent:** yes` template line and paragraph.
- The `pipelined` and `merged` task states, `pipelineOff`, `Run.fixRound`, the `Pipeline: off`
  parse and the pane's `Pipeline:` and `fix round …` lines.
- The README's "Pipelining is opt-in" paragraph, and the `case=pipeline` holds in `scripts/test`.

## 5. Interfaces

### 5.1 Plan line

`**Depends on:** none` or `**Depends on:** Task 2, Task 4` (ids as in the headings, `3a` allowed).
It sits after the `**Commit:**` line. Every task has one. A task depends on every earlier task
whose Interfaces Produces it consumes, or whose created file it touches. It never depends on a
later task. Plan order stays dependency order.

When a plan has no `Depends on` line at all (an older plan), every task depends on the task before
it. When only some tasks have one, each missing line is ruled `Depends on` the previous task, and
the ruling is ledgered. The run continues.

### 5.2 Preflight (build setup step 4), written to the ledger

- **Graph check:** every listed id is a task in the plan, and it comes earlier than the task
  listing it. That alone rules out cycles. Each violation, and each consumed interface or touched
  created file that isn't listed, gets a `Ruling:` that corrects the dependency. A plan whose graph
  can't be repaired from the spec is amp:phase's "broken plan" stop.
- **Exclusive pairs:** one row per pair of tasks whose Files or Docs lines share a path (compared
  without `:lines` suffixes). A pair where neither depends on the other, directly or transitively,
  never runs at the same time.
- The conflict rows from today stay: tests vs code, and created vs later-touched files.

### 5.3 Scheduling

- **Cap** = the amp configuration's `Parallel tasks`, else 3. A value that isn't an integer ≥ 1 is
  ruled to 3 and ledgered. On Codex the cap is at most half the session's thread limit (§5.4).
- **Ready** (for a task, against a set F of tasks in flight) = not started, not dropped, every
  `Depends on` task complete, and no exclusive pair with any task in F.
- A **scheduling point** comes at build start, after each completion, and after each drop. At each
  one:
  1. **Redo first.** If a dropped task awaits its redo: start nothing until nothing is in flight.
     Then run the lowest-numbered dropped task alone in the main tree, and go to the next
     scheduling point when it completes.
  2. **Pick.** Otherwise S = the starts so far (empty). Repeat: take the lowest-numbered task
     ready against F ∪ S and add it to S, while |F ∪ S| < cap and one is ready.
  3. **Place.** If F is empty and S holds exactly one task, it runs in the main tree. Otherwise
     every task in S gets a worktree.
- This keeps a main-tree task alone in flight. Nothing else can start while it runs, because a new
  start needs a scheduling point, and the only thing in flight to complete or drop is that task.
- A batch (same-shape edits) counts as one task.

### 5.4 Worktree tasks

- **Start:** `BASE=$(git rev-parse HEAD)` (the phase branch head), `WT="$WS/wt-<N>"`,
  `git worktree add "$WT" -b amp-wt-<N>`, then run the project's documented install or setup in
  `$WT` if its tests need one. Ledger `Task N: started (worktree <WT>, base <BASE>)`. A main-tree
  task ledgers `Task N: started (main tree, base <BASE>)`.
- **Setup failure** (worktree add, or setup the project doesn't document): clean up, ledger
  `Parallel: off — <why>`, and run every task not yet started sequentially in the main tree once
  the in-flight tasks finish (cap 1 from then on).
- **Dispatches:** the implementer gets `Work in: <WT> on branch amp-wt-<N>`, and the reviewer and
  checker get `Tree: <WT>`. The review package is `review-package $WS <BASE> amp-wt-<N>`. Fix
  rounds use `FIX_BASE=$(git rev-parse amp-wt-<N>)` and
  `review-package $WS $FIX_BASE amp-wt-<N>`. Every dispatch while other tasks are in flight
  states that `.amp/` holds other tasks' worktrees, outside its scope.
- **Codex:** a task in flight holds up to two open agents, its implementer and its reviewer (or
  checker). The cap is lowered to ⌊thread limit / 2⌋ (3 at the default 6), and a lowered value is
  ledgered. A task's implementer and reviewer stay open until it is **complete** (after
  integration) or dropped, instead of closing when the fix loop ends.

### 5.5 Integration (a worktree task whose review is clean, or whose breaker has ruled)

Only one task integrates at a time. Others queue in the order they became ready to integrate.

1. `git -C "$WT" status --porcelain` must be empty. If it isn't, resume the implementer to commit
   or discard its leftovers, then run this check again.
2. If the phase branch head ≠ BASE: `git -C "$WT" rebase <phase branch>`. On failure, run
   `git -C "$WT" rebase --abort` (ignore its error) and **drop**. On success, set
   `BASE=$(git rev-parse <phase branch>)` and ledger `Task N: rebased (base <BASE>)`. Then resume
   the implementer with the re-test variant: "The phase branch moved under your task; your commits
   were rebased onto it. Re-run your task's tests in <WT> and reply with the contract; change
   and commit nothing. Report any failure." A failing re-test is a fix round of the same loop, counted against
   the same 5-round cap and re-reviewed as usual. The task leaves the queue during the fix, then
   re-queues and restarts at step 1. At the cap, the breaker adjudicates as today.
3. Check: `git rev-list --count <BASE>..amp-wt-<N>` ≥ 1, and
   `git merge-base --is-ancestor <phase branch> amp-wt-<N>`. If either fails, **drop**.
4. From the main tree: `git merge --ff-only amp-wt-<N>`. A failure is a **drop**. On success, at
   once ledger `Task N: complete (commits <BASE7>..<head7>, review clean | K parked)`, then clean
   up.

**Drop:** clean up, then ledger `Task N: dropped — <why>` and
`Ruling: Task N dropped and redone alone — <why> — its work is redone`, so the drop reaches the
PR (S6). The task is redone from scratch by §5.3 step 1, with its old brief and a fresh
implementer.

**Cleanup:** `git worktree remove --force "$WT"`, then `git branch -D amp-wt-<N>`. An error for an
item that's already gone is harmless. If a remove fails (a locked file), run `git worktree prune`
and retry once, and ledger anything left over.

### 5.6 Ledger lines (parsed by `hooks/run.ts`)

A row's state comes from the last line that sets one. Lines that don't set a state change only the
row's text.

| Line | Row effect |
|---|---|
| `Task N: started (worktree <WT>, base <SHA>)` | state `started`, `worktree` = `<WT>`, `round` unset |
| `Task N: started (main tree, base <SHA>)` | state `started`, `worktree` and `round` unset |
| `Task N: fix round R/5 (…)` | state `fixing`, `round` = R |
| `Task N: rebased (base <SHA>)` | state `started`, `round` unset |
| `Task N: complete (…)` | state `complete`, `round` and `worktree` unset |
| `Task N: dropped — <why>` | state `dropped`, `round` and `worktree` unset |
| any other `Task N: …` (minor deferred, parked) | text only; a new row starts as `started` |
| `Parallel: off — <why>` | `Run.parallelOff` |

Parked and minor counting stays as it is.

```ts
export type TaskRow = { id: string; state: 'started' | 'fixing' | 'complete' | 'dropped'; text: string; round?: number; worktree?: string }
export type Run = { /* as today, minus fixRound and pipelineOff */ parallelOff?: string }
```

### 5.7 Status line and pane

**Active** = rows in `started` or `fixing`, in the order of each row's first ledger line. An
active token is `<id>`, plus ` r<R>` when the row is fixing.

`statusText` during build:
- 0 active: ` · task <done+1>[/<total>]` (as today).
- 1 active: ` · task <id>`, plus ` · fix r<R>/5` when it is fixing, plus ` · <done>/<total> done`
  when the total is known.
- 2 or more: ` · tasks <token>, <token>, …`, plus ` · <done>/<total> done` when the total is
  known. Example: `amp 05-x · build · tasks 2, 3 r2, 5 · 1/7 done`.

Pane task rows: `  Task <id> · <state>[ r<R>][ · <basename of worktree>]`. The separate
`fix round …` line goes, and the `Pipeline:` line becomes `Parallel: on` or
`Parallel: off — <why>`.

### 5.8 Resume after a crash

A task is **in flight** when its row is `started` or `fixing`. Its BASE is the one on its last
`started` or `rebased` line. For each in-flight task, in this order:

1. **Main-tree task:** resume from its last line, as sequential tasks resume today.
2. **Worktree task, already merged:** the branch `amp-wt-<N>` exists,
   `git rev-list --count <BASE>..amp-wt-<N>` ≥ 1, and the branch is an ancestor of HEAD. Or the
   branch is gone, and `git log --format=%s <BASE>..HEAD` holds the task's Commit line. Either
   way, write its `complete` line and clean up.
3. **Worktree task, worktree present:** continue from its last line in that worktree.
   Agents that are gone are re-dispatched fresh with the brief and report paths.
4. **Otherwise:** clean up and drop it (`dropped — resume`, with its Ruling line).

Then clean up any `$WS/wt-*` worktree or `amp-wt-*` branch whose task is not in flight, and go to
a scheduling point.

## 6. States and errors

- A plan with no `Depends on` lines runs sequentially in the main tree, with no rulings.
- Graph errors are fixed by rulings against the spec. An unrepairable graph is the broken-plan
  stop.
- Rebase conflicts, ff failures, a dirty or lost worktree, and resume misses drop the task. A
  dropped task is redone alone. Each drop is ledgered with a Ruling, so the PR lists it. Nothing is
  silent.
- Worktree setup failure turns parallel mode off for the rest of the run, ledgered.
- With `Parallel tasks: 1`, the run is fully sequential in the main tree, the same as before 1.5.0
  minus pipelining. The README recommends that value for suites that hold fixed shared resources
  (ports, a database, fixed temp paths).

## 7. Testing strategy

- `hooks/run.test.ts`:
  - two tasks' lines interleaved: per-row round and worktree
  - a fix round of task 3, then `Task 2: complete`: task 3 keeps r2
  - `minor (deferred)` or parked after `complete`: the row stays complete
  - `rebased` clears the round
  - `dropped` clears round and worktree
  - the `Parallel: off` line is parsed
  - `statusText` for 0, 1 (out-of-order id) and 2+ active, with and without a total
- `hooks/run-hooks.test.ts`: the `/amp-run` pane test asserts the new row format, the worktree
  basename and the `Parallel:` line. The old `fix round 2/5 · task 3a` expectation goes.
- `scripts/test`:
  - `holds` on the new text: `Depends on`, `Parallel tasks`, `amp-wt-`, `merge --ff-only`,
    `rebase --abort`, `worktree prune`, `dropped — resume`, `Tree:`
  - `lacks` on the rendered build and plan skills (Claude and Codex) for the exact tokens
    `**Independent:**` and `Pipelining`
  - the Codex hook fixture ledger swaps `Pipeline: off` for `Parallel: off`
  - the resume text is unchanged
- Gates: `claude plugin validate .`, `claude plugin test .`, `bash scripts/render --check`,
  `bash scripts/test`.

## 8. Docs impact

- README:
  - the build-stage paragraph describes the scheduler, `Depends on`, integration and drops
  - the configuration table gains `Parallel tasks` (default 3, use 1 for suites with shared fixed
    resources)
  - the status line and pane descriptions change
  - the guard text that names `amp-wt-*` stays
- CHANGELOG: a 1.5.0 entry. Both plugin manifests: version 1.5.0.

## 9. Review Focus

1. A task starting before a dependency is merged. Readiness requires `complete`, never `DONE`.
2. Two tasks in flight that share a Docs-line file. The exclusive pairs cover Docs, not only Files.
3. A main-tree task in flight next to another task. §5.3's Place step forbids it.
4. A stale BASE after a rebase. The review package, fix rounds and the `complete` range all use
   the BASE from the `rebased` line.
5. A crash between the ff-merge and cleanup. Resume (§5.8 step 2) writes `complete` and never
   redoes the merged work.

## 10. Out of scope

Parallel grill, design or plan. Parallel fix rounds inside one task. Merge strategies other than
rebase plus fast-forward. A changed resume-guard text (Codex parity stays).

**Refactor opportunity:** none found.
