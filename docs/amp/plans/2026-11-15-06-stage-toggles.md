# Phase 06 — stage toggles: Implementation Plan

> Executed by amp:build (one amp:implementer per task, reviewed per task). Checkbox steps track progress.

**Goal:** A project can turn seven amp steps off in its `## amp configuration` table; everything is on by default.
**Spec:** `docs/amp/specs/2026-11-15-06-stage-toggles.md`, the binding authority; conflicts resolve against it.
**Branch:** `framework/06-stage-toggles`
**Architecture:** Prose only. amp:phase gains one section that defines the switches, reads them at intake and writes an `Off:` ledger line; each stage skill gains a short "When `<step>` is off" clause at the step it owns. The `Tests: off` line lives once in amp:phase and reaches agents through the plan's Global Constraints.
**Tech stack:** Markdown skill sources in `src/`, rendered by `scripts/render` (bash + awk); `scripts/test` (bash) asserts the rendered text.
**Dispatch skills:** none

## Global Constraints

- Edit skills, agents, prompts and templates only under `src/`. Then run `bash scripts/render` and commit the rendered trees (`skills/`, `agents/`, `codex/skills/`, `codex/agents/`) in the same commit. Never hand-edit a rendered tree.
- The only script that changes is `scripts/test`. No change to `hooks/`, `codex/hooks/`, `scripts/render`, `codex/install` or `src/skills/build/scripts/`.
- Step names, exact and always in this order: `Grill`, `Tests`, `Verify`, `Document reviews`, `Task reviews`, `Final review`, `CI`.
- The Tests line, verbatim, written out in full only in `src/skills/phase/SKILL.md`: `Tests: off — write no new tests; fix an existing test the change breaks in the same commit; missing tests are not a finding.` Every other file calls it "the `Tests: off` line" and cites amp:phase.
- Other skills cite the definition as `(amp:phase, Steps a project can turn off)`.
- In a skill the orchestrator reads, a clause for a step that is off starts with "When `<step>` is off" (for example "When `Task reviews` is off"), placed at the step it changes. Text an agent reads (the agent definitions, amp:lean, amp:debug, the dispatch prompts) keys on "the `Tests: off` line" instead, because agents never read the ledger.
- Keep every phrase that `scripts/test` asserts on one source line: `holds`/`lacks` match within a line. Keep each clause short and in the surrounding file's style; leave sentences that describe the all-on run unchanged (spec §4, "Wording left as is").
- New text is tool-neutral. Where it must name `CLAUDE.md`/`AGENTS.md` or a dispatch mechanism, use the file's existing `{{claude: …}}{{codex: …}}` spans.
- Tests: `bash scripts/test` (one `ok: <case>` line per case; a failure prints `FAIL: <case>: <detail>`), and `bash scripts/render --check` → `render: up to date`. Tasks 1–3 leave the version at 1.5.0.
- On this checkout (`core.filemode=false`) stage with `git add -A` and, if `git diff --cached --summary` shows a mode change on a script, restore it with `git update-index --chmod=+x <path>` before committing.
- All new assertions go into one new case, `steps-off`, in `scripts/test`, placed right after the `parallel` case. Task 1 creates it; later tasks add their lines before its `ok`.

## Review Focus

1. Grill off must not weaken any stop: a dirty tree, user-only input, a destructive operation outside the pre-authorized set and project stop rules still stop the run, and a request where every reading is a guess stops instead of being ruled through. (Task 1)
2. Tests off: an existing test the change breaks is still fixed and still a review finding; only *missing* tests stop being one. (Task 2)
3. Task reviews off in a worktree task: no path waits on a reviewer that never ran, and the integration fix cases stay capped. (Task 3)
4. Resume: the ledger's `Off:` line wins over a table edited mid-run; a ledger without the line reads the table. (Task 1)
5. Parity: every clause renders into both trees, and the Claude tree gains no Codex-only text (and the reverse). (every task: each assertion runs against `skills/…` and `codex/skills/…`)

## File map

