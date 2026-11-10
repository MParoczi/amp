# Phase 04 — workflow mods: Spec

## 1. Goal

Phase 04 (`feature/04-workflow-mods`) adds six Claude Code mods to the amp plugin, plus Codex
equivalents where Codex hooks allow. The mods make an autonomous amp run visible, resumable and
safe:

1. a run pane and a status line
2. a resume guard
3. autonomy guardrails
4. read-only enforcement for the reviewer, checker and scout roles
5. rich rows for amp dispatches
6. alerts at the gate, at stops and at the merge

The request was a plain one, not a roadmap phase. This repo has no roadmap, so the phase id follows
the specs before it (02, 03).

## 2. Decisions

| # | Decision | Source |
|---|---|---|
| S1 | Build all six mods | user |
| S2 | Ship them in the amp plugin: `hooks/` for Claude Code, a Codex hooks file named by `.codex-plugin/plugin.json` | user |
| S3 | Codex gets the resume guard (`SessionStart`), the guardrails and the read-only roles (`PreToolUse` with `agent_type`). The pane, status line, dispatch rows and alerts are Claude Code only. | Codex rust-v0.167.0 source |
| S4 | The reviewer, checker and scout write only their report or findings file | `src/agents/reviewer.md:16`, `checker.md:13`, `scout.md:20` |
| S5 | A workspace `.amp/<key>/` exists only while a run is unfinished. amp:ship deletes it after the merge. | `src/skills/ship/SKILL.md:85` |
| S6 | Codex runs a plugin's hooks only after the user trusts them in `/hooks`. The README says so. | Codex plugins/build docs |
| D1 | amp:phase creates the ledger `progress.md` at intake and writes `Stage:` lines at every stage change. Every mod reads the ledger. | user |
| D2 | The guardrails apply only during an amp run, meaning a `.amp/<key>/progress.md` exists in the repo. Roadmap runs and standalone grills don't trigger them. | user |
| D3 | The Codex hooks are bash. JSON fields are extracted with sed. | user |
| D4 | An alert is a toast plus a small bundled WAV | user |
| D5 | The guardrail deny list (§5.4) | confirmed |
| D6 | The read-only rule (§5.5) | confirmed |
| D7 | Release 1.4.0 with a CHANGELOG entry and README sections | confirmed |

## 3. Architecture

```
ledger .amp/<key>/progress.md  ← written by amp:phase / build / ship (skill text)
   │ read (stat mtime, re-parse on change)
   ├─ Claude Code: hooks/run.ts parseLedger()  ─► status line, /amp-run pane,
   │                                              resume section, compaction note, alerts
   └─ Codex: codex/hooks/amp-hook session-start ─► context text on stdout
tool calls
   ├─ Claude Code: tool.call hook → hooks/guard.ts guardViolation() / readOnlyViolation() → { deny }
   └─ Codex: PreToolUse → codex/hooks/amp-hook pre-tool-use → permissionDecision deny
Agent rows: ui.render ToolUse → spawnModel()/aliasFor() (existing) + result's first line
```

`hooks/register.tsx` stays the only module named in `hooks/hooks.json`. It imports two new
siblings that hold pure logic: `hooks/run.ts` (ledger) and `hooks/guard.ts` (command and path
classifiers). The register file does the wiring.

## 4. Components

| Component | Verdict | Responsibility |
|---|---|---|
| `hooks/register.tsx` | **extend** | Wires the new hooks: `session.start` (repo root, resume scan, `/amp-run` command), `tool.call` (guards, then ledger refresh after the call), `prompt.compose` (adds the resume section beside the existing routing section), `session.compact`, `ui.render` for the Pane `amp-run` and for `ToolUse` |
| `spawnModel`, `aliasFor`, `ROLES` in register.tsx | **reuse** | The effective model shown on a dispatch row |
| `hooks/run.ts` | **new**, because nothing parses the ledger today (the skills read it as text) | `parseLedger`, `findRun`, `statusText`, `resumeText` |
| `hooks/guard.ts` | **new**, because no command classifier exists | `splitCommands`, `guardViolation`, `readOnlyViolation` |
| `hooks/sounds/alert.wav` | **new** (D4) | The alert sound: about 0.25 s, mono, 16-bit, under 16 KB, generated once |
| `codex/hooks/hooks.json` | **new** | The Codex hooks file. The manifest's `"hooks": {}` becomes `"hooks": "./codex/hooks/hooks.json"`. |
| `codex/hooks/amp-hook` | **new** (D3) | bash, with `session-start` and `pre-tool-use` subcommands. The same rules as `guard.ts` and `run.ts`. |
| `src/skills/phase`, `build`, `ship`, `grill` SKILL.md | **extend** | The ledger lifecycle and `Stage:` lines (§5.1), rendered by `scripts/render` |
| `scripts/test` | **extend** | Cases that pipe JSON to `amp-hook`, plus a check that `alert.wav` starts with `RIFF`…`WAVE` and is under 16 KB (proves `.gitattributes` keeps it binary) |
| `src/agents/reviewer.md` | **unchanged** | Its "temporary worktree outside the repo" stays allowed (§5.5) |
| `.gitattributes` | **extend** | `*.wav binary`. Today's `* text=auto eol=lf` would corrupt the WAV. |

