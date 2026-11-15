# amp for Claude Code

**amp** is a Claude Code plugin for building software in phases: you answer one requirements
interview, then the agent works on its own to a merged pull request. It writes the spec and the
plan, has subagents build each task with its own review, then opens the PR, waits for CI and
merges. You choose which model runs each kind of task.

```
/amp:phase  →  grill (your one approval)  →  branch  →  spec  →  plan
            →  build: per task, implementer → reviewer → capped fix loop → reviewer re-check
            →  final whole-branch review  →  docs + close-out  →  PR  →  green CI  →  merge
```

amp combines three ideas: the relentless *Grill me* interview, the *Superpowers*
design → plan → subagent-build discipline, and a strict economy doctrine for code and context. It
works for any language or stack. Everything specific to a project lives in that project's
`CLAUDE.md`.

## Contents

- [Requirements](#requirements)
- [Install](#install)
- [Choosing the models](#choosing-the-models)
- [Using amp](#using-amp)
- [What the plugin adds to a session](#what-the-plugin-adds-to-a-session)
- [Project configuration](#project-configuration)
- [What runs where](#what-runs-where)
- [Updating and removing](#updating-and-removing)
- [Developing the plugin](#developing-the-plugin)

## Requirements

- **Claude Code.** Tested on 2.1.295. The model routing, the settings pane and the run hooks (status
  line, `/amp-run`, resume guard, alerts, dispatch rows) use Claude Code's function-hook plugins
  (early access). On a build without them the skills and agents still work, and each agent runs on
  the default model in its definition (see the defaults below).
- **git**, and the **GitHub CLI** (`gh`) signed in (`gh auth login`), for the PR, CI and merge
  stages. Without a remote, amp still runs everything up to the PR, then stops and tells you.
- **bash**. Git Bash works on Windows. The bundled helper scripts are bash.

## Install

At a Claude Code prompt:

```
/plugin marketplace add MParoczi/amp
/plugin install amp@amp
```

Pick a scope when asked. **User** makes amp available in every repository; **project** records it
in that repository's `.claude/settings.json`, so collaborators get it too. Claude Code then shows the
model settings screen (next section). Accepting the defaults is fine, and you can change them later.

The one-line form does the same thing:

```
/plugin install amp --marketplace MParoczi/amp
```

Answer `y` to add the marketplace. From a shell, use `claude plugin marketplace add MParoczi/amp`
and then `claude plugin install amp@amp`.

## Choosing the models

amp has six task types. Each can run on `inherit` (the session's model), `fable`, `opus`, `sonnet`
or `haiku`:

| Setting | What runs on it | Default |
|---|---|---|
| **Reviewer** | spec, plan and roadmap reviews; every task review; the final whole-branch review; the re-check of each fix (`amp:reviewer`) | `opus` |
| **Implementer** | each plan task, fix rounds 1–3, final-review fixes and CI fixes (`amp:implementer`) | `opus` |
| **Checker** | the fallback re-check when the reviewer can't be resumed (`amp:checker`) | `sonnet` |
| **Scout** | fact-finding during the grill, design and roadmap (`amp:scout`) | `sonnet` |
| **Escalation** | a fresh implementer for fix rounds 4–5, and a retry of a BLOCKED task | `inherit` |
| **Fallback** | where a dispatch goes when its model is unavailable (rate or usage limit, overload) | `sonnet` |

The **orchestrator** runs the grill, spec, plan, rulings and shipping. It is your session itself,
so it runs on whatever `/model` you choose. Put your strongest model there.

You can change the settings in four places:

1. **The amp models pane.** Run `/amp-models` to open a pane with one picker per task type. Move
   with Tab and the arrow keys, confirm with Enter, close with Esc. A change applies to the next
   dispatch.
2. **`/config`.** The same six settings appear as amp rows in the settings menu.
3. **`settings.json`**, under `pluginConfigs`, for example in `~/.claude/settings.json`:

   ```json
   {
     "pluginConfigs": {
       "amp@amp": {
         "options": { "reviewer": "fable", "implementer": "opus", "escalation": "fable", "fallback": "opus" }
       }
     }
   }
   ```

4. **The plugin's options.** `/plugin configure amp@amp` in a session, or from a shell (takes
   effect after a restart):

   ```
   echo '{"reviewer":"fable","escalation":"fable","fallback":"opus"}' | claude plugin configure amp@amp --values-stdin
   ```

Each alias resolves through Claude Code's usual model settings. To point `opus` at a particular
model version, set `ANTHROPIC_DEFAULT_OPUS_MODEL` (and the matching variable for the other aliases)
in the `env` block of your settings.

**How the routing works.** amp dispatches its agents without a `model` parameter. A plugin hook
fills in the model configured for that agent's task type, and resolves `inherit` to the session's
model. Escalation and fallback dispatches pass an explicit `model`, and the hook leaves that alone.
The orchestrator learns those two values from a short *amp model routing* section that the plugin
adds to the system prompt. Don't set `CLAUDE_CODE_SUBAGENT_MODEL`: it overrides every agent's
model, so it would also override these settings.

## Using amp

### Start a new project: `/amp:roadmap`

Run this in an empty or nearly empty folder. amp asks about the whole project (vision, stack,
quality bar, delivery, safety rules) and has scouts research the options. It then writes:

- `docs/roadmap/ROADMAP.md`: the project from A to Z as numbered phases. Each phase is vertical,
  can ship on its own, and fits in one session.
- `docs/roadmap/prompts/<NN>-<slug>.md`: one self-contained prompt per phase.
- `CLAUDE.md` with the project's `## amp configuration`.
- `.claude/settings.json`: the session model and high effort. amp's reviewer and implementer also
  run at high effort, its checker and scout at medium.

A reviewer checks the result. Then amp makes the initial commit and, if you asked for one, creates
the GitHub repository. Use `/amp:roadmap revise: <change>` to add, split, reorder or re-scope
phases later.

### Run a phase or any change: `/amp:phase`

```
/amp:phase 04                       # a roadmap phase, by number
/amp:phase docs/roadmap/prompts/04-profiles.md
/amp:phase fix the crash when the import file is empty
```

1. **Grill.** amp maps every open decision and looks up facts (it never asks you for something the
   code or the docs can answer). It asks the open questions in rounds, each with a recommended
   answer, and ends with one summary. **Your confirmation of that summary is the only approval in
   the run.**
2. **Autonomous from there.** amp cuts a `feature|bugfix|hotfix|framework/<NN>-<slug>` branch from
   the default branch, then writes the spec and the plan (each reviewed independently). The spec
   starts from a survey: existing code is reused or extended before anything new is written, and
   code nothing references and no doc or roadmap phase claims is scheduled for deletion. It builds
   the plan, with one atomic commit and one review per task, then runs a final review.
   Each implementer runs its focused tests, and the full suite only when its task touches shared
   code (code other modules import, a public interface, config or build files) or is the last one.
   A task is never only setup, config or docs: those fold into the task that needs them.
   Every plan task names the tasks it builds on (`**Depends on:** none` or `Task 2, Task 4`).
   amp starts each task once those are complete (reviewed and merged) and it shares no file, docs
   included, with a task already running, up to `Parallel tasks` at once (3 by default). A task
   alone runs in the main tree; when several run, each gets its own git worktree under `.amp/`
   and runs its whole implement, review and fix cycle there. A finished task is rebased onto the
   phase branch (its tests re-run if the rebase moved it) and fast-forwarded in, one at a time. A
   rebase conflict or a failed merge drops the task: amp redoes it alone from scratch, and the PR
   lists the drop as a ruling. If a worktree can't be set up, the rest of the run goes one task
   at a time. A plan with no `Depends on` lines runs one task at a time.
   Finally it updates the docs, verifies, pushes, opens the PR, waits for green CI, merges with a
   merge commit, tags if your project says to, and syncs your local default branch.
3. **Rulings, not questions.** When amp meets an ambiguity, it decides against the spec and writes
   down the decision with its cost if wrong. The PR lists every ruling.

The grill, new tests, the reviews, verify and the CI wait each run unless your project turned
them off; see [Turning steps off](#turning-steps-off).

amp stops and asks only for:

- input only you can give: a visual or physical judgment, a login, a secret, a paid action
- a destructive operation outside the pre-authorized set
- a security-sensitive action, or one of your project's stop rules
- a plan too broken to continue, or a cap reached (three CI fix rounds, a protected merge)

Before it starts, amp also refuses to touch a dirty working tree. It never stashes or discards your
work.

### The other skills

Each stage is also a skill you can call on its own:

| Skill | Use it to |
|---|---|
| `/amp:grill` | stress-test an idea or pin down requirements ("grill me"), with no build after it |
| `/amp:design` | turn confirmed decisions into a binding spec |
| `/amp:plan` | turn a spec into right-sized tasks |
| `/amp:build` | execute a plan with implementer and reviewer subagents |
| `/amp:ship` | land a finished branch: docs, verify, PR, CI, merge |
| `/amp:debug` | find a bug's root cause: reproduce, trace, pin it with a test, fix once |
| `/amp:lean` | apply the economy doctrine (DRY, YAGNI, KISS): the laziness ladder, the dead-code rule, the never-cut list, lean review tags |

### Resuming

Each run keeps its working files in `.amp/<NN>-<slug>/` at the repository root: decisions, the
ledger (`progress.md`), task briefs, reports, review packages and CI logs. The folder ignores itself,
so nothing in it reaches git. If a session ends or its context is compacted, run `/amp:phase` again
with the same phase. It resumes from the ledger and `git log`. amp deletes the folder after the
merge, leaving the PR as the record.

## What the plugin adds to a session

amp's hooks module watches the run's ledger. The **active run** is the newest
`.amp/<key>/progress.md` whose stage isn't `merged`. Every tool call and every finished turn
checks for it again, so a run started mid-session shows up at once and a merged one drops out.
Outside a git repository nothing below appears, and with no ledger only the read-only roles apply.
A ledger over 4 MiB, or one that can't be read, is skipped.

- **Status line.** While a run is active the status line reads `amp <key> · <stage>`. During the
  build it adds every active task with its fix round, then the done count, for example
  `amp 05-parallel-build · build · tasks 2, 3 r2, 5 · 1/7 done`, or
  `amp 04-workflow-mods · build · task 3 · fix r2/5 · 2/7 done` with one task active.
- **`/amp-run`.** Opens the "amp run" pane: the key and branch, the stage and its note, one row per
  task with its state, fix round and worktree, the parked, rulings and fallback counts, the
  `Parallel:` state and the ledger's last lines. With no run it replies "No amp run in this
  repository."
- **Resume guard.** Whenever Claude Code builds the system prompt of a conversation that can
  dispatch agents while the current branch is one an unfinished run owns (its `Branch:` line, or
  the default branch while the run has none yet), the prompt tells Claude that the run owns the
  branch and that it resumes with `amp:phase <key>`. A compaction in the main conversation keeps
  the same note, so the summary still names the run, its stage and its ledger.
- **Guardrails.** While a run is active, every Bash and PowerShell command, in the main
  conversation and in every subagent, is checked before it runs. Each `&&`, `||`, `;`, `|` or
  newline segment is checked on its own; quoted text and heredoc bodies are data, so
  `git commit -m "fix; git push -f"` passes. A blocked command is refused with the rule and what
  to do instead:
  - **hooks skipped:** `git commit --no-verify` or `-n`
  - **signing skipped:** `git commit --no-gpg-sign`, or `git -c commit.gpgsign=false commit`
  - **force push:** `git push` with `--force`, `-f`, `--force-with-lease`, `--force-if-includes`,
    `--mirror`, `--delete`/`-d`, or a refspec starting with `+` or `:`
  - **push to default:** a push to the default branch, or a bare `git push` while on it
  - **hard reset:** `git reset --hard`
  - **commit on default:** `git commit` while on the default branch
  - **discard work:** `git stash` (except `list` and `show`), `git checkout --`/`-f`,
    `git restore` without `--staged` (or with `--worktree`), `git clean -f`
  - **admin merge:** `gh pr merge --admin`

  What amp's skills run stays allowed: the tag push on the default branch,
  `git worktree remove --force`, `git branch -D amp-wt-*` and `gh pr merge --merge --delete-branch`.
  The default branch is origin's HEAD, else `init.defaultBranch`, else `main`. When the current
  branch can't be read, only the two rules that need it are skipped.
- **Alerts.** In the main conversation a toast, with a short sound, says when the grill summary
  is ready (`amp: grill summary ready — confirm to start the run`), when a run stops
  (`amp stopped: <what is needed>`) and when it merges (`amp: merged — <PR URL>`). A question
  Claude asks after the grill (during design, plan, build or ship) toasts `amp needs your answer`.
  A run's stage when the session first sees it raises nothing, so opening a session on a waiting
  or stopped run stays quiet. The toast shows everywhere; the sound plays on macOS terminals and
  on hosts that can play audio, and is silent on Windows and Linux terminals.
- **Dispatch rows.** The row of an `amp:reviewer`, `amp:implementer`, `amp:checker` or `amp:scout`
  dispatch gets a box beneath it: `amp <role> · <model> · task <N>`, for example
  `amp implementer · opus · task 3a`. The model is the configured one until the agent reports the
  model it ran on; the task comes from the first `Task <N>` in the description or the prompt.
  Once the agent completes, the box adds the first line of its report, such as `- STATUS: DONE`.
- **Read-only roles.** `amp:reviewer`, `amp:checker` and `amp:scout` may not edit, write or
  notebook-edit a file inside the repository except under `.amp/` (a task worktree there,
  `.amp/<key>/wt-*`, counts as the repository), and may not run a writing git
  command (commit, push, merge, reset, checkout, stash, add, a new tag or branch, `apply` without
  `--check`, a `worktree add` inside the repository, and the like). Reading git (`status`, `log`,
  `diff`, `branch --contains`, `tag -l`) and a temporary worktree outside the repository stay
  allowed. This holds whether or not a run is active.

Known gaps: the guardrails match spellings, so a git alias, an `sh -c` wrapper, a command after a
lone `&` (background) or one inside a `( … )` subshell slips past them; they are defense in depth,
and the skills remain the contract. The read-only rule doesn't stop
non-git shell writes (`>`, `sed -i`, `rm`), because reviewers run test suites that write caches.
An abandoned run keeps the guardrails on until its `.amp/<key>/` folder is deleted, which every
refusal says; Claude never deletes it itself.

## Project configuration

Settings for one project go in its `CLAUDE.md`, under a `## amp configuration` heading, as a
key → value table. Every key is optional:

| Key | Default | Meaning |
|---|---|---|
| Roadmap | `docs/roadmap/ROADMAP.md` | the phase list and status table |
| Phase prompts | `docs/roadmap/prompts/` | where `/amp:phase NN` finds phase `NN` |
| Specs / Plans | `docs/amp/specs/` · `docs/amp/plans/` | where specs and plans are committed |
| Dispatch skills | none | your project's skills that every implementer, reviewer and checker loads (may be conditional: "`ui-rules` when touching screens") |
| Grill | on | the requirements interview; `off` turns it off (see [Turning steps off](#turning-steps-off)) |
| Tests | on | new tests in plans and tasks; `off` turns them off |
| Verify | the repo's documented test, lint, typecheck and build | the command or skill that proves a change; `off` skips the verify run |
| Document reviews | on | the independent spec, plan and roadmap reviews; `off` turns them off |
| Task reviews | on | the review of each task and its fix loop; `off` turns them off |
| Final review | on | the whole-branch review before the PR; `off` turns it off |
| CI | on | waiting for green CI before the merge; `off` turns it off |
| Design process | none | steps `amp:design` runs for UX work |
| Parallel tasks | 3 | how many plan tasks `amp:build` runs at once; use 1 for test suites that hold fixed shared resources (ports, a database, fixed temp paths) |
| Merge method | merge commit | or squash or rebase |
| Close-out | roadmap status row → Complete | version bump, changelog, … |
| Versioning / tags | none | for example "patch per phase, minor and an annotated tag per milestone" |
| Stop rules | none | extra conditions where amp must stop and ask |

Example:

```markdown
## amp configuration

| Key | Value |
|---|---|
| Dispatch skills | `acme-conventions` always; `acme-db` when touching migrations |
| Verify | `pnpm test && pnpm lint && pnpm typecheck && pnpm build` |
| Close-out | ROADMAP status → Complete; bump `version` in package.json; CHANGELOG entry |
| Stop rules | never run migrations against a shared database |
```

### Turning steps off

Seven steps of a run can be turned off. Each one runs unless its row in the table above says
`off`. The spec, the plan, the docs sweep, the close-out, the PR and the merge always run.

| Step | What happens when it is off |
|---|---|
| Grill | amp asks you nothing. It writes the decisions itself from your request and the project's docs, and settles each open point with a ruling, so every assumption it made is listed among the PR's rulings. The run is autonomous from the start, and amp still stops for the usual reasons, including a request so vague that every reading is a guess. For a bug it still investigates the root cause first. `/amp:grill` on its own and `/amp:roadmap` always interview you. |
| Tests | Plans carry no test steps and implementers write no new tests. Existing tests stay green: a change that breaks one fixes it in the same commit. Reviewers don't report missing tests. |
| Verify | amp doesn't run the verify command before opening the PR, or again after merging the default branch in. The PR's evidence reads `Verify: off (project configuration)`. |
| Document reviews | The spec, the plan and a roadmap revision get no independent review. amp's own self-review of the spec and the plan still runs. |
| Task reviews | No reviewer checks each task, and there is no fix loop: a task is complete once its implementer reports it done. When the final review is on, it then also judges each task's correctness and quality. |
| Final review | No whole-branch review runs before the PR. Deferred minor findings and parked findings go to the PR untriaged. |
| CI | amp opens the PR and merges it without waiting for checks. A merge that branch protection blocks still stops the run. |

A step never turns off silently. When at least one is off, amp says so in one line as the run
starts, for example `Steps off for this project: Tests, Task reviews.` The run's ledger records
the same list in an `Off:` line (`Off: none` when every step is on). A resumed run keeps that
line, so a change to the table during a run applies from the next run. The PR lists every step
that was off, and what did not run, in its "Steps turned off" section. A value other than `on`
or `off` counts as on: the step runs, and amp records that as a ruling.

## What runs where

| Piece | Kind | Role |
|---|---|---|
| `amp:phase` | skill | entry point: intake, preflight, grill, branch, the autonomy contract |
| `amp:grill` · `amp:design` · `amp:plan` · `amp:build` · `amp:ship` | skills | the pipeline's stages |
| `amp:roadmap` | skill | a new project's roadmap, phase prompts and `CLAUDE.md` |
| `amp:lean` · `amp:debug` | skills | the economy doctrine and the root-cause discipline that every stage applies |
| `amp:implementer` | agent | one task, test first, one atomic commit, a report file, a short status reply |
| `amp:reviewer` | agent | read-only reviews of tasks, the whole branch and documents, citing `file:line` for every finding |
| `amp:checker` | agent | fallback re-check when the reviewer can't be resumed: each finding addressed or not, plus any new breakage in the fix |
| `amp:scout` | agent | answers one factual question from primary sources, with citations |
| `/amp-models` | command + pane | the model settings |
| `/amp-run` | command + pane | the active run: stage, tasks, fix rounds, parked items |
| amp status line | hook | `amp <key> · <stage>`, plus the active tasks and their fix rounds during the build |
| amp resume guard | hook | tells a session on a branch an unfinished run owns to resume it with `amp:phase <key>` |
| amp guardrails | hook | while a run is active, refuses the git and `gh` commands that skip hooks, rewrite or discard work, or bypass the PR |
| amp read-only roles | hook | refuses repository edits and writing git commands from the reviewer, checker and scout |
| amp alerts | hook | a toast and a sound when the grill summary is ready, a run stops or merges, or a question waits |
| amp dispatch rows | hook | an amp agent's tool row names its role, model and task, then its first report line |

The bundled scripts in `skills/build/scripts/` handle the run's bookkeeping. `amp-workspace` creates the `.amp/<key>/` folder. `task-brief` extracts one
task from the plan. `review-package` writes a commit range as one diff file for a reviewer.

## Updating and removing

```
/plugin marketplace update amp
/plugin update amp@amp
/plugin uninstall amp@amp
```

Run `/reload-plugins` (or restart) after an update.

## Developing the plugin

`skills/` and `agents/` are the plugin's source: edit them directly. There is no build step, so
what is committed there is what Claude Code loads.

```
bash scripts/test                     # scripts' executable bits, manifests, skill, agent and docs text
claude plugin validate --strict .     # manifest, marketplace and hooks module
claude plugin test .                  # hooks/*.test.ts against the engine
claude --plugin-dir .                 # a session with this working copy loaded
```

On a checkout with `core.filemode=false` (common on Windows), git doesn't record a new script's
executable bit: run `git update-index --chmod=+x` on it after `git add`. `bash scripts/test` fails
when `scripts/test` or a file in `skills/build/scripts/` isn't executable in the index.

Layout: `.claude-plugin/` (the manifest and marketplace), `skills/` and `agents/`, `scripts/test`,
and `hooks/` (the hooks module `register.tsx` for the routing, the panes, the run hooks and the
guards; `run.ts`, the ledger parser it reads the run with; `guard.ts`, the guardrails and
read-only rules it checks each command and path with; their tests; and `sounds/`, the alert
sound). The editor types for the hooks module appear in `.claude-plugin/types/` the first time a
session loads the folder with `--plugin-dir`. That folder is git-ignored.

## License

[MIT](LICENSE)
