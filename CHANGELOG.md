# Changelog

## 2.0.0 — 2026-11-15

- **Breaking:** Codex support is removed. The Codex manifest, the rendered Codex skills and
  agents, the agent installer (`codex/install`) and the Codex hooks (`codex/hooks/amp-hook`) are
  gone, and amp is a Claude Code plugin only. Codex users stay on 1.6.0 (commit `655239f`).
- No build step: the `src/` sources and `scripts/render` are gone. `skills/` and `agents/` are
  edited directly, and what is committed there is what Claude Code loads. `scripts/test` checks
  the skills', agents' and docs' text and fails if a Codex mention or a rendering marker returns.
- The skills name Claude Code's tools where they spoke generically: amp:build keeps one task per
  plan task in the session's task list (TaskCreate, or TodoWrite), and amp:ship runs the CI watch
  with the Bash tool's `run_in_background`.
- The `/amp-run` pane shows the steps a run has off, from the ledger's `Off:` line, after its
  `Parallel:` line: `Steps off: none` when every step is on, and
  `Steps off: not recorded (the CLAUDE.md table applies)` for a ledger without an `Off:` line.

## 1.6.0 — 2026-11-15

- A project can turn steps of a run off in its amp configuration. Seven switches, each on by
  default: `Grill`, `Tests`, `Verify`, `Document reviews`, `Task reviews`, `Final review` and
  `CI`. `Verify` takes `off` in place of its command; the other six take `on` or `off`. A value
  other than `on` or `off` counts as on, and amp ledgers that as a ruling. The spec, the plan, the
  docs sweep, the close-out, the PR and the merge always run.
- `Grill` off: amp:phase asks nothing. It writes the decisions from the request and the project's
  docs and settles each open point with a ruling, so the PR lists every assumption; the project's
  row is the approval, and every stop of the autonomy contract still applies. A bug still gets its
  root-cause investigation first. amp:grill run on its own and amp:roadmap ignore the switch.
- `Tests` off: the plan's Global Constraints and every implementer dispatch without them carry the
  line `Tests: off — write no new tests; …`. Plans have no failing-test steps, implementers write
  no new tests and report the existing-test run instead, and reviewers never report a missing
  test; an existing test the change breaks is fixed in the same commit, and a broken or weakened
  test is still a finding.
- `Verify` off: amp:ship skips its verify step and every re-verify, and the PR's evidence reads
  `Verify: off (project configuration)`.
- `Document reviews` off: the independent spec, plan and roadmap-revision reviews are skipped; the
  self-reviews of the spec and the plan stay.
- `Task reviews` off: no per-task review or fix loop; a task completes when its implementer is
  done (`Task N: complete (commits …, unreviewed)`), and a worktree task integrates at once. With
  `Final review` still on, the final reviewer also judges each task's correctness and quality.
- `Final review` off: no whole-branch review; deferred minors and parked findings reach the PR's
  Parked section untriaged.
- `CI` off: amp:ship merges without waiting for checks; a merge that branch protection blocks
  still stops the run.
- Never silent: intake writes the ledger line `Off: <steps>` (or `Off: none`) once, and with at
  least one step off tells you `Steps off for this project: …`. A resumed run keeps the line, so a
  table edit takes effect on the next run. The PR body gains a "Steps turned off" section.
- A project that sets none of the switches runs exactly as in 1.5.0. New roadmaps write the six
  on/off rows at `on`.

## 1.5.0 — 2026-11-12

- amp:build runs plan tasks in parallel. Every plan task carries a `**Depends on:**` line naming
  the earlier tasks it builds on, and the plan review checks it. A task starts once its
  dependencies are complete (reviewed and merged) and it shares no file, docs included, with a
  running task, up to the `Parallel tasks` configuration key at once (default 3; use 1 for test
  suites that hold fixed shared resources). A task alone runs in the main tree. When several run,
  each runs its whole implement, review and fix cycle in its own git worktree under `.amp/` on an
  `amp-wt-<N>` branch, then is rebased onto the phase branch (its tests re-run if the rebase moved
  it) and fast-forwarded in, one task at a time.
- A rebase conflict, a failed fast-forward or a lost worktree drops the task: amp redoes it alone
  from scratch and ledgers a ruling, so the PR lists it. Worktree setup failure turns parallel
  mode off for the rest of the run. After a crash, a task that was already merged is completed and
  never redone.
- The status line lists every active task with its fix round
  (`amp 05-x · build · tasks 2, 3 r2, 5 · 1/7 done`), and the `/amp-run` pane shows each task's
  state, fix round and worktree, plus `Parallel: on` or `Parallel: off — <why>`.
- On Codex the parallel cap is at most half the session's thread limit (3 at the default 6), and a
  task's implementer and reviewer stay open until the task is complete or dropped.
- The read-only roles treat a task worktree (`.amp/<key>/wt-*`) as the repository, so a reviewer
  or checker can't edit the code it reviews there; report files under `.amp/` stay writable.
- The opt-in pipelining from 1.3.0 and its `**Independent:** yes` mark are gone. A plan with no
  `Depends on` lines runs one task at a time.

## 1.4.0 — 2026-11-10

- amp:phase creates the run's ledger (`.amp/<key>/progress.md`) at intake, and every stage
  appends a `Stage:` line (`grill`, `gate`, `design`, `plan`, `build`, `ship`, `merged`, or
  `stopped` with what it needs) along with the run's `Branch:` and `Plan:`. The hooks below read
  it; ledgers written by 1.3.0 still work.
