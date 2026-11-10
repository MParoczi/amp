import { describe, expect, test } from 'claude-code/testing'

import { guardViolation, insideRoot, readOnlyViolation, roleOf, splitCommands, type GuardCtx, type ReadOnlyCall } from './guard'

const FEATURE: GuardCtx = { branch: 'feature/04-x', defaultBranch: 'main' }
const ON_MAIN: GuardCtx = { branch: 'main', defaultBranch: 'main' }
const UNKNOWN: GuardCtx = { defaultBranch: 'main' }

/** Each §5.4 rule: denied commands (with the context they're denied in) and allowed ones. */
const RULES: [rule: string, denied: [string, GuardCtx][], allowed: [string, GuardCtx][]][] = [
  ['hooks skipped',
    [['git commit -m "x" -n', FEATURE], ['git commit --no-verify -m x', FEATURE], ['git commit -nm x', FEATURE]],
    [['git commit -am "x"', FEATURE], ['git commit -m -n', FEATURE], ['git commit -mnote', FEATURE]]],
  ['signing skipped',
    [['git commit --no-gpg-sign -m x', FEATURE], ['git -c commit.gpgsign=false commit -m x', FEATURE]],
    [['git commit -m "x"', FEATURE], ['git -c user.name=x commit -m x', FEATURE]]],
  ['force push',
    [['git push -f', FEATURE], ['git push --force origin x', FEATURE], ['git push --force-with-lease origin x', FEATURE],
      ['git push --force-with-lease=x:abc origin x', FEATURE], ['git push --force-if-includes origin x', FEATURE],
      ['git push --mirror origin', FEATURE], ['git push --delete origin x', FEATURE], ['git push -d origin x', FEATURE],
      ['git push origin +x', FEATURE], ['git push origin :x', FEATURE]],
    [['git push -u origin feature/04-x', FEATURE], ['git push -o ci.skip origin feature/04-x', FEATURE]]],
  ['push to default',
    [['git push origin main', FEATURE], ['git push origin HEAD:main', FEATURE], ['git push', ON_MAIN], ['git push origin', ON_MAIN]],
    [['git push origin v1.4.0', ON_MAIN], ['git push', FEATURE], ['git push', UNKNOWN]]],
  ['hard reset',
    [['git reset --hard', FEATURE], ['git reset --hard HEAD~1', UNKNOWN], ['git -C ../x reset --hard', FEATURE]],
    [['git reset --soft HEAD~1', FEATURE]]],
  ['commit on default',
    [['git commit -m x', ON_MAIN]],
    [['git commit -m x', FEATURE], ['git commit -m x', UNKNOWN]]],
  ['discard work',
    [['git stash', FEATURE], ['git stash pop', FEATURE], ['git stash -u', FEATURE], ['git checkout -- a.ts', FEATURE],
      ['git checkout -f x', FEATURE], ['git checkout --force x', FEATURE], ['git restore a.ts', FEATURE],
      ['git restore --staged --worktree a.ts', FEATURE], ['git restore --staged -W a.ts', FEATURE], ['git restore -S -W a.ts', FEATURE],
      ['git clean -fd', FEATURE], ['git clean -xf', FEATURE], ['git clean --force', FEATURE]],
    [['git stash list', FEATURE], ['git stash show', FEATURE], ['git restore --staged a.ts', FEATURE], ['git restore -S a.ts', FEATURE],
      ['git checkout feature/x', FEATURE], ['git clean -n', FEATURE]]],
  ['admin merge',
    [['gh pr merge 5 --admin', FEATURE], ['gh pr merge 5 --merge --admin', FEATURE]],
    [['gh pr merge 5 --merge --delete-branch', FEATURE]]],
]

