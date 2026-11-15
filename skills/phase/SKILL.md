---
name: phase
description: Use FIRST, before exploring, asking or coding, whenever the user wants something that ends in code or repo changes. That includes a pasted roadmap phase prompt, `/amp:phase 04`, a feature, a bug fix, a hotfix, or a framework/tooling change. It runs the whole amp pipeline on one branch. The Grill-me-style Q&A is the only approval gate. After it, the run is autonomous (design → plan → subagent build with reviews → docs → PR via gh → CI → merge into the default branch) unless user-only input is needed. It supersedes grill-me and Superpowers' brainstorming, writing-plans, subagent-driven-development and finishing-a-development-branch. For a blank folder or a new project, use amp:roadmap first.
argument-hint: "[phase id | prompt file path]"
effort: high
---

# amp:phase

Announce: "Using amp:phase: grill first, then I run autonomously to a merged PR."

If grill-me/grilling or Superpowers skills are also available, don't invoke them:
amp carries their combined workflow. If the project has a blank or near-blank tree and no roadmap,
switch to **amp:roadmap**.

## The pipeline

| # | Stage | Skill | Output |
|---|---|---|---|
| 0 | Intake + preflight | this skill | phase resolved, config read, tree clean, workspace |
| 1 | Grill (**the only gate**) | `amp:grill` | `decisions.md`, confirmed summary, branch name |
| 2 | Branch | this skill | `<type>/<NN>-<slug>` from the fresh default branch |
| 3 | Design | `amp:design` | reviewed spec |
| 4 | Plan | `amp:plan` | reviewed plan; spec + plan committed |
| 5 | Build | `amp:build` | reviewed atomic task commits, final review clean |
| 6 | Ship | `amp:ship` | docs + close-out, PR, green CI, merged, synced |

Load each stage's skill when the stage starts, not before. Load `amp:lean` at stage 3 and keep it
for the rest of the run. Bug or hotfix work: load `amp:debug` at stage 0 and investigate before
the grill.

## 0. Intake and preflight

1. **Resolve the phase.** An argument `04`/`P04` finds the prompt file in the roadmap's prompt
   directory. A path is read directly. A pasted prompt is used as is. A plain request (no roadmap
   phase) is attributed to the phase it belongs to: the roadmap phase whose area it changes, or the
   current phase. Its id is used for the branch.
2. **Phase id `NN`**: the roadmap's number, two digits (`P04` → `04`). **Type**: from the prompt's
   Branch line, else `feature` (new capability), `bugfix` (defect fix), `hotfix` (urgent fix of
   something released or broken on the default branch), or `framework` (tooling, build, CI,
   scaffolding, process, docs structure). **Slug**: kebab-case, 2–5 words.
3. **Read the project's amp configuration** (see below), including the steps it turns off (see
   Steps a project can turn off), and `CLAUDE.md`. Prerequisites: if the
   roadmap shows earlier phases incomplete, tell the user and stop unless they say to proceed.
4. **Preflight:** `git status` must be clean (otherwise **stop**: never stash or discard the user's
   work). Then `git fetch`, switch to the default branch, `git pull --ff-only`. Check
   `gh auth status` and that a remote exists (if not, note it; amp:ship stops there).
5. `WS=$(bash "${CLAUDE_PLUGIN_ROOT}/skills/build/scripts/amp-workspace" <NN>-<slug>)`. If `$WS/progress.md`
   or `$WS/decisions.md` already exists, **resume** at the stage they show (with `git log` and the
   branch as ground truth) instead of restarting, and append the `Stage:` line of the stage it
   continues (creating the ledger first, as below, if only `decisions.md` exists). Otherwise create
   the ledger `$WS/progress.md` with the header `# amp ledger — <NN>-<slug>` and the line
   `Stage: grill`. Right after creating the ledger, append `Off: <names>` (the steps that are off,
   in the order of Steps a project can turn off, joined by ", ") or `Off: none`. With at least one
   step off, tell the user `Steps off for this project: <names>.` The line is written once, at
   ledger creation: a resumed run never rewrites it and doesn't repeat the notice.

