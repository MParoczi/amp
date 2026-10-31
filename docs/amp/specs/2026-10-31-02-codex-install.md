# Spec 02: amp for Codex (feature/02-codex-install)

## 1. Goal

The request: "Extend amp so it can be installed for Codex as well. Each environment (Claude Code
and Codex) must be super optimized for its use cases and environment, so the skills and agents
achieve the best result."

After this phase, one repository ships two installs:

- the Claude Code plugin, unchanged in behavior;
- a Codex plugin plus Codex custom agents.

Both are rendered from a single source. The source keeps tool-specific text in per-tool blocks, so
each install reads text written for its own tool. Version 1.2.0.

## 2. Decisions

| # | Decision |
|---|---|
| D1 | **Codex delivery.** Codex installs amp as a plugin: `codex plugin marketplace add MParoczi/amp`, then `/plugins`. Codex reads `.claude-plugin/marketplace.json`. A new `.codex-plugin/plugin.json` makes Codex load `codex/skills` and a Codex-format hooks file. Codex plugins can't bundle agents, so the bundled bash installer `codex/install` writes the four agent TOMLs to `${CODEX_HOME:-~/.codex}/agents`, or to `<repo>/.codex/agents` with `--project`. |
| D2 | **Agent TOMLs.** The renderer generates them from `src/agents/*.md` and they are committed. The installer copies them and applies model pins. |
| D3 | **Models on Codex.** No `model` by default, so agents inherit the session model. `--reviewer/--implementer/--checker/--scout <model>` pins a model. Effort is always `high`. Re-run the installer to change. Ruling (after spec review): pins live in `amp-install.json` beside the TOMLs, which the orchestrator reads and passes on each spawn. They don't go in the TOML, because a role TOML overrides the spawn arguments, and escalation and fallback could not work. |
| D4 | **Config home on Codex.** The `## amp configuration` table lives in `AGENTS.md`, with `CLAUDE.md` as the fallback. Claude Code keeps `CLAUDE.md`. |
| D5 | **Single source with per-tool blocks.** `src/` renders to the Claude Code tree (`skills/`, `agents/`) and the Codex tree (`codex/skills/`, `codex/agents/*.toml`). Both trees are committed, and a drift check fails when they're stale. Each tree gets native wording, tool names, and its own model and effort mechanics. `/amp-models` and the routing hook stay Claude-only. |
| D6 | Version 1.2.0 in both manifests, plus a CHANGELOG entry. |
| D7 | **Verification.** `scripts/test` covers the renderer cases, the drift check and the installer (run in a temp `CODEX_HOME`). `claude plugin validate --strict .` and `claude plugin test .` must still pass. No Codex binary is assumed. |

Facts behind D1–D5 are in the scout findings (Codex docs and openai/codex source, rust-v0.166.0):

- Codex manifest discovery order is root `plugin.json` → `.codex-plugin/plugin.json` →
  `.claude-plugin/plugin.json`.
- Manifest fields include `skills` and `hooks`. There is no `agents` field.
- A plugin's `hooks/hooks.json` is loaded by default unless the manifest sets `hooks`, and it is
  parsed strictly as `{description?, hooks}`.
- Plugin skills are namespaced `amp:<name>`. Only the `name` and `description` frontmatter fields
  are read.
- Relative paths in a skill resolve against its SKILL.md directory.
- Agent TOML fields are `name`, `description`, `developer_instructions`, `model` and
  `model_reasoning_effort`.
- Subagent tools are `spawn_agent` (`agent_type`, `model`, `reasoning_effort`, and in v2 also
  `task_name` and `fork_turns`) and `wait_agent`. v1 adds `send_input` and `close_agent`; v2 adds
  `followup_task` and `send_message`.
- The question tool is `request_user_input`: 1–3 questions, 2–3 options each, an automatic "Other"
  option. It is available in Plan mode only by default.
- `AGENTS.md` is read natively. `CLAUDE.md` is not.
- Effort levels are `low … max`.

## 3. Architecture

```
src/skills/<name>/…  ─┐                      ┌─► skills/<name>/…            (Claude Code plugin, default path)
src/agents/<n>.md    ─┼─ scripts/render ─────┼─► agents/<n>.md              (Claude Code agents)
                      │   (bash + awk)        ├─► codex/skills/<name>/…      (Codex plugin, via .codex-plugin)
                      │                      └─► codex/agents/amp-<n>.toml  (copied by codex/install)
                      └─ scripts/render --check  → exit 1 + stale list when outputs differ
```

