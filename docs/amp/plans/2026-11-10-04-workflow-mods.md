# Phase 04 — workflow mods: Implementation Plan

> Executed by amp:build (one amp:implementer per task, reviewed per task). Checkbox steps track progress.

**Goal:** Add the run pane, status line, resume guard, guardrails, read-only roles, dispatch rows
and alerts to amp, plus the Codex hooks where Codex allows them.
**Spec:** `docs/amp/specs/2026-11-10-04-workflow-mods.md`, the binding authority; conflicts
resolve against it.
**Branch:** feature/04-workflow-mods
**Architecture:**
- Pure logic lives in `hooks/run.ts` (ledger) and `hooks/guard.ts` (classifiers).
- `hooks/register.tsx` wires them to the function-hook API.
- Codex gets one bash script, `codex/hooks/amp-hook`, named by `codex/hooks/hooks.json`, which
  implements the same rule tables.
- The skills write `Stage:` lines into the ledger.

**Tech stack:**
- Claude Code function-hook plugins: TS/TSX against `claude-code` typings, `claude-code/testing`.
- bash (Git Bash on Windows).
- Codex rust-v0.167.0 hooks.

**Dispatch skills:** `plugin-authoring` when touching `hooks/`. It lays down the `claude-code`
typings and the test-kit docs. Grep its `types/claude-code.d.ts` for every event and `$` call
used.

## Global Constraints

- **Sources:** edit `src/skills/**` and `src/agents/**`, never the rendered `skills/`, `agents/`
  or `codex/skills|agents` trees directly. After a src edit, run `bash scripts/render`.
- **Gates:** `claude plugin validate .`, `claude plugin test .`, `bash scripts/render --check` and
  `bash scripts/test`, all clean. Also `npx tsc -p .` whenever `.claude-plugin/types/` exists
  (the engine writes it once the plugin has loaded).
- **Deny texts:**
  - Guard: `amp guard: <rule> is blocked during an amp run (<segment>). <instead> (If the user says
    this run is abandoned, they can delete .amp/<key>/; never delete it yourself.)`
  - Read-only: `amp read-only: <role> may not <what> (<target>). Report the finding instead; write
    only the report file under .amp/ or outside the repo.` It never carries the suffix.
- **Rule names, used verbatim as `<rule>`:** `hooks skipped`, `signing skipped`, `force push`,
  `push to default`, `hard reset`, `commit on default`, `discard work`, `admin merge`.
- **Fail safe:**
  - No hook throws. Failures follow spec §6:
    - An unreadable candidate ledger, or one over 4 MiB, is skipped. The other candidates still
      count.
    - A failed `git rev-parse` makes the mod idle.
    - A failed `git branch` leaves the branch unknown. Only the rules that need the branch skip;
      the rest still deny.
  - The Codex hook fails open on any parse failure.
- **No new dependencies.** The sound is `hooks/sounds/alert.wav`.
- **Plugin name:** `$.plugin.name`, never a hard-coded `amp`. Agent types are
  `${plugin}:reviewer|checker|scout`, and on Codex `amp-reviewer|amp-checker|amp-scout`.

## Review Focus

1. **The splitter on quotes and heredocs:** the §5.4 splitter fixtures. Pinned in Task 4 and
   Task 6.
2. **amp's own commands pass the guards:**
   - `git push origin v1.4.0` on main
   - `git worktree remove --force .amp/x/wt-2`
   - `git branch -D amp-wt-2`
   - `gh pr merge 5 --merge --delete-branch`
   - `git push -u origin feature/04-x` on that branch

   Pinned in Task 4 and Task 6.
3. **Windows paths in the read-only rule:** `C:\Repo\src\a.ts` against the root `c:/repo` is
   denied, and `C:\Repo\.amp\04-x\r.md` is allowed. Pinned in Task 4 and Task 6.
4. **The merged-then-deleted ledger:** the merged alert fires once and the status line is
   cleared. Pinned in Task 5.
5. **Codex JSON with `\"` and `\\`:** extracted correctly (a deny still denies), or the call is
   allowed. Pinned in Task 6.

## File map

