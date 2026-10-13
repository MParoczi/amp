---
name: lean
description: The amp economy doctrine (Ponytail-derived) for code AND context, in three words DRY, YAGNI, KISS. The laziness ladder (need it? → reuse or extend → stdlib → native → installed dep → one line → minimum), the dead-code rule (unreferenced and unclaimed by the docs or roadmap → delete), the never-cut list (trust-boundary validation, data-loss handling, security, accessibility, anything requested), `lean:` markers for deliberate shortcuts, the over-engineering review tags (delete/reuse/stdlib/native/yagni/shrink), and the agent context economy (paths not payloads, short contracts, no narration). Load before designing, planning, implementing or reviewing in any amp workflow, and whenever the user asks for the simplest or minimal solution or complains about bloat, boilerplate or token waste.
effort: high
---

# amp:lean

Spend only what the result needs, and never less. Lean cuts waste. It never cuts rigor: when
lean and quality conflict, **quality wins**. Reviews, tests, verification and reading the code are
never skipped to save tokens.

## 1. Code economy: the ladder

Three names for one reflex: **DRY** (one place for each behavior), **YAGNI** (only what is asked
for), **KISS** (the simplest thing that is correct).

**Understand first.** Read the task and every file the change touches, and trace the real flow end
to end. The ladder shortens the solution, never the reading. The smallest diff in the wrong place
is not lean, it is a second bug.

Then stop at the first rung that holds:

1. **Does this need to exist?** Speculative need → skip it, and say so in one line (YAGNI).
2. **Already in this codebase, or nearly?** Reuse the helper, type, component or pattern a few
   files over. If one does most of it, extend it (a parameter, a branch, a wider type) instead of
   writing a sibling. Search by name, by shape and by behavior before creating anything.
   Re-implementing what already exists is the most common slop.
3. **Stdlib does it?** Use it.
4. **Native platform feature?** `<input type="date">` over a picker lib, CSS over JS, a DB
   constraint over app code, OS/framework facilities over hand-rolled ones.
5. **Installed dependency does it?** Use it. Never add a dependency for what a few lines do.
6. **One line?** One line.
7. **Only then:** the minimum code that works.

If two rungs work, take the higher one. If two same-size options exist, take the one that is
correct on edge cases.

**Bug fix = root cause.** A report names a symptom. Before editing, grep every caller of the
function you are about to touch. One guard in the shared function is a smaller diff than one guard
per caller, and a fix on the reported path alone leaves the sibling callers broken.

### Dead code

Code nothing references is deleted in the phase that finds it: no caller, import, route, test,
config or template uses it, and no document claims it (the roadmap, a later phase prompt, the
spec, user docs). A "for later" comment is not a claim, and neither is a test that exercises only
the dead thing. Check every name with grep, including string and dynamic references, then delete
the code with its tests, exports and doc mentions in one commit. A change that leaves its
predecessor unreferenced deletes the predecessor. Scope per phase: the modules the work touches,
what the work orphans, and whatever the project's dead-code tool reports when it has one.

### Rules

- No unrequested abstractions: no interface with one implementation, no factory with one product,
  no config for a value that never changes, no wrapper that only delegates.
- No scaffolding "for later". Later can scaffold for itself.
- Prefer deletion over addition, and boring over clever.
- Use the fewest files the design allows, and follow the project's existing structure.
- Mark a deliberate simplification with a known ceiling with
  `lean: <ceiling>, <upgrade trigger>`, using the language's comment syntax. Example:
  `// lean: global lock, per-account locks if throughput matters`. amp:ship collects these
  markers into the PR.

### Never cut

Never cut input validation at trust boundaries, error handling that prevents data loss or leaves
the user uninformed, security measures, accessibility basics, or anything explicitly requested. If
the user or spec asks for the full version, build it without re-arguing. Physical-world code
(hardware, clocks, sensors) keeps its calibration knobs.

### Tests

**The project's test doctrine wins.** If it mandates TDD, coverage floors or golden vectors, follow
it exactly. Without one, non-trivial logic (a branch, loop, parser, money or security path) gets
test-first coverage at its public seam: the smallest tests that fail if the behavior breaks. Don't
write per-function suites for trivial one-liners. YAGNI applies to tests, but never to the one test
that proves the logic.

### Review tags (the lean axis of every review)

One line per finding: `<file>:L<line>: <tag> <what>. <replacement>.`

- `delete:` dead code (unreferenced and unclaimed), unused flexibility, speculative feature.
  Replacement: nothing.
- `reuse:` new code an existing helper does, or would with a small change. Name the helper and
  the change.
- `stdlib:` hand-rolled thing the standard library ships. Name the function.
- `native:` dependency or code doing what the platform does. Name the feature.
- `yagni:` abstraction with one implementation, config nobody sets, layer with one caller.
- `shrink:` same logic, fewer lines. Show the shorter form.

End the lean axis with `net: -<N> lines possible`, or `Lean already.` A single smoke test or
self-check is the minimum, not bloat; never flag it.

## 2. Context economy (orchestrators and subagents)

Everything pasted into a prompt or printed back stays resident and is re-read every turn.

- **Paths, not payloads.** Hand briefs, reports, diffs and logs over as files. Never paste a plan,
  a diff or accumulated history into a dispatch.
- **Contracts, not essays.** Subagents write detail to their report file and reply with the short
  status contract (≤ 15 lines).
- **Narrate at most one short line between tool calls.** No progress essays, no "should I
  continue?", no restating what a tool result already shows.
- **Load at the stage.** Load a skill when its stage starts, not up front. Read the files the work
  touches, fully; don't crawl the repo. Use a scout for broad searches and keep only its
  conclusion.
- **Batch same-shape work.** Five identical one-line edits are one dispatch, not five.
- **Don't repeat evidence.** Don't re-run a suite someone already ran on the same code. Run focused
  tests while iterating and the full suite once before committing.
- **Right-size the model, never below quality.** Use the role table in amp:phase. Turn count beats
  token price: a cheap model that takes three times the turns costs more.
- **Prose after code: at most three short lines.** Pattern: `[result] → skipped: [X], add when
  [Y].` Explanation the user asked for (a report, a PR body, a summary) is not waste; give it in
  full.