**Duplication across runtimes:** the TS and bash classifiers implement one rule table (§5.4,
§5.5). They can't share code, so the table in this spec is the single authority, and both test
suites cover every row of it.

**Deletions:** none. A grep of `hooks/`, `codex/` and `src/` for the touched names found no dead
code. The manifest's `"hooks": {}` is replaced, not left behind.

## 5. Interfaces

### 5.1 Ledger format (skill contract)

`$WS/progress.md` is plain lines. A mod reads only these forms. Every other line is free text.

```
# amp ledger — <NN>-<slug>
Stage: <stage> — <note>
Branch: <branch>
Plan: <plan path>
Task <N>: <state text>
Pipeline: off — <why>
Ruling: <decision> — <why> — <cost if wrong>
Fallback: <role> → <model> (<error class>)
```

- `<stage>` ∈ `grill | gate | design | plan | build | ship | merged | stopped`. The last `Stage:`
  line is the current stage. `gate` means the grill summary is waiting for confirmation, and
  `stopped` means the run is waiting for user-only input (the note says what it needs).
- The last `Branch:` and `Plan:` lines win.
- The old header `# amp ledger — plan: <path> — branch: <branch>` is still read as Plan and
  Branch, so runs started on 1.3.0 keep working.
- **Who writes what.** Only amp:phase (and amp:build run standalone) **creates** a ledger. Every
  other skill appends a `Stage:` line **only when `$WS/progress.md` already exists**. That keeps
  roadmap runs and standalone grill, design, plan or ship runs ledger-free (D2).
  - amp:phase §0 step 5 creates the ledger with its header and `Stage: grill`. A resume appends to
    the existing ledger.
  - amp:grill §5 writes `Stage: gate` right before the confirmation question (if the ledger
    exists).
  - amp:phase stage 2 writes `Branch:` and `Stage: design`.
  - amp:plan writes `Plan:` and `Stage: plan`.
  - amp:build writes `Stage: build`. When it runs standalone and no ledger exists, it creates one
    with its header, `Branch:` and `Plan:`.
  - amp:ship writes `Stage: ship`, then `Stage: merged — <PR URL>` right after
    `gh pr merge` succeeds and before step 6 deletes the workspace.
  - Every stop in amp:phase's autonomy contract writes `Stage: stopped — <what is needed>`, and
    the resume writes the stage it continues.

### 5.2 `hooks/run.ts`

```ts
export type Stage = 'grill' | 'gate' | 'design' | 'plan' | 'build' | 'ship' | 'merged' | 'stopped' | 'unknown'
export type TaskRow = { id: string; state: 'complete' | 'fixing' | 'pipelined' | 'merged' | 'dropped' | 'started'; text: string }
// id: matched by /^Task (\d+[a-z]?):/ (amp plans use ids like 3a, 3b)
export type Run = {
  key: string; ledgerPath: string; stage: Stage; note: string; branch?: string; planPath?: string
  tasks: TaskRow[]; fixRound?: { task: string; round: number }; parked: number; rulings: number
  fallbacks: string[]; pipelineOff?: string; tail: string[]   // tail = last 5 non-blank lines
}
export function parseLedger(key: string, ledgerPath: string, text: string): Run
export function planTaskCount(planText: string): number        // count of /^### Task \d+[a-z]?:/m
export function statusText(run: Run, total?: number): string
export function resumeText(run: Run): string
```

**Task states** come from the last `Task N:` line of each task:

