<!-- amp PR body template. Keep prose brief; use the project's domain language. Delete a section
     only if it would say "none", except Rulings and Merge danger, which are always present. -->
## Summary

<2–4 sentences: what this phase delivers, from the user's point of view. Link the phase prompt.>

<Optional, only if it clarifies: the smallest view of the change, such as a call tree, a
component tree, a shallow file tree, a diff-sketch or a small mermaid diagram.>

## Changes

<Grouped by area, one bullet per task, each naming its commit(s):>
- **<area>**: <what changed> (`<sha>`)
- **Deleted**: <dead code removed, and the evidence nothing referenced or claimed it; omit if none>

## Evidence

- Verify: `<command>` → <observed result: counts, coverage, lint/type/build status>
- <e2e / emulator / screenshot evidence with paths, before → after where it applies>

## Decisions

Grill decisions and spec: `<spec path>` · plan: `<plan path>`

## Rulings made autonomously

<Every `Ruling:` from the ledger: what was decided, why, and what it costs if wrong. Write
"None" if there are none.>

## Deliberate shortcuts

<`lean:` markers this branch added: `file:line`, ceiling, upgrade trigger. Find them with
`git diff <merge-base>..HEAD | grep -E '^\+.*lean:'`.>

## Parked / follow-ups

<Deferred minors and parked findings the final review ruled fine-to-merge, and where each was
written (a later phase prompt, the roadmap's parked list, an issue).>

## Merge danger

**Door:** one-way | two-way — <why (migrations, data formats, public contracts are one-way)>
**Blast radius:** <one word> — <what could break for users or other code>
