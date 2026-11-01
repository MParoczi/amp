---
name: plan
description: The amp planning stage (Superpowers writing-plans, made lean). It turns the binding spec into an implementation plan of right-sized, independently reviewable tasks. Each task gets exact files, an Interfaces block, the test assertions and signatures the implementer can't decide alone, a Docs line, and one atomic conventional commit. Then a self-review, one amp:reviewer pass, and a single commit of spec + plan. Run by amp:phase after amp:design.
effort: high
---

# amp:plan

A plan is **the set of decisions the implementer cannot make alone**. Write it for a skilled
engineer who has seen neither this codebase nor the spec. A plan longer than the code it describes
has written the code instead (a transcript). A line that decides nothing is a gap. Both are
failures.

Default path: `docs/amp/plans/YYYY-MM-DD-<NN>-<slug>.md` (project configuration may override it).

## Header (mandatory)

```markdown
# Phase <NN> — <title>: Implementation Plan

> Executed by amp:build (one amp:implementer per task, reviewed per task). Checkbox steps track progress.

**Goal:** <one sentence>
**Spec:** <path>, the binding authority; conflicts resolve against it.
**Branch:** <type>/<NN>-<slug>
**Architecture:** <2–3 sentences>
**Tech stack:** <key technologies, versions as pinned in the repo>
**Dispatch skills:** <project skills every implementer/reviewer loads, from the project's amp configuration>

## Global Constraints
<every project-wide requirement from the spec, one line each, exact values verbatim: versions,
naming, copy, platform rules, safety rules. Every task implicitly includes this section.>

## Review Focus
<the spec's Review Focus lines; each one also has its pinning test inside the task that owns the code>
```

## File map first

Before drawing tasks, list every file to create, modify or delete and its one responsibility.
Files that change together live together. Follow the existing structure, and split a file only
where the plan's work would otherwise make it unwieldy.

## Tasks

A task is the **smallest unit that carries its own test cycle and is worth a fresh reviewer's
gate**. Fold setup, config and docs into the task whose deliverable needs them. Split only where a
reviewer could reject one half while approving the other. Order by dependency: enabling refactors
first, then tracer-bullet vertical slices. Each task ends green and committable.

````markdown
### Task N: <component or behavior>

**Files:** Create `path` · Modify `path:lines` · Delete `path` · Test `path`
**Reuse:** <existing code this task reuses or extends, from the spec's Components; or "none: <why>">
**Interfaces:** Consumes <exact names/signatures from earlier tasks> · Produces <exact names, params, return types later tasks rely on>
**Docs:** <docs this task updates, or "none">
**Commit:** `<type>(<scope>): <imperative summary>`

- [ ] **Step 1: Failing test** `<test name>`, with its assertions as code, using the spec's exact values
- [ ] **Step 2: Run, expect FAIL** `<command>` → `<expected failure>`
- [ ] **Step 3: Implement** `<signature>` in `<file>`, plus one line on the approach only where the signature and test leave a real choice; a code block only for an algorithm they don't determine, or exact copy the spec fixes
- [ ] **Step 4: Run, expect PASS** `<command>`
- [ ] **Step 5: Docs** update what the Docs line names
- [ ] **Step 6: Commit** with the Commit line's message (the task's atomic commit)
````

Commit types: `feat`, `fix`, `refactor`, `test`, `docs`, `build`, `ci`, `chore`, `perf`, `style`,
or the project's own convention if it defines one. **One task, one atomic commit.** A task that
genuinely needs two commits (e.g. an expand–contract step) names both.

Batch same-shape trivial edits (the same one-line change across files) into ONE task that lists
every file.

## Self-review (yourself, then fix inline)

1. **Coverage:** every spec requirement, decision, Docs-impact line and Review Focus line maps to a
   task.
2. **Step scan:** every step lets the implementer write exactly one reasonable thing, with no
   gaps and no transcribed bodies.
3. **Consistency:** names, signatures and types match across tasks.
4. **Proportion:** if code blocks are most of the document, replace bodies with signatures and
   assertions.
5. **Lean:** no task builds what the spec doesn't require (`amp:lean` ladder).
6. **DRY:** no two tasks create the same thing, every spec Deletion has a task, and each Reuse
   line names what the task builds on or says why nothing fits.

## Review and commit

Dispatch `amp:reviewer` with `${CLAUDE_PLUGIN_ROOT}/skills/build/prompts/document-review.md` (mode: plan), passing the plan
and spec paths. Fix Critical/Important issues and run at most one confirmation re-review: resume the same reviewer via SendMessage
with "Confirmation re-review: the document changed; verify each Critical/Important issue you raised
is resolved and flag only new Critical/Important problems in the changes." If the resume fails,
dispatch a fresh reviewer with the document-review template.
Rule on residuals in the ledger. Then commit spec and plan together:
`docs(<NN>): spec and implementation plan for <slug>`. Continue straight into amp:build; the grill
confirmation was the approval.
