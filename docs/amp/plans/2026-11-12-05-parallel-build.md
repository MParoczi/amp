# Phase 05 — parallel build: Implementation Plan

> Executed by amp:build (one amp:implementer per task, reviewed per task). Checkbox steps track progress.

**Goal:** amp:build runs every plan task whose dependencies are complete and that shares no file
with a running task concurrently (default cap 3), each in its own worktree, replacing the
one-task-ahead pipelining.
**Spec:** `docs/amp/specs/2026-11-12-05-parallel-build.md`. It is the binding authority, and
conflicts resolve against it.
**Branch:** framework/05-parallel-build
**Architecture:** Plans carry `**Depends on:**` lines. amp:build's task loop becomes a scheduler
(spec §5.3) that runs each task's existing lifecycle in its own tree and integrates worktree tasks
one at a time by rebase and fast-forward (§5.5). The ledger parser tracks state, fix round and
worktree per task, and the status line and `/amp-run` pane show every active task.
**Tech stack:** Markdown skill sources rendered by `scripts/render` (bash/awk). TypeScript
function-hook plugin tests run with `claude plugin test .`, and `scripts/test` is bash.
**Dispatch skills:** none

## Global Constraints

- **Sources:** edit `src/skills/**` and `src/agents/**`, never the rendered `skills/`, `agents/`
  or `codex/skills|agents` trees directly. After a src edit, run `bash scripts/render` and commit
  the rendered trees in the same commit.
- **Gates:** `claude plugin validate .`, `claude plugin test .`, `bash scripts/render --check` and
  `bash scripts/test`, all clean.
- **Exact ledger forms** (spec §5.4–5.6):
  - `Task N: started (worktree <WT>, base <SHA>)`
  - `Task N: started (main tree, base <SHA>)`
  - `Task N: rebased (base <SHA>)`
  - `Task N: dropped — <why>`
  - `Ruling: Task N dropped and redone alone — <why> — its work is redone`
  - `Parallel: off — <why>`
  - `Task N: complete (commits <BASE7>..<head7>, review clean | K parked)`
- **Config key:** `Parallel tasks`, default 3.
- Claude Code and Codex stay in parity through the render markup (`{{claude: …}}{{codex: …}}`,
  `<!-- codex -->` blocks). The resume-guard text doesn't change.
- Release 1.5.0.

## Review Focus

1. Readiness requires `complete`, never `DONE` (Task 3, build skill §Scheduling).
2. Exclusive pairs cover Docs-line paths, not only Files (Task 3, preflight).
3. A main-tree task is never in flight next to another (Task 3, the Place step).
4. A stale BASE after a rebase: the review package, fix rounds and `complete` range use the
   `rebased` line's BASE (Task 3).
5. A crash between the ff-merge and cleanup is resumed as complete, never redone (Task 3, Resume).
   A fix round of one task followed by another task's `complete` keeps the first one's round
   (Task 1, `run.test.ts`).

## File map

| File | Responsibility | Task |
|---|---|---|
| `hooks/run.ts` | ledger parser, status line | 1 |
| `hooks/register.tsx` | `/amp-run` pane rows (`runLines` and the pane component) | 1 |
| `hooks/run.test.ts`, `hooks/run-hooks.test.ts` | parser, status and pane tests | 1 |
| `scripts/test` | ledger fixture (T1), skill-text holds/lacks (T2, T3) | 1, 2, 3 |
| `src/skills/plan/SKILL.md` | `Depends on` line | 2 |
| `src/skills/build/prompts/document-review.md` | plan-mode dependency check | 2 |
| `src/skills/build/SKILL.md` | scheduler, worktree tasks, integration, drops, resume | 3 |
| `src/skills/build/prompts/implement.md`, `task-review.md`, `re-review.md` | `Work in:` / `Tree:` / re-test variant | 3 |
| `src/agents/implementer.md`, `reviewer.md`, `checker.md` | tree and worktree wording | 3 |
| `src/skills/phase/SKILL.md` | pre-authorized set, `Parallel tasks` key, Codex Closing | 3 |
| rendered `skills/`, `agents/`, `codex/` | `bash scripts/render` output | 2, 3 |
| `README.md` | status line and pane (T1); build paragraph and config row (T3) | 1, 3 |
| `CHANGELOG.md`, `.claude-plugin/plugin.json`, `.codex-plugin/plugin.json` | 1.5.0 | 3 |

