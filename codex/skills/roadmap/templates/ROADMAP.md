# <Project> — Roadmap (A → Z)

> **How to use this file.** The project is built as an ordered sequence of phases, one prompt file
> each under `docs/roadmap/prompts/`. For each phase, open a **fresh Codex session** in this
> repo and run `$amp:phase <NN>` (or paste the prompt file). Answer the grill; after you confirm the
> summary, the session runs autonomously: design → plan → build with reviews → PR → CI → merge
> into `main`, and it updates the status table below. Don't skip ahead: each phase assumes every
> phase above it is Complete.
>
> Planning session: <YYYY-MM-DD>. Research: `docs/research/`. Rules: `AGENTS.md`.

## Vision

<3–6 sentences: the problem, who it's for, what v1 is, what makes it worth building.>

**Non-goals (v1):** <bullets>

## Laws of the project

<The 3–7 binding rules every phase honors: safety or quality rules, model routing, secrets, test
doctrine. Each one short, each one enforceable.>

## Process per phase (identical every time)

1. `$amp:phase <NN>` in a fresh session. The **grill** is the only approval gate.
2. Branch `<type>/<NN>-<slug>` from `main` (types: framework, feature, bugfix, hotfix).
3. Spec → plan → one `amp-implementer` per task with an atomic commit, reviewed per task, and a
   final whole-branch review.
4. Docs updated with the code, verification observed, PR via `gh`, merge after green CI (merge
   commit), then this table updated.
5. Items a phase parks for a later phase are written into that phase's prompt under "Carried in".

## Versioning

<e.g. SemVer. Every completed phase bumps patch; a milestone-completing phase bumps minor and tags
the merge commit `vX.Y.0` (annotated). `1.0.0` is tagged by the release phase. The version lives in
ONE place: <file>.>

## Milestones

| Milestone | What it proves |
|---|---|
| <M0 Foundation> | <…> |

## Status

| Milestone | Phase | Type | Scope | Depends on | Version at close | Status |
|---|---|---|---|---|---|---|
| M0 | [00](prompts/00-<slug>.md) | framework | <one line> | — | 0.0.1 | Pending |

## Decisions the owner makes along the way

| Decision | Asked in | Default if undecided |
|---|---|---|
| <…> | phase <NN> grill | <…> |
