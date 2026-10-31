---
name: ship
description: The amp landing stage. Final docs sweep, project close-out (roadmap status, version, changelog), full verification with observed output, push, a proper GitHub PR (title + structured body with evidence, autonomous rulings and merge danger) via gh, CI watch with a capped fix loop, merge into the default branch after green checks, tag when the project says so, sync local and clean up. Pre-authorized in an amp run, so no approval is asked. Run by amp:phase after amp:build; use directly to land an already-built branch.
effort: high
---

# amp:ship

Everything here is **pre-authorized** by the grill confirmation: push the phase branch, open the
PR, re-run CI, merge after green, tag per project config, and delete the merged branch. Stop only
for the reasons in amp:phase's autonomy contract.

<!-- codex -->
`<skills>` is the folder that holds this skill's folder (the parent of this SKILL.md's directory); use its absolute path.

Every `amp-implementer` dispatch below is a `spawn_agent` call with `agent_type: "amp-implementer"`, as amp:phase, Model routing says.

<!-- /codex -->
`D` = default branch: `gh repo view --json defaultBranchRef -q .defaultBranchRef.name`, falling
back to `git symbolic-ref --short refs/remotes/origin/HEAD` without its `origin/` prefix.

## 1. Docs sweep and close-out (orchestrator bookkeeping; no product code)

- Check the spec's **Docs impact** list against the branch: each named doc was updated, and nothing
  else the branch made stale remains (README, {{claude: CLAUDE.md}}{{codex: AGENTS.md (else CLAUDE.md)}}, roadmap, user docs, project skills,
  `.env.example`, CLI help). If a gap needs product knowledge, dispatch one `amp:implementer`.
  Pure bookkeeping you may edit yourself.
- Run the project's **close-out** from its amp configuration, e.g. roadmap status row → Complete
  with date and a one-line outcome, carry-forward/parked items written into the later phase prompts
  they address, version bump in the one place the project keeps it, changelog entry.
- Commit: `chore(<NN>): close out phase <NN> — <slug>` (docs-only changes: `docs(<NN>): …`).

## 2. Verify, and observe it

Run the project's verify command/skill (amp configuration; otherwise the repo's documented test,
lint, typecheck and build commands). **Read the output.** Never claim a pass you didn't observe.
Red → `amp:implementer` fix with the log path, commit, re-verify (max 3 rounds, then stop and
report).

## 3. Push and open the PR

- Preconditions: a remote exists and `gh auth status` succeeds. Otherwise **stop**: ask the user to
  run `! gh auth login`, or to confirm the repo to create.
- `git fetch origin && git merge origin/$D` if D moved. Merge, never rebase (commits are already
  reviewed). Resolve conflicts through an `amp:implementer` when code is involved, then re-verify.
- `git push -u origin <branch>`.
- **Title** (≤ 72 chars): `<type>(<NN>): <imperative outcome>`, where type is the branch prefix
  (`framework`, `feature`, `bugfix`, `hotfix`). Example: `feature(04): add aquarium profiles with
  SQLite persistence`.
- **Body:** write `$WS/pr-body.md` from `${CLAUDE_SKILL_DIR}/pr-template.md`, filled from
  the spec, the ledger and the verify output. Then
  `gh pr create --base $D --head <branch> --title "<title>" --body-file $WS/pr-body.md`. Append
  the harness-required attribution line if the session defines one.

## 4. CI

- `gh pr checks <pr> --watch --fail-fast --interval 30`. Run it in the background (or with a long
  timeout) and wait for completion rather than polling in short loops. "No checks reported" after
  about 60 s means the repo has no CI for PRs, so go to step 5.
- **Failure:** save logs with
  `gh run view <run-id> --log-failed > $WS/ci-<k>.log` and classify them.
  - Caused by the branch: dispatch `amp:implementer` (CI variant in `${CLAUDE_PLUGIN_ROOT}/skills/build/prompts/implement.md`)
    with the log path, push, re-watch.
  - Infra flake (runner lost, network, cache service): `gh run rerun <run-id> --failed` once.
  - Cap: 3 fix rounds. Then **stop** and report the failing check, the log path and what was tried.
- Checks the project documents as manual or non-blocking don't gate the merge. Say so in the PR
  body.

## 5. Merge

- `gh pr merge <pr> --merge --delete-branch`. The default is a merge commit, which keeps the atomic
  task commits. Use `--squash` or `--rebase` only if the project configuration says so.
- Blocked by required human review, or other protection the agent can't satisfy → **stop**, say
  exactly what's needed, and give the PR URL.
- If D moved and the PR is behind, merge D in (step 3), re-verify, push, re-watch, and merge.

## 6. After the merge

1. `git switch $D && git pull --ff-only`, and `git branch -d <branch>` if it still exists.
2. **Tag** if the project config says so for this phase (e.g. a milestone boundary): an annotated
   tag on the merge commit, `git tag -a vX.Y.Z <merge-sha> -m "<phase/milestone>" && git push
   origin vX.Y.Z`.
3. Collect every `Ruling:` line from the ledger. Then delete the workspace (`rm -rf $WS`); git and
   the PR are the record now.
4. Final report to the user, outcome first: the merged PR URL and merge commit, what was built (2–4
   sentences), verification evidence, "Rulings I made" (every ledger ruling with its cost-if-wrong),
   parked and follow-up items with where they were written, and the next phase to run.
