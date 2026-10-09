---
name: roadmap
description: Use when starting a NEW project in a blank or nearly blank folder (after the user's opening prompt), when the user asks for a project roadmap or phase plan, or when an existing amp roadmap needs revising (add, split, reorder or re-scope phases). It grills the whole project, researches the stack with scouts, and writes an A-to-Z roadmap of numbered, shippable phases. Each phase gets a self-contained prompt that `/amp:phase NN` executes in a fresh session. It also writes CLAUDE.md with the project's amp configuration and the model settings, reviews everything independently, and makes the initial commit (and GitHub repo if chosen).
argument-hint: "[revise: <what changes>]"
effort: high
---

# amp:roadmap

The roadmap describes the whole project from A to Z, as phases that each run through amp:phase as
one branch and one merged PR. The phase prompts are the contract a future session executes with no
memory of this one, so they must stand on their own.

## Mode

- **New:** the folder has no roadmap and little or no code. Proceed below.
- **Revise** (a roadmap exists, or the argument starts with `revise`): grill only the change, then
  edit ROADMAP.md and the affected prompts (renumbering is allowed only for phases not started).
  Ship it as a `framework/<NN>-roadmap-<slug>` branch through amp:ship. `<NN>` is the next pending
  phase's id.

## 1. Discuss and grill the project (`amp:grill`, project scope)

Let the user's opening prompt and first answers shape it. The tree to cover:

- vision, users, the problem, what "done" means for v1, explicit non-goals
- platform(s), distribution, offline or online, data and integrations, privacy and secrets
- stack: the user's preference, or 2–3 researched options with a recommendation (dispatch
  `amp:scout`s for current versions and trade-offs; verify library facts via Context7/web, never
  from memory)
- quality bar: test doctrine (TDD? coverage floors? e2e?), lint/format, accessibility, i18n,
  performance budgets
- design ambition for UI projects (design system? a design process to run per surface?)
- repo and delivery: GitHub (name, private/public, `gh repo create`), CI on GitHub Actions (which
  gates), versioning (default: SemVer, patch per phase, minor per milestone with an annotated tag,
  1.0.0 at release), merge method (default: merge commit)
- project-specific safety or stop rules (e.g. "never touch production hardware before phase X")
- models: the session model for the orchestrator, and the amp plugin's model per task type
  (reviewer, implementer, checker, scout, escalation, fallback; `/amp-models`), all high effort.
  Keep the user's current settings unless they want otherwise

**Last grill round: the phase outline.** Propose the phase table (id, type, title, one-line
deliverable, depends-on, milestone) and ask whether the granularity, order and cut lines are right.
Iterate until confirmed. The confirmed summary is the gate: after it, write everything without
asking.

### Phase design rules

- **Phase 00 is `framework`:** repo, toolchain, a skeleton that builds and runs, CI with the core
  gates, conventions, and the project's own convention/testing skills if the project warrants them
  (listed later as Dispatch skills).
- Every phase is a **vertical, demoable, shippable increment** that ends green and is sized for one
  session and one PR (roughly 3–12 plan tasks). Split anything larger.
- Order: foundation → walking skeleton → **riskiest unknowns early** (spikes as their own phases)
  → features by value → hardening → release. Dependencies are explicit and only point backwards.
- Types: `framework` (tooling, infra, process, scaffolding), `feature`, and `bugfix`/`hotfix` only
  when a roadmap phase is a planned fix.
- Group phases into milestones. A milestone-completing phase bumps minor and tags.
- Leave cross-cutting quality work (audit, security review, performance, docs, release) as explicit
  late phases, and don't pretend earlier phases make it unnecessary.

## 2. Write the files

From `${CLAUDE_SKILL_DIR}/templates/`:

1. `docs/roadmap/ROADMAP.md` from `ROADMAP.md`, with the status table listing every phase as
   Pending.
2. `docs/roadmap/prompts/<NN>-<slug>.md`, one per phase, from `phase-prompt.md`. Each prompt
   carries its own context, links to research, decisions already made (so the phase grill doesn't
   re-ask them) and the **open decisions** its grill must settle.
3. `CLAUDE.md` from `CLAUDE.md`: project summary, binding rules, stack, and the `## amp
   configuration` table. Only put in it what a session can't derive from the code.
4. `.claude/settings.json` from `settings.json`: the session model, high effort. Merge into an
   existing file rather than replacing it.
5. Research notes the scouts produced go to `docs/research/` (cited by the prompts).
6. `.gitignore` with the stack's ignores. `.amp/` ignores itself.

## 3. Review

Dispatch `amp:reviewer` with `${CLAUDE_PLUGIN_ROOT}/skills/build/prompts/document-review.md` (mode: roadmap), passing
ROADMAP.md, the prompts directory, CLAUDE.md and the grill decisions. Fix Critical/Important
issues and run one confirmation pass. Record residual rulings in the final report.

## 4. Commit and publish

- `git init -b main` if needed. The roadmap commit is the **one exception** to branch-first: there
  is no default branch to branch from yet. Commit to `main`:
  `docs(roadmap): project roadmap, phase prompts and amp configuration`.
- If the grill chose GitHub: `gh repo create <name> --<private|public> --source . --push`. This was
  confirmed in the grill, so it is pre-authorized. `gh` not authenticated → stop and ask for
  `! gh auth login`.
- Report: the phase table, where the files are, residual rulings, and the next step: "open a
  fresh session here and run `/amp:phase 00`".