| Line starts with | State |
|---|---|
| `complete` | `complete` |
| `fix round R/5` | `fixing` (also sets `fixRound` when it is the latest task line) |
| `pipelined` | `pipelined` |
| `merged (base` | `merged` |
| `pipeline dropped` | `dropped` |
| anything else | `started` |

**Parked count:** the number of `Task N: minor (deferred)` lines, plus K for each `| K parked)` in
a complete line. **Rulings count:** the `Ruling:` lines.

**`statusText`:** `amp <key> · <stage>`. During build it adds ` · task <c+1>/<total>`, where c is
the number of complete tasks; it shows `<c>/<total>` once all are complete, and `<c+1>` alone
when there is no total. It then adds ` · fix r<R>/5` while the latest task line is a fix round.
Example: `amp 04-workflow-mods · build · task 3/7 · fix r2/5`.

**`resumeText`:** one section, titled `# amp run in progress (<key>)`. It names the stage and
note, the ledger path, the branch and plan, the last task line, and this instruction: *"An
unfinished amp run owns this branch. When the user asks to continue, resume it with amp:phase
<key>: the ledger and git log are the ground truth. Don't start unrelated work on this branch
without saying so."*

**Finding the run** (register.tsx; `findRun` uses `$.fs`):
- The repo root is `git rev-parse --show-toplevel` (`$.process.run`), resolved once in
  `session.start`. No root (not a git repo) means every mod stays idle.
- Candidates are the `.amp/*/progress.md` files.
- The **active run** is the candidate with the newest mtime whose stage isn't `merged`.
- **Every refresh re-scans** (`$.fs.list('<root>/.amp')` plus one `stat` per candidate, which is
  cheap). A run whose ledger appears mid-session (the normal case: amp:phase creates it at
  intake), a run that vanished (ship deleted `$WS`), and a later run after a merge are all picked
  up at the next refresh. Only a candidate whose mtime changed is re-read.
- The resume guard also requires the run's `Branch` to equal the current branch. A run with no
  Branch yet (stage grill or gate) matches only when the current branch is the default branch.

### 5.3 Claude Code hooks

| Hook | Behaviour |
|---|---|
| `session.start` | Resolves the root, scans for the active run, sets the status line, and registers `/amp-run` (*"Show the current amp run: stage, tasks, fix rounds, parked items"*). |
| `tool.call` (every tool) | Before the call: the guards in §5.4 and §5.5, which return `{ deny }`. After `await next(e)`: the refresh (§5.2 re-scan), which, when the active run or its mtime
changed, re-parses the ledger, updates the status line (clearing it with `undefined` when no run is active), redraws the pane, and runs the alert check. |
| `turn.complete` | Runs the same refresh, which catches ledger edits outside tool calls. |
| `prompt.compose` | Keeps the existing routing section. When a resumable run matches the branch (§5.2), it adds the section `<plugin>:resume` (`scope: 'session'`) with `resumeText`. |
| `session.compact` | Main loop only (`agentId` absent), with a resumable run: `next({ ...e, instructions })`, appending *"Keep: amp run <key> is in progress at stage <stage>; ledger <path>; resume with amp:phase <key>."* to any instructions already there. |
| `command.run` `amp-run` | Opens the pane `amp-run`, titled "amp run". Replies `{ text: 'No amp run in this repository.' }` when no run is active. |
| `ui.render` Pane `amp-run` | Shows: the key and branch; the stage and note; a task list with one row per task and its state (plus the total from the plan when known); the current fix round; the parked, rulings and fallback counts; the pipeline state; and the tail lines. With no run: *"No amp run in this repository."* Mobile gets the same as plain text. |
| `ui.render` ToolUse | Applies only to an `Agent` call whose `subagent_type` is `<plugin>:<role>`. It keeps `await next(e)` and adds a bordered box: `amp <role> · <model> · task <N>`. `<model>` is the output's `resolvedModel` once the output exists. Before that it is the input's explicit `model`, else `spawnModel` with `aliasFor` (shown as `inherit` when there is no alias). The task number comes from the first `Task (\d+[a-z]?)` in the description, then the prompt, and is left out when neither has one. **Result line:** only when the output's `status` is `completed`: the first non-blank line of the `content[]` text (else of `handbackReport.text`), cut to 100 characters. For `async_launched` or any other status, or when there's no output, there is no result line. |
| Alerts | Main loop only. (a) The refresh sees the stage change to `gate`, `stopped` or `merged`, compared with the previous stage per run key, held in a module variable. The first parse of a run in this module (at load or reload) seeds that variable silently, so a session that opens on a `gate` or `stopped` ledger doesn't toast, and a reload doesn't re-fire. A run that first appears mid-session is seeded as well (its stage then is `grill`). Toasts: `amp: grill summary ready — confirm to start the run`, `amp stopped: <note>` and `amp: merged — <note>`. The merged alert fires from the refresh that first sees `Stage: merged`, even if the file vanishes afterwards. (b) An `AskUserQuestion` tool call starts while the active run's stage is `design`, `plan`, `build` or `ship` (never during the grill): `amp needs your answer`. Each toast plays `{ asset: 'hooks/sounds/alert.wav' }`, with any rejection caught and ignored. |