Rendered trees are build outputs and are never edited by hand. The README's "Developing the plugin"
section says so. The hooks module, `.claude-plugin/`, and the Claude Code paths are unchanged.

## 4. Components

| Component | Verdict | Responsibility |
|---|---|---|
| `skills/**`, `agents/*.md` sources | **extend** (move to `src/` with `git mv`, then add per-tool blocks) | single source of truth |
| `scripts/render` | **new**, because no build step exists and neither tool can conditionally include text | render both trees, `--check` for drift |
| `codex/install` | **new**, because Codex plugins can't ship agents | copy the agent TOMLs, apply model pins, support `--project` and `--uninstall` |
| `.codex-plugin/plugin.json` | **new**, because Codex needs its own `skills` and `hooks` paths. `.claude-plugin/plugin.json` stays for Claude Code. | the Codex manifest |
| `scripts/test` | **new**, because the bash tooling has no test harness (`claude plugin test` runs only `hooks/*.test.ts`) | renderer and installer tests |
| `hooks/register.tsx`, `.claude-plugin/*` | **reuse** unchanged (version bump only) | Claude Code routing and pane |
| `skills/build/scripts/*` | **reuse**: copied verbatim into both trees | workspace, brief and review package |
| `skills/roadmap/templates/CLAUDE.md`, `settings.json` | **extend**: become `CLAUDE.claude.md`, `settings.claude.json`, plus new `AGENTS.codex.md`, `config.codex.toml` | each tool's project files |

**Deletions:** none. The moved sources keep their history through `git mv`, and the rendered
outputs reappear at the old Claude paths. A grep of `skills agents hooks .claude-plugin README.md`
found no unreferenced code in the touched modules.

## 5. Interfaces

### 5.1 Source markup (rendered by `scripts/render`)

Markup is processed in `.md` files only. Every other file is copied byte for byte, and the
executable bit is preserved.

- **Line blocks.** A line consisting exactly of `<!-- claude -->` or `<!-- codex -->` opens a block.
  The matching `<!-- /claude -->` or `<!-- /codex -->` closes it. The block's lines are kept only
  in that target, and the marker lines are always dropped. Blocks don't nest.
- **Inline spans.** `{{claude: TEXT}}` and `{{codex: TEXT}}`, where TEXT can't contain `}}`.
  The wrapper and the single space after the colon are removed. TEXT is kept only in its target.
- **Per-tool files.** `NAME.claude.EXT` goes only to the Claude tree and `NAME.codex.EXT` only to
  the Codex tree. Both are renamed to `NAME.EXT`, and markup is still processed when EXT is `md`.
- Spans and blocks also work inside frontmatter values, for example agent descriptions that name
  `/amp-models`.
- **Codex automatic rewrites.** These apply only in the Codex tree, to `.md` files after the block
  rules:
  - `amp:implementer|reviewer|checker|scout` → `amp-implementer|…`, the Codex agent names. Skill
    names (`amp:phase`, …) are unchanged because Codex namespaces plugin skills the same way.
  - `${CLAUDE_PLUGIN_ROOT}/skills/` → `<skills>/`. Every Codex skill that uses `<skills>` defines
    it in a codex block: "`<skills>` is the folder that holds this skill's folder (the parent of
    this SKILL.md's directory); use its absolute path."
  - `/amp:` → `$amp:`, because Codex invokes skills with `$name`. This is a ruling from the plan
    review.
  - `${CLAUDE_SKILL_DIR}/` becomes empty, leaving a path relative to the SKILL.md directory,
    which Codex resolves.
  - Skill frontmatter is reduced to `name` and `description`, the only fields Codex parses.
- **Errors.** These make the renderer print `render: <file>:<line>: <reason>` to stderr and exit 1
  without writing anything:
  - an unclosed block, a stray closer, or a nested opener;
  - an unterminated `{{claude:` or `{{codex:` span;
  - an agent body containing `'''`.

`scripts/render [--check]`, run from anywhere:

- It resolves the repo root from its own path and renders into a temp directory.
- Without `--check`, it replaces `skills/`, `agents/`, `codex/skills/` and `codex/agents/` with the
  temp output, exits 0, and prints `rendered: <n> files`.