describe('amp guardrails', () => {
  for (const [rule, denied, allowed] of RULES) {
    test(`${rule}: denied and allowed`, () => {
      for (const [command, ctx] of denied) expect([command, guardViolation(command, ctx)]).toEqual([command, expect.stringContaining(`amp guard: ${rule} is blocked`)])
      for (const [command, ctx] of allowed) expect([command, guardViolation(command, ctx)]).toEqual([command, undefined])
    })
  }

  test('the deny text names the rule, the segment and what to do instead', () => {
    expect(guardViolation('ls && git reset --hard HEAD', FEATURE))
      .toBe('amp guard: hard reset is blocked during an amp run (git reset --hard HEAD). never discard work; revert or fix forward')
    expect(guardViolation('gh pr merge 5 --admin', FEATURE)).toMatch(/\. stop and ask the user$/)
  })

  test('the splitter fixtures', () => {
    expect(guardViolation('git commit -m "fix; git push -f"', FEATURE)).toBeUndefined()
    expect(guardViolation('git commit -m "x" && git push -f', FEATURE)).toContain('amp guard: force push')
    expect(guardViolation('git commit -mnote', FEATURE)).toBeUndefined()
    expect(guardViolation("git commit -F - <<'EOF'\ngit push --force is now blocked\nEOF", FEATURE)).toBeUndefined()
    expect(guardViolation(`git commit -m "$(cat <<'EOF'\ndon't git reset --hard\nEOF\n)"`, FEATURE)).toBeUndefined()
  })

  test('splitCommands: separators outside quotes, quotes removed, heredoc bodies dropped', () => {
    expect(splitCommands('a "b; c" && d\'e | f\' || g; h | i\nj')).toEqual([['a', 'b; c'], ["de | f"], ['g'], ['h'], ['i'], ['j']])
    expect(splitCommands('echo "say \\"hi\\" \\\\" && git push -f')).toEqual([['echo', 'say "hi" \\'], ['git', 'push', '-f']])
    expect(splitCommands('x -m "it\'s"; y ""')).toEqual([['x', '-m', "it's"], ['y', '']])
    expect(splitCommands("cat <<-EOF > f\n\tgit push -f\n\tEOF\ngit status")).toEqual([['cat', '<<-EOF', '>', 'f'], ['git', 'status']])
    expect(splitCommands('cat <<A <<"B"\na body\nA\nb body\nB\nnext')).toEqual([['cat', '<<A', '<<B'], ['next']])
    expect(splitCommands('cat <<< "x; y"; z')).toEqual([['cat', '<<<', 'x; y'], ['z']])
  })

  test("amp's own pre-authorized commands pass (Review Focus 2)", () => {
    expect(guardViolation('git push origin v1.4.0', ON_MAIN)).toBeUndefined()
    expect(guardViolation('git tag -a v1.4.0 abc123 -m "phase 04" && git push origin v1.4.0', ON_MAIN)).toBeUndefined()
    expect(guardViolation('git worktree remove --force .amp/x/wt-2', FEATURE)).toBeUndefined()
    expect(guardViolation('git branch -D amp-wt-2', FEATURE)).toBeUndefined()
    expect(guardViolation('git branch -d feature/04-x', ON_MAIN)).toBeUndefined()
    expect(guardViolation('gh pr merge 5 --merge --delete-branch', FEATURE)).toBeUndefined()
    expect(guardViolation('git push -u origin feature/04-x', FEATURE)).toBeUndefined()
    expect(guardViolation('git switch main && git pull --ff-only', ON_MAIN)).toBeUndefined()
    expect(guardViolation('git push \\\n  origin v1.4.0', ON_MAIN)).toBeUndefined()
  })

  test('a backslash-newline continues the line, outside single quotes', () => {
    expect(guardViolation('git commit -m x \\\n  -n', FEATURE)).toContain('amp guard: hooks skipped')
    expect(guardViolation('git commit -m x \\\r\n  -n', FEATURE)).toContain('amp guard: hooks skipped')
    expect(splitCommands('a "b\\\nc" \\\nd')).toEqual([['a', 'bc', 'd']])
    expect(splitCommands("a 'b\\\nc'")).toEqual([['a', 'b\\\nc']])
  })

  test('a PowerShell here-string is one literal word', () => {
    const message = "The guard doesn't deny.\nTests pass; git push -f is now blocked"
    expect(guardViolation(`git commit -m @'\n${message}\n'@`, FEATURE)).toBeUndefined()
    expect(splitCommands(`git commit -m @'\r\n${message}\r\n'@; git status`)).toEqual([['git', 'commit', '-m', message], ['git', 'status']])
    expect(splitCommands('x @"\na "b"; c\n"@ && y')).toEqual([['x', 'a "b"; c'], ['y']])
  })
})

