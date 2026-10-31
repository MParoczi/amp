---
name: debug
description: The amp root-cause discipline (Superpowers systematic-debugging, made lean). Reproduce, isolate, trace to the root, pin it with a failing test, then make one fix where every caller routes through, and verify. Three failed hypotheses means you question the design, not try a fourth patch. Use for any bug, test failure, CI failure or unexpected behavior, in bugfix/hotfix phases (before the grill asks anything), and inside amp-implementer when a task hits something that doesn't behave as expected.
---

# amp:debug

**No fix without a root cause.** A symptom patch is a second bug with a delay.

1. **Reproduce.** Get a deterministic reproduction: the exact command, input, and observed vs
   expected output. If you can't reproduce it, gather evidence (logs, versions, environment
   diffs) before touching code. Never guess-fix a heisenbug.
2. **Read the error fully.** Stack traces, line numbers and the *first* error, not the last.
3. **Find what changed.** `git log -p`/`git bisect` against a known-good point, and recent
   dependency or config changes.
4. **Trace to the source.** Follow the bad value backwards through the call chain to where it
   first became wrong. Compare with a working sibling path in the same codebase. Grep **every
   caller** of the function you intend to change.
5. **One hypothesis at a time.** State it ("X is null because Y runs before Z"), test it with the
   smallest probe (a log line, an assert, a focused test), and keep or discard it. Don't change two
   things at once.
6. **Pin it.** Write the failing test that reproduces the bug at the highest seam that shows it,
   and watch it fail for the expected reason.
7. **Fix once, at the root.** Make the smallest change where all callers route through (amp:lean).
   Add a guard at another layer only where bad data genuinely enters from outside (a trust
   boundary).
8. **Verify.** Run the pinning test, the tests around the change, then the suite once. Remove the
   probes.

**Three strikes.** If three hypotheses or fixes have failed, stop patching. The problem is
structural (wrong model, wrong layer, a shared-state or timing assumption). Write down what the
three attempts showed, and escalate: an implementer returns `BLOCKED` with that write-up, and an
orchestrator rules on a design change or asks the user if every path is a guess.

**Flaky tests:** replace sleeps with condition-based waits, find the polluting test by bisecting the
test order, and never "fix" a flake by retrying it.

In a **bugfix/hotfix phase**, do steps 1–4 *before* the grill, so the grill asks the user
decisions (expected behavior, acceptable fix scope, rollout), never facts the code can answer.
