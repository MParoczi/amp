# Changelog

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