const ROOT = '/repo'
const bash = (command: string): ReadOnlyCall => ({ tool: 'Bash', command, cwd: ROOT })
const DENY_ALL = ['commit', 'push', 'merge', 'rebase', 'reset', 'checkout', 'switch', 'stash', 'add', 'rm', 'mv', 'cherry-pick', 'revert', 'am', 'restore', 'clean', 'pull']

/** Each §5.5 row: denied and allowed git commands. */
const ROWS: [row: string, denied: string[], allowed: string[]][] = [
  ['any form', DENY_ALL.map(sub => `git ${sub} x`).concat(DENY_ALL.map(sub => `git ${sub}`)), ['git status', 'git log --oneline', 'git diff main...HEAD', 'git show HEAD:a.ts']],
  ['tag',
    ['git tag v1', 'git tag -a v1 -m x', 'git tag -s v1', 'git tag -u key v1', 'git tag -d v1', 'git tag -f v1', 'git tag -mnote v1',
      'git tag -F f v1', 'git tag --annotate v1', 'git tag --sign v1', 'git tag --delete v1', 'git tag --force v1'],
    ['git tag', "git tag -l 'v1.*'", "git tag -ln 'v1*'", 'git tag --list v1', 'git tag --sort=-v:refname', 'git tag --contains HEAD']],
  ['notes',
    ['git notes add -m x', 'git notes edit', 'git notes remove', 'git notes copy a b', 'git notes append -m x', 'git notes merge x', 'git notes prune'],
    ['git notes list', 'git notes show']],
  ['apply', ['git apply x.patch', 'git apply --index x.patch'], ['git apply --check x.patch', 'git apply --stat x.patch', 'git apply --numstat x.patch']],
  ['branch',
    ['git branch -d x', 'git branch -D x', 'git branch -m a b', 'git branch -M a b', 'git branch -c a b', 'git branch -C a b', 'git branch -f x HEAD',
      'git branch --delete x', 'git branch --move a b', 'git branch --copy a b', 'git branch --force x', 'git branch new'],
    ['git branch', 'git branch -a', 'git branch --show-current', 'git branch --contains HEAD', 'git branch --merged main', "git branch --list 'amp-*'", 'git branch -al x']],
  ['worktree add',
    ['git worktree add wt HEAD', 'git worktree add /repo/src/wt HEAD', 'git worktree add ./x', 'git worktree add ../repo/src/wt HEAD', 'git worktree add src/$X'],
    ['git worktree add ../tmp-rev HEAD', 'git worktree add /tmp/rev', 'git worktree add .amp/04-x/wt HEAD', 'git worktree list', 'git worktree remove /repo/x', 'git worktree remove --force wt',
      // a target the shell expands can't be resolved here, so it passes
      'git worktree add "$TMPDIR/rev" HEAD', 'git worktree add "$(mktemp -d)"', 'git worktree add ~/rev', 'git worktree add $env:TEMP\\rev',
      'git worktree add %TEMP%\\rev', 'git worktree add "`mktemp -d`"', 'git worktree add "/x/$(mktemp -u)"']],
]