### 5.4 Guardrails (D5): `guardViolation(command, ctx): string | undefined`

`ctx = { branch: string; defaultBranch: string }`.

- **Active** only while a run is active (§5.2), for every loop (main and subagents), on `Bash`
  calls and on Claude Code's `PowerShell` tool calls (its `command`, through the same splitter;
  a backtick is a literal character: `lean: PowerShell backtick escapes not parsed, a `"
  inside a string can mis-split; parse them if a false deny is reported`).
- **Default branch:** `git symbolic-ref --short refs/remotes/origin/HEAD` with `origin/` stripped,
  else `git config init.defaultBranch`, else `main`. Resolved once per session.
- **Current branch:** `git branch --show-current`, run only when the command contains `git`.
- **Splitting:** `splitCommands` splits on `&&`, `||`, `;`, `|` and newlines, outside quotes.
  - Inside `"…"` a `'` is literal and `\"` is an escaped quote. Inside `'…'` everything is
    literal.
  - **Heredoc bodies are data:** after a `<<WORD`, `<<-WORD`, `<<'WORD'` or `<<"WORD"`, the lines
    up to the line equal to `WORD` (leading tabs stripped for `<<-`) are dropped before
    splitting. The same goes for heredocs inside `$(…)`.
  - Each segment's words split on whitespace, with quotes removed.
- **Words of a subcommand:** **option words** start with `-`. **Value-taking options** consume
  the next word: for `commit` these are `-m`, `-F`, `-C`, `-c`, `-t`, `--author`, `--date`,
  `--message`, `--file`.
  - For `push`: `-o`, `--push-option`, `--repo`, `--receive-pack`, `--exec`.
  - For `tag` and `branch`: `--contains`, `--no-contains`, `--points-at`, `--merged`,
    `--no-merged`, `--sort`, `--format`, `-n`, `-u`, `-m`, `-F`, `-t`.
  - A `--opt=value` word carries its own value, and so does a short word whose first letter is a
    value-taking flag with more letters attached (`-mnote`). Neither consumes the next word.
  - **Positional words** are the rest. For `push`, the first positional word is the remote and
    the later ones are refspecs.
- **Matching:** a git segment is one whose first word is `git`. Global options (`-C <dir>`,
  `-c <k=v>`, `--git-dir=…`, `--no-pager`) are skipped to find the subcommand. `-c
  commit.gpgsign=false` is recorded.

| Rule | Denied when | Example allowed |
|---|---|---|
| hooks skipped | `commit` with `--no-verify`, or any option word matching `^-[a-zA-Z]+$` that contains `n`, anywhere in the segment (value words skipped) | `git commit -am "x"`; denied: `git commit -m "x" -n` |
| signing skipped | `commit` with `--no-gpg-sign`, or the global `-c commit.gpgsign=false` | `git commit -m "x"` |
| force push | `push` with `--force`, `-f`, `--force-with-lease[=…]`, `--force-if-includes`, `--mirror`, `--delete`/`-d`, or a refspec word starting with `+` or `:` | `git push -u origin feature/04-x` |
| push to default | `push` with a refspec equal to the default branch or ending in `:<default>`, or `push` with no refspec while on the default branch | `git push origin v1.4.0` while on main |
| hard reset | `reset` with `--hard` | `git reset --soft HEAD~1` |
| commit on default | `commit` while the current branch is the default branch | — |
| discard work | `stash` (any form except `list` and `show`); `checkout` with `--`, `-f` or `--force`; `restore` without `--staged`, or with `--worktree`/`-W`; `clean` with a short-flag word containing `f`, or `--force` | `git stash list`, `git restore --staged a.ts`, `git checkout feature/x` |
| admin merge | a `gh pr merge` segment with `--admin` | `gh pr merge 5 --merge --delete-branch` |

