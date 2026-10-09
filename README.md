# amp

**amp** is a Claude Code plugin for building software in phases: you answer one requirements
interview, then Claude works on its own to a merged pull request. It writes the spec and the plan,
has subagents build each task with its own review, then opens the PR, waits for CI and merges. You
choose which model runs each kind of task.

```
/amp:phase  →  grill (your one approval)  →  branch  →  spec  →  plan
            →  build: per task, implementer → reviewer → capped fix loop → checker
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
- [Project configuration](#project-configuration)
- [What runs where](#what-runs-where)
- [Updating and removing](#updating-and-removing)
- [Developing the plugin](#developing-the-plugin)

## Requirements

- **Claude Code.** Tested on 2.1.295. The model routing and the settings pane use Claude Code's
  function-hook plugins (early access). On a build without them the skills and agents still work,
  and each agent runs on the default model in its definition (see the defaults below).
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
| **Reviewer** | spec, plan and roadmap reviews; every task review; the final whole-branch review (`amp:reviewer`) | `opus` |
| **Implementer** | each plan task, fix rounds 1–3, final-review fixes and CI fixes (`amp:implementer`) | `opus` |
| **Checker** | the scoped re-review after each fix round (`amp:checker`) | `sonnet` |
| **Scout** | fact-finding during the grill, design and roadmap (`amp:scout`) | `sonnet` |
| **Escalation** | a fresh implementer for fix rounds 4–5, and a retry of a BLOCKED task | `inherit` |
| **Fallback** | where a dispatch goes when its model is unavailable (rate or usage limit, overload) | `sonnet` |

The **orchestrator** runs the grill, spec, plan, rulings and shipping. It is your session itself,
so it runs on whatever `/model` you choose. Put your strongest model there.

You can change the settings in three places:

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
- `.claude/settings.json`: the session model and high effort.

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
   the default branch, then writes the spec and the plan (each reviewed independently). It builds
   the plan task by task, with one atomic commit and one review per task, then runs a final review.
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
| `/amp:lean` | apply the economy doctrine: the laziness ladder, the never-cut list, lean review tags |

### Resuming

Each run keeps its working files in `.amp/<NN>-<slug>/` at the repository root: decisions, the
ledger (`progress.md`), task briefs, reports, review packages and CI logs. The folder ignores itself,
so nothing in it reaches git. If a session ends or its context is compacted, run `/amp:phase` again
with the same phase. It resumes from the ledger and `git log`. amp deletes the folder after the
merge, leaving the PR as the record.

## Project configuration

Settings for one project go in its `CLAUDE.md`, under a `## amp configuration` heading, as a
key → value table. Every key is optional:

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

| Piece | Kind | Role |
|---|---|---|
| `amp:phase` | skill | entry point: intake, preflight, grill, branch, the autonomy contract |
| `amp:grill` · `amp:design` · `amp:plan` · `amp:build` · `amp:ship` | skills | the pipeline's stages |
| `amp:roadmap` | skill | a new project's roadmap, phase prompts and `CLAUDE.md` |
| `amp:lean` · `amp:debug` | skills | the economy doctrine and the root-cause discipline that every stage applies |
| `amp:implementer` | agent | one task, test first, one atomic commit, a report file, a short status reply |
| `amp:reviewer` | agent | read-only reviews of tasks, the whole branch and documents, citing `file:line` for every finding |
| `amp:checker` | agent | read-only check of each fix round: addressed or not, plus any new breakage |
| `amp:scout` | agent | answers one factual question from primary sources, with citations |
| `/amp-models` | command + pane | the model settings |

The bundled scripts in `skills/build/scripts/` handle the run's bookkeeping. `amp-workspace`
creates the `.amp/<key>/` folder. `task-brief` extracts one task from the plan. `review-package`
writes a commit range as one diff file for a reviewer.

## Updating and removing

```
/plugin marketplace update amp
/plugin update amp@amp
/plugin uninstall amp@amp
```

Run `/reload-plugins` (or restart) after an update.

## Developing the plugin

```
claude plugin validate --strict .     # manifest, marketplace and hooks module
claude plugin test .                  # hooks/*.test.ts against the engine
claude --plugin-dir .                 # a session with this working copy loaded
```

Layout: `.claude-plugin/` (manifest, marketplace), `skills/`, `agents/`, and `hooks/` (the routing
and pane module `register.tsx`, plus its tests). The editor types for the hooks module appear in
`.claude-plugin/types/` the first time a session loads the folder with `--plugin-dir`. That folder
is git-ignored.

## License

[MIT](LICENSE)