- With `--check`, it diffs the temp output against the trees in the working tree (not HEAD). On a match it prints
  `render: up to date` and exits 0. Otherwise it prints `render: stale: <path>` per differing,
  missing or extra file and exits 1.

### 5.2 Agent TOML (`codex/agents/amp-<name>.toml`)

```toml
# Generated by scripts/render from src/agents/<name>.md. Do not edit.
name = "amp-<name>"
description = "<rendered codex description, TOML basic-string escaped: \ and ">"
developer_instructions = '''
<rendered codex body, frontmatter removed>
'''
```

The TOML deliberately has no `model` and no `model_reasoning_effort`. Codex applies a role's TOML
after the spawn arguments (`child_config.rs:63-75`, `role.rs:184-192`), so either key would
override the orchestrator's per-spawn `model` and `reasoning_effort`, and escalation and fallback
would stop working.

The Claude Code `agents/<name>.md` keeps its frontmatter (`name`, `description`, `model`, `effort`,
`color`) from the source, with the codex blocks stripped.

### 5.3 `codex/install`

```
bash codex/install [--project] [--reviewer M] [--implementer M] [--checker M] [--scout M]
bash codex/install [--project] --uninstall
```

- **Target directory.** The default is `${CODEX_HOME:-$HOME/.codex}/agents`. With `--project`,
  it's `$(git rev-parse --show-toplevel)/.codex/agents`, and outside a git repository that fails
  with a message and exit 1. The directory is created if missing.
- **Install.** Each `amp-*.toml` from `codex/agents/` beside the script is copied to the target,
  overwriting earlier amp files. The installer then writes `amp-install.json` there:
  `{"version": "<.codex-plugin version>", "models": {"reviewer": "M"|null, "implementer": …, "checker": …, "scout": …}}`
  (null = inherit). Codex loads only `*.toml` as roles, so the JSON is inert to Codex. M must
  match `^[A-Za-z0-9._:/-]+$`. Otherwise the installer prints `install: invalid model 'M'` and
  exits 2 before writing anything.
- **Output.** One line per file written, `installed: <path> (model: M|inherit)`, then a reminder to
  start a new Codex session.
- **`--uninstall`.** Removes only the four `amp-<role>.toml` files and `amp-install.json` from the target, printing
  `removed: <path>` for each, or `not installed: <dir>` when none existed. Exits 0.
- An unknown flag or a missing value prints usage and exits 2.

### 5.4 `.codex-plugin/plugin.json`

It has `name: "amp"`, the same `version`, `description`, `keywords`, `homepage` and `repository`
as `.claude-plugin/plugin.json`, plus:

- `"skills": "./codex/skills"`
- `"hooks": {}`: an inline empty hooks object, which suppresses Codex's default
  `hooks/hooks.json` load (`manifest.rs:151-156,423-427`)
- `interface` with `displayName "amp"`, a `shortDescription`, `developerName` and `category`.

### 5.5 Per-tool content of the source

The rule: in each tree, the model reads only that tool's mechanics. The shared doctrine stays
common.

- **phase**
  - *Claude:* the current text.
  - *Codex:*
    - **Agents.** Each role is spawned with `spawn_agent` and `agent_type: "amp-<role>"`. Every
      spawn passes `reasoning_effort: "high"`, and passes `model` only when `amp-install.json`
      pins that role.
    - **Multi-agent v1 and v2.** The text covers both versions:
      - **v2 spawns.** v2 requires `task_name`, so use `<role>-<task id>`. Every v2 spawn also
        passes `fork_turns: "none"`. The default forks the orchestrator's whole history, which
        breaks reviewer independence and multiplies context cost. The brief is the agent's only
        context.
      - **Collecting results.**
        - In v1, `wait_agent` returns the agent's result.
        - In v2, `wait_agent` only reports that a wait finished, and each agent's status contract
          arrives as a message. Call `wait_agent` again until every spawned agent's message has
          arrived. A timeout means wait again.
      - **Resuming.** A live implementer is resumed for fix rounds 1–3, or after `NEEDS_CONTEXT`,
        with `send_input` (v1) or `followup_task` (v2). Never spawn it again.
      - **Closing.** Where `close_agent` exists, close each reviewer, checker and scout as soon as
        its result is read. Close the implementer when its task's fix loop ends, or before a
        round-4 fresh dispatch. v1 caps open agents at 6.
      - Independent agents are spawned before waiting on any of them.
    - **Escalation.** Spawn a fresh `amp-implementer` with `reasoning_effort: "xhigh"`, keeping
      any pinned `model`. Ledger it.
    - **Fallback.** On a model-unavailable error, re-spawn without `model`, so the agent runs on the
      session model. If the failed spawn already had no `model`, wait briefly, retry once, then
      stop and tell the user. Ledger it.
    - **Preflight.**
      - Look for `amp-install.json` in `<repo>/.codex/agents`, then in
        `${CODEX_HOME:-~/.codex}/agents`.
      - If it's missing, stop. Tell the user to run `bash <skills>/../install` (optionally with
        `--project`) and start a new session.
      - If its `version` differs from the plugin's (`<skills>/../../.codex-plugin/plugin.json`),
        stop and tell the user to re-run the installer, because the agents are stale.
    - **Config.** The configuration table comes from `AGENTS.md`, else `CLAUDE.md`. There's no
      PushNotification. The session model limit is changed with `/model`.
    - **Settings.** The model routing table names the installer flags and `amp-install.json`, not
      `/amp-models`, `/config` or `${user_config.*}`.
