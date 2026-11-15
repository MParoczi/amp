# Phase 06 — stage toggles: Spec

## 1. Goal

Phase 06 (`framework/06-stage-toggles`) lets a project turn seven amp steps off in its
`## amp configuration` table: the grill, test writing, the verify run, document reviews, task
reviews, the final review and the CI watch. Every step is on by default, so a project that sets
nothing runs exactly as in 1.5.0.

The request was a plain one, not a roadmap phase. This repo has no roadmap, so the phase id follows
the specs before it (02–05).

## 2. Decisions

| # | Decision | Source |
|---|---|---|
| S1 | Per-project settings live in the `## amp configuration` table of `CLAUDE.md` (Codex: `AGENTS.md`, else `CLAUDE.md`); every key is optional | `src/skills/phase/SKILL.md:184` |
| S2 | Edit `src/`; `scripts/render` produces `skills/`, `agents/`, `codex/`; `scripts/test` asserts the rendered text | spec 02 §5.1 |
| S3 | A release is a minor bump in both plugin manifests plus a CHANGELOG entry and README update | 1.3.0–1.5.0 |
| S4 | This repo has no `CLAUDE.md`, no roadmap and no `.github/` CI; the phase id follows the spec numbering | repo |
| S5 | `Parallel tasks: 1` already turns parallel build off; untouched here | spec 05 |
| S6 | Every switch defaults to on | user |
| D1 | `Grill` off: no questions and no gate. amp:phase goes from intake to design; every assumption is a ledgered `Ruling:` listed in the PR; the project setting authorizes push, PR and merge | user |
| D2 | Two test switches. `Tests` off: plans carry no test steps and implementers write no new tests. `Verify` off: amp:ship skips the local verify run | user |
| D2a | With `Tests` off, an existing test the change breaks is fixed in the same commit; reviewers don't flag missing tests | user |
| D3 | Three review switches: `Document reviews` (spec, plan, roadmap), `Task reviews` (the per-task review and its fix loop), `Final review` (whole branch) | user |
| D4 | `CI` off: open the PR and merge without watching checks. PR, merge, docs sweep and close-out are always on | user |
| D5 | Spec (amp:design) and plan (amp:plan) are always on | user |
| D6 | One row per step, value `on` or `off`: `Grill`, `Tests`, `Document reviews`, `Task reviews`, `Final review`, `CI`. Verify reuses the existing `Verify` row: `off` skips the step, any other value is the command | user |
| D7 | No per-run override; the table is the only source | user |
| D8 | Steps turned off show as one notice line at intake, an `Off:` ledger line (a resumed run keeps the same switches) and a PR body section. No hook or pane code changes | user |
| D9 | amp:roadmap's templates show the six rows at `on`; the roadmap grill asks nothing about them | user |
| A1 | A missing row or `on` is on; `off` in any letter case is off; any other value counts as on, with a ledgered ruling | confirmed assumption |
| A2 | amp:phase reads the switches once at intake and writes them to the ledger; later stages follow the ledger. A stage skill run without that ledger line reads the table | confirmed assumption |
| A3 | `Grill` applies to amp:phase only: amp:grill run directly and amp:roadmap always grill. Bug and hotfix runs still do the amp:debug investigation. `Document reviews` also covers the roadmap review | confirmed assumption |
| A4 | `Task reviews` off: an implementer's `DONE` completes the task. `Document reviews` off keeps the orchestrator's self-review. The autonomy contract's stops and the project's stop rules are unchanged | confirmed assumption |
| A5 | `CI` off on a repo whose branch protection requires checks ends in the existing merge-protection stop | confirmed assumption |
| A6 | Release 1.6.0 | confirmed assumption |

## 3. Architecture

The change is prose in the skills, agents, prompts and templates; no script or hook code changes.

- **One definition, in amp:phase.** A new section `## Steps a project can turn off` holds the
  table of steps, the value rule (A1), the rule for where a stage reads the switches (§5.3), and
  the statement that a step turned off overrides any sentence in an amp skill that describes it
  as always happening.
  Every other skill cites it as "(amp:phase, Steps a project can turn off)", the way they already
  cite "amp:phase, Model routing".
- **Read once, carried by the ledger.** amp:phase intake reads the table and appends one `Off:`
  line to the ledger. Each stage skill carries a short clause at the step it owns: "When `<step>`
  is off: …".