| File | Change |
|---|---|
| `src/skills/phase/SKILL.md` | config rows, `## Steps a project can turn off`, intake, Grill-off path, autonomy wording (Task 1) |
| `src/skills/roadmap/templates/CLAUDE.claude.md`, `AGENTS.codex.md` | six rows at `on` (Task 1) |
| `src/skills/plan/SKILL.md` | Tests off (Task 2); Document reviews off (Task 3) |
| `src/skills/design/SKILL.md` | Tests off (Task 2); Document reviews off (Task 3) |
| `src/skills/lean/SKILL.md`, `src/skills/debug/SKILL.md` | Tests off (Task 2) |
| `src/agents/implementer.md`, `src/agents/reviewer.md` | Tests off (Task 2) |
| `src/skills/build/prompts/document-review.md`, `implement.md` | Tests off (Task 2) |
| `src/skills/build/SKILL.md` | fix-report wording (Task 2); Task reviews off, Final review off (Task 3) |
| `src/skills/build/prompts/final-review.md` | unreviewed opening line (Task 3) |
| `src/skills/roadmap/SKILL.md` | Document reviews off (Task 3) |
| `src/skills/ship/SKILL.md`, `src/skills/ship/pr-template.md` | Verify off, CI off, Grill-off wording, Tests line on dispatches, PR section (Task 4) |
| `README.md`, `CHANGELOG.md`, `.claude-plugin/plugin.json`, `.codex-plugin/plugin.json` | docs and 1.6.0 (Task 4) |
| `scripts/test` | case `steps-off` (Tasks 1–4), version strings (Task 4) |
| rendered trees | regenerated in every task |

### Task 1: amp:phase defines and reads the switches; Grill off

**Files:** Modify `src/skills/phase/SKILL.md` · Modify `src/skills/roadmap/templates/CLAUDE.claude.md` · Modify `src/skills/roadmap/templates/AGENTS.codex.md` · Test `scripts/test` · rendered trees
**Reuse:** the `## Project amp configuration` table and the "amp:phase, Model routing" citation pattern; `holds`/`lacks` in `scripts/test`
**Interfaces:** Consumes none · Produces the section heading `## Steps a project can turn off`, the seven step names, the ledger line `Off: <names joined by ", ">` / `Off: none`, the Tests line (Global Constraints), the test case `steps-off`
**Docs:** none (README is Task 4)
**Commit:** `feat(phase): let a project turn steps off; Grill off runs without the interview`
**Depends on:** none

- [x] **Step 1: Failing test** new case in `scripts/test` after the `parallel` case:
  ```bash
  case=steps-off
  # a project turns steps off in its amp configuration (spec 06 §5)
  tests_off='Tests: off — write no new tests; fix an existing test the change breaks in the same commit; missing tests are not a finding.'
  for t in skills codex/skills; do
    holds "$t/phase/SKILL.md" '## Steps a project can turn off' '| Grill |' '| Tests |' '| Document reviews |' '| Task reviews |' '| Final review |' '| CI |' \
      'Off: none' 'Steps off for this project:' 'read as on — only on and off are valid — the step runs' "doesn't repeat the notice" \
      'wins over the table' 'overrides any sentence' "$tests_off" 'When `Grill` is off' 'from intake when `Grill` is off' 'every reading is a guess'
  done
  for f in skills/roadmap/templates/CLAUDE.md codex/skills/roadmap/templates/AGENTS.md; do
    holds "$f" '| Grill | on |' '| Tests | on |' '| Document reviews | on |' '| Task reviews | on |' '| Final review | on |' '| CI | on |'
  done
  ok
  ```
- [x] **Step 2: Run, expect FAIL** `bash scripts/test` → `FAIL: steps-off: skills/phase/SKILL.md lacks '## Steps a project can turn off'`
- [x] **Step 3: Implement** in `src/skills/phase/SKILL.md` (spec §5.1–5.4):
  - `## Project amp configuration` table: the `Verify` row's default gains "`off` skips amp:ship's verify step"; after it, six rows `| Grill | on |` … `| CI | on |` in the step order, each default cell starting with `on` and pointing at the new section.
  - New section `## Steps a project can turn off`, after the configuration section. It holds: a table with one row per step (the seven names) saying in one line what does not run and which skill owns it (spec §5.4, summarized); the value rule of spec §5.1 including the ruling text `Ruling: <Key> "<value>" read as on — only on and off are valid — the step runs` and that a stage without a ledger states it in its final report; the read rule of spec §5.3 (an `Off:` line "wins over the table"; a ledger without one, or no ledger, reads the table); the Tests line in full, named "the `Tests: off` line"; and the sentence that a step turned off "overrides any sentence" in an amp skill that describes it as always happening.
  - Intake step 3 also reads the switches. Intake step 5: right after creating the ledger, append `Off: <names>` or `Off: none`, and with at least one step off tell the user `Steps off for this project: <names>.`; the line is written once and a resumed run "doesn't repeat the notice".
  - `## 1–2. Grill, then branch`: a paragraph "When `Grill` is off" with the four behaviors of spec §5.4 Grill (no amp:grill and no questions, amp:debug investigation still first for bug/hotfix; `decisions.md` written from the request and sources with each open decision a ledgered `Ruling:`; no `Stage: gate`, then branch as usual; the `Grill | off` row is the approval, and amp:grill run directly and amp:roadmap ignore the switch). It also states the stop the grill used to provide: a request so vague that "every reading is a guess" is a stop (autonomy contract, stop 4), not a ruling; extend stop 4's text to name it.
  - Autonomy contract: its heading or first sentence says autonomy starts after the grill confirmation, or "from intake when `Grill` is off", with every stop kept (stop 4 extended as above). Red flags row "Small change, skip the grill": add that only the project's `Grill | off` row skips it.
  - Pipeline table and frontmatter description stay unchanged.
  In both templates, add the six `| <Key> | on |` rows after the `Verify` row. Then `bash scripts/render`.
