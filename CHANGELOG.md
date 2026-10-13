# Changelog

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
