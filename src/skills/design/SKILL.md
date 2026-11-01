---
name: design
description: The amp design stage (Superpowers-derived). It turns a confirmed grill into a binding written spec. First a reuse-first survey (reuse / extend / new-because for every component, plus the dead code to delete), then the project's own design process for UX-bearing work, then the spec with interfaces, states, testing seams, docs impact and Review Focus, then a self-review and one independent amp:reviewer pass. Run by amp:phase after the grill gate. Use it directly only when a confirmed set of decisions needs to become a spec.
effort: high
---

# amp:design

The spec is the **binding authority** for everything after it: the plan argues from it, reviewers
judge against it, and rulings resolve against it. Write it so that a skilled engineer who wasn't in
the grill builds the right thing.

Load `amp:lean` first. The ladder governs every "new" in this document.

<!-- codex -->
`<skills>` is the folder that holds this skill's folder (the parent of this SKILL.md's directory); use its absolute path.

Before the first spawn, run only the **Agents:** check of amp:phase's Preflight (step 4), not its git steps, unless it already ran in this session.

<!-- /codex -->
## 1. Reuse-first survey

For each component the work needs, find what already exists: components, utilities, types,
patterns, installed dependencies. For a large surface, {{claude: dispatch `amp:scout`s}}{{codex: spawn `amp-scout`s as in amp:phase}} in parallel, each
with one area and a findings path. Record one verdict per component:

- **reuse `X`**, **extend `Y`** (reuse with a small change: name the change), or **new, because
  `<why nothing existing fits, even with a small change>`**.

A "new" without a reason that survives a search is a design smell.

- **Deletions:** code in the touched modules that nothing references and no document claims
  (`amp:lean`, Dead code), including what this work will orphan. Each becomes a deletion in the
  spec, scheduled with the enabling refactor or inside the task that replaces it.

- **Enabling refactor:** if existing structure makes this work awkward or risky, fold the
  *minimal* refactor that de-risks it into scope as an early task.
- **Opportunistic refactor:** a cleanup of code this work doesn't touch goes into "Refactor
  opportunities" as a suggestion. It never becomes scope silently.

## 2. Project design process (UX-bearing work)

If the project defines a design process (named in its amp configuration or {{claude: `CLAUDE.md`}}{{codex: `AGENTS.md` (else `CLAUDE.md`)}}, e.g. a
design playbook, `/design-explore`, render/preview skills), run the steps it names for this surface
now, before writing the spec. Their outputs (briefs, chosen directions, screenshots, choreography)
are inputs the spec cites. Visual decisions the agent cannot judge from pixels alone are a
legitimate stop: show the renders and ask.

## 3. Write the spec

Default path: `docs/amp/specs/YYYY-MM-DD-<NN>-<slug>.md` (the project configuration may override
it). Sections, each scaled to the work (a sentence is fine where a sentence suffices):

1. **Goal**: one paragraph; the phase id and the prompt it implements.
2. **Decisions**: link `decisions.md` content by copying the confirmed decision table (the
   workspace is ephemeral, the spec is permanent).
3. **Architecture**: components, boundaries and data flow. Include a small diagram only if it
   earns its place.
4. **Components**: one entry each, with its reuse/extend/new verdict and responsibility. Then
   **Deletions**: one line per dead item, with the search that showed no reference and no claim.
5. **Interfaces**: exact names, signatures, commands, events, schemas and file formats others
   depend on.
6. **States and errors**: empty, loading, offline, partial and failure; what the user sees; what is
   logged; what never happens silently.
7. **Testing strategy**: the seams under test, the test levels, and the fixtures and emulators the
   project's test doctrine requires.
8. **Docs impact**: every document that must change (README, {{claude: CLAUDE.md}}{{codex: AGENTS.md (else CLAUDE.md)}}, roadmap, user docs, ADRs,
   project skills) and what changes in it.
9. **Review Focus**: the ≤ 5 input classes or failure modes the spec implies but tests might miss,
   and which are most likely to bite a real user. One line each, naming the condition and the
   expected behavior.
10. **Out of scope** and **Refactor opportunities**.

No placeholders ("TBD", "TODO", "handle errors appropriately"), no contradictions, and no
requirement readable two ways. YAGNI ruthlessly.

## 4. Review

1. **Self-review** against the decisions table: is every decision reflected, with nothing
   invented? Fix inline.
2. **Independent review:** {{claude: dispatch `amp:reviewer`}}{{codex: spawn `amp-reviewer` (`spawn_agent`, `agent_type: "amp-reviewer"`, as amp:phase, Model routing says)}} with `${CLAUDE_PLUGIN_ROOT}/skills/build/prompts/document-review.md`
   (mode: spec) and the spec, decisions and prompt paths. If it returns Critical or Important
   issues, fix them and run one confirmation re-review: resume the same reviewer {{claude: via SendMessage}}{{codex: with `followup_task` (v2) or `send_input` (v1)}}
   with "Confirmation re-review: the document changed; verify each Critical/Important issue you raised
   is resolved and flag only new Critical/Important problems in the changes." If the resume fails,
   {{claude: dispatch}}{{codex: spawn}} a fresh reviewer with the document-review template.
   If issues remain after that, rule on each (`Ruling:` line in the ledger) and continue. The spec
   isn't committed yet; amp:plan commits spec and plan together.

Model fallback applies to every dispatch (see amp:phase, Model routing).