- **grill**
  - *Claude:* AskUserQuestion, up to 4 questions.
  - *Codex:* `request_user_input` with up to 3 questions and 2–3 options each, the recommended
    option first and labelled "(Recommended)", and "Other" added automatically. When the tool is
    unavailable (Default mode), use the numbered text format. Never ask the user to switch modes. Facts come from `amp-scout`.
- **build, design, plan, ship, roadmap:** every dispatch line uses the tool's mechanism, every
  script path uses `${CLAUDE_PLUGIN_ROOT}` or `<skills>` with the definition block, and config
  file names are `CLAUDE.md` or `AGENTS.md (else CLAUDE.md)`. The `roadmap` Codex text:
  - It writes `AGENTS.md` from `templates/AGENTS.md`, keeping it under Codex's 32 KiB AGENTS.md
    cap.
  - It writes `.codex/config.toml` from `templates/config.toml`, with `model = "<session model>"`
    and `model_reasoning_effort = "high"`.
  - It tells the user to run the agent installer, optionally with `--project`, so collaborators
    get the agents.
- **build prompts** (`document-review.md`, `final-review.md`): `CLAUDE.md` mentions become a span
  naming `AGENTS.md` / `CLAUDE.md` on Codex.
- **agents**
  - *Claude:* the current text.
  - *Codex:*
    - **Skills.** Skills are loaded by opening the named skill's SKILL.md (amp's are under the amp
      plugin, `amp:lean` etc.) instead of "via the Skill tool".
    - **Library docs.** Use "Context7 MCP when configured, else official docs".
    - **Return.** The final message is the short status contract that `wait_agent` returns.
    - **Writes.** The reviewer, checker and scout stay read-only on the repository. They write only
      their report or findings file in the workspace.
- **lean:** shared except the "right-size the model" line, which names each tool's mechanism.

## 6. States and errors

- **Render.** A malformed source fails loudly with file and line, and leaves both trees untouched,
  because the render goes to a temp directory and is swapped in only on success. A stale committed
  tree fails `--check` and lists the paths.
- **Installer.**
  - An invalid model or unknown flag exits 2 with nothing written.
  - `--project` outside a git repository exits 1.
  - A missing `codex/agents/` beside the script (corrupt checkout) gives
    `install: no agent files in <dir>` and exit 1.
  - It never deletes files it didn't write: uninstall touches only the four known names.
- **Codex session without agents.** The phase preflight stops with the install instruction. It
  never falls back silently to built-in roles.
- **Codex in Default mode.** Without `request_user_input`, the grill asks in numbered text.
- **Claude Code.** Behavior is identical to 1.1.0.

## 7. Testing strategy

`scripts/test` is bash. It runs from anywhere, prints one line per case and exits non-zero on the
first failure. Cases:

1. **Renderer fixtures** in a temp `src/`:
   - line blocks per target;
   - inline spans;
   - `.claude.md` and `.codex.toml` file variants;
   - agent id, `${CLAUDE_PLUGIN_ROOT}/skills/` and `${CLAUDE_SKILL_DIR}/` rewrites (Codex only);
   - Codex frontmatter reduced to `name` and `description`;
   - a script copied byte-identical and still executable;
   - each error class exits 1 and writes nothing.

   The renderer takes `AMP_RENDER_ROOT` as an override of the repo root, so it can run on
   fixtures. That is its only test seam.