- [x] **Step 4: Run, expect PASS** `bash scripts/test` and `bash scripts/render --check`
- [x] **Step 5: Docs** none
- [x] **Step 6: Commit** with the Commit line's message

### Task 2: Tests off

**Files:** Modify `src/skills/plan/SKILL.md` · `src/skills/design/SKILL.md` · `src/skills/lean/SKILL.md` · `src/skills/debug/SKILL.md` · `src/agents/implementer.md` · `src/agents/reviewer.md` · `src/skills/build/prompts/document-review.md` · `src/skills/build/prompts/implement.md` · `src/skills/build/SKILL.md:97-98` · Test `scripts/test` · rendered trees
**Reuse:** the plan's Global Constraints, which `prompts/implement.md` and `prompts/task-review.md` already paste verbatim; lean's "The project's test doctrine wins" rule and its copy in `implementer.md`
**Interfaces:** Consumes the Tests line and the section name from Task 1, the case `steps-off` · Produces the trigger agents key on: a dispatch, plan or document that carries the `Tests: off` line
**Docs:** none
**Commit:** `feat(plan): Tests off drops test writing from plans, agents and reviews`
**Depends on:** Task 1

- [x] **Step 1: Failing test** add before the `ok` of `steps-off`:
  ```bash
  for t in skills codex/skills; do
    holds "$t/plan/SKILL.md" 'When `Tests` is off' 'none cover it'
    holds "$t/design/SKILL.md" 'When `Tests` is off'
    holds "$t/lean/SKILL.md" 'unless the project turned the step off' 'Tests: off'
    holds "$t/debug/SKILL.md" 'Tests: off'
    holds "$t/build/SKILL.md" 'the tests run'
    holds "$t/build/prompts/implement.md" 'Tests: off'
    holds "$t/build/prompts/document-review.md" 'Tests: off'
    lacks "$t/plan/SKILL.md" "$tests_off"
  done
  for f in agents/implementer.md agents/reviewer.md codex/agents/amp-implementer.toml codex/agents/amp-reviewer.toml; do holds "$f" 'Tests: off'; done
  holds agents/reviewer.md 'missing tests'
  ```
- [x] **Step 2: Run, expect FAIL** `bash scripts/test` → `FAIL: steps-off: skills/plan/SKILL.md lacks 'When `Tests` is off'`
- [x] **Step 3: Implement** (spec §5.4 Tests; every clause cites `(amp:phase, Steps a project can turn off)` once per file):
  - `plan/SKILL.md`, after the task template: "When `Tests` is off": Global Constraints carries the `Tests: off` line verbatim; a task has no failing-test steps and no new test file on its Files line; its steps are Implement, "Run the existing tests that cover the change, expect PASS" with the command (when no existing test covers it, the step reads "none cover it" with the reason), Docs, Commit; Review Focus lines carry no pinning test.
  - `design/SKILL.md`, section 7 of "Write the spec": "When `Tests` is off", the Testing strategy section is the `Tests: off` line, verbatim.
  - `lean/SKILL.md`: the opening sentence "Reviews, tests, verification and reading the code are never skipped to save tokens" gains "unless the project turned the step off (amp:phase, Steps a project can turn off)"; `### Tests` gains one sentence: a `Tests: off` line is the project's doctrine (no new tests; an existing test the change breaks is fixed).
  - `agents/implementer.md`: the Lean rules **Tests** bullet gets the same sentence as lean; the "Test-first" bullet and the Report section's "TDD evidence" say that under a `Tests: off` line in the dispatch no new test is written, an existing test the change breaks is fixed in the same commit, and the report gives the existing-test command and output instead.
  - `agents/reviewer.md`, Calibration, a new line: when the Global Constraints (in the dispatch or the plan) or the document under review carry the `Tests: off` line, missing tests, test seams and test steps are never a finding; a broken or weakened existing test still is.
  - `debug/SKILL.md` step 6: under `Tests: off`, write no pinning test; keep the reproduction command and its failing output for the report, and step 8 re-runs that command.
  - `prompts/document-review.md`: one line under "Flag only…": a document that carries the `Tests: off` line is not missing test seams or test steps.
  - `prompts/implement.md`, "Final-review and CI fix variants": when `Tests` is off, both end with the `Tests: off` line.
  - `build/SKILL.md` fix loop: "confirm the fix report has tests, command and output" becomes "confirm the fix report has the tests run, their command and output".
  Then `bash scripts/render`.
