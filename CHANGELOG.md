# Changelog

## 1.3.0 — 2026-11-01

- A fix round is re-checked by the task's own reviewer, resumed with the fix diff, instead of a
  fresh `amp:checker`. The final fix wave and the spec, plan and roadmap confirmation re-reviews
  resume their reviewer too. `amp:checker` runs only when the reviewer can't be resumed, and the
  ledger says why.
- The implementer and reviewer agents carry the lean rules they need (the ladder, the dead-code
  rule, the never-cut list, `lean:` markers, the review tags), so dispatches no longer load
  `amp:lean`. The skill stays for the orchestrating stages.
- Implementers run their focused tests, and the full suite only when the task touches shared code
  (code other modules import, a public interface, config or build files) or is the plan's last
  task. amp:ship's verification and CI are unchanged.
- The checker and scout run at medium effort (Codex: `reasoning_effort: "medium"`); the reviewer
  and implementer stay at high.
- Model routing and fallback are stated once, in amp:phase. On Claude Code the model values come
  from the plugin's injected routing section, so the skills no longer repeat them.
- amp:plan never makes a task that is only setup, config or docs (unless the whole phase is docs);
  its self-review and the plan review check it.
- Opt-in pipelining: a plan task marked `**Independent:** yes` (it uses nothing the previous task
  produces and shares no file with it) is implemented in a git worktree under `.amp/` while the
  previous task is under review, then rebased if needed, merged and reviewed as usual. A rebase
  conflict, a failed merge or undocumented setup drops back to one task at a time. Every step is
  ledgered, and after a crash amp keeps the pipelined task only if it was merged, otherwise it
  redoes it. On Codex the second implementer stays within the default thread limit.

## 1.2.0 — 2026-10-31

- amp runs on Codex too (CLI or desktop app). Install it from the `MParoczi/amp` marketplace with
  `codex plugin marketplace add MParoczi/amp` and `/plugins`, then run `codex/install` to add the
  `amp-reviewer`, `amp-implementer`, `amp-checker` and `amp-scout` agents, globally or into one
  repository (`--project`). Skills are invoked as `$amp:phase NN`, `$amp:roadmap` and so on.
- On Codex, agents run on the session model unless the installer pins a model per role
  (`--reviewer`, `--implementer`, `--checker`, `--scout`, recorded in `amp-install.json`).
  Escalation is a fresh implementer at reasoning effort `xhigh`, and fallback re-spawns on the
  session model. Every skill that spawns agents (`$amp:phase`, `$amp:roadmap`, `$amp:grill`,
  `$amp:design`, `$amp:plan`, `$amp:build`, `$amp:ship`) stops before its first spawn when the
  agents are missing or differ from the plugin's version. `--uninstall` removes them.
- On Codex, the project configuration is read from `AGENTS.md` (else `CLAUDE.md`), and
  `$amp:roadmap` writes `AGENTS.md` and `.codex/config.toml`.
- The skills and agents are now rendered from one source in `src/` into the Claude Code and Codex
  trees by `scripts/render`; `scripts/test` covers the renderer, the installer and the manifests.
  Codex support hasn't yet been tested end to end against a real Codex binary.

## 1.1.0 — 2026-10-13

- `amp:lean` names its principles (DRY, YAGNI, KISS), adds the dead-code rule (code nothing
  references and no doc, roadmap or phase prompt claims is deleted in the phase that finds it)
  and a `reuse:` review tag for new code an existing helper does or nearly does.
- Every stage applies them at its own point: the design survey records reuse/extend verdicts and
  deletions, plan tasks carry a Reuse line and Delete files, the implementer searches before
  creating and deletes what it orphans, task and final reviews flag duplicates and dead code, and
  phase prompts name unreferenced code a later phase will build on.

## 1.0.0 — 2026-10-09

- First release as a Claude Code plugin: the amp skills (`phase`, `grill`, `design`, `plan`,
  `build`, `ship`, `roadmap`, `lean`, `debug`) and agents (`implementer`, `reviewer`, `checker`,
  `scout`), made project-neutral.
- Model per task type (reviewer, implementer, checker, scout, escalation, fallback), set at
  install, in `/config`, or in the `/amp-models` pane, and applied to every amp dispatch.
