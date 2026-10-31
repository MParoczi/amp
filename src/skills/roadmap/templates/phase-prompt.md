# Phase <NN> — <Title>

> Run in a fresh session: `/amp:phase <NN>` (or paste this file).
> Prereq: phases <list> Complete.

| Branch | `<type>/<NN>-<slug>` |
|---|---|
| Milestone | <milestone> |
| Version at close | <x.y.z> (<tag or no tag>) |

## Goal

<One paragraph: what exists at the end of this phase that didn't before, from the user's point of
view.>

## Context

<What already exists that this builds on (earlier phases, files, modules), and research to read
(`docs/research/…#section`). Enough that a session with no memory understands the ground. Name
existing code this phase will build on that nothing references yet, so earlier phases keep it
(`amp:lean`, Dead code).>

## Scope

1. <Deliverable, precise enough to test: behavior, data, UI surface, interface.>
2. <…>

## Out of scope

<What this phase deliberately doesn't do, and which later phase does it.>

## Decisions already made (don't re-grill)

- <decision — where it was made>

## Open decisions for the grill

- <question the grill must settle, with the recommended default>

## Carried in

<Items earlier phases parked for this one, or "none". Earlier phases append here at close-out.>

## Verification gates

- <the project's verify command/skill green>
- <phase-specific: e2e scenario, screenshots in both themes, emulator run, benchmark, …>

## Docs to update

<README / {{claude: CLAUDE.md}}{{codex: AGENTS.md}} / user docs / ADRs / project skills this phase must change.>

## Close-out

ROADMAP status → Complete; version → <x.y.z>; <tag if milestone>; PR merged into `main`.
