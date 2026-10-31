---
name: grill
description: The amp requirements interview (Grill-me-derived). Map the work as a decision tree, ask it in frontier rounds (every question whose prerequisites are settled, each with a recommended answer), look facts up instead of asking them, sharpen vocabulary, record every decision to a file, and end with ONE confirmation gate. amp:phase and amp:roadmap run it as their first stage. Use it directly when the user says "grill me", wants a plan or idea stress-tested, or needs requirements pinned down before any work.
effort: high
---

# amp:grill

Interview the user relentlessly until you share one understanding with nothing left silently
assumed. Finding facts is your job. Making decisions is theirs.

## 0. Before the first question

Read what already answers questions: the prompt (phase prompt or request), `CLAUDE.md`, the
roadmap and its carry-forward/parked items addressed to this phase, earlier specs and ADRs, and the
code the work touches. A decision already fixed by any of these is **settled**. Cite it in the
summary and don't re-ask it. Ask only where the sources leave something open, disagree with each
other, or disagree with the code.

Create `<workspace>/decisions.md` (the workspace comes from amp:phase; standalone, use
`.amp/grill-<slug>/`). This file is the interview's memory and survives compaction.

## 1. Map the decision tree

Write every open decision as a node: `D<n> — <question> — needs: D<a>, D<b> — status`. Cover each
branch that applies:

- purpose, success criteria, who and what uses it
- scope: what is in, and explicitly what is **out**
- data shapes, persistence, migrations and compatibility
- interfaces and contracts (APIs, commands, events, files)
- states: empty, loading, offline, error, partial, and how failures surface to the user
- edge cases, limits, concurrency, time/zone/locale/units
- security, privacy, secrets
- UX, copy and motion when the work has a UI (the project's design process may own this)
- testing: which seams, what level, what fixtures
- docs that must change
- the implementation approach, as its own decision whenever more than one is viable: 2–3
  approaches with trade-offs, recommendation first, lean ladder applied (`amp:lean`)

## 2. Facts vs decisions

When a question needs a fact (existing behavior, a library's API or version, a file's contents,
CI setup), **don't ask the user**. Dispatch an `amp:scout` (several in parallel when independent)
with a precise question and a findings path in the workspace. A running scout is an unsettled
prerequisite: only the questions downstream of it wait, so ask the rest of the frontier now.

## 3. Ask in frontier rounds

The **frontier** is every open decision whose prerequisites are all settled and that no running
scout blocks. Ask the whole frontier in one round:

- **Enumerable options:** use the AskUserQuestion tool, up to 4 questions per call. Put the
  recommended option first, labelled "(Recommended)". Each question gets 1–3 sentences of context
  and options that state their trade-off. If the frontier has more than 4, ask first the ones that
  unblock the most downstream decisions.
- **Open-ended:** use numbered text, one block per question:

  ```
  ❓ **Q1 — <title>**: <context and the question; choices if any>

  ➡️ Recommended: <answer and why, one line>

  ---
  ```

Never put two questions in one round when one's answer changes the other; the dependent one
belongs to a later round.

## 4. After each round

- Record each answer in `decisions.md`: `D<n>: <answer> — <why, one line>`.
- **Challenge immediately** when an answer contradicts the code, an earlier decision or the
  prompt: "Your code cancels whole orders, but you said partial cancellation works. Which is
  right?"
- **Sharpen fuzzy terms.** Propose one canonical word for an overloaded one. If the project keeps
  a glossary (`CONTEXT.md` or similar), update it the moment a term is resolved.
- **Stress-test with a concrete scenario** when a boundary is vague.
- **Offer an ADR** only when all three hold: the decision is hard to reverse, would surprise a
  future reader, and came out of a real trade-off. Record it where the project keeps them.
- Recompute the frontier and ask the next round.

## 5. Close

The grill is done when the frontier is empty: every branch visited and every assumption either
confirmed or stated. Then present one compact summary:

- a table of every decision, with settled-by-sources items marked "(from prompt/docs)"
- stated assumptions and what is **out of scope**
- for amp:phase: the branch name `<type>/<NN>-<slug>` and the phase's verification gates

Ask: **"Is this a complete and correct picture? Once you confirm, I run autonomously through
design, plan, build, PR and merge."** (Standalone, drop the second sentence.) Corrections reopen
their branch of the tree; ask again only what changed.

This confirmation is the **only** approval gate in an amp run. Nothing is designed, planned or
built before it.

## Red flags

| Thought | Reality |
|---|---|
| "The prompt is detailed, skip the grill" | Grill what is open, even if that is one round. Zero rounds only if nothing is open, and the summary and confirmation still happen. |
| "I'll ask the user where X lives" | That is a fact. Dispatch a scout. |
| "I'll ask this now and fix it later if the other answer changes it" | A dependent question waits for its prerequisite's round. |
| "Close enough, I can infer the rest" | Unasked decisions become rulings the user never saw. Ask. |
| "The user already approved the idea, so I'll start" | Only the confirmed summary opens the gate. |
