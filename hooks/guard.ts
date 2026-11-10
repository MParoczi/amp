/*
 * The amp guardrails (spec §5.4) and read-only roles (spec §5.5): pure classifiers over a shell
 * command or a file path. `codex/hooks/amp-hook` ports the same rule tables to bash, so a change
 * here is a change there.
 *
 * lean: the guard is a deny-list on spellings, so aliases and `sh -c` wrappers evade it. It is
 * defense in depth, and the skills remain the contract.
 * lean: PowerShell backtick escapes not parsed, a `" inside a string can mis-split; parse them if a
 * false deny is reported.
 * lean: non-git shell writes (`>`, `sed -i`, `rm`) aren't blocked for read-only roles, because
 * reviewers run test suites that write caches. The guardrails still apply.
 */

/** Drops heredoc bodies: after `<<WORD`, `<<-WORD`, `<<'WORD'` or `<<"WORD"` the lines up to WORD are data. */
function dropHeredocs(command: string): string {
  const kept: string[] = []
  const open: { word: string; tabs: boolean }[] = []
  for (const line of command.split(/\r?\n/)) {
    const body = open[0]
    if (body) {
      if ((body.tabs ? line.replace(/^\t+/, '') : line) === body.word) open.shift()
      continue
    }
    kept.push(line)
    for (const m of line.matchAll(/(?<!<)<<(-?)\s*(['"]?)([A-Za-z_][\w.-]*)\2/g)) open.push({ word: m[3] ?? '', tabs: m[1] === '-' })
  }
  return kept.join('\n')
}

/** The command's segments (split on `&&`, `||`, `;`, `|` and newlines outside quotes), each its unquoted words. */
export function splitCommands(command: string): string[][] {
  const text = dropHeredocs(command)
  const segments: string[][] = []
  let words: string[] = []
  let word: string | undefined
  let quote = ''
  const endWord = () => {
    if (word !== undefined) words.push(word)
    word = undefined
  }
  const endSegment = () => {
    endWord()
    if (words.length > 0) segments.push(words)
    words = []
  }
  const add = (chars = '') => {
    word = (word ?? '') + chars
  }
  for (let i = 0; i < text.length; i++) {
    const c = text[i] ?? ''
    if (quote === "'") {
      if (c === "'") quote = ''
      else add(c)
    } else if (quote === '"') {
      if (c === '\\' && (text[i + 1] === '"' || text[i + 1] === '\\')) add(text[++i])
      else if (c === '"') quote = ''
      else add(c)
    } else if (c === "'" || c === '"') {
      quote = c
      add()
    } else if (c === ';' || c === '|' || c === '\n') endSegment()
    else if (c === '&' && text[i + 1] === '&') {
      endSegment()
      i++
    } else if (/\s/.test(c)) endWord()
    else add(c)
  }
  endSegment()
  return segments
}

/** The value-taking options per subcommand: each consumes the next word. */
const TAG_VALUES = ['--contains', '--no-contains', '--points-at', '--merged', '--no-merged', '--sort', '--format', '-n', '-u', '-m', '-F', '-t']
const VALUES: Record<string, readonly string[]> = {
  commit: ['-m', '-F', '-C', '-c', '-t', '--author', '--date', '--message', '--file'],
  push: ['-o', '--push-option', '--repo', '--receive-pack', '--exec'],
  tag: TAG_VALUES,
  branch: TAG_VALUES,
}

/** A git segment: its subcommand, option names (`--opt` of `--opt=v`, `-m` of `-mnote`) and positional words. */
type Git = { sub: string; options: string[]; positional: string[]; gpgOff: boolean }

function parseGit(words: string[]): Git | undefined {
  if (words[0] !== 'git') return undefined
  let at = 1
  let gpgOff = false
  for (let w = words[at]; w?.startsWith('-'); w = words[++at]) {
    if (w !== '-C' && w !== '-c') continue
    if (w === '-c' && /^commit\.gpgsign=false$/i.test(words[at + 1] ?? '')) gpgOff = true
    at++
  }
  const sub = words[at]
  if (sub === undefined) return undefined
  const values = VALUES[sub] ?? []
  const options: string[] = []
  const positional: string[] = []
  for (at++; at < words.length; at++) {
    const w = words[at] ?? ''
    if (!w.startsWith('-')) positional.push(w)
    else if (w.includes('=') && w.startsWith('--')) options.push(w.slice(0, w.indexOf('=')))
    else if (!w.startsWith('--') && w.length > 2 && values.includes(w.slice(0, 2))) options.push(w.slice(0, 2))
    else {
      options.push(w)
      if (values.includes(w)) at++
    }
  }
  return { sub, options, positional, gpgOff }
}

export type GuardCtx = { branch?: string; defaultBranch: string }

const INSTEAD: Record<string, string> = {
  'hooks skipped': 'fix the hook failure instead',
  'signing skipped': 'fix the hook failure instead',
  'force push': 'amp merges, never rewrites published history',
  'push to default': 'push the phase branch and merge through the PR',
  'hard reset': 'never discard work; revert or fix forward',
  'commit on default': 'create the phase branch first',
  'discard work': 'never discard work; revert or fix forward',
  'admin merge': 'stop and ask the user',
}

const FORCE = ['--force', '-f', '--force-with-lease', '--force-if-includes', '--mirror', '--delete', '-d']
const short = (option: string) => /^-[a-zA-Z]+$/.test(option)

/** The §5.4 rule a segment breaks, or undefined. */
function brokenRule(words: string[], ctx: GuardCtx): string | undefined {
  if (words[0] === 'gh' && words[1] === 'pr' && words[2] === 'merge' && words.includes('--admin')) return 'admin merge'
  const git = parseGit(words)
  if (git === undefined) return undefined
  const { sub, options, positional } = git
  const has = (...names: string[]) => options.some(o => names.includes(o))
  const onDefault = ctx.branch !== undefined && ctx.branch === ctx.defaultBranch
  if (sub === 'commit') {
    if (has('--no-verify') || options.some(o => short(o) && o.includes('n'))) return 'hooks skipped'
    if (has('--no-gpg-sign') || git.gpgOff) return 'signing skipped'
    if (onDefault) return 'commit on default'
  }
  if (sub === 'push') {
    const refspecs = positional.slice(1)
    if (has(...FORCE) || refspecs.some(r => r.startsWith('+') || r.startsWith(':'))) return 'force push'
    const def = ctx.defaultBranch
    if (refspecs.some(r => r === def || r.endsWith(`:${def}`)) || (refspecs.length === 0 && onDefault)) return 'push to default'
  }
  if (sub === 'reset' && has('--hard')) return 'hard reset'
  if ((sub === 'stash' && !['list', 'show'].includes(positional[0] ?? ''))
    || (sub === 'checkout' && has('--', '-f', '--force'))
    || (sub === 'restore' && (!has('--staged') || has('--worktree', '-W')))
    || (sub === 'clean' && (has('--force') || options.some(o => short(o) && o.includes('f'))))) return 'discard work'
  return undefined
}

/** The guard's deny text for a command (without the abandoned-run suffix), or undefined. */
export function guardViolation(command: string, ctx: GuardCtx): string | undefined {
  for (const words of splitCommands(command)) {
    const rule = brokenRule(words, ctx)
    if (rule) return `amp guard: ${rule} is blocked during an amp run (${words.join(' ')}). ${INSTEAD[rule]}`
  }
  return undefined
}

export type ReadOnlyRole = 'reviewer' | 'checker' | 'scout'
const READ_ONLY: readonly ReadOnlyRole[] = ['reviewer', 'checker', 'scout']

/** The read-only role of the loop a call runs in: its agent's type is `<plugin>:<role>`. */
export function roleOf(agents: readonly { id: string; type: string }[], agentId: string | undefined, plugin: string): ReadOnlyRole | undefined {
  if (agentId === undefined) return undefined
  const type = agents.find(a => a.id === agentId)?.type
  return READ_ONLY.find(role => type === `${plugin}:${role}`)
}

/** A path, absolute, `/`-separated, with `.` and `..` collapsed. */
function resolve(path: string, cwd: string): string {
  const slashed = path.replace(/\\/g, '/')
  const absolute = /^([a-zA-Z]:)?\//.test(slashed) ? slashed : `${cwd.replace(/\\/g, '/')}/${slashed}`
  const [head = '', ...rest] = absolute.split('/')
  const parts: string[] = []
  for (const part of rest) {
    if (part === '..') parts.pop()
    else if (part !== '.' && part !== '') parts.push(part)
  }
  return `${head}/${parts.join('/')}`
}

/** Where a path lands: under `<root>/.amp/`, elsewhere in the repo, or outside it (case ignored on a drive root). */
export function insideRoot(path: string, cwd: string, root: string): 'repo' | 'amp' | 'outside' {
  const fold = /^[a-zA-Z]:/.test(root) ? (p: string) => p.toLowerCase() : (p: string) => p
  const target = fold(resolve(path, cwd))
  const base = fold(resolve(root, root)).replace(/\/$/, '')
  if (target === `${base}/.amp` || target.startsWith(`${base}/.amp/`)) return 'amp'
  return target === base || target.startsWith(`${base}/`) ? 'repo' : 'outside'
}

export type ReadOnlyCall = { tool: string; command?: string; path?: string; cwd: string }

const DENY_ALL = ['commit', 'push', 'merge', 'rebase', 'reset', 'checkout', 'switch', 'stash', 'add', 'rm', 'mv', 'cherry-pick', 'revert', 'am', 'restore', 'clean']
const TAG_WRITE = ['-a', '-s', '-u', '-d', '-f', '-m', '-F', '--annotate', '--sign', '--delete', '--force']
const BRANCH_WRITE = ['-d', '-D', '-m', '-M', '-c', '-C', '-f', '--delete', '--move', '--copy', '--force']
const NOTES_WRITE = ['add', 'edit', 'remove', 'copy', 'append', 'merge', 'prune']

/** Whether a git segment writes, for a read-only role (§5.5). */
function gitWrites({ sub, options, positional }: Git, cwd: string, root: string): boolean {
  const has = (names: string[]) => options.some(o => names.includes(o))
  // A positional word creates a tag or branch, unless it is a `--list` pattern.
  const creates = positional.length > 0 && !has(['-l', '--list'])
  switch (sub) {
    case 'tag': return has(TAG_WRITE) || creates
    case 'branch': return has(BRANCH_WRITE) || creates
    case 'notes': return NOTES_WRITE.includes(positional[0] ?? '')
    case 'apply': return !has(['--check', '--stat', '--numstat'])
    case 'worktree': return positional[0] === 'add' && positional[1] !== undefined && insideRoot(positional[1], cwd, root) === 'repo'
    default: return DENY_ALL.includes(sub)
  }
}

/** A read-only role's deny text for a call, or undefined: edits inside the repo (but `.amp/`) and git writes. */
export function readOnlyViolation(role: ReadOnlyRole, call: ReadOnlyCall, root: string): string | undefined {
  const deny = (what: string, target: string) =>
    `amp read-only: ${role} may not ${what} (${target}). Report the finding instead; write only the report file under .amp/ or outside the repo.`
  if (['Edit', 'Write', 'NotebookEdit'].includes(call.tool)) {
    return call.path !== undefined && insideRoot(call.path, call.cwd, root) === 'repo' ? deny('edit files in the repository', call.path) : undefined
  }
  if (call.command === undefined || !['Bash', 'PowerShell'].includes(call.tool)) return undefined
  for (const words of splitCommands(call.command)) {
    const git = parseGit(words)
    if (git && gitWrites(git, call.cwd, root)) return deny(`run git ${git.sub}${git.sub === 'worktree' ? ' add' : ''}`, words.join(' '))
  }
  return undefined
}
