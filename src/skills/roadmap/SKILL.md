---
name: roadmap
description: Use when starting a NEW project in a blank or nearly blank folder (after the user's opening prompt), when the user asks for a project roadmap or phase plan, or when an existing amp roadmap needs revising (add, split, reorder or re-scope phases). It grills the whole project, researches the stack with scouts, and writes an A-to-Z roadmap of numbered, shippable phases. Each phase gets a self-contained prompt that `/amp:phase NN` executes in a fresh session. It also writes {{claude: CLAUDE.md}}{{codex: AGENTS.md and .codex/config.toml}} with the project's amp configuration and the model settings, reviews everything independently, and makes the initial commit (and GitHub repo if chosen).
argument-hint: "[revise: <what changes>]"
effort: high
---

# amp:roadmap

The roadmap describes the whole project from A to Z, as phases that each run through amp:phase as
one branch and one merged PR. The phase prompts are the contract a future session executes with no
memory of this one, so they must stand on their own.

<!-- codex -->
`<skills>` is the folder that holds this skill's folder (the parent of this SKILL.md's directory); use its absolute path.

**Agents first.** Before the grill (it spawns scouts), run amp:phase's Agents preflight: read
`amp-install.json` from `.codex/agents`, else `${CODEX_HOME:-~/.codex}/agents`. Missing → **stop**:
tell the user to run `bash <skills>/../install` and start a new Codex session. Its `version`
differs from `<skills>/../../.codex-plugin/plugin.json`'s → **stop**: the agents are stale, so tell
the user to re-run the installer and start a new session. Every spawn follows amp:phase, Model
routing, with `model` only where `amp-install.json` pins the role.

<!-- /codex -->
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
- stack: the user's preference, or 2–3 researched options with a recommendation ({{claude: dispatch}}{{codex: spawn}}
  {{claude: `amp:scout`s}}{{codex: `amp-scout`s as in amp:phase}} for current versions and trade-offs; verify library facts via {{claude: Context7/web}}{{codex: the Context7 MCP when configured, else the official docs}}, never
  from memory)
- quality bar: test doctrine (TDD? coverage floors? e2e?), lint/format, accessibility, i18n,
  performance budgets
- design ambition for UI projects (design system? a design process to run per surface?)
- repo and delivery: GitHub (name, private/public, `gh repo create`), CI on GitHub Actions (which
  gates), versioning (default: SemVer, patch per phase, minor per milestone with an annotated tag,
  1.0.0 at release), merge method (default: merge commit)
- project-specific safety or stop rules (e.g. "never touch production hardware before phase X")
<!-- claude -->
- models: the session model for the orchestrator, and the amp plugin's model per task type
  (reviewer, implementer, checker, scout, escalation, fallback; `/amp-models`), all high effort.
  Keep the user's current settings unless they want otherwise
<!-- /claude -->
<!-- codex -->
- models: the session model for the orchestrator (written to `.codex/config.toml`), and whether
  to pin a model per amp role (reviewer, implementer, checker, scout; the installer's flags,
  otherwise each runs on the session model), all high effort, and whether to install the agents
  into this repo for collaborators (`--project`). Keep the user's current settings (the
  `amp-install.json` the preflight read) unless they want otherwise
<!-- /codex -->

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
<!-- claude -->
3. `CLAUDE.md` from `CLAUDE.md`: project summary, binding rules, stack, and the `## amp
   configuration` table. Only put in it what a session can't derive from the code.
4. `.claude/settings.json` from `settings.json`: the session model, high effort. Merge into an
   existing file rather than replacing it.
<!-- /claude -->
<!-- codex -->
3. `AGENTS.md` from `AGENTS.md`: project summary, binding rules, stack, and the `## amp
   configuration` table. Only put in it what a session can't derive from the code. Keep it well
   under Codex's AGENTS.md cap (`project_doc_max_bytes`, 32 KiB by default, for all merged files).
4. `.codex/config.toml` from `config.toml`: `model` is the session model and
   `model_reasoning_effort = "high"`. Merge into an existing file rather than replacing it.
<!-- /codex -->
5. Research notes the scouts produced go to `docs/research/` (cited by the prompts).
6. `.gitignore` with the stack's ignores. `.amp/` ignores itself.

## 3. Review

{{claude: Dispatch `amp:reviewer`}}{{codex: Spawn `amp-reviewer` (`spawn_agent`, `agent_type: "amp-reviewer"`, as amp:phase, Model routing says)}} with `${CLAUDE_PLUGIN_ROOT}/skills/build/prompts/document-review.md` (mode: roadmap), passing
ROADMAP.md, the prompts directory, {{claude: CLAUDE.md}}{{codex: AGENTS.md}} and the grill decisions. Fix Critical/Important
issues and run one confirmation pass. Record residual rulings in the final report.

## 4. Commit and publish

- `git init -b main` if needed. The roadmap commit is the **one exception** to branch-first: there
  is no default branch to branch from yet. Commit to `main`:
  `docs(roadmap): project roadmap, phase prompts and amp configuration`.
- If the grill chose GitHub: `gh repo create <name> --<private|public> --source . --push`. This was
  confirmed in the grill, so it is pre-authorized. `gh` not authenticated → stop and ask for
  `! gh auth login`.
<!-- claude -->
- Report: the phase table, where the files are, residual rulings, and the next step: "open a
  fresh session here and run `/amp:phase 00`".
<!-- /claude -->
<!-- codex -->
- Report: the phase table, where the files are, residual rulings, and the next steps: "run
  `bash <skills>/../install <flags>` to install amp's agents with the models chosen in the grill,
  then open a fresh Codex session here and run `$amp:phase 00`". `<flags>` holds
  `--reviewer|--implementer|--checker|--scout <model>` for each role the grill pinned, and
  `--project` if the grill chose to install the agents into this repo for collaborators (commit
  the `.codex/agents` it writes). If the grill kept the installed agents as they are, drop the
  install step.
<!-- /codex -->