### Task 1: Per-task ledger state, status line and pane

**Files:** Modify `hooks/run.ts` · Modify `hooks/register.tsx` (`runLines`, the pane's
`fix round` and `Pipeline` rows) · Modify `scripts/test` (the Codex hook fixture ledger,
`Pipeline: off — conflict` → `Parallel: off — conflict`) · Test `hooks/run.test.ts`,
`hooks/run-hooks.test.ts`
**Reuse:** extends `parseLedger`, `taskState`, `statusText` and `runLines`. `resumeText` stays
unchanged.
**Interfaces:** Produces
`TaskRow = { id: string; state: 'started' | 'fixing' | 'complete' | 'dropped'; text: string; round?: number; worktree?: string }`
and `Run.parallelOff?: string`. Removes `Run.fixRound` and `Run.pipelineOff`.
**Docs:** README "Status line" and "`/amp-run`" bullets (around L274–281) and the hooks table row
(L388): active tasks with their fix rounds, `Parallel:` instead of `Pipeline:`.
**Commit:** `feat(hooks): track state, fix round and worktree per task; show every active task`
**Depends on:** none

- [ ] **Step 1: Failing tests** in `hooks/run.test.ts`.
  - FIXTURE's last line becomes `Parallel: off — conflict`. In the first test:
    - `fixRound` → `run.tasks[2]?.round` is 2
    - `pipelineOff` → `parallelOff` is `'conflict'`
    - `tail[4]` is `'Parallel: off — conflict'`
  - The "remaining states" test becomes this parallel ledger:
    ```
    Stage: build
    Task 1: started (worktree .amp/k/wt-1, base a1)
    Task 2: started (worktree .amp/k/wt-2, base a1)
    Task 3: started (worktree .amp/k/wt-3, base a1)
    Task 4: started (worktree .amp/k/wt-4, base a1)
    Task 1: fix round 2/5 (…)
    Task 3: fix round 1/5 (…)
    Task 4: fix round 1/5 (…)
    Task 2: complete (commits a..b, review clean)
    Task 2: minor (deferred): x
    Task 3: dropped — conflict
    Task 4: rebased (base c3)
    ```
  - It expects:
    - states `['fixing', 'complete', 'dropped', 'started']`
    - task 1: `round` 2, worktree `.amp/k/wt-1`
    - task 2: no worktree
    - task 3: no round, no worktree
    - task 4: no round, worktree `.amp/k/wt-4`
  - A separate ledger `Task 5: minor (deferred): x` → task 5 is `started`.
  - The status test expects:
    - FIXTURE + total 7 → `'amp 04-x · build · task 3a · fix r2/5 · 2/7 done'`
    - FIXTURE, no total → `'amp 04-x · build · task 3a · fix r2/5'`
    - one active, out of order: `Stage: build`, `Task 2: complete (…)`, `Task 3: complete (…)`,
      `Task 1: started (main tree, base a)`, total 7 → `'amp k · build · task 1 · 2/7 done'`
    - none active: `Stage: build`, `Task 1: complete (…)`, total 7 → `'amp k · build · task 2/7'`
    - the parallel ledger + total 7 → `'amp k · build · tasks 1 r2, 4 · 1/7 done'`
    - the parallel ledger, no total → `'amp k · build · tasks 1 r2, 4'`
  - In `run-hooks.test.ts`:
    - add `'Task 4: started (worktree .amp/04-x/wt-4, base a)'` to `TEXT` (L80–88), so 3a and 4
      are active
    - every hard-coded `'amp 04-x · build · task 3/7 · fix r2/5'` (L139, L164, L203, L233)
      becomes `'amp 04-x · build · tasks 3a r2, 4 · 2/7 done'`
    - the pane test expects rows matching `/Task 3a · fixing r2/` and `/Task 4 · started · wt-4/`
    - it expects a `Parallel: on` text, and no `fix round 2/5` row