| File | Responsibility |
|---|---|
| `src/skills/{phase,grill,plan,build,ship}/SKILL.md` | the ledger lifecycle and `Stage:` lines (spec §5.1) |
| `skills/**`, `codex/skills/**` | rendered output |
| `hooks/run.ts` (+ `run.test.ts`) | the ledger parser, the status and resume text |
| `hooks/guard.ts` (+ `guard.test.ts`) | the splitter, the guardrails, the read-only rules, `roleOf`, `insideRoot` |
| `hooks/register.tsx` | the wiring: refresh, default branch, status line, pane, resume, compaction, guards, alerts, ToolUse rows |
| `hooks/run-hooks.test.ts` | the register-level tests |
| `hooks/sounds/alert.wav`, `.gitattributes` | the sound; `*.wav binary` |
| `codex/hooks/hooks.json`, `codex/hooks/amp-hook` | the Codex hooks |
| `.codex-plugin/plugin.json`, `.claude-plugin/plugin.json` | hooks path; 1.4.0 (`marketplace.json` has no version) |
| `scripts/test` | Stage-line checks; Codex hook cases; WAV check; manifest and mode checks |
| `README.md`, `CHANGELOG.md` | docs |

### Task 1: Ledger lifecycle and Stage lines in the skills

**Files:**
- Modify `src/skills/{phase,grill,plan,build,ship}/SKILL.md`
- Re-render `skills/`, `codex/skills/`
- Test `scripts/test`

**Reuse:** the existing ledger rules in `src/skills/build/SKILL.md:40-42`, extended.

**Interfaces:** Produces the spec §5.1 ledger format.

**Docs:** the skills themselves.

**Commit:** `feat(skills): write the amp ledger from intake with Stage lines`

- [x] **Step 1: Failing test.** New `case=stage-lines` in `scripts/test`. For both rendered trees
  it greps these literal strings:
  - phase: `# amp ledger — <NN>-<slug>`, `Stage: grill`, `Branch: <branch>`, `Stage: design`
    and `Stage: stopped — <what is needed>`
  - grill: `Stage: gate`
  - plan: `Plan: <plan path>` and `Stage: plan`
  - build: `Stage: build`
  - ship: `Stage: ship` and `Stage: merged — <PR URL>`
  - each of grill, plan and ship: `only when $WS/progress.md exists`
  - build: `If no ledger exists (amp:build run on its own), create it`
- [x] **Step 2: Run, expect FAIL.** `bash scripts/test` → `FAIL: stage-lines: …`
- [x] **Step 3: Implement** the spec §5.1 "Who writes what":
  - one sentence per write point, using the literal strings above
  - phase's autonomy-contract stop rule writes `Stage: stopped — <what is needed>` before the stop
    message, and the resume writes the stage it continues
  - build step 2's standalone creation: the new header, `Branch:` and `Plan:` (the old header
    form is retired from the text)

  Then run `bash scripts/render`.
- [x] **Step 4: Run, expect PASS.** `bash scripts/render --check && bash scripts/test`
- [x] **Step 5: Docs.** none beyond the skills.
- [x] **Step 6: Commit.**

### Task 2: Ledger parser

**Files:** Create `hooks/run.ts` · Test `hooks/run.test.ts`
**Reuse:** none, because nothing parses the ledger (spec §4).
**Interfaces:** Produces exactly the spec §5.2 types and functions: `Stage`, `TaskRow`
(`id: string`), `Run`, `parseLedger(key, ledgerPath, text)`, `planTaskCount(planText)`,
`statusText(run, total?)` and `resumeText(run)`.
**Docs:** none.
**Commit:** `feat(hooks): parse the amp ledger`
**Independent:** yes

- [x] **Step 1: Failing tests** in `run.test.ts`, on a fixture ledger containing:
  - the header and `Stage: grill`, then `Stage: build — tasks`
  - `Branch: feature/04-x` and `Plan: docs/amp/plans/p.md`
  - `Task 1: complete (commits a..b, review clean)`
  - `Task 2: minor (deferred): x`
  - `Task 2: complete (commits c..d, review clean | 2 parked)`
  - `Task 3a: fix round 2/5 (1 addressed, 1 open — y; commits e..f)`
  - `Ruling: r — w — c`
  - `Fallback: reviewer → sonnet (429)`
  - `Pipeline: off — conflict`

  Assertions:
  - `stage` is `build` and `note` is `tasks`; `branch` and `planPath` are set
  - the task ids are `['1','2','3a']`, with states `complete, complete, fixing`
  - `fixRound` is `{task:'3a',round:2}`, `parked` is 3, `rulings` is 1, `fallbacks.length` is 1,
    `pipelineOff` is `'conflict'`, and `tail.length` is 5
  - `statusText(run, 7)` is `'amp 04-x · build · task 3/7 · fix r2/5'`
  - `statusText(run)` contains `task 3 ·`
  - the old header `# amp ledger — plan: p.md — branch: b` gives `planPath:'p.md'` and
    `branch:'b'`, with stage `unknown`
  - `planTaskCount('### Task 1: a\n### Task 2a: b')` is 2
  - `resumeText` contains `# amp run in progress (04-x)`, the ledger path and
    `amp:phase 04-x`