2. **Drift:** `scripts/render --check` exits 0 on the committed repo.
3. **Agent TOML:** each generated file has `name = "amp-<n>"` and
   no `model` or `model_reasoning_effort` line, and has a `developer_instructions`
   literal block that is closed.
4. **Installer**, in a temp `CODEX_HOME`:
   - the default install writes 4 TOMLs plus `amp-install.json` with all models null, and the
     right `version`;
   - `--reviewer gpt-x` pins only the reviewer in `amp-install.json`;
   - an invalid model exits 2 with nothing written;
   - `--project` in a temp git repository writes `.codex/agents`;
   - `--uninstall` removes the 5 files, and a second run reports `not installed`.
5. **Versions:** `.claude-plugin/plugin.json` and `.codex-plugin/plugin.json` have the same
   `version`.
6. **Leaks:** `codex/` contains none of `AskUserQuestion`, `Skill tool`, `/amp-models`,
   `CLAUDE_PLUGIN_ROOT`, `CLAUDE_SKILL_DIR`, `user_config`, `SendMessage`, `PushNotification`, `{{`, `<!-- claude`, `<!-- codex`. `skills/` and
   `agents/` contain none of `spawn_agent`, `request_user_input`, `wait_agent`, `{{`,
   `<!-- claude`, `<!-- codex`.

**Claude Code regression:** after the move to `src/` and before any per-tool block is added, the
rendered `skills/` and `agents/` must be byte-identical to 1.1.0 (`git diff --exit-code`). Then
`claude plugin validate --strict .` and `claude plugin test .` must pass.

**Verify command:** `bash scripts/test && claude plugin validate --strict . && claude plugin test .`

## 8. Docs impact

- **README**
  - Retitle and intro to "for Claude Code and Codex".
  - Requirements: Codex CLI or app. The IDE extension has no plugins.
  - A new "Install for Codex" section: marketplace add, `/plugins`, `bash
    ~/.codex/plugins/cache/<marketplace>/amp/<version>/codex/install [flags]` (or from a clone), and
    `--project`.
  - "Choosing the models" gets a Codex subsection: installer flags, `amp-install.json`,
    escalation = `xhigh` effort, fallback = the session model. Re-run the installer after every
    plugin upgrade.
  - Project configuration: `AGENTS.md` on Codex.
  - Updating and removing for Codex: marketplace upgrade, re-run the installer, `--uninstall`.
  - "Developing the plugin": edit `src/`, run `scripts/render`, `scripts/test`; the rendered trees
    are outputs.
  - The "What runs where" table gets the Codex names.
- **CHANGELOG:** a 1.2.0 entry.
- **Manifests:** version 1.2.0. Descriptions mention Codex.
- No CLAUDE.md, roadmap or ADR exists in this repo.

## 9. Review Focus

1. **Windows Git Bash.** On CRLF checkouts or paths with spaces, the renderer and the installer
   must behave the same as on Linux (`.gitattributes` is respected, paths are quoted), and `--check`
   must not report false drift from line endings.
2. **TOML validity.** A description with `"` or `\`, or a body with a backslash or a non-ASCII
   character, must produce TOML that a strict parser accepts. A literal `'''` must be rejected.
3. **Leaks between trees.** No Claude-only tool name (AskUserQuestion, Skill tool, /amp-models,
   CLAUDE_PLUGIN_ROOT, PushNotification) may appear in `codex/`, and no Codex-only name
   (spawn_agent, request_user_input, AGENTS.md as the primary config) may appear in `skills/` or
   `agents/`. `scripts/test` greps for both.
4. **Codex hook override.** `"hooks": {}` must keep Codex from parsing `hooks/hooks.json`. This
   is confirmed in source, but not end to end.
5. **Stale agents after a plugin upgrade.** The preflight's version check must stop the run with
   the re-install instruction. A run must never proceed silently with old agent instructions.

## 10. Out of scope

- A Codex models pane or any hook-based routing on Codex.
- The Codex IDE extension.
- Codex model defaults per role.
- CI workflows (the repo has none).
- An end-to-end run against a real Codex binary (none available here).

**Refactor opportunities:** none found.