- [x] **Step 4: Run, expect PASS** `bash scripts/test` and `bash scripts/render --check`
- [x] **Step 5: Docs** none
- [x] **Step 6: Commit** with the Commit line's message

### Task 3: Document reviews, Task reviews and Final review off

**Files:** Modify `src/skills/design/SKILL.md` · `src/skills/plan/SKILL.md` · `src/skills/roadmap/SKILL.md` · `src/skills/build/SKILL.md` · `src/skills/build/prompts/final-review.md` · Test `scripts/test` · rendered trees
**Reuse:** amp:build's fix loop (resume, escalation, 5-round cap, breaker) for the integration fix cases; the existing completion-line shape `Task N: complete (commits <BASE7>..<head7>, …)`, which `hooks/run.ts` parses by its `complete` prefix and `| K parked)` suffix
**Interfaces:** Consumes the section name from Task 1, the case `steps-off` · Produces the completion lines `Task N: complete (commits <BASE7>..<head7>, unreviewed)` and `…, unreviewed | K parked)`
**Docs:** none
**Commit:** `feat(build): Document reviews, Task reviews and Final review can be turned off`
**Depends on:** Task 1, Task 2

- [x] **Step 1: Failing test** add before the `ok` of `steps-off`:
  ```bash
  for t in skills codex/skills; do
    for s in design plan roadmap; do holds "$t/$s/SKILL.md" 'When `Document reviews` is off'; done
    holds "$t/build/SKILL.md" 'When `Task reviews` is off' 'unreviewed)' 'unreviewed | K parked)' 'When `Final review` is off' 'untriaged'
    holds "$t/build/prompts/final-review.md" 'No task was reviewed (Task reviews off)'
  done
  ```
- [x] **Step 2: Run, expect FAIL** `bash scripts/test` → `FAIL: steps-off: skills/design/SKILL.md lacks 'When `Document reviews` is off'`
- [x] **Step 3: Implement** (spec §5.4; a file that already cites `(amp:phase, Steps a project can turn off)` from Task 2 needs no second citation):
  - `design/SKILL.md` §4 item 2 and `plan/SKILL.md` "Review and commit": "When `Document reviews` is off", skip the independent review; the self-review stands (amp:plan still commits spec and plan together).
  - `roadmap/SKILL.md` §3: "When `Document reviews` is off" (a revision in a project whose table sets it), skip this review; the final report says the documents were not reviewed.
  - `build/SKILL.md`, task loop, before step 4: "When `Task reviews` is off", skip steps 4 and 5: a `DONE`, or a `DONE_WITH_CONCERNS` whose concerns are resolved, completes the task; no reviewer or checker is dispatched; the completion line ends `unreviewed)`, or `unreviewed | K parked)` when the cap parked findings. Integration: a worktree task integrates as soon as its implementer is done; committing leftovers and a failing re-test remain fix rounds under the fix loop's resume, escalation and 5-round cap rules, with no re-review, and the breaker adjudicates at the cap.
  - `build/SKILL.md`, Final review: "When `Final review` is off", skip steps 1 and 2; steps 3 and 4 run, and deferred minors and parked findings reach the PR untriaged.
  - `prompts/final-review.md`: a note above the template: when `Task reviews` is off, replace the template's sentence "Every task passed its own review; you judge the whole: integration, cross-task consistency, and what a real user meets." with "No task was reviewed (Task reviews off): judge each task's correctness and quality as well as the whole: integration, cross-task consistency, and what a real user meets."
  Then `bash scripts/render`.