- [x] **Step 2: Run, expect FAIL.** `claude plugin test .` → `run.ts` is missing.
- [x] **Step 3: Implement** in `hooks/run.ts`: line-by-line regexes, last value wins.
- [x] **Step 4: Run, expect PASS.** `claude plugin test .`
- [x] **Step 5: Docs.** none.
- [x] **Step 6: Commit.**

### Task 3: Run detection, status line, `/amp-run` pane, resume section, compaction note

**Files:** Modify `hooks/register.tsx` · Create `hooks/run-hooks.test.ts`
**Reuse:**
- Task 2's functions
- `register.tsx`'s existing `session.start`, `command.run`, `prompt.compose` and pane patterns
- `hooks/pane.test.ts`'s mount pattern

**Interfaces:**
- Consumes Task 2.
- Produces:
  - in `register.tsx` (module-internal): `refresh($): Promise<Run | undefined>` and the module
    variables `root`, `defaultBranch` and `active`
  - command `amp-run`, pane id `amp-run`, section id `${plugin}:resume`
  - a `fakeHost` block at the top of `hooks/run-hooks.test.ts` (its only consumer), which Tasks 4 and 5 reuse:

  ```ts
  export type Host = {
    files: Map<string, { text: string; mtimeMs: number }>     // absolute, '/'-separated
    git: Record<string, string | Error>                        // argv.join(' ') → stdout | failure
    agents: { id: string; type: string }[]
    status: (string | undefined)[]; toasts: string[]; sounds: string[]
  }
  export function fakeHost(on: On, init?: Partial<Pick<Host, 'files' | 'git' | 'agents'>>): Host
  // installs test hooks beneath the plugin: fs.list / fs.stat / fs.read over `files` (stat reports `size` from the text length; a read over
  // 4 MiB or of a missing file rejects), process.run over `git`, agent.list over `agents`, and
  // ui.status / ui.toast / audio.play captured into the arrays; also a bottom tool.call answer
  // for allowed calls
  ```

  The kit runs with no fs, network or process. `On` is imported from `'claude-code'` (the kit's `on` type); see
  `claude-code/testing` in the typings. Test hooks sit beneath the plugin. Each test calls
  `$.session.start(...)` before acting.

**Docs:** README:
- a new section "What the plugin adds to a session" with the status line, `/amp-run` and the
  resume guard
- its Contents entry
- the "What runs where" rows for `/amp-run` and the status line
- the Layout paragraph: `hooks/run.ts`

**Commit:** `feat(hooks): amp run status line, /amp-run pane and resume guard`

- [x] **Step 1: Failing tests** in `run-hooks.test.ts`, all through `fakeHost`:
  - With no `.amp`: the last status is `undefined`, `/amp-run` replies
    `No amp run in this repository.`, and no `:resume` section is added.
  - A ledger added to `files` **after** `session.start`: after one tool call, the last status
    equals `statusText(...)`.
  - A matching `Branch:` adds a `${plugin}:resume` section with `scope:'session'`. A mismatched
    branch adds none.
  - A ledger with no `Branch:` adds a section on `main` and none on `feature/y`.
  - **Default branch chain:**
    - `git symbolic-ref --short refs/remotes/origin/HEAD` → `origin/trunk` gives `trunk`
    - if that fails, `git config init.defaultBranch` → `dev` gives `dev`
    - if both fail, `main`

    Each is observed through the no-Branch resume case.
  - A 5 MiB candidate and an unreadable candidate are skipped, while a third valid ledger stays
    active.
  - A failing `git rev-parse --show-toplevel` → idle (no status, no section).
  - `session.compact` with no `agentId`: the instructions end with `Keep: amp run 04-x is in
    progress`. With an `agentId` they are unchanged.
  - The pane mounted on `terminal` and `desktop` shows the stage, `3a` and `fix round 2/5`.
- [x] **Step 2: Run, expect FAIL.** `claude plugin test .`
- [x] **Step 3: Implement:**
  - spec §5.2 "Finding the run"
  - the §5.4 default-branch chain, resolved once in `session.start`
  - the §5.3 rows `session.start`, `tool.call` (the after-refresh only), `turn.complete`,
    `prompt.compose`, `session.compact`, `command.run` and Pane

  Refresh: `$.fs.list(<root>/.amp)`, a stat of each `progress.md`, a re-read only on an mtime
  change, and a candidate skipped when its stat size is over 4 MiB or its read rejects. Cache the
  plan total by its path.
- [x] **Step 4: Run, expect PASS.** `claude plugin test . && claude plugin validate .`
- [x] **Step 5: Docs.** the README items.
- [x] **Step 6: Commit.**

### Task 4: Guardrails and read-only roles (Claude Code)

**Files:** Create `hooks/guard.ts` · Test `hooks/guard.test.ts` · Modify `hooks/register.tsx`,
`hooks/run-hooks.test.ts`
**Reuse:** `root`, `defaultBranch`, the active-run check and `fakeHost` from Task 3.
**Interfaces:** Produces:

```ts
export function splitCommands(command: string): string[][]          // segments of unquoted words; heredoc bodies dropped
export type GuardCtx = { branch?: string; defaultBranch: string }
export function guardViolation(command: string, ctx: GuardCtx): string | undefined   // deny text without the abandoned-run suffix
export type ReadOnlyRole = 'reviewer' | 'checker' | 'scout'
export function roleOf(agents: readonly { id: string; type: string }[], agentId: string | undefined, plugin: string): ReadOnlyRole | undefined
export type ReadOnlyCall = { tool: string; command?: string; path?: string; cwd: string }
export function readOnlyViolation(role: ReadOnlyRole, call: ReadOnlyCall, root: string): string | undefined
export function insideRoot(path: string, cwd: string, root: string): 'repo' | 'amp' | 'outside'
```

(`ReadOnlyRole`, not `Role`, because `register.tsx` already exports `Role`.)

**Docs:** README:
- the guardrails list, the read-only rule, and the known gaps (aliases, `sh -c`, an abandoned run)
- the "What runs where" rows for the guard and the read-only hooks
- the Layout entry for `hooks/guard.ts`

**Commit:** `feat(hooks): amp autonomy guardrails and read-only reviewer roles`

- [x] **Step 1: Failing tests.**
  - In `guard.test.ts`:
    - every row of spec §5.4: a deny case (the `<rule>` is in the text) and its allowed example
    - the §5.4 splitter fixtures table
    - the Review Focus 2 commands, all allowed
    - every row of the §5.5 table, denied and allowed, including `git tag --contains HEAD`,
      `git branch --merged main` and `git worktree add ../tmp-rev HEAD` (allowed)
    - `insideRoot('C:\\Repo\\src\\a.ts','c:/x','c:/repo')` is `'repo'`
    - `insideRoot('C:\\Repo\\.amp\\04-x\\r.md','c:/x','c:/repo')` is `'amp'`
    - a relative `src/a.ts` with `cwd` equal to the root is `'repo'`
    - `/tmp/x.md` is `'outside'`
    - `roleOf([{id:'a1',type:'amp:reviewer'}],'a1','amp')` is `'reviewer'`, and `undefined` for
      `agentId` undefined
  - In `run-hooks.test.ts` (through `fakeHost`), with a ledger present:
    - `$.tool.call({tool:'Bash',command:'git reset --hard'})` errors with `amp guard: hard reset`
      and the abandoned-run suffix
    - the same call without the ledger passes
    - `PowerShell` with `git push -f` is denied
    - with `git branch --show-current` failing: `git reset --hard` is still denied, and
      `git commit -m x` is not denied as `commit on default`
  - In `run-hooks.test.ts`, with `agents:[{id:'a1',type:'amp:reviewer'}]`:
    - `$.tool.call({tool:'Write',file_path:`${ROOT}/src/a.ts`,content:'x',agentId:'a1'})` errors
      with `amp read-only: reviewer`
    - a Write to `${ROOT}/.amp/04-x/r.md` from `a1` passes
    - the same repo Write from the main loop passes
    - `Bash git commit -m x` from `a1` is denied (no ledger needed)
- [x] **Step 2: Run, expect FAIL.** `claude plugin test .`
- [x] **Step 3: Implement** `guard.ts` per spec §5.4 and §5.5. Then wire `tool.call`:
  - **read-only first**, always on: roles via
    `roleOf(await $.agent.list(), e.agentId, $.plugin.name)`, for Edit/Write/NotebookEdit and
    Bash/PowerShell
  - **then the guardrails**, while a run is active: Bash/PowerShell, with the current branch
    fetched only when the command contains `git`; append the suffix
  - return `{ deny }`
- [x] **Step 4: Run, expect PASS.** `claude plugin test . && claude plugin validate .`
- [x] **Step 5: Docs.** the README items.
- [x] **Step 6: Commit.**

### Task 5: Alerts and amp dispatch rows

**Files:** Modify `hooks/register.tsx`, `hooks/run-hooks.test.ts`, `.gitattributes`,
`scripts/test` · Create `hooks/sounds/alert.wav`
**Reuse:** Task 3's refresh and `fakeHost`; `spawnModel`, `aliasFor` and `ROLES` in
`register.tsx`.
**Interfaces:** Consumes the Task 3 refresh. Produces the module variable
`lastStage: Map<string, Stage>`.
**Docs:** README:
- alerts: the sound plays on macOS terminals and capable hosts, the toast everywhere
- dispatch rows
- the "What runs where" rows and the Layout entry for `hooks/sounds/`

**Commit:** `feat(hooks): amp gate, stop and merge alerts and rich dispatch rows`

- [x] **Step 1: Failing tests** (through `fakeHost`).
  - **Alerts:**
    - A ledger that reads `Stage: gate` at the first refresh → no toast.
    - A run at `grill` that changes to `Stage: gate` → the toast
      `amp: grill summary ready — confirm to start the run`, plus one sound.
    - Appending `Stage: stopped — need gh auth login` → exactly one toast,
      `amp stopped: need gh auth login`. Appending a non-Stage line (a new mtime, so a re-parse)
      → no new toast.
    - `Stage: merged — https://x/pr/5`, then deleting the file → exactly one merged toast, and
      the last status is `undefined`.
    - `AskUserQuestion` at stage `build` from the main loop toasts `amp needs your answer`. It
      doesn't toast at stage `grill`, nor from `agentId:'a1'`.
  - **ToolUse rows**, mounted on `terminal` and `desktop`:
    - The Agent input `{subagent_type:'amp:implementer', description:'Task 3a: x'}` with no
      output shows `amp implementer · opus · task 3a`.
    - With output `{status:'completed', resolvedModel:'claude-sonnet-x', content:[{type:'text',
      text:'\n- STATUS: DONE\n- Commits: …'}]}` it shows `claude-sonnet-x` and `- STATUS: DONE`.
    - `async_launched` → no result line.
    - A non-amp agent's row is unchanged.
  - **`scripts/test` case=`alert-wav`:** the file starts with `RIFF`, has `WAVE` at offset 8, and
    is under 16384 bytes. `git check-attr binary hooks/sounds/alert.wav` reports `set`.
- [x] **Step 2: Run, expect FAIL.** `claude plugin test .` and `bash scripts/test`
- [x] **Step 3: Implement** the spec §5.3 Alerts and ToolUse rows.
  - Add `*.wav binary` to `.gitattributes` first.
  - Generate the WAV once with an inline command: 0.25 s, 880 Hz, 22050 Hz, mono, 16-bit, for
    example `node -e` or `python -c`.
  - The alert helper is `$.ui.toast(text)` plus
    `$.audio.play({asset:'hooks/sounds/alert.wav'}).catch(() => {})`.
- [x] **Step 4: Run, expect PASS.** `claude plugin test . && bash scripts/test && claude plugin validate .`
- [x] **Step 5: Docs.** the README items.
- [x] **Step 6: Commit.**

### Task 6: Codex pre-tool-use hook (guardrails and read-only roles)

**Files:** Create `codex/hooks/hooks.json`, `codex/hooks/amp-hook` (mode 100755) · Modify
`.codex-plugin/plugin.json` (the `hooks` path), `scripts/test`, `README.md`
**Reuse:** the spec §5.4 and §5.5 tables (Task 4's rules, ported); the `scripts/test` helpers
(`fail`, `ok`, temp roots).
**Interfaces:** Produces the spec §5.6 hooks file (both events, the SessionStart handler pointing
at `session-start`, which Task 7 implements; until then that subcommand exits 0 silently) and
`amp-hook pre-tool-use`.
**Docs:** README Codex section:
- trust amp's hooks in `/hooks`
- on Windows, Git Bash's `bash` first on PATH
- the guardrails and read-only rules apply on Codex
- the "What runs where" row and the Layout entry for `codex/hooks/`
- the executable-scripts sentence lists `codex/hooks/amp-hook`

**Commit:** `feat(codex): guardrails and read-only roles as a Codex PreToolUse hook`

- [x] **Step 1: Failing tests** in `scripts/test`, each in a temp git repo with
  `refs/remotes/origin/HEAD → origin/main` and a `.amp/04-x/progress.md`, piping JSON to
  `bash codex/hooks/amp-hook pre-tool-use`:
  - The same deny and allow rows as Task 4 (§5.4, §5.5, the splitter fixtures, Review Focus 2),
    in the Codex shapes:
    - `{"tool_name":"Bash","tool_input":{"command":"…"},"cwd":"…"}`
    - apply_patch with `tool_input.command` set to a `*** Begin Patch` text
  - A deny prints `"permissionDecision":"deny"` and the rule name. An allow prints nothing. The
    exit code is 0.
  - **Escapes:**
    - `git commit -m \"a \\\"b\\\"\"` is allowed
    - `git commit -m \"a\" && git push -f` is denied (proves extraction rather than fail-open)
  - Malformed JSON → allowed, with empty output.
  - `agent_type:"amp-reviewer"`:
    - apply_patch `src/a.ts` → denied
    - `.amp/04-x/r.md` → allowed
    - a two-file patch, allowed path first and then `src/b.ts` → denied
    - an absolute, backslashed, differently-cased path (`<ROOT upper-cased, \\-separated>\\src\\a.ts`)
      → denied, and the same under `\\.amp\\04-x\\r.md` → allowed
  - Without a ledger, `git reset --hard` is allowed and the read-only rows still deny.
  - Manifest checks:
    - `.codex-plugin/plugin.json` contains `"hooks": "./codex/hooks/hooks.json"`
    - the `"hooks": {}` assertion at `scripts/test:276` is replaced
    - the spec §7 hooks-file grep checks
  - `case=modes` covers `codex/hooks/amp-hook` as 100755.
- [x] **Step 2: Run, expect FAIL.** `bash scripts/test`
- [x] **Step 3: Implement** `amp-hook` per spec §5.6:
  - sed JSON extraction, failing open
  - the `guard.ts` tokenizer rules
  - `commandWindows` in `hooks.json`
  - `git update-index --chmod=+x`
- [x] **Step 4: Run, expect PASS.** `bash scripts/test && bash scripts/render --check`
- [x] **Step 5: Docs.** the README items.
- [x] **Step 6: Commit.**

### Task 7: Codex resume guard, release 1.4.0

**Files:** Modify `codex/hooks/amp-hook`, `scripts/test`, `.claude-plugin/plugin.json`,
`.codex-plugin/plugin.json`, `README.md`, `CHANGELOG.md`
**Reuse:** Task 6's script and test fixtures; the `resumeText` content (spec §5.2).
**Interfaces:** Consumes the §5.1 ledger format. Produces `amp-hook session-start`.
**Docs:** README Codex: the resume guard. CHANGELOG 1.4.0 covering the whole phase. The version
bump.
**Commit:** `feat(codex): resume guard as a Codex SessionStart hook; release 1.4.0`

- [x] **Step 1: Failing tests** in `scripts/test`:
  - `session-start` prints `# amp run in progress (04-x)` and the ledger path for a matching
    `Branch:`
  - it prints nothing for a mismatched branch, for no `.amp`, and for a `Stage: merged` ledger
  - with two ledgers, the newer (`touch` order) wins
  - both manifests are `"version": "1.4.0"`, replacing the 1.3.0 assertions at
    `scripts/test:215,278`
- [x] **Step 2: Run, expect FAIL.** `bash scripts/test`
- [x] **Step 3: Implement** `session-start` per spec §5.6.2, with `ls -t` ordering. Then bump both
  manifests to 1.4.0.
- [x] **Step 4: Run, expect PASS.** `bash scripts/test && bash scripts/render --check && claude plugin test . && claude plugin validate .`
- [x] **Step 5: Docs.** README and CHANGELOG.
- [x] **Step 6: Commit.**