Everything amp's skills run stays allowed: `worktree remove --force`, `branch -D amp-wt-*`,
`git branch -d`, `gh pr merge --merge --delete-branch`, tags.

The deny text is `amp guard: <rule> is blocked during an amp run (<segment>). <instead>`. The
`<instead>` per rule:

| Rule | `<instead>` |
|---|---|
| hooks skipped | `fix the hook failure instead` |
| signing skipped | `fix the hook failure instead` |
| force push | `amp merges, never rewrites published history` |
| push to default | `push the phase branch and merge through the PR` |
| hard reset | `never discard work; revert or fix forward` |
| commit on default | `create the phase branch first` |
| discard work | `never discard work; revert or fix forward` |
| admin merge | `stop and ask the user` |

Every deny text ends with ` (If the user says this run is abandoned, they can delete .amp/<key>/;
never delete it yourself.)`.

**Splitter fixtures (both suites):**

| Command | Result |
|---|---|
| `git commit -m "fix; git push -f"` | allowed |
| `git commit -m "x" && git push -f` | denied |
| `git commit -mnote` | allowed (an attached value, not `-n`) |
| `git commit -F - <<'EOF'` + `git push --force is now blocked` + `EOF` | allowed |
| `git commit -m "$(cat <<'EOF'` + `don't git reset --hard` + `EOF` + `)"` | allowed |

`// lean:` marker: the guard is a deny-list on spellings, so aliases and `sh -c` wrappers evade
it. It is defense in depth, and the skills remain the contract.

### 5.5 Read-only roles (D6): `readOnlyViolation(role, call, ctx): string | undefined`

**The role.** On Claude Code, `roleOf($, agentId)` finds the call's `agentId` in
`$.agent.list()` and checks its entry `type`, which must equal `<plugin>:reviewer`, `:checker` or `:scout`. On Codex it is
`agent_type` equal to `amp-reviewer`, `amp-checker` or `amp-scout`. The rule applies whether or
not a run is active.

**Edit, Write and NotebookEdit** (Codex: `apply_patch` and its aliases):
- **Denied** when the target path (`file_path` for Edit and Write, `notebook_path` for
  NotebookEdit) resolves inside the repo root and not under `<root>/.amp/`.
- **Paths:** a relative path is joined to the cwd; `\` becomes `/`; `.` and `..` segments are
  collapsed. The comparison ignores case when the root starts with a drive letter.
- **Codex:** every `*** Add File:`, `*** Update File:`, `*** Delete File:` and `*** Move to:` path
  in the patch text is checked.

**Bash** (and PowerShell): a git segment (§5.4 splitting and word rules) is denied when it is
one of the following.

| Subcommand | Denied | Allowed |
|---|---|---|
| `commit`, `push`, `merge`, `rebase`, `reset`, `checkout`, `switch`, `stash`, `add`, `rm`, `mv`, `cherry-pick`, `revert`, `am`, `restore`, `clean` | any form | — |
| `tag` | any of `-a -s -u -d -f -m -F --annotate --sign --delete --force`, or a positional word without `-l`/`--list` | `git tag`, `git tag -l 'v1.*'`, `git tag --sort=-v:refname`, `git tag --contains HEAD` |
| `notes` | `add`, `edit`, `remove`, `copy`, `append`, `merge`, `prune` | `git notes list`, `git notes show` |
| `apply` | any form without `--check`, `--stat` or `--numstat` | `git apply --check x.patch` |
| `branch` | `-d -D -m -M -c -C -f --delete --move --copy --force`, or a positional word (that creates a branch) | `git branch`, `git branch -a`, `git branch --show-current`, `git branch --contains HEAD`, `git branch --merged main` |
| `worktree add` | a target path inside the root and not under `<root>/.amp/` | a path outside the repo (reviewer.md's temporary worktree), `worktree list`, `worktree remove` |

The deny text is `amp read-only: <role> may not <what> (<target>). Report the finding instead;
write only the report file under .amp/ or outside the repo.`

`// lean:` marker: non-git shell writes (`>`, `sed -i`, `rm`) aren't blocked, because reviewers
run test suites that write caches. The guardrails still apply.

