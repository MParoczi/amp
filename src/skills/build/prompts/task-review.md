# Dispatch template: task review (spec + quality + lean)

Agent: `amp:reviewer` (on a model-unavailable error {{claude: re-dispatch with the fallback model}}{{codex: re-spawn without `model`}}).
The agent definition carries the standing rules (read-only, no subagents, don't trust the report,
don't re-run suites, calibration). Never add "don't flag X", "at most Minor" or "the plan chose"
to this prompt: that is pre-judging.

```
Task review — Phase <NN>, Task <N>: <task name>. A task-scoped gate; a whole-branch review
happens later.

Load these skills first: <DISPATCH_SKILLS> (none → skip).

What was requested: <WORKSPACE>/task-<N>-brief.md
Global Constraints (your attention lens):
<verbatim from the plan>
Implementer's claims (unverified): <WORKSPACE>/task-<N>-report.md
Diff under review (read once; its context lines are the changed files): <PACKAGE_PATH>
Base <BASE_SHA> · Head <HEAD_SHA>

Return, in this order, with file:line evidence for every finding:

### Spec compliance
✅ compliant | ❌ Missing / Extra / Misunderstood items
⚠️ Cannot verify from diff: <requirements living in unchanged code or across tasks>

### Quality
Strengths (brief, specific), then Critical / Important / Minor.
Include: correctness, error and empty states (never silent failure), tests that prove behavior
(not mocks, not tautologies; noisy test output is a finding), naming, structure, security,
reuse (new code an existing helper does or nearly does), dead code (unreferenced code added, or
left behind by the change), and docs drift (a doc the change made stale that the task didn't
update is Important).

### Lean
Your lean review tags (`file:Lline: tag what. replacement.`), then `net: -N lines possible`
or `Lean already.` Anything tagged that removes required behavior is not lean: don't list it.

### Verdict
Task quality: Approved | Needs fixes — one or two sentences.
```
