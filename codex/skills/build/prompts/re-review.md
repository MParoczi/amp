# Dispatch template: scoped re-review of a fix round

Agent: `amp-checker` (`model` only when `amp-install.json` pins it). It verdicts findings and inspects the fix diff, nothing
else.

```
Scoped re-review — Phase <NN>, Task <N>, fix round <R>.

Load: <DISPATCH_SKILLS>.
Task brief: <WORKSPACE>/task-<N>-brief.md
Findings under verification (verbatim):
<one bullet each>
Fix report (appended at the end): <WORKSPACE>/task-<N>-report.md
Fix diff: <PACKAGE_PATH> (base <FIX_BASE_SHA> = the head the previous review saw · head <HEAD_SHA>)

Return:
### Finding verdicts
- <finding one-liner> — ADDRESSED | NOT ADDRESSED — file:line evidence ("attempted" is not addressed)
### New breakage in the fix diff
<Critical/Important/Minor with file:line, or "None">
### Out-of-scope observations
<issues entirely outside the fix diff; non-blocking; or "None">
### Verdict
All addressed, no new Critical/Important | Open: <list>
```
