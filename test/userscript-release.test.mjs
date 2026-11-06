import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import metadata from '../script/userscript.cjs'

const baseVersion = JSON.parse(readFileSync(new URL('../package.json', import.meta.url))).version

test('local and CI versions stay compatible with existing installations and increase across publishes', () => {
  assert.equal(metadata.scriptVersion({}), baseVersion)
  const env = { GITHUB_ACTIONS: 'true', GITHUB_RUN_NUMBER: '5', GITHUB_RUN_ATTEMPT: '1' }
  assert.equal(metadata.scriptVersion(env), `${baseVersion}.5.1`)
  assert.equal(metadata.scriptVersion({ ...env, GITHUB_RUN_NUMBER: '6' }), `${baseVersion}.6.1`)
  assert.equal(metadata.scriptVersion({ ...env, GITHUB_RUN_ATTEMPT: '2' }), `${baseVersion}.5.2`)
  assert.throws(() => metadata.scriptVersion({ ...env, GITHUB_RUN_NUMBER: '' }))
})

test('the stable update feed belongs to the fork and retains script identity for reinstalls', () => {
  const header = metadata.createHeader({})
  assert.match(header, /@namespace\s+https:\/\/github.com\/biuuu\/ShinyColors\n/)
  assert.match(header, /@name\s+偶像大师ShinyColors汉化\n/)
  assert.match(header, /@updateURL\s+https:\/\/github.com\/MatryoshkaLJY\/ShinyColors\/releases\/latest\/download\/ShinyColors.meta.js/)
  assert.match(header, /@downloadURL\s+https:\/\/github.com\/MatryoshkaLJY\/ShinyColors\/releases\/latest\/download\/ShinyColors.user.js/)
  assert.ok(!header.includes('https://www.shiny.fun/ShinyColors.user.js'))
})