## 1–2. Grill, then branch

Run `amp:grill`. After the user confirms: `git switch -c <type>/<NN>-<slug>` from the updated
default branch, then append `Branch: <branch>` and `Stage: design` to the ledger. This is the
start of autonomy.

When `Grill` is off, don't run amp:grill and ask nothing; for a bug or hotfix, still run the
amp:debug investigation first. Write `$WS/decisions.md` yourself from the request and the sources
amp:grill §0 names, settling each decision they leave open with a ruling, ledgered as usual
(`Ruling: <decision> — <why> — <cost if wrong>`), so amp:ship lists it in the PR. No
`Stage: gate` line is written; branch and append `Branch:` and `Stage: design` as above. The
project's `Grill | off` row is the approval: autonomy starts at intake, with the same
pre-authorized set and every stop. A request so vague that every reading is a guess is stop 4,
not a ruling. amp:grill run directly and amp:roadmap ignore this switch.

## The autonomy contract (after the grill confirmation, or from intake when `Grill` is off)

No check-ins, no "should I continue?", no progress questions. **Rulings, not stalls:** decide
conflicts, ambiguities and plan defects yourself, with the spec as the authority. Ledger each as
`Ruling: <decision> — <why> — <cost if wrong>`; the PR lists them all.

**Stop only for:**
1. **User-only input:** a visual or physical judgment you can't make from renders or output,
   authentication (`! gh auth login`, a CLI login, OAuth), credentials or secrets, a physical
   action, or a paid or external-account action.
2. A destructive or irreversible operation **outside** the pre-authorized set. Pre-authorized:
   create the phase branch, commit, push the phase branch, open the PR, re-run CI, merge after
   green (with `CI` off, after opening the PR), tag per project config, delete the merged phase
   branch, and rebase, remove and delete amp:build's own task worktrees (`$WS/wt-*`) and
   `amp-wt-*` branches.
3. A security-sensitive action, or a project-specific stop rule from the amp configuration.
4. A plan so broken that every path forward is a guess; when `Grill` is off, a request so vague
   that every reading is a guess; or a cap tripped in amp:ship (verify, CI, merge protection).

When stopping, first append `Stage: stopped — <what is needed>` to the ledger, then send one short
message saying exactly what is needed and why. Send a PushNotification if that tool is available.
Wait, then resume from the ledger and append the `Stage:` line of the stage it continues.

## Model routing

Reviewer and implementer run at high effort, checker and scout at medium. The model of each task
type is the user's choice, set in the plugin's settings (`/amp-models`, or the amp rows under
`/config`).

| Role | Runs as |
|---|---|
| Orchestrator: grill, design, plan, rulings, ship | main session (`/model`) |
| Fact-finding: codebase, docs, versions, CI logs | `amp:scout` |
| Spec / plan / roadmap review, task review, final whole-branch review, and their re-reviews | `amp:reviewer` |
| Implementation, fix rounds 1–3, final and CI fixes | `amp:implementer` |
| Fix rounds 4–5, a BLOCKED retry (escalation) | `amp:implementer` + `model` |
| Scoped re-review fallback (reviewer not resumable) | `amp:checker` |
| Re-dispatch when a model is unavailable (fallback) | same agent + `model` |

**Dispatch amp agents without a `model` parameter:** the plugin assigns each its configured model.
Pass `model` only for escalation and fallback, with the value the **amp model routing** section of
your system prompt names. Never set `CLAUDE_CODE_SUBAGENT_MODEL`: it outranks the settings.

**Fallback (automatic, no question):** when a dispatch fails because its model is unavailable
(usage/rate limit, 429, overloaded), re-dispatch the same prompt with the fallback model, ledger
`Fallback: <role> → <model> (<error class>)`, and keep that role on it for the rest of the run.
If the failed dispatch already ran on the fallback model, wait briefly and retry once, then stop
and tell the user. The main session can't switch its own model: if the **session** hits a limit,
tell the user to run `/model <another model>` and say "continue". The workspace and ledger make
the resume exact. Record every fallback in the PR's Rulings.