- In Claude Code, the status line shows the active run, `amp <key> · <stage>`, plus the task and
  any fix round during the build. `/amp-run` opens a pane with the run's stage, tasks, fix round,
  parked items, rulings, fallbacks and the ledger's last lines.
- A resume guard: a session on a branch an unfinished run owns is told that the run owns it and
  resumes with `amp:phase <key>`, and a compaction keeps that note. On Codex a `SessionStart`
  hook adds the same note.
- Guardrails: while a run is active, the git and `gh` commands that skip hooks or signing, force
  push, push to or commit on the default branch, hard reset, discard work or merge with `--admin`
  are refused, with what to do instead. `amp:reviewer`, `amp:checker` and `amp:scout` are
  read-only: no repository edits outside `.amp/` and no writing git commands. On Codex a
  `PreToolUse` hook enforces both for shell commands and `apply_patch`, once amp's hooks are
  trusted in `/hooks` (on Windows, Git Bash's `bash` must come first on PATH).
- Alerts: a toast says when the grill summary is ready, a run stops or merges, or a question
  waits after the grill, with a short sound on macOS terminals. Each amp dispatch row shows the
  role, model and task, then the first line of the agent's report. Both are Claude Code only.

## 1.3.0 — 2026-11-01

- A fix round is re-checked by the task's own reviewer, resumed with the fix diff, instead of a
  fresh `amp:checker`. The final fix wave and the spec, plan and roadmap confirmation re-reviews
  resume their reviewer too. `amp:checker` runs only when the reviewer can't be resumed, and the
  ledger says why.
- The implementer and reviewer agents carry the lean rules they need (the ladder, the dead-code
  rule, the never-cut list, `lean:` markers, the review tags), so dispatches no longer load
  `amp:lean`. The skill stays for the orchestrating stages.
- Implementers run their focused tests, and the full suite only when the task touches shared code
  (code other modules import, a public interface, config or build files) or is the plan's last
  task. amp:ship's verification and CI are unchanged.
- The checker and scout run at medium effort (Codex: `reasoning_effort: "medium"`); the reviewer
  and implementer stay at high.
- Model routing and fallback are stated once, in amp:phase. On Claude Code the model values come
  from the plugin's injected routing section, so the skills no longer repeat them.
- amp:plan never makes a task that is only setup, config or docs (unless the whole phase is docs);
  its self-review and the plan review check it.
- Opt-in pipelining: a plan task marked `**Independent:** yes` (it uses nothing the previous task
  produces and shares no file with it) is implemented in a git worktree under `.amp/` while the
  previous task is under review, then rebased if needed, merged and reviewed as usual. A rebase
  conflict, a failed merge or undocumented setup drops back to one task at a time. Every step is
  ledgered, and after a crash amp keeps the pipelined task only if it was merged, otherwise it
  redoes it. On Codex the second implementer stays within the default thread limit.

## 1.2.0 — 2026-10-31

- amp runs on Codex too (CLI or desktop app). Install it from the `MParoczi/amp` marketplace with
  `codex plugin marketplace add MParoczi/amp` and `/plugins`, then run `codex/install` to add the
  `amp-reviewer`, `amp-implementer`, `amp-checker` and `amp-scout` agents, globally or into one
  repository (`--project`). Skills are invoked as `$amp:phase NN`, `$amp:roadmap` and so on.
- On Codex, agents run on the session model unless the installer pins a model per role
  (`--reviewer`, `--implementer`, `--checker`, `--scout`, recorded in `amp-install.json`).
  Escalation is a fresh implementer at reasoning effort `xhigh`, and fallback re-spawns on the
  session model. Every skill that spawns agents (`$amp:phase`, `$amp:roadmap`, `$amp:grill`,
  `$amp:design`, `$amp:plan`, `$amp:build`, `$amp:ship`) stops before its first spawn when the
  agents are missing or differ from the plugin's version. `--uninstall` removes them.
- On Codex, the project configuration is read from `AGENTS.md` (else `CLAUDE.md`), and
  `$amp:roadmap` writes `AGENTS.md` and `.codex/config.toml`.
- The skills and agents are now rendered from one source in `src/` into the Claude Code and Codex
  trees by `scripts/render`; `scripts/test` covers the renderer, the installer and the manifests.
  Codex support hasn't yet been tested end to end against a real Codex binary.

## 1.1.0 — 2026-10-13

- `amp:lean` names its principles (DRY, YAGNI, KISS), adds the dead-code rule (code nothing
  references and no doc, roadmap or phase prompt claims is deleted in the phase that finds it)
  and a `reuse:` review tag for new code an existing helper does or nearly does.
- Every stage applies them at its own point: the design survey records reuse/extend verdicts and
  deletions, plan tasks carry a Reuse line and Delete files, the implementer searches before
  creating and deletes what it orphans, task and final reviews flag duplicates and dead code, and
  phase prompts name unreferenced code a later phase will build on.

## 1.0.0 — 2026-10-09

- First release as a Claude Code plugin: the amp skills (`phase`, `grill`, `design`, `plan`,
  `build`, `ship`, `roadmap`, `lean`, `debug`) and agents (`implementer`, `reviewer`, `checker`,
  `scout`), made project-neutral.
- Model per task type (reviewer, implementer, checker, scout, escalation, fallback), set at
  install, in `/config`, or in the `/amp-models` pane, and applied to every amp dispatch.