- **Tests off travels through the plan.** amp:plan writes one fixed line into the plan's Global
  Constraints. The task dispatch templates (implement, fix round, task review) already paste
  Global Constraints verbatim, and the final reviewer is handed the plan path. The implementer
  dispatches that carry no Global Constraints (the final-review fix, the CI fix, and amp:ship's
  docs-gap, verify-fix and merge-conflict dispatches) end with the same line when Tests is off.

## 4. Components

| Component | Verdict | Responsibility |
|---|---|---|
| `src/skills/phase/SKILL.md` | extend | Six config rows and the `Verify` `off` value; the `Steps a project can turn off` section; intake reads the switches, writes `Off:`, prints the notice; the Grill-off path; autonomy contract and red-flag wording |
| `src/skills/design/SKILL.md` | extend | Document reviews off skips §4.2; Tests off wording for the spec's Testing strategy |
| `src/skills/plan/SKILL.md` | extend | Document reviews off skips the review; Tests off task shape and the Global Constraints line |
| `src/skills/build/SKILL.md` | extend | Task reviews off (task loop, integration); Final review off; the fix-loop report check under Tests off |
| `src/skills/build/prompts/implement.md` | extend | The final-review and CI fix variants end with the Tests line when Tests is off |
| `src/skills/build/prompts/final-review.md` | extend | The opening line for a run with Task reviews off |
| `src/skills/ship/SKILL.md` | extend | Verify off, CI off, pre-authorization wording when Grill is off; its implementer dispatches end with the Tests line when Tests is off |
| `src/skills/ship/pr-template.md` | extend | `## Steps turned off` section; Evidence and Parked wording |
| `src/skills/roadmap/SKILL.md` | extend | Document reviews off skips §3 |
| `src/skills/roadmap/templates/CLAUDE.claude.md`, `AGENTS.codex.md` | extend | Six rows at `on` |
| `src/skills/lean/SKILL.md` | extend | Its opening "never skipped" sentence gains "unless the project turned the step off (amp:phase, Steps a project can turn off)"; its Tests rule names `Tests: off` |
| `src/agents/implementer.md` | extend | The Tests bullet of its Lean rules names `Tests: off` (the copy of lean's rule); "While working" Test-first bullet and the Report section's TDD evidence cover the Tests-off case |
| `src/agents/reviewer.md` | extend | A new Calibration line (it has no Tests rule today): under `Tests: off`, missing tests are never a finding; a broken or weakened existing test still is |
| `src/skills/debug/SKILL.md` | extend | Step 6 with Tests off |
| `src/skills/build/prompts/document-review.md` | extend | A document that states `Tests: off` is not missing test seams or test steps |
| `scripts/test` | extend | A `steps-off` case of `holds`/`lacks` assertions; the version strings |
| `README.md`, `CHANGELOG.md`, both `plugin.json` | extend | Docs and release 1.6.0 |
| `src/skills/grill/SKILL.md`, hooks, `hooks/run.ts`, `codex/hooks/amp-hook`, build scripts, the task-review and re-review prompts | reuse unchanged | The `Off:` line is an unknown ledger line to the parsers, which ignore it; the `/amp-run` pane shows it only as part of the ledger tail |

**Wording left as is:** sentences that describe the all-on run stay unchanged, because the new
section in amp:phase states that a step turned off overrides them: amp:phase's frontmatter
description and pipeline table, amp:build's "every change … passes a review" and Batching's "one
review", "the grill confirmation was the approval" in amp:plan and amp:build, the plan header's
"reviewed per task", and `templates/ROADMAP.md`'s workflow lines.

**Deletions:** none. `git grep -n -i "skip\|optional" src/skills` shows no earlier switch
mechanism that this replaces; nothing is orphaned.

## 5. Interfaces

### 5.1 Configuration rows

In the `## amp configuration` table:

| Key | Values | Default |
|---|---|---|
| `Grill` | `on` \| `off` | `on` |
| `Tests` | `on` \| `off` | `on` |
| `Document reviews` | `on` \| `off` | `on` |
| `Task reviews` | `on` \| `off` | `on` |
| `Final review` | `on` \| `off` | `on` |
| `CI` | `on` \| `off` | `on` |
| `Verify` | `off`, or the verify command or skill (as today) | the repo's documented commands |

Value rule: compare after trimming whitespace and backticks, ignoring letter case. For the six
on/off keys, a value other than `on` or `off` is read as on and ledgered:
`Ruling: <Key> "<value>" read as on — only on and off are valid — the step runs`.
`Verify` has no invalid value: anything but `off` is the command. A stage run without a ledger
states the ruling in its final report instead.

The **step names** are exactly the seven keys: `Grill`, `Tests`, `Verify`, `Document reviews`,
`Task reviews`, `Final review`, `CI`, always listed in that order.

### 5.2 Ledger line and intake notice

- amp:phase intake (step 5), right after it creates the ledger, appends
  `Off: <step names that are off, in the §5.1 order, joined by ", ">`, or `Off: none`.
  The line is written once, at ledger creation; a resumed run never rewrites it.
- When at least one step is off, amp:phase then tells the user one line:
  `Steps off for this project: <the same list>.` With `Off: none` it says nothing. A resumed run
  doesn't repeat the notice.

### 5.3 Where a stage reads the switches

A step is **off** when the ledger has an `Off:` line that names it. When the ledger has no `Off:`
line (a 1.5.0 ledger, a ledger amp:build created on its own) or there is no ledger (a stage skill
run directly), the step is off when the amp configuration table sets it to `off`. An `Off:` line
always wins over the table, so editing the table during a run changes nothing until the next run.

### 5.4 What each step does when off

**Grill** (amp:phase only):
- amp:phase does not run amp:grill and asks nothing. For a bug or hotfix it still runs the
  amp:debug investigation first.
- It writes `$WS/decisions.md` itself from the request and the sources amp:grill §0 names. Each
  decision the sources leave open is settled by a ruling, ledgered as usual
  (`Ruling: <decision> — <why> — <cost if wrong>`), so amp:ship lists it in the PR.
- No `Stage: gate` line is written. It cuts the branch and appends `Branch:` and `Stage: design`
  as today. The ledger still starts with `Stage: grill`: that line marks intake.
- The project's `Grill | off` row is the approval: autonomy starts at intake, and the same
  pre-authorized set applies. Every stop of the autonomy contract still applies, including a
  request so vague that every reading is a guess (stop 4).
- amp:grill run directly and amp:roadmap ignore this switch.

**Tests:**
- amp:plan writes this line, verbatim, into the plan's Global Constraints:
  `Tests: off — write no new tests; fix an existing test the change breaks in the same commit; missing tests are not a finding.`
- Plan tasks have no failing-test steps. The task steps become: **Implement**, **Run the existing
  tests that cover the change, expect PASS** (with the command), **Docs**, **Commit**. A task's
  Files line has no new test file. Review Focus lines carry no pinning test.
- A change that no existing test covers: the run step reads "none cover it", with the reason.
- The spec's Testing strategy section is that same `Tests: off — …` line, verbatim.
- Every implementer dispatch that carries no Global Constraints ends with that same line: the
  final-review fix and CI fix variants of `prompts/implement.md`, and amp:ship's docs-gap,
  verify-fix and merge-conflict dispatches.
- amp:build's fix-loop check "the fix report has tests, command and output" means the tests run,
  not tests written.
- Implementer: writes no new tests, fixes an existing test its change breaks in the same commit,
  and reports the existing-test run in place of TDD evidence.
- Reviewer (task, final, document): when the Global Constraints (in the dispatch or the plan) or
  the document under review carry the `Tests: off` line, missing tests, test seams and test steps
  are never a finding; a broken or weakened existing test still is.
- amp:debug step 6: no pinning test is written; the reproduction command and its failing output go
  into the report, and step 8 re-runs that command.

**Verify:**
- amp:ship skips step 2 and every later "re-verify" (after merging the default branch in).
- The PR's Evidence section says `Verify: off (project configuration)`.

**Document reviews:**
- amp:design §4.2, amp:plan's "Review and commit" dispatch, and amp:roadmap §3 are skipped. The
  self-review of the spec and of the plan stays. amp:plan still commits spec and plan together.
- amp:roadmap has no self-review step, so its documents then get no review. The switch reaches
  amp:roadmap only when it revises a roadmap in a project whose table already sets it.

**Task reviews:**
- In amp:build's task loop, steps 4 (Review) and 5 (Fix loop) are skipped: a `DONE` contract, or a
  `DONE_WITH_CONCERNS` whose concerns are resolved, completes the task.
- The completion line is `Task N: complete (commits <BASE7>..<head7>, unreviewed)`, or
  `…, unreviewed | K parked)` when the cap below parked findings.
- A worktree task integrates as soon as its implementer is done. Integration's two
  implementer-fix cases (committing leftovers, a failing re-test after a rebase) are still fix
  rounds: they follow the fix loop's resume and escalation rules and its 5-round cap, with no
  re-review. At the cap the orchestrator adjudicates as at the breaker.
- No reviewer or checker is dispatched for the task.

**Final review:**
- amp:build's Final review steps 1 and 2 are skipped; steps 3 (commit the plan's ticked
  checkboxes) and 4 (hand off to amp:ship) run.
