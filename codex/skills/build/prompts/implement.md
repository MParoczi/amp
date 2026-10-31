# Dispatch template: implement one task

Agent: `amp-implementer` (`model` only when `amp-install.json` pins it). Rounds 4–5 of a fix loop: fresh spawn with `reasoning_effort: "xhigh"`.
The agent definition carries every standing rule (TDD, docs, commits, report contract, no
subagents). Fill the brackets; add nothing else.

```
Phase <NN> — <title>. Task <N> of <M>: <task name>. <One line: where this task fits.>

Read your brief first: <WORKSPACE>/task-<N>-brief.md. It is your requirements; use its exact
values verbatim.
Spec (binding authority, read only the sections the brief cites): <SPEC_PATH>

Load these skills before writing anything: amp:lean, <DISPATCH_SKILLS>.

Global Constraints (bind this task):
<verbatim from the plan's Global Constraints>

From earlier tasks (the brief cannot know these):
<interfaces actually produced, rulings that affect this task, pointers to parked findings in this area; or "none">

Ambiguities I resolved: <your rulings on anything unclear in the brief; or "none">

Work in: <repo root> on branch <branch>. Write your full report to <WORKSPACE>/task-<N>-report.md
and reply with the status contract only.
```

## Fix-round variant (rounds 1–3: resume the same agent with `followup_task` (v2) or `send_input` (v1); if it can't be resumed, spawn fresh with the brief and report paths)

```
Fix round <R>/5 for Task <N>. The review found these open issues (verbatim):
<findings, one bullet each, with file:line>
Fix them, re-run the tests covering the amended code, append a fix report (changes, tests run,
command, output) to <WORKSPACE>/task-<N>-report.md, commit as a new follow-up commit (never amend
or rebase: the review ranges depend on the existing commits), and reply with the contract.
```

Rounds 4–5 add: "A prior implementer attempted this task <R-1> times; you own it now. Read the
report file for what was tried."

## Final-review and CI fix variants

Final review: "Fix ALL of these findings from the whole-branch review (verbatim list). One commit
per coherent fix group." CI: "CI failed on the PR. Failure log: <WORKSPACE>/ci-<k>.log. Find the
root cause (amp:debug), fix it, run the failing check's command locally if possible, commit, and
report. Do not push; the orchestrator pushes."
