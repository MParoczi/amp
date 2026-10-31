# <Project> — project instructions (CLAUDE.md)

## Project

<2–5 sentences: what it is, for whom, the core value. Point at `docs/roadmap/ROADMAP.md`.>

## Binding rules

<The laws of the project from the roadmap, stated as rules a session can follow and a reviewer
can check.>

## Stack

<Chosen stack with one-line rationale each; versions are pinned in <manifest>, not here. Verify
library APIs via Context7 before use.>

## How we work

Every code-bearing change runs through **`/amp:phase`** (the amp skill suite): grill (the only
gate) → spec → plan → `amp:implementer` tasks with atomic commits and per-task reviews → final
review → docs → PR via `gh` → green CI → merge into `main`. Branches: `framework|feature|bugfix|
hotfix/<NN>-<slug>`. Docs are updated in the same branch as the code they describe.

## amp configuration

| Key | Value |
|---|---|
| Roadmap | `docs/roadmap/ROADMAP.md` |
| Phase prompts | `docs/roadmap/prompts/` |
| Specs / Plans | `docs/amp/specs/` · `docs/amp/plans/` |
| Dispatch skills | <project skills, or "none yet (created in phase 00)"> |
| Verify | <command or skill> |
| Design process | <steps for UX-bearing work, or "none"> |
| Merge method | merge commit |
| Close-out | ROADMAP status row → Complete; bump version in <file>; tag milestone-completing merges |
| Versioning / tags | <SemVer rule> |
| Stop rules | <project-specific, or "none"> |