### 5.6 Codex hooks

`codex/hooks/hooks.json`:

```json
{
  "description": "amp: resume guard, autonomy guardrails, read-only roles",
  "hooks": {
    "SessionStart": [{ "matcher": "startup|resume|compact", "hooks": [{ "type": "command", "command": "<see 5.6.1>", "timeout": 10 }] }],
    "PreToolUse": [{ "matcher": "Bash|apply_patch", "hooks": [{ "type": "command", "command": "<see 5.6.1>", "timeout": 10 }] }]
  }
}
```

#### 5.6.1 Command strings

Codex passes the string to `$SHELL -lc` on Unix and to `%COMSPEC% /C` on Windows, and uses
`commandWindows` on Windows when it is set. It does no substitution of its own: it sets
`PLUGIN_ROOT` in the env, and the shell expands it (Codex `discovery.rs:313-318, ~660`,
`command_runner.rs:444-471`). So each handler carries both forms, with `<sub>` being
`session-start` or `pre-tool-use`:

- `"command": "bash \"$PLUGIN_ROOT/codex/hooks/amp-hook\" <sub>"`
- `"commandWindows": "bash \"%PLUGIN_ROOT%/codex/hooks/amp-hook\" <sub>"`

`Ruling: on Windows the hook needs Git Bash's bash.exe on PATH ahead of WSL's System32\bash.exe —
amp already requires bash and the README says Git Bash — cost if wrong: Codex hooks error on a
Windows machine whose PATH resolves WSL bash; the README states the PATH requirement.`

The resume text stays well under Codex's 2,500-token `additionalContextLimit`.

#### 5.6.2 Subcommands

- **`amp-hook session-start`:** reads stdin's `cwd`, resolves the repo root, and applies the
  §5.2 rules (newest unfinished ledger whose `Branch` matches). The newest is found with
  `ls -t`, which is portable, never GNU or BSD `stat`. On a match it prints the
  `resumeText` content as plain stdout and exits 0. Otherwise it prints nothing.
- **`amp-hook pre-tool-use`:** reads `tool_name`, `tool_input.command`, `agent_type` and `cwd`.
  - For `Bash`, `tool_input.command` is the command string (Codex
    `core/src/tools/handlers/unified_exec/exec_command.rs:336-347`).
  - For `apply_patch`, it is the whole patch text, `*** Begin Patch` … `*** End Patch` (Codex
    `core/src/tools/handlers/apply_patch.rs:370-374`). The paths in it may be relative (to `cwd`)
    or absolute.
  - The Codex tests use exactly these shapes. It applies §5.5 first,
  then §5.4 (only while a run is active). On a violation it prints
  `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"<text>"}}`
  and exits 0. Otherwise it prints nothing and exits 0.
- **JSON extraction:** sed handles `\"`, `\\`, `\n` and `\t` inside a string value. A field it
  can't parse counts as absent, and the hook allows the call (fail open: a guard bug must not
  brick a session).