- [ ] **Step 2: Run, expect FAIL** `claude plugin test .` → the new expectations fail.
- [ ] **Step 3: Implement** spec §5.6 and §5.7 in `run.ts`. A non-state line updates only the
  text, and a new row defaults to `started`. Active = `started` or `fixing`, in first-seen order.
  `register.tsx` row: `  Task <id> · <state>[ r<R>][ · <basename of worktree>]`, plus
  `Parallel: on` or `Parallel: off — <why>`.
- [ ] **Step 4: Run, expect PASS** `claude plugin test .` and `bash scripts/test`.
- [ ] **Step 5: Docs** README lines named above.
- [ ] **Step 6: Commit**

### Task 2: `Depends on` in plans and plan review

**Files:** Modify `src/skills/plan/SKILL.md` (template line L68, the paragraph at L82–84,
self-review item 7) · Modify `src/skills/build/prompts/document-review.md` (Mode plan, L19–22) ·
Modify `scripts/test` (the `case=pipeline` plan holds, L415–417) · rendered trees via
`bash scripts/render`
**Reuse:** the existing template and the `holds`/`lacks` helpers.
**Interfaces:** Produces the plan line `**Depends on:** none` / `**Depends on:** Task 2, Task 4`
(spec §5.1), which Task 3's build skill consumes.
**Docs:** none (the README's build paragraph changes in Task 3, with the scheduler)
**Commit:** `feat(plan): every task names the tasks it depends on`
**Depends on:** none

- [ ] **Step 1: Failing test** In `scripts/test`, insert a new `case=depends` block directly
  before the `case=pipeline` line, with:
  - `holds skills/plan/SKILL.md '**Depends on:** none' 'only setup, config or docs'`
  - `holds skills/build/prompts/document-review.md 'Depends on' 'only setup, config or docs'`
  - `lacks skills/plan/SKILL.md '**Independent:**'`
  - `lacks codex/skills/plan/SKILL.md '**Independent:**'`

  Then delete the old plan `holds … '**Independent:** yes' …` line and the document-review
  `'only setup, config or docs'` holds line from the `case=pipeline` block. The block's
  build-skill and phase-skill `holds` lines stay for Task 3.
- [ ] **Step 2: Run, expect FAIL** `bash scripts/test` → `FAIL: depends: …`
- [ ] **Step 3: Implement**
  - The template line becomes `**Depends on:** none | Task <a>, Task <b> <the earlier tasks whose output this task consumes>`.
  - The paragraph states spec §5.1 rules, minus the build-side legacy handling: every task has
    one; it depends on every earlier task whose Produces it consumes or whose created file it
    touches; never a later task; amp:build runs tasks whose dependencies are complete and that
    share no file with a running task, in parallel.
  - Self-review 7: "every `Depends on` line is complete and names only earlier tasks".
  - document-review Mode plan adds: "every `Depends on` line names only earlier tasks and misses
    no consumed interface or touched created file".
  - Then `bash scripts/render`.
- [ ] **Step 4: Run, expect PASS** `bash scripts/render --check` and `bash scripts/test`.
- [ ] **Step 5: Docs** none.
- [ ] **Step 6: Commit**

### Task 3: The parallel scheduler in amp:build

**Files:**
- Modify `src/skills/build/SKILL.md`: Setup step 4, the task-loop heading and steps, delete
  Pipelining, Cleanup and Resume after a crash, write the new sections, and the Codex block.
- Modify `src/skills/build/prompts/implement.md`, `task-review.md`, `re-review.md`.
- Modify `src/agents/implementer.md`, `reviewer.md`, `checker.md`.
- Modify `src/skills/phase/SKILL.md`: L85, the configuration table and the Codex Closing rule
  around L167.
- Modify `scripts/test`: the remaining `case=pipeline` block, plus `case=manifests`, where
  `"version": "1.4.0"` becomes `"1.5.0"`.
- Modify `README.md`: L217–230 and the configuration table.
- Modify `CHANGELOG.md`, `.claude-plugin/plugin.json` and `.codex-plugin/plugin.json`.
- Rendered trees via `bash scripts/render`.

**Reuse:** the existing per-task lifecycle, fix loop, breaker, cleanup commands and the
`task-brief`/`review-package` scripts (unchanged, with `amp-wt-<N>` as HEAD).
**Interfaces:** Consumes Task 1's ledger forms and Task 2's `Depends on` line.
**Docs:**
- README: the build paragraph describes the scheduler, `Depends on`, integration and drops
  (replacing "Pipelining is opt-in…").
- README configuration table: the `Parallel tasks | 3 | …` row, with use 1 for suites that hold
  fixed shared resources.
- CHANGELOG `## 1.5.0 — 2026-11-12`.
- Both manifests: `"version": "1.5.0"`.

**Commit:** `feat(build): run independent tasks in parallel worktrees; release 1.5.0`
**Depends on:** Task 1, Task 2

- [ ] **Step 1: Failing test** In `scripts/test`, replace the remaining `case=pipeline` block (its
  comment and the build- and phase-skill `holds` lines) with a `case=parallel` block, and bump
  `case=manifests` to `"version": "1.5.0"`. The old block's `lacks … 'never two implementers at
  once'` check and its agent checks (`'git grep' '.amp/'`, `'git -C'`) move into the new block
  unchanged. The new block has:
  - `holds skills/build/SKILL.md` for each of these strings:
    - `**Depends on:**`
    - `Parallel tasks`
    - `amp-wt-`
    - `git worktree add`
    - `merge --ff-only`
    - `rebase --abort`
    - `worktree remove --force`
    - `branch -D`
    - `worktree prune`
    - `started (worktree`
    - `rebased (base`
    - `dropped — resume`
    - `Parallel: off`
    - `git grep`
    - `Only one task integrates at a time`
  - `holds codex/skills/build/SKILL.md 'amp-wt-' 'thread limit'`
  - `holds skills/phase/SKILL.md 'amp-wt-' 'Parallel tasks'`
  - `holds skills/build/prompts/task-review.md 'Tree:'`
  - `holds skills/build/prompts/re-review.md 'Tree:'`
  - `lacks` on `skills/build/SKILL.md` and `codex/skills/build/SKILL.md` for `Pipelining` and
    `**Independent:**`
  - `lacks` on `agents/reviewer.md`, `agents/implementer.md` and `agents/checker.md` for
    `pipelined worktree`
  - `holds skills/build/SKILL.md 'no `Depends on` line'` (the legacy rule)
- [ ] **Step 2: Run, expect FAIL** `bash scripts/test` → `FAIL: manifests: …` (it runs first), then `FAIL: parallel: …`
- [ ] **Step 3: Implement** spec §3 and §5.2–5.8 in the build skill, in its existing terse style:
  - Setup step 4 is §5.2, preceded by the legacy rules from spec §5.1 paragraph 2:
    - a plan with no `Depends on` line: each task depends on the one before it
    - a plan with only some lines: rule each missing line as depending on the previous task,
      and ledger the ruling
  - Loop step 3, `DONE_WITH_CONCERNS`: a shared-resource flake counts as resolved once the test
    passes when it is run alone.
  - The task loop says "per task, in its tree", and step 4 uses `review-package $WS <BASE> <task head>`.
  - New sections: **Scheduling** (§5.3, with the three steps Redo first / Pick / Place, verbatim
    in meaning), **Worktree tasks** (§5.4), **Integration** (§5.5, including the sentence
    "Only one task integrates at a time."), **Drop** and **Cleanup**, and **Resume after a crash**
    (§5.8).
  - The Codex block gains the cap ⌊thread limit / 2⌋ and the close-at-complete-or-drop rule. The
    Pipelining `{{codex:}}` note goes.
  - Prompts: `implement.md` adds the re-test variant with the exact wording from §5.5 step 2.
    `task-review.md` and `re-review.md` add the line
    `Tree: <repo root | worktree> — read, grep and run any focused test here.`
  - Agents and phase skill, per spec §4.
  - The `lean:` marker isn't needed.
  - Then `bash scripts/render`.
- [ ] **Step 4: Run, expect PASS** `bash scripts/render --check`, `bash scripts/test`,
  `claude plugin validate .` and `claude plugin test .` (the last task, so run the full gates).
- [ ] **Step 5: Docs** README, CHANGELOG and the manifests, as listed on the Docs line.
- [ ] **Step 6: Commit**
