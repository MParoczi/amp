# amp for Claude Code and Codex

**amp** is a plugin for Claude Code and Codex for building software in phases: you answer one
requirements interview, then the agent works on its own to a merged pull request. It writes the
spec and the plan, has subagents build each task with its own review, then opens the PR, waits for
CI and merges. You choose which model runs each kind of task.

```
/amp:phase  →  grill (your one approval)  →  branch  →  spec  →  plan
            →  build: per task, implementer → reviewer → capped fix loop → reviewer re-check
            →  final whole-branch review  →  docs + close-out  →  PR  →  green CI  →  merge
```

amp combines three ideas: the relentless *Grill me* interview, the *Superpowers*
design → plan → subagent-build discipline, and a strict economy doctrine for code and context. It
works for any language or stack. Everything specific to a project lives in that project's
`CLAUDE.md` (on Codex, `AGENTS.md`, else `CLAUDE.md`).

On Codex the skills are invoked with `$` instead of `/`: `$amp:phase 04`, `$amp:roadmap` and so on.
Everything else in this README applies to both tools unless a section says otherwise.

## Contents

- [Requirements](#requirements)
- [Install for Claude Code](#install-for-claude-code)
- [Install for Codex](#install-for-codex)
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
- **Or Codex**: the Codex CLI or the desktop app. The IDE extension has no plugins, so it can't
  run amp. Codex support follows Codex's source and documentation but hasn't yet been tested end
  to end against a real Codex binary.
- **git**, and the **GitHub CLI** (`gh`) signed in (`gh auth login`), for the PR, CI and merge
  stages. Without a remote, amp still runs everything up to the PR, then stops and tells you.
- **bash**. Git Bash works on Windows. The bundled helper scripts are bash.

## Install for Claude Code

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

## Install for Codex

1. Add the marketplace from a shell:

   ```
   codex plugin marketplace add MParoczi/amp
   ```

2. Install amp from `/plugins` in the Codex CLI, or from the Plugins tab of the desktop app.
3. Install amp's agents. Codex plugins can't ship custom agents, so a bundled installer copies the
   four amp roles (`amp-reviewer`, `amp-implementer`, `amp-checker`, `amp-scout`) into Codex's
   agents folder. Run it from the installed plugin, which Codex keeps under
   `~/.codex/plugins/cache/amp/amp/<version>/`, or from a clone of this repository:

   ```
   bash ~/.codex/plugins/cache/amp/amp/<version>/codex/install [--project] [--reviewer M] [--implementer M] [--checker M] [--scout M]
   ```

   Without `--project` the agents go to `~/.codex/agents` (or `$CODEX_HOME/agents`), and their
   model pins apply to every project without its own `--project` install. With `--project` they go
   to the repository's `.codex/agents`, which you can commit so collaborators get them too. The
   model flags are described in the next section.
4. Trust amp's hooks: open `/hooks` in Codex, review amp's two entries and trust them. Codex
   doesn't run a plugin's hooks until you do. They carry the resume guard, the guardrails and the
   read-only roles (see [What the plugin adds to a session](#what-the-plugin-adds-to-a-session)). The hooks run
   `bash`, so on Windows Git Bash's `bash` must come first on PATH, ahead of
   `C:\Windows\System32\bash.exe`; otherwise Codex reports a hook error.
5. Start a new Codex session, so it loads the agents.

Every amp skill that spawns agents (`$amp:phase`, `$amp:roadmap`, and `$amp:grill`, `$amp:design`,
`$amp:plan`, `$amp:build` and `$amp:ship` run on their own) checks the install before its first
spawn. It stops and tells you what to run when the agents are missing, or when the installed
version differs from the plugin's.

## Choosing the models

The settings below are Claude Code's. Codex pins models through its agent installer instead: see
[Models on Codex](#models-on-codex) at the end of this section.

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

### Models on Codex

`/amp-models`, the settings pane and the routing hook are Claude Code only. On Codex, every amp
agent runs on the session model (`/model`) unless the agent installer pinned one for its role
(`<plugin dir>` is the cache folder from [Install for Codex](#install-for-codex), or a clone):

```
bash <plugin dir>/codex/install --reviewer M --implementer M --checker M --scout M
```

Each flag is optional. The installer records the pins in `amp-install.json` beside the agents
(`null` means the session model), and amp passes a pinned role's model on each spawn. The
reviewer and implementer run at high reasoning effort, the checker and scout at medium. The other
two task types have no setting on Codex:

- **Escalation** is a fresh implementer at reasoning effort `xhigh`, on the implementer's model.
- **Fallback**, when a spawn's model is unavailable, re-spawns the agent without a model, so it
  runs on the session model.

To change the pins, run the installer again with the new flags and start a new session. A role
whose flag you leave out goes back to the session model. **Re-run the installer after every
plugin upgrade as well**: every amp skill that spawns agents stops when the version in
`amp-install.json` differs from the plugin's.

## Using amp

### Start a new project: `/amp:roadmap`

Run this in an empty or nearly empty folder. amp asks about the whole project (vision, stack,
quality bar, delivery, safety rules) and has scouts research the options. It then writes:

- `docs/roadmap/ROADMAP.md`: the project from A to Z as numbered phases. Each phase is vertical,
  can ship on its own, and fits in one session.
- `docs/roadmap/prompts/<NN>-<slug>.md`: one self-contained prompt per phase.
- `CLAUDE.md` with the project's `## amp configuration` (`AGENTS.md` on Codex).
- `.claude/settings.json`: the session model and high effort (`.codex/config.toml` on Codex,
  with `model` and `model_reasoning_effort = "high"`). amp's reviewer and implementer also run at
  high effort, its checker and scout at medium.

A reviewer checks the result. Then amp makes the initial commit and, if you asked for one, creates
the GitHub repository. Use `/amp:roadmap revise: <change>` to add, split, reorder or re-scope
phases later. On Codex, the final report also gives the agent installer command with the models
you chose in the grill.

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
   the plan task by task, with one atomic commit and one review per task, then runs a final review.
   Each implementer runs its focused tests, and the full suite only when its task touches shared
   code (code other modules import, a public interface, config or build files) or is the last one.
   A task is never only setup, config or docs: those fold into the task that needs them.
   Pipelining is opt-in: when the plan marks a task `**Independent:** yes` (it uses nothing the
   previous task produces and shares no file with it), amp implements it in a git worktree under
   `.amp/` while the previous task is under review, then merges it and reviews it as usual. That
   saves the wait for each marked task's implementation; on a rebase conflict, or setup the
   project doesn't document, amp falls back to one task at a time.
   Finally it updates the docs, verifies, pushes, opens the PR, waits for green CI, merges with a
   merge commit, tags if your project says to, and syncs your local default branch.
3. **Rulings, not questions.** When amp meets an ambiguity, it decides against the spec and writes
   down the decision with its cost if wrong. The PR lists every ruling.

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

In Claude Code, amp's hooks module watches the run's ledger. The **active run** is the newest
`.amp/<key>/progress.md` whose stage isn't `merged`. Every tool call and every finished turn
checks for it again, so a run started mid-session shows up at once and a merged one drops out.
Outside a git repository nothing below appears, and with no ledger only the read-only roles apply.
A ledger over 4 MiB, or one that can't be read, is skipped.

- **Status line.** While a run is active the status line reads `amp <key> · <stage>`. During the
  build it adds the task and any fix round, for example
  `amp 04-workflow-mods · build · task 3/7 · fix r2/5`.
- **`/amp-run`.** Opens the "amp run" pane: the key and branch, the stage and its note, one row per
  task with its state, the current fix round, the parked, rulings and fallback counts, the
  pipeline state and the ledger's last lines. With no run it replies "No amp run in this
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
  notebook-edit a file inside the repository except under `.amp/`, and may not run a writing git
  command (commit, push, merge, reset, checkout, stash, add, a new tag or branch, `apply` without
  `--check`, a `worktree add` inside the repository, and the like). Reading git (`status`, `log`,
  `diff`, `branch --contains`, `tag -l`) and a temporary worktree outside the repository stay
  allowed. This holds whether or not a run is active.

On Codex, once you trust amp's hooks in `/hooks`, the resume guard, the guardrails and the
read-only roles apply too, with the same rules and the same refusals. When a session starts,
resumes or compacts on a branch an unfinished run owns, `codex/hooks/amp-hook` adds the same
resume note to its context. It checks every shell command the same way, and for `amp-reviewer`,
`amp-checker` and `amp-scout` every file an `apply_patch` adds, updates, deletes or moves to.
Codex has no PowerShell tool, so only its shell commands are checked. A hook input it can't parse
lets the call through. The status line, `/amp-run`, the alerts and the dispatch rows are Claude
Code only.

Known gaps: the guardrails match spellings, so a git alias, an `sh -c` wrapper, a command after a
lone `&` (background) or one inside a `( … )` subshell slips past them; they are defense in depth,
and the skills remain the contract. The read-only rule doesn't stop
non-git shell writes (`>`, `sed -i`, `rm`), because reviewers run test suites that write caches.
An abandoned run keeps the guardrails on until its `.amp/<key>/` folder is deleted, which every
refusal says; Claude never deletes it itself.

## Project configuration

Settings for one project go in its `CLAUDE.md`, under a `## amp configuration` heading, as a
key → value table. On Codex, amp reads the table from `AGENTS.md`, else from `CLAUDE.md`. Every key
is optional:

| Key | Default | Meaning |
|---|---|---|
| Roadmap | `docs/roadmap/ROADMAP.md` | the phase list and status table |
| Phase prompts | `docs/roadmap/prompts/` | where `/amp:phase NN` finds phase `NN` |
| Specs / Plans | `docs/amp/specs/` · `docs/amp/plans/` | where specs and plans are committed |
| Dispatch skills | none | your project's skills that every implementer, reviewer and checker loads (may be conditional: "`ui-rules` when touching screens") |
| Verify | the repo's documented test, lint, typecheck and build | the command or skill that proves a change |
| Design process | none | steps `amp:design` runs for UX work |
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

## What runs where

| Piece (Claude Code) | On Codex | Kind | Role |
|---|---|---|---|
| `amp:phase` | the same | skill | entry point: intake, preflight, grill, branch, the autonomy contract |
| `amp:grill` · `amp:design` · `amp:plan` · `amp:build` · `amp:ship` | the same | skills | the pipeline's stages |
| `amp:roadmap` | the same | skill | a new project's roadmap, phase prompts and `CLAUDE.md` (Codex: `AGENTS.md` and `.codex/config.toml`) |
| `amp:lean` · `amp:debug` | the same | skills | the economy doctrine and the root-cause discipline that every stage applies |
| `amp:implementer` | `amp-implementer` | agent | one task, test first, one atomic commit, a report file, a short status reply |
| `amp:reviewer` | `amp-reviewer` | agent | read-only reviews of tasks, the whole branch and documents, citing `file:line` for every finding |
| `amp:checker` | `amp-checker` | agent | fallback re-check when the reviewer can't be resumed: each finding addressed or not, plus any new breakage in the fix |
| `amp:scout` | `amp-scout` | agent | answers one factual question from primary sources, with citations |
| `/amp-models` | `codex/install` + `amp-install.json` | command + pane / installer | the model settings |
| `/amp-run` | — | command + pane | the active run: stage, tasks, fix rounds, parked items |
| amp status line | — | hook | `amp <key> · <stage>`, plus the task and fix round during the build |
| amp resume guard | `codex/hooks/amp-hook` | hook | tells a session on a branch an unfinished run owns to resume it with `amp:phase <key>` |
| amp guardrails | `codex/hooks/amp-hook` | hook | while a run is active, refuses the git and `gh` commands that skip hooks, rewrite or discard work, or bypass the PR |
| amp read-only roles | `codex/hooks/amp-hook` | hook | refuses repository edits and writing git commands from the reviewer, checker and scout |
| amp alerts | — | hook | a toast and a sound when the grill summary is ready, a run stops or merges, or a question waits |
| amp dispatch rows | — | hook | an amp agent's tool row names its role, model and task, then its first report line |

The bundled scripts in `skills/build/scripts/` (`codex/skills/build/scripts/` on Codex) handle the
run's bookkeeping. `amp-workspace` creates the `.amp/<key>/` folder. `task-brief` extracts one
task from the plan. `review-package` writes a commit range as one diff file for a reviewer.

## Updating and removing

On Claude Code:

```
/plugin marketplace update amp
/plugin update amp@amp
/plugin uninstall amp@amp
```

Run `/reload-plugins` (or restart) after an update.

On Codex, to update:

```
codex plugin marketplace upgrade                        # then update amp from /plugins
bash <plugin dir>/codex/install [same flags as before]  # after every upgrade
```

Start a new Codex session after re-running the installer. To remove amp from Codex, remove the
agents first, then uninstall the plugin from `/plugins`, then remove the marketplace:

```
bash <plugin dir>/codex/install [--project] --uninstall # removes the amp agents and amp-install.json
codex plugin marketplace remove amp                     # after uninstalling amp from /plugins
```

`--uninstall` takes `--project` to remove a repository's agents instead of the global ones.

## Developing the plugin

The sources live in `src/` (`src/skills/`, `src/agents/`). `skills/`, `agents/`, `codex/skills/`
and `codex/agents/` are rendered from them: never edit those four trees by hand. Text that differs
between the tools is marked in the `.md` sources:

- whole lines between `<!-- claude -->` … `<!-- /claude -->` or `<!-- codex -->` … `<!-- /codex -->`
- inline spans `{{claude: …}}` and `{{codex: …}}`
- whole files as `NAME.claude.EXT` or `NAME.codex.EXT`, rendered only into that tool's tree as
  `NAME.EXT`

```
bash scripts/render                   # regenerate the four rendered trees from src/
bash scripts/render --check           # fail if the rendered trees are out of date
bash scripts/test                     # renderer, installer, manifest and Codex hook tests
claude plugin validate --strict .     # manifest, marketplace and hooks module
claude plugin test .                  # hooks/*.test.ts against the engine
claude --plugin-dir .                 # a session with this working copy loaded
```

On a checkout with `core.filemode=false` (common on Windows), re-apply the scripts' executable bit
after rendering: `git add -A`, then `git update-index --chmod=+x` on `scripts/render`,
`scripts/test`, `codex/install`, `codex/hooks/amp-hook` and the files in `src/skills/build/scripts/`,
`skills/build/scripts/` and `codex/skills/build/scripts/`.

Layout: `.claude-plugin/` (Claude Code manifest, marketplace), `.codex-plugin/` (Codex manifest),
`src/` (the sources), the rendered `skills/`, `agents/`, `codex/skills/` and `codex/agents/`,
`codex/install` (the Codex agent installer), `codex/hooks/` (the Codex hooks file `hooks.json` and
`amp-hook`, the bash port of the guardrails and read-only rules it runs), `scripts/` (render and
test), and `hooks/` (the
Claude Code hooks module `register.tsx` for the routing, the panes, the run hooks and the guards;
`run.ts`, the ledger parser it reads the run with; `guard.ts`, the guardrails and read-only rules
it checks each command and path with; their tests; and `sounds/`, the alert sound). The editor
types for the hooks module appear in `.claude-plugin/types/` the first time a session loads the
folder with `--plugin-dir`. That folder is git-ignored.

## License

[MIT](LICENSE)
