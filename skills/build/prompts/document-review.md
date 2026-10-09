# Dispatch template: document review (spec, plan, or roadmap)

Agent: `amp:reviewer` (on a model-unavailable error re-dispatch with the fallback model).

```
Document review — mode: <spec | plan | roadmap>.

Document: <PATH>
Sources it must honor: <decisions.md / grill summary path>, <prompt path>, <spec path for plan mode>,
CLAUDE.md, <DISPATCH_SKILLS to load, if any>

Flag only what would cause real problems downstream:
- Completeness: placeholders, TBDs, missing sections, a decision from the sources not reflected
- Consistency: contradictions within the document or against the sources/code
- Clarity: any requirement readable two ways
- Scope and lean: unrequested features, over-engineering (amp:lean ladder), scope creep
- Mode spec: interfaces exact? states and errors covered? testing seams named? docs impact listed?
- Mode plan: every spec requirement → a task; step granularity (no gaps, no transcribed bodies);
  names and signatures consistent across tasks; each task one atomic commit; docs steps present
- Mode roadmap: covers the whole vision A→Z; phases are vertical, shippable, one-session-sized;
  dependencies and order sound (risk early); each prompt self-contained and runnable by
  /amp:phase in a fresh session; branch types correct; verification gates concrete

Return:
**Status:** Approved | Issues found
**Issues:** Critical / Important — [section]: issue — why it matters downstream
**Advisory (non-blocking):** …
```
