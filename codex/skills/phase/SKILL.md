---
name: phase
description: Use FIRST, before exploring, asking or coding, whenever the user wants something that ends in code or repo changes. That includes a pasted roadmap phase prompt, `$amp:phase 04`, a feature, a bug fix, a hotfix, or a framework/tooling change. It runs the whole amp pipeline on one branch. The Grill-me-style Q&A is the only approval gate. After it, the run is autonomous (design → plan → subagent build with reviews → docs → PR via gh → CI → merge into the default branch) unless user-only input is needed. It supersedes grill-me and Superpowers' brainstorming, writing-plans, subagent-driven-development and finishing-a-development-branch. For a blank folder or a new project, use amp:roadmap first.
---

# amp:phase

Announce: "Using amp:phase: grill first, then I run autonomously to a merged PR."

If grill-me/grilling or Superpowers skills are also available, don't invoke them:
amp carries their combined workflow. If the project has a blank or near-blank tree and no roadmap,
switch to **amp:roadmap**.

`<skills>` is the folder that holds this skill's folder (the parent of this SKILL.md's directory); use its absolute path.

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
3. **Read the project's amp configuration** (see below) and `AGENTS.md` (else `CLAUDE.md`). Prerequisites: if the
   roadmap shows earlier phases incomplete, tell the user and stop unless they say to proceed.
4. **Preflight:** `git status` must be clean (otherwise **stop**: never stash or discard the user's
   work). Then `git fetch`, switch to the default branch, `git pull --ff-only`. Check
   `gh auth status` and that a remote exists (if not, note it; amp:ship stops there).
   **Agents:** read `amp-install.json` from `<repo>/.codex/agents`, else from
   `${CODEX_HOME:-~/.codex}/agents`. If it's missing, **stop**: tell the user to run
   `bash <skills>/../install` (add `--project` to install into this repo, for collaborators) and
   start a new Codex session. If its `version` differs from the plugin's `version` in
   `<skills>/../../.codex-plugin/plugin.json`, **stop**: the agents are stale, so tell the user to
   re-run the installer and start a new session. Its `models` drive the Model routing below.
5. `WS=$(bash "<skills>/build/scripts/amp-workspace" <NN>-<slug>)`. If `$WS/progress.md`
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

When stopping, send one short message saying exactly what is needed and why. Wait, then resume
from the ledger.

## Model routing

Reviewer and implementer run at high effort, checker and scout at medium. amp's roles are Codex
custom agents (`amp-scout`, `amp-reviewer`, `amp-implementer`, `amp-checker`) written by
`bash <skills>/../install`. The installer flags `--scout`, `--reviewer`, `--implementer` and
`--checker` pin a role's model in `amp-install.json` under `models`; `null` means the session
model.

| Role | Runs as | Model |
|---|---|---|
| Orchestrator: grill, design, plan, rulings, ship | main session | the session model (`/model`) |
| Fact-finding: codebase, docs, versions, CI logs | `amp-scout` | `models.scout`, else the session model |
| Spec / plan / roadmap review, task review, final whole-branch review, and their re-reviews | `amp-reviewer` | `models.reviewer`, else the session model |
| Implementation, fix rounds 1–3, final and CI fixes | `amp-implementer` | `models.implementer`, else the session model |
| Fix rounds 4–5, a BLOCKED retry (escalation) | fresh `amp-implementer` + `reasoning_effort: "xhigh"` | `models.implementer`, else the session model |
| Scoped re-review fallback (reviewer not resumable) | `amp-checker` | `models.checker`, else the session model |
| Re-spawn when a model is unavailable (fallback) | same agent, no `model` | the session model |

**Spawning.** Every agent is a `spawn_agent` call with `agent_type: "amp-<role>"`, the filled
dispatch template as `message`, and the role's effort: `reasoning_effort: "medium"` for
`amp-scout` and `amp-checker`, `reasoning_effort: "high"` for `amp-reviewer` and
`amp-implementer` (escalation: `"xhigh"`). Pass `model` only when `amp-install.json` pins that
role. Spawn independent agents (parallel scouts) before waiting on any of them. Codex has two multi-agent versions; follow the one whose tools you have:

- **v2** (`followup_task` exists): every spawn also passes `task_name: "<role>_<task id>"` and
  `fork_turns: "none"`. A name uses only lowercase letters, digits and `_` (task `3a` stays `3a`)
  and never repeats: add `_r<R>` in fix round R and `_retry<k>` for the k-th BLOCKED retry. For
  example `implementer_3`, `reviewer_3`, `checker_3_r2`, `implementer_3_r4`, `scout_<short_slug>`,
  `reviewer_spec`, `reviewer_plan`, `reviewer_roadmap`, `reviewer_final`, `implementer_final`,
  `checker_final`, `implementer_ci_<k>` (the k-th CI fix). Without `fork_turns: "none"` the spawn
  forks your whole history into the agent, which breaks reviewer independence and multiplies
  context cost; the brief is the agent's only context. `wait_agent` only reports that a wait finished, and each agent's status contract
  arrives as a message: call `wait_agent` again until every spawned agent's message has arrived.
- **v1** (`send_input` exists): `wait_agent` returns the agent's result. 6 agents can be open at
  once by default (`agents.max_concurrent_threads_per_session`; `agents.max_threads` is its legacy
  alias).

A `wait_agent` timeout means wait again.

**Resuming.** A live implementer is resumed for fix rounds 1–3, or after `NEEDS_CONTEXT`, with
`followup_task` (v2) or `send_input` (v1). Never spawn it again. A live reviewer is resumed the
same way for its re-reviews (fix rounds, the final fix wave, a document's confirmation). Only when
that resume fails is a fresh agent spawned: `amp-checker` for a fix round (`checker_<N>_r<R>`,
`checker_final`), `amp-reviewer` for a document (`reviewer_<mode>_r1`).

**Closing.** Where `close_agent` exists, close each checker and scout as soon as its result is
read, and each reviewer when its task's fix loop or its document's confirmation ends
(at once when nothing loops). Close the implementer when its task's fix loop ends, or before any
fresh implementer spawn for the same task (round 4, a BLOCKED retry).

**Escalation** (fix rounds 4–5, a BLOCKED retry): spawn a fresh `amp-implementer` with
`reasoning_effort: "xhigh"`, keeping any pinned `model`. Ledger `Escalation: implementer → xhigh`.

**Fallback (automatic, no question):** when a spawn fails because its model is unavailable
(usage/rate limit, 429, overloaded), re-spawn the same message without `model`, so the agent runs
on the session model. Ledger `Fallback: <role> → session model (<error class>)` and keep that
role on it for the rest of the run. If the failed spawn already had no `model`, wait briefly and
retry once, then stop and tell the user. The main session can't switch its own model: if the
**session** hits a limit, tell the user to run `/model <another model>` and say "continue". The
workspace and ledger make the resume exact. Record every fallback in the PR's Rulings.

## Project amp configuration

Projects declare their specifics in `AGENTS.md` (else `CLAUDE.md`) under a heading `## amp configuration`: a table of
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
| "I'll write this bit of code myself" | Product code comes from amp-implementer, reviewed. |
| "CI is slow, merge anyway" | Merge only after green, or stop at the cap. |
| "Better ask before merging" | The grill confirmation pre-authorized it. Merge on green. |
| "The model failed, I'll ask what to do" | Re-spawn without `model` automatically and ledger it. |
| "Dirty tree, I'll stash it" | Never touch the user's uncommitted work. Stop and ask. |