describe('amp read-only roles', () => {
  for (const [row, denied, allowed] of ROWS) {
    test(`git ${row}: denied and allowed`, () => {
      for (const command of denied) expect([command, readOnlyViolation('reviewer', bash(command), ROOT)]).toEqual([command, expect.stringContaining('amp read-only: reviewer may not')])
      for (const command of allowed) expect([command, readOnlyViolation('reviewer', bash(command), ROOT)]).toEqual([command, undefined])
    })
  }

  test('the deny text names the role, what and the target, without the run suffix', () => {
    const tail = 'Report the finding instead; write only the report file under .amp/ or outside the repo.'
    expect(readOnlyViolation('checker', bash('git status && git commit -m "x y"'), ROOT))
      .toBe(`amp read-only: checker may not run git commit (git commit -m x y). ${tail}`)
    expect(readOnlyViolation('scout', { tool: 'Write', path: '/repo/src/a.ts', cwd: ROOT }, ROOT))
      .toBe(`amp read-only: scout may not edit files in the repository (/repo/src/a.ts). ${tail}`)
  })

  test('PowerShell commands follow the same rules', () => {
    expect(readOnlyViolation('reviewer', { tool: 'PowerShell', command: 'git push', cwd: ROOT }, ROOT)).toContain('may not run git push')
    expect(readOnlyViolation('reviewer', { tool: 'PowerShell', command: 'git log', cwd: ROOT }, ROOT)).toBeUndefined()
  })

  test('Edit, Write and NotebookEdit are denied inside the repo, allowed under .amp/ and outside', () => {
    for (const tool of ['Edit', 'Write', 'NotebookEdit']) {
      expect(readOnlyViolation('reviewer', { tool, path: '/repo/src/a.ts', cwd: ROOT }, ROOT)).toContain('may not edit files in the repository')
      expect(readOnlyViolation('reviewer', { tool, path: 'src/a.ts', cwd: ROOT }, ROOT)).toContain('may not edit')
      expect(readOnlyViolation('reviewer', { tool, path: '/repo/.amp/04-x/r.md', cwd: ROOT }, ROOT)).toBeUndefined()
      expect(readOnlyViolation('reviewer', { tool, path: '/tmp/x.md', cwd: ROOT }, ROOT)).toBeUndefined()
    }
    expect(readOnlyViolation('reviewer', { tool: 'Read', path: '/repo/src/a.ts', cwd: ROOT }, ROOT)).toBeUndefined()
    expect(readOnlyViolation('reviewer', { tool: 'Bash', command: 'npm test > out.txt', cwd: ROOT }, ROOT)).toBeUndefined()
  })

  test('insideRoot: separators, case on a drive root, relative paths and dot segments', () => {
    expect(insideRoot('C:\\Repo\\src\\a.ts', 'c:/x', 'c:/repo')).toBe('repo')
    expect(insideRoot('C:\\Repo\\.amp\\04-x\\r.md', 'c:/x', 'c:/repo')).toBe('amp')
    expect(insideRoot('src/a.ts', ROOT, ROOT)).toBe('repo')
    expect(insideRoot('/tmp/x.md', ROOT, ROOT)).toBe('outside')
    expect(insideRoot('/tmp/x.md', 'c:/repo', 'c:/repo')).toBe('outside')
    expect(insideRoot('../tmp-rev', ROOT, ROOT)).toBe('outside')
    expect(insideRoot('/repo/src/../.amp/x', ROOT, ROOT)).toBe('amp')
    expect(insideRoot('/repo2/a.ts', ROOT, ROOT)).toBe('outside')
    expect(insideRoot('/Repo/a.ts', ROOT, ROOT)).toBe('outside')
    expect(insideRoot('/repo/.amplify/a', ROOT, ROOT)).toBe('repo')
  })

  test('roleOf: the agent type must be the plugin read-only role', () => {
    const agents = [{ id: 'a1', type: 'amp:reviewer' }, { id: 'a2', type: 'amp:implementer' }, { id: 'a3', type: 'other:scout' }, { id: 'a4', type: 'amp:checker' }]
    expect(roleOf(agents, 'a1', 'amp')).toBe('reviewer')
    expect(roleOf(agents, 'a4', 'amp')).toBe('checker')
    expect(roleOf(agents, undefined, 'amp')).toBeUndefined()
    expect(roleOf(agents, 'a2', 'amp')).toBeUndefined()
    expect(roleOf(agents, 'a3', 'amp')).toBeUndefined()
    expect(roleOf(agents, 'zz', 'amp')).toBeUndefined()
  })
})