- Deferred minors and parked findings from task reviews reach the PR's Parked section untriaged.

**Final review on, Task reviews off:** the final-review dispatch replaces its sentence "Every task
passed its own review; you judge the whole: integration, cross-task consistency, and what a real
user meets." with "No task was reviewed (Task reviews off): judge each task's correctness and
quality as well as the whole: integration, cross-task consistency, and what a real user meets."


**CI:**
- amp:ship skips step 4 and goes from opening the PR to the merge. When the default branch moved
  and the PR is merged with it again, it pushes and merges without re-watching.
- A merge that branch protection blocks is the existing stop in step 5.

### 5.5 PR body

`src/skills/ship/pr-template.md` gains, after `## Evidence`:

```markdown
## Steps turned off

<Each step the run had off (the ledger's `Off:` line, else the amp configuration), one bullet
with what did not run. Delete the section when every step was on.>
```

The Parked section's text also covers the untriaged case of Final review off.

### 5.6 Roadmap templates

Both templates' `## amp configuration` table gains, after the `Verify` row:

```markdown
| Grill | on |
| Tests | on |
| Document reviews | on |
| Task reviews | on |
| Final review | on |
| CI | on |
```

## 6. States and errors

- **Nothing set:** no step is off; `Off: none`; no notice; the run equals 1.5.0.
- **Invalid value:** read as on with a ruling (§5.1). Never a stop.
- **Resume:** the ledger's `Off:` line decides; a table edit made mid-run takes effect on the next
  run. A ledger without the line falls back to the table.
