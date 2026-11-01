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
3. **Read the project's amp configuration** (see below) and `CLAUDE.md`. Prerequisites: if the
   roadmap shows earlier phases incomplete, tell the user and stop unless they say to proceed.
4. **Preflight:** `git status` must be clean (otherwise **stop**: never stash or discard the user's
   work). Then `git fetch`, switch to the default branch, `git pull --ff-only`. Check
   `gh auth status` and that a remote exists (if not, note it; amp:ship stops there).
5. `WS=$(bash "${CLAUDE_PLUGIN_ROOT}/skills/build/scripts/amp-workspace" <NN>-<slug>)`. If `$WS/progress.md`
   or `$WS/decisions.md` already exists, **resume** at the stage they show (with `git log` and the
   branch as ground truth) instead of restarting.

## 1–2. Grill, then branch

Run `amp:grill`. After the user confirms: `git switch -c <type>/<NN>-<slug>` from the updated
default branch. This is the start of autonomy.

## The autonomy contract (after the grill confirmation)

No check-ins, no "should I continue?", no progress questions. **Rulings, not stalls:** decide
conflicts, ambiguities and plan defects yourself, with the spec as the authority. Ledger each as
`Ruling: <decision> — <why> — <cost if wrong>`; the PR lists them all.

**Stop only for:**
1. **User-only input:** a visual or physical judgment you can't make from renders or output,
   authentication (`! gh auth login`, a CLI login, OAuth), credentials or secrets, a physical
   action, or a paid or external-account action.
2. A destructive or irreversible operation **outside** the pre-authorized set. Pre-authorized:
   create the phase branch, commit, push the phase branch, open the PR, re-run CI, merge after
   green, tag per project config, delete the merged phase branch, and rebase, remove and delete
   amp:build's own pipeline worktrees (`$WS/wt-*`) and `amp-wt-*` branches.
3. A security-sensitive action, or a project-specific stop rule from the amp configuration.
4. A plan so broken that every path forward is a guess, or a cap tripped in amp:ship (verify, CI,
   merge protection).

When stopping, send one short message saying exactly what is needed and why. Send a
PushNotification if that tool is available. Wait, then resume from the ledger.

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
| Verify | the repo's documented test + lint + typecheck + build commands |
| Design process | none. Steps amp:design runs for UX-bearing work |
| Merge method | merge commit |
| Close-out | roadmap status row → Complete |
| Versioning / tags | none |
| Stop rules | none. Extra project-specific stop conditions |

## Red flags

| Thought | Reality |
|---|---|
| "Small change, skip the grill" | Grill what is open, even if it's one round. The summary gate always happens. |
| "I'll write this bit of code myself" | Product code comes from amp:implementer, reviewed. |
| "CI is slow, merge anyway" | Merge only after green, or stop at the cap. |
| "Better ask before merging" | The grill confirmation pre-authorized it. Merge on green. |
| "The model failed, I'll ask what to do" | Fall back to the fallback model automatically and ledger it. |
| "Dirty tree, I'll stash it" | Never touch the user's uncommitted work. Stop and ask. |