## Project amp configuration

Projects declare their specifics in `CLAUDE.md` under a heading `## amp configuration`: a table of
key → value. Every key is optional and has a default:

| Key | Default |
|---|---|
| Roadmap | `docs/roadmap/ROADMAP.md` |
| Phase prompts | `docs/roadmap/prompts/` |
| Specs / Plans | `docs/amp/specs/` · `docs/amp/plans/` |
| Dispatch skills | none. Project skills every implementer/reviewer/checker loads (may be conditional, e.g. "X when touching drivers") |
| Verify | the repo's documented test + lint + typecheck + build commands; `off` skips amp:ship's verify step |
| Grill | on. `off`: see Steps a project can turn off |
| Tests | on. `off`: see Steps a project can turn off |
| Document reviews | on. `off`: see Steps a project can turn off |
| Task reviews | on. `off`: see Steps a project can turn off |
| Final review | on. `off`: see Steps a project can turn off |
| CI | on. `off`: see Steps a project can turn off |
| Design process | none. Steps amp:design runs for UX-bearing work |
| Parallel tasks | 3. How many plan tasks amp:build runs at once; 1 runs them one at a time |
| Merge method | merge commit |
| Close-out | roadmap status row → Complete |
| Versioning / tags | none |
| Stop rules | none. Extra project-specific stop conditions |

## Steps a project can turn off

Every step is on unless the project's amp configuration sets its row to `off`. Spec, plan, PR,
merge, docs sweep and close-out always run.

| Step | Off: what does not run | Owner |
|---|---|---|
| Grill | the interview and its gate; intake writes `decisions.md` and rules on what is open | amp:phase |
| Tests | new tests: plans carry no test steps and implementers write none | amp:plan, amp:build |
| Verify | the local verify run before the PR and every re-verify | amp:ship |
| Document reviews | the independent spec, plan and roadmap reviews; the self-reviews stay | amp:design, amp:plan, amp:roadmap |
| Task reviews | the per-task review and its fix loop: an implementer's `DONE` completes the task | amp:build |
| Final review | the whole-branch review; parked findings reach the PR untriaged | amp:build |
| CI | the CI watch: the PR merges without waiting for checks | amp:ship |

**Values.** Compare after trimming whitespace and backticks, ignoring letter case. A missing row
or `on` is on; `off` is off. Any other value of the six on/off rows is read as on and ledgered as
`Ruling: <Key> "<value>" read as on — only on and off are valid — the step runs`; a stage run
without a ledger states that ruling in its final report. `Verify` has no invalid value: anything
but `off` is the command.

**Where a stage reads them.** A step is off when the ledger's `Off:` line (intake step 5) names
it. When the ledger has no `Off:` line, or there is no ledger (a stage skill run on its own), the
step is off when the table sets it to `off`. An `Off:` line wins over the table, so a table edit
made during a run takes effect on the next run.

**The `Tests: off` line.** With `Tests` off, the plan's Global Constraints and every implementer
dispatch that carries none end with this line, verbatim:

`Tests: off — write no new tests; fix an existing test the change breaks in the same commit; missing tests are not a finding.`

A step turned off overrides any sentence in an amp skill that describes it as always happening.

## Red flags

| Thought | Reality |
|---|---|
| "Small change, skip the grill" | Grill what is open, even if it's one round. The summary gate always happens. Only the project's `Grill` row at `off` skips it. |
| "I'll write this bit of code myself" | Product code comes from amp:implementer, reviewed. |
| "CI is slow, merge anyway" | Merge only after green, or stop at the cap. |
| "Better ask before merging" | The grill confirmation (or the `Grill` row at `off`) pre-authorized it. Merge on green. |
| "The model failed, I'll ask what to do" | Fall back to the fallback model automatically and ledger it. |
| "Dirty tree, I'll stash it" | Never touch the user's uncommitted work. Stop and ask. |