- **Stdout escaping:** the reason string in the output has `"` and `\` escaped.

## 6. States and errors

- **No git repo, no `.amp/`, or no ledger:** every mod is idle. The status line is cleared, the
  pane says "No amp run in this repository.", and no section is added.
- **Unreadable ledger, or a ledger over 4 MiB:** that candidate is skipped silently. Nothing
  throws out of a hook.
- **Ledger without Stage lines** (a 1.3.0 run in build): the stage is `unknown`. The status line
  and pane still show the tasks. No stage alerts fire, because nothing is known.
- **A `git` process fails or times out:** the branch counts as unknown. The guard rules that need
  the branch (push with no refspec, commit on default) don't fire, and the other rules still do.
- **The sound can't play** (Windows/Linux terminals have no player): silent. The toast always
  shows. `Ruling: sound kept although $.audio plays only on macOS terminals and capable hosts —
  toast is the guaranteed channel — cost: Windows users hear nothing.`
- **Codex hook untrusted:** Codex doesn't run it. The README tells users to trust it in `/hooks`.
- **Codex hook bash missing** (Windows without Git Bash): Codex reports the hook error, and amp
  already requires bash.
- **Never silent:** every deny carries its reason to the model, and the model relays it.

## 7. Testing strategy

**Claude Code** (`claude plugin test .`):
- `hooks/guard.test.ts`: one test per rule row in §5.4 and §5.5, with a denied and an allowed
  example, through the pure functions.
- **End-to-end guardrails** (main loop): through `$.tool.call({ tool: 'Bash', command })` with a
  ledger present, a denied and an allowed case, and no deny once the ledger is gone.
  - **End-to-end read-only roles:** `$.tool.call({ ..., agentId: 'a1' })`, with a test
    `on('agent.list')` naming `a1` as `amp:reviewer`. A Write in the repo is denied, a Write
    under `.amp/` is allowed, and the same call from the main loop is allowed.
- `hooks/run.test.ts`: `parseLedger` on a fixture ledger covering every line form, the old
  header, a stage-less ledger, and the `statusText` and `resumeText` strings.
- Pane and ToolUse render tests mount on `terminal` and `desktop`, checking that the stage, the
  tasks and the dispatch row text are present.
- **Alert test:** a stage change to `stopped` toasts once, and does not toast again after a
  re-parse at the same stage. A ledger that already reads `gate` at load doesn't toast.
- **Mid-session test:** a ledger created after `session.start` is picked up by the next refresh
  (status line set). A merged run whose file is then deleted toasts merged once and clears the
  status line.
- The existing `pane.test.ts` and `routing.test.ts` stay green.

**Codex** (`bash scripts/test`):
- New cases pipe JSON fixtures to `codex/hooks/amp-hook` from a temp git repo, with a `.amp`
  ledger and a fake origin HEAD. Every §5.4 and §5.5 row has a deny and an allow case, including
  JSON with escaped quotes.
- `session-start` is tested with a matching branch, a mismatched branch and no ledger.
- The manifest test asserts `.codex-plugin/plugin.json` `hooks` is `"./codex/hooks/hooks.json"`.
  For `codex/hooks/hooks.json` it greps (the suite has no JSON parser) for exactly two top-level
  keys, `description` and `hooks`, and requires every handler key to be one of `type`,
  `command`, `commandWindows` and `timeout`.

**Gates:** `claude plugin validate .`, `claude plugin test .`, `bash scripts/render --check`,
`bash scripts/test`, and `tsc -p .`.

## 8. Docs impact

- **README:**
  - A new section, "What the plugin adds to a session", covering the status line, `/amp-run`,
    the resume guard, the guardrails and their list, read-only roles, dispatch rows and alerts
    (sound on macOS).
  - The Codex install section gains a step to trust amp's hooks in `/hooks`, and says which mods
    Codex gets.
  - The Requirements line keeps the function-hook note.
  - It also states the known gaps: aliases and `sh -c` evade the guard, and an abandoned run
    keeps the guards on until `.amp/<key>/` is deleted. On Windows, Codex hooks need Git Bash's
    `bash` first on PATH.
- **WAV generation:** done once by an inline command in the plan task (not a committed script).
- **CHANGELOG:** a 1.4.0 entry.
- **Version:** 1.4.0 in `.claude-plugin/plugin.json` and `.codex-plugin/plugin.json`, and in
  `.claude-plugin/marketplace.json` if it carries a version.
- **Skills (src, then rendered):** the ledger lifecycle and Stage lines (§5.1) in phase, grill,
  plan, build and ship.

## 9. Review Focus

1. **The guard splitter on quoted text:** `git commit -m "fix; git push -f"` must not deny, and
   `git commit -m "x" && git push -f` must deny.
2. **amp's own pre-authorized commands must pass under the guards:** ship's tag push while on
   main, pipeline worktree removal, `branch -D amp-wt-*`, and the merge. A false deny stalls the
   whole autonomous run.
3. **Windows paths in the read-only rule:** `C:\Users\x\repo\src\a.ts` versus a root spelled
   `C:/Users/x/repo` (case and separator), and `.amp\` subpaths.
4. **The ledger cleanup race:** ship deletes `$WS` after `Stage: merged`. The refresh must
   tolerate the file vanishing, and the merged alert must still fire exactly once.
5. **Codex sed JSON extraction:** commands with `\"` and `\\` must be extracted correctly or fail
   open, never deny on a mis-parse of an allowed command.

## 10. Out of scope

- A Codex pane, status line, dispatch rows or alerts.
- Blocking non-git shell writes for the read-only roles.
- Routing changes.
- Publishing the mods separately.

**Refactor opportunities:** `scripts/test` is growing past 400 lines; splitting it per area would
help, but it's not part of this phase.