- [x] **Step 4: Run, expect PASS** `bash scripts/test` and `bash scripts/render --check`
- [x] **Step 5: Docs** none
- [x] **Step 6: Commit** with the Commit line's message

### Task 4: Verify and CI off in amp:ship; release 1.6.0

**Files:** Modify `src/skills/ship/SKILL.md` · `src/skills/ship/pr-template.md` · `README.md` · `CHANGELOG.md` · `.claude-plugin/plugin.json` · `.codex-plugin/plugin.json` · Test `scripts/test` (case `steps-off`; lines 217 and 280) · rendered trees
**Reuse:** amp:ship's existing merge-protection stop (step 5) for CI off on a protected branch; the README's Project configuration table; the CHANGELOG entry style of 1.5.0
**Interfaces:** Consumes the section name, step names and `Off:` line from Task 1; `unreviewed` and "untriaged" from Task 3 · Produces the PR section `## Steps turned off` and the Evidence text `Verify: off (project configuration)`
**Docs:** `README.md`, `CHANGELOG.md`
**Commit:** `feat(ship): Verify and CI can be turned off; release 1.6.0`
**Depends on:** Task 1, Task 3

- [x] **Step 1: Failing test** add before the `ok` of `steps-off`:
  ```bash
  for t in skills codex/skills; do
    holds "$t/ship/SKILL.md" 'When `Verify` is off' 'When `CI` is off' 'Tests: off' 'Grill | off'
    holds "$t/ship/pr-template.md" '## Steps turned off' 'Verify: off (project configuration)' 'untriaged'
  done
  holds README.md '### Turning steps off' '| Grill | on |' '| Tests | on |' '| Document reviews | on |' '| Task reviews | on |' '| Final review | on |' '| CI | on |' 'Steps off for this project:'
  holds CHANGELOG.md '## 1.6.0'
  ```
  and change `1.5.0` to `1.6.0` in the `install-default` and `manifests` cases (three occurrences on lines 217 and 280).
- [x] **Step 2: Run, expect FAIL** `bash scripts/test` → `FAIL: install-default: json: {"version": "1.5.0", …`
- [x] **Step 3: Implement** (spec §5.4 Verify, CI; §5.5; §8):
  - `ship/SKILL.md`: the opening paragraph says the pre-authorization comes from the grill confirmation, or from the project's `Grill | off` row. Step 2: "When `Verify` is off", skip this step and every later re-verify. Step 4: "When `CI` is off", skip this step; after a default-branch merge-in, push and merge without re-watching; a protected merge is step 5's stop. Each implementer dispatch amp:ship makes (docs gap, verify fix, merge conflict) ends with the `Tests: off` line when `Tests` is off. One citation of `(amp:phase, Steps a project can turn off)`.
  - `ship/pr-template.md`: Evidence's Verify bullet notes the alternative `Verify: off (project configuration)`; after `## Evidence`, the section of spec §5.5 verbatim; the Parked section's text also covers every deferred minor and parked finding, untriaged, when Final review was off.
  - Both `plugin.json`: `"version": "1.6.0"`.
  - Then `bash scripts/render`.
- [x] **Step 4: Run, expect PASS** `bash scripts/test`, `bash scripts/render --check`, `claude plugin validate --strict .`, `claude plugin test .`
- [x] **Step 5: Docs**
  - `README.md`, Project configuration table: the `Verify` row notes `off`; six rows `| Grill | on | … |` in the step order. A new subsection `### Turning steps off` right after the example in that section: a table of the seven steps and what each does when off (spec §5.4 in user terms, including "existing tests stay green" and that `Grill` off makes every assumption a ruling in the PR), then where a run shows it: the intake line `Steps off for this project: …`, the ledger's `Off:` line (a resumed run keeps it; a table edit applies from the next run) and the PR's "Steps turned off" section; and that an invalid value counts as on. In "Run a phase or any change", one sentence that the grill, the reviews, verify and the CI wait run unless the project turned them off, linking the subsection.
  - `CHANGELOG.md`: a `## 1.6.0 — 2026-11-15` entry in the style of 1.5.0: the seven switches and their defaults, what each off does, the notice/ledger/PR visibility, and that nothing changes for a project that sets none.
- [x] **Step 6: Commit** with the Commit line's message