- **Everything off:** the run is intake → rulings → spec → plan → implementers → docs and
  close-out → PR → merge. The PR's `Steps turned off` section lists all seven, and its Rulings
  section lists every assumption.
- **Grill off and user-only input needed:** the autonomy contract's stops apply unchanged; amp
  stops and asks.
- **Task reviews off and the implementer returns `BLOCKED` or `NEEDS_CONTEXT`:** handled as today;
  only the review and its fix loop are gone.
- **Never silent:** a step that did not run is named in the intake notice, the ledger and the PR.

## 7. Testing strategy

The repo's test for skill text is `scripts/test`: `holds FILE TEXT…` and `lacks FILE TEXT…` against
the rendered trees. A new case `steps-off` asserts, for the Claude and the Codex tree, that each
skill, agent, prompt and template carries its clause: the phase section heading, the six key names,
`Off: none`, `Steps off for this project:`, the Global Constraints line of §5.4, `unreviewed`,
`Verify: off (project configuration)`, `## Steps turned off`, `No task was reviewed`, and the `on` rows in the rendered
templates. The `manifests` case and the installer case assert `1.6.0`.
`bash scripts/render --check` proves the rendered trees match `src/`. `claude plugin validate
--strict .` and `claude plugin test .` must stay green; no hook test changes.

## 8. Docs impact

- `README.md`: the Project configuration table gains the six rows and the `Verify` `off` value; a
  new subsection lists what each step does when off (§5.4, in user terms) and where it is shown
  (notice, ledger, PR); the `/amp:phase` section says that the grill, the reviews, verify and the
  CI wait run unless the project turned them off.
- `CHANGELOG.md`: a `1.6.0` entry.
- `src/skills/roadmap/templates/CLAUDE.claude.md` and `AGENTS.codex.md`: §5.6.
- `.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`: version `1.6.0`.

## 9. Review Focus

1. Grill off must not weaken any stop: a dirty tree, user-only input, a destructive operation
   outside the pre-authorized set and project stop rules still stop the run.
2. Tests off: an existing test the change breaks is still fixed and still a review finding;
   only *missing* tests stop being one.
3. Task reviews off in a worktree task: no path waits on a reviewer that never ran, and the
   integration fix cases stay capped.
4. Resume: the ledger's `Off:` line wins over a table edited mid-run; a ledger without the line
   reads the table.
5. Parity: every clause renders into both trees, and the Claude tree gains no Codex-only text (and
   the reverse).

## 10. Out of scope

Switches for PR, merge, docs sweep, close-out, spec or plan; per-run overrides; changes to the
`/amp-run` pane, the status line or any hook code; a roadmap-grill question about the switches;
user-level switches in the plugin settings.

**Refactor opportunities:** the roadmap templates' configuration table has no `Parallel tasks` row
although amp:phase documents the key.
