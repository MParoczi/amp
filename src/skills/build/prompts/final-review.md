# Dispatch template: final whole-branch review

Agent: `amp:reviewer` (on a model-unavailable error {{claude: re-dispatch with the fallback model}}{{codex: re-spawn without `model`}}).

```
Final whole-branch review — Phase <NN>: <title>, branch <branch>. Every task passed its own
review; you judge the whole: integration, cross-task consistency, and what a real user meets.

Load these skills first: amp:lean, <DISPATCH_SKILLS>.

Spec (binding): <SPEC_PATH>
Plan: <PLAN_PATH>
Branch package (merge-base..HEAD): <PACKAGE_PATH>
Ledger lines to triage (deferred minors, parked findings, rulings): <WORKSPACE>/progress.md — lines
containing "minor (deferred)", "parked", or "Ruling:"

The spec is a vision document: for behavior it is silent on, a reasonable user's expectation is
the requirement. Check the spec's Review Focus lines explicitly, one verdict each.

Return:
### Review Focus verdicts (one line each: held | broken, with file:line)
### Strengths
### Issues — Critical / Important / Minor (file:line, what, why it matters, fix)
  Include integration gaps, cross-task naming or contract drift, silent failures, security,
  and docs drift across the whole repo (README, {{claude: CLAUDE.md}}{{codex: AGENTS.md, CLAUDE.md}}, roadmap, user docs, project skills).
### Lean (amp:lean tag lines across the branch, including anything two tasks built twice and
  code the branch left unreferenced, then net)
### Ledger triage
  Each deferred minor or parked item: must-fix-before-merge | fine to merge | follow-up for a later phase
### Declined to judge
  Behaviors you set aside as outside the spec, one line each with the reason (empty = none).
### Verdict
Ready to merge: Yes | With fixes | No — reasoning in two sentences.
```
