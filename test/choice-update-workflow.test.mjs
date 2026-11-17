import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const workflow = readFileSync(new URL('../.github/workflows/publish-userscript.yml', import.meta.url), 'utf8')
// Execute the actual workflow shell blocks, without a YAML package or network.
const scriptOf = name => {
  const section = workflow.split(`      - name: ${name}\n`)[1]?.split('\n      - ')[0]
  assert.ok(section, `missing workflow step: ${name}`)
  return section.split('        run: |\n')[1].split('\n').map(line => line.slice(10)).join('\n')
}
const run = (command, args, cwd, env) => {
  const result = spawnSync(command, args, { cwd, env, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr || result.stdout)
  return result.stdout.trim()
}
const workspace = callback => {
  const directory = mkdtempSync(join(tmpdir(), 'sc-choice-workflow-'))
  const bin = join(directory, 'bin')
  mkdirSync(bin)
  writeFileSync(join(bin, 'gh'), `#!/usr/bin/env node
const { appendFileSync } = require('node:fs')
const args = process.argv.slice(2)
appendFileSync(process.env.GH_CALLS, JSON.stringify(args) + '\\n')
if (args[0] === 'api') {
  if (process.env.MOCK_API_ERROR) process.exit(1)
  process.stdout.write(args[1].endsWith('/releases/latest') ? process.env.LATEST_SHA : process.env.REMOTE_SHA)
} else if (!(args[0] === 'auth' || args[0] === 'release')) process.exit(1)
`, { mode: 0o755 })
  const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, GH_CALLS: join(directory, 'calls.jsonl'),
    GITHUB_OUTPUT: join(directory, 'output'), GITHUB_ENV: join(directory, 'env'),
    GITHUB_REPOSITORY: 'example/ShinyColors', GITHUB_SHA: 'original', GITHUB_EVENT_NAME: 'schedule',
    REFRESH_CHANGED: 'false', LATEST_SHA: 'original', REMOTE_SHA: 'original', USERSCRIPT_VERSION: '1.13.0.100.1' }
  writeFileSync(env.GH_CALLS, '')
  const execute = (name, extra = {}) => run('bash', ['-e', '-o', 'pipefail', '-c', scriptOf(name)], directory, { ...env, ...extra })
  const calls = () => readFileSync(env.GH_CALLS, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line))
  try { callback({ directory, env, execute, calls }) } finally { rmSync(directory, { recursive: true, force: true }) }
}

test('scheduled checks skip unchanged published data and retry unpublished commits', () => workspace(({ execute, env }) => {
  for (const [extra, publish] of [
    [{}, false],
    [{ REFRESH_CHANGED: 'true' }, true],
    [{ LATEST_SHA: 'older-release' }, true],
    [{ MOCK_API_ERROR: 'missing-release' }, true],
    [{ GITHUB_EVENT_NAME: 'push' }, true],
    [{ GITHUB_EVENT_NAME: 'workflow_dispatch' }, true]
  ]) {
    writeFileSync(env.GITHUB_OUTPUT, '')
    execute('Decide whether a release is needed', extra)
    assert.equal(readFileSync(env.GITHUB_OUTPUT, 'utf8').trim(), `publish=${publish}`)
  }
}))

test('a validated catalogue is committed alone and published at its new commit in the same run', () => workspace(({ directory, env, execute, calls }) => {
  const git = (...args) => run('git', args, directory, env)
  git('init', '--bare', 'remote.git')
  git('init', '--initial-branch=master')
  git('config', 'user.name', 'Test')
  git('config', 'user.email', 'test@example.com')
  mkdirSync(join(directory, 'src/data'), { recursive: true })
  const catalogue = join(directory, 'src/data/choice-effects.json')
  writeFileSync(catalogue, '{"groups":[]}\n')
  git('add', 'src/data/choice-effects.json')
  git('commit', '-m', 'initial')
  git('remote', 'add', 'origin', join(directory, 'remote.git'))
  git('push', 'origin', 'master')
  const before = git('rev-parse', 'HEAD')
  writeFileSync(catalogue, '{"groups":["new card"]}\n')
  writeFileSync(join(directory, 'unrelated.txt'), 'must not be committed')
  execute('Commit validated catalogue', { GITHUB_SHA: before, REMOTE_SHA: before })
  const after = git('rev-parse', 'HEAD')
  assert.notEqual(after, before)
  assert.equal(git('--git-dir=remote.git', 'rev-parse', 'refs/heads/master'), after)
  assert.equal(git('diff-tree', '--no-commit-id', '--name-only', '-r', after), 'src/data/choice-effects.json')
  assert.equal(readFileSync(env.GITHUB_ENV, 'utf8').trim(), `RELEASE_SHA=${after}`)
  mkdirSync(join(directory, 'dist'))
  execute('Publish versioned release', { GITHUB_SHA: before, REMOTE_SHA: after, RELEASE_SHA: after })
  const release = calls().find(args => args[0] === 'release')
  assert.ok(release)
  assert.equal(release[release.indexOf('--target') + 1], after)
  assert.ok(readFileSync(join(directory, 'dist/release-notes.md'), 'utf8').includes(`/commit/${after}`))
}))

test('a concurrent master update prevents committing stale data or publishing stale assets', () => workspace(({ directory, env, execute, calls }) => {
  const commit = spawnSync('bash', ['-e', '-o', 'pipefail', '-c', scriptOf('Commit validated catalogue')], {
    cwd: directory, env: { ...env, REMOTE_SHA: 'newer' }, encoding: 'utf8'
  })
  assert.equal(commit.status, 1)
  assert.ok(!calls().some(args => args[0] === 'auth'))
  execute('Publish versioned release', { REMOTE_SHA: 'newer' })
  assert.ok(!calls().some(args => args[0] === 'release'))
}))
