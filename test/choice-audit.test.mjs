import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import Papa from 'papaparse'
import { readChoiceScenario, auditScenarios, renderAuditMarkdown } from '../script/auditChoiceEffects.mjs'

const characters = { Hana_Suzuki: { id: '27', names: ['羽那'] } }
const group = { kind: 'event', title: 'event', source: 'https://example.com/wiki', choices: [
  { text: '回答Ａ', effects: { vocal: 20 } },
  { text: '回答Ｂ', effects: { dance: 20 } },
  { text: '回答Ｃ', effects: { visual: 20 } }
] }
const csvFor = (texts, path = 'produce_events/1.json') => '\ufeff' + Papa.unparse({
  fields: ['id', 'name', 'text', 'trans'],
  data: [['1', '羽那', '……？', '……？'], ...texts.map((text, i) => ['select', '', text, `中文选项${i}`]),
    ['info', path, '', '']]
})
const scenarioFor = texts => readChoiceScenario(csvFor(texts), 'data/story/羽那/scene.csv')

test('audit replays original fullwidth text through translation, JSON caching and shuffled choices', () => {
  const scenario = scenarioFor(['回答C', '回答A', '回答B'])
  assert.equal(scenario.path, '/produce_events/1.json')
  const report = auditScenarios([scenario], [group], characters)
  assert.equal(report.summary.matchedGroups, 1)
  assert.equal(report.summary.matchedChoices, 3)
  assert.equal(report.failures.length, 0)
})

test('audit identifies a typo candidate without assigning its effect or reporting translated text as original', () => {
  const report = auditScenarios([scenarioFor(['回答A', '回答B', '回答間違い'])], [group], characters)
  assert.equal(report.summary.unmatchedGroups, 1)
  assert.equal(report.summary.missingChoices, 3)
  assert.equal(report.failures[0].reason, 'text_mismatch_candidate')
  assert.deepEqual(report.failures[0].originals, ['回答A', '回答B', '回答間違い'])
  assert.equal(report.failures[0].candidates[0].source, group.source)
})

test('audit separates inferred matches from exact coverage and supports an exact-only comparison', () => {
  const long = { ...group, choices: [
    { text: '帰りに公園を一緒に散歩しよう', effects: { vocal: 20 } },
    { text: '次の仕事の話をしよう', effects: { dance: 20 } },
    { text: '練習の成果を見せてほしい', effects: { visual: 20 } }
  ] }
  const input = [long.choices[0].text, '次のお仕事の話をしよう', long.choices[2].text]
  const fuzzy = auditScenarios([scenarioFor(input)], [long], characters)
  assert.equal(fuzzy.summary.matchedGroups, 1)
  assert.equal(fuzzy.summary.fuzzyGroups, 1)
  assert.equal(fuzzy.fuzzyMatches.length, 1)
  assert.ok(fuzzy.fuzzyMatches[0].matches.every(match => match.effect.match.type === 'fuzzy'))
  const exact = auditScenarios([scenarioFor(input)], [long], characters, { fuzzy: false })
  assert.equal(exact.summary.unmatchedGroups, 1)
  assert.equal(exact.summary.fuzzyGroups, 0)
})

test('repeated Wiki text cannot count the same source answer twice when proposing candidates', () => {
  const duplicate = { ...group, choices: [group.choices[0], group.choices[0], group.choices[0]] }
  const report = auditScenarios([scenarioFor(['回答A', '回答X', '回答Y'])], [duplicate], characters)
  assert.equal(report.failures[0].reason, 'no_close_catalogue_group')
  assert.equal(report.failures[0].candidates.length, 0)
})

test('conflicting effects and partial morning matches remain visible as distinct audit findings', () => {
  const conflict = { ...group, choices: group.choices.map((choice, index) => index ? choice : { ...choice, effects: { vocal: 99 } }) }
  const event = scenarioFor(['回答A', '回答B', '回答C'])
  const morning = readChoiceScenario(csvFor(['朝A', '朝B', '朝C'], 'produce_communications/27.json'), 'morning.csv')
  const morningGroup = { kind: 'morning', title: '1', source: 'https://example.com/morning', character: 'Hana_Suzuki',
    choices: [{ text: '朝A', grade: 'perfect' }, { text: '朝B', grade: 'good' }, { text: '朝間違い', grade: 'normal' }] }
  const report = auditScenarios([event, morning], [group, conflict, morningGroup], characters)
  assert.equal(report.summary.partialGroups, 2)
  assert.equal(report.summary.missingChoices, 2)
  assert.equal(report.failures[0].reason, 'conflicting_effects')
  assert.equal(report.failures[1].character, 'Hana_Suzuki')
  assert.deepEqual(report.failures[1].missing, ['朝C'])
})

test('runtime-filtered pools, single answers and unsupported scenario families do not inflate failures', () => {
  const pool = scenarioFor(['回答A', '回答B', '回答C', '条件付き'])
  const single = scenarioFor(['一つだけ'])
  const outside = readChoiceScenario(csvFor(['回答A', '回答B', '回答C'], 'mypage_communications/1.json'), 'outside.csv')
  const report = auditScenarios([pool, single, outside], [group], characters)
  assert.equal(report.summary.choiceGroups, 0)
  assert.equal(report.summary.filteredPools, 1)
  assert.equal(report.summary.singleChoices, 1)
  assert.equal(report.summary.excludedFiles, 1)
  assert.equal(report.filteredPools[0].triples, 4)
  assert.equal(report.filteredPools[0].supportedTriples, 1)
  assert.equal(report.failures.length, 0)
})

test('ambiguous scenario metadata and malformed CSVs are reported instead of silently counted as clean', () => {
  const ambiguous = readChoiceScenario(csvFor(['回答A', '回答B']) + '\r\ninfo,produce_events/2.json,,', 'ambiguous.csv')
  assert.equal(ambiguous.excluded, 'ambiguous_scenario_path')
  const malformed = readChoiceScenario('id,name,text,trans\nselect,,A\ninfo,produce_events/1.json,,', 'bad.csv')
  const report = auditScenarios([ambiguous, malformed], [group], characters)
  assert.equal(report.summary.csvWarningFiles, 1)
  assert.equal(report.csvWarnings[0].errors[0].code, 'TooFewFields')
})

test('CLI produces source hashes and links, and strict mode rejects gaps or inferred results', () => {
  const directory = mkdtempSync(join(tmpdir(), 'sc-choice-audit-test-'))
  try {
    mkdirSync(join(directory, 'data/story'), { recursive: true })
    writeFileSync(join(directory, 'data/story/scene.csv'), csvFor(['回答A', '回答B', '回答間違い']))
    writeFileSync(join(directory, 'catalogue.json'), JSON.stringify({ groups: [group] }))
    writeFileSync(join(directory, 'snapshot.json'), JSON.stringify({ repository: 'ShinyGroup/SCTranslationData', commit: 'snapshot' }))
    const output = join(directory, 'report.json')
    const command = ['--experimental-default-type=module', 'script/auditChoiceEffects.mjs', '--translations', directory,
      '--catalogue', join(directory, 'catalogue.json'), '--report', output, '--markdown', join(directory, 'report.md')]
    const first = spawnSync(process.execPath, command, { encoding: 'utf8' })
    assert.equal(first.status, 0, first.stderr)
    const report = JSON.parse(readFileSync(output, 'utf8'))
    assert.match(report.sources.translationSha256, /^[a-f0-9]{64}$/)
    assert.match(renderAuditMarkdown(report), /github.com\/ShinyGroup\/SCTranslationData\/blob\/snapshot/)
    assert.match(readFileSync(join(directory, 'report.md'), 'utf8'), /回答間違い/)
    const second = spawnSync(process.execPath, [...command, '--strict'], { encoding: 'utf8' })
    assert.equal(second.status, 1, second.stderr)
    assert.equal(JSON.parse(readFileSync(output, 'utf8')).sources.translationSha256, report.sources.translationSha256)
    writeFileSync(join(directory, 'data/story/scene.csv'), csvFor(['回答A', '回答B', '回答C']))
    const clean = spawnSync(process.execPath, [...command, '--strict'], { encoding: 'utf8' })
    assert.equal(clean.status, 0, clean.stderr)
    const long = { ...group, choices: [
      { text: '帰りに公園を一緒に散歩しよう', effects: { vocal: 20 } },
      { text: '次の仕事の話をしよう', effects: { dance: 20 } },
      { text: '練習の成果を見せてほしい', effects: { visual: 20 } }
    ] }
    writeFileSync(join(directory, 'catalogue.json'), JSON.stringify({ groups: [long] }))
    writeFileSync(join(directory, 'data/story/scene.csv'), csvFor([long.choices[0].text, '次のお仕事の話をしよう', long.choices[2].text]))
    const inferred = spawnSync(process.execPath, [...command, '--strict'], { encoding: 'utf8' })
    assert.equal(inferred.status, 1, inferred.stderr)
    const inferredReport = JSON.parse(readFileSync(output, 'utf8'))
    assert.equal(inferredReport.summary.unmatchedGroups, 0)
    assert.equal(inferredReport.summary.fuzzyGroups, 1)
    assert.match(readFileSync(join(directory, 'report.md'), 'utf8'), /近似匹配：1 组需要确认/)
    const strictText = spawnSync(process.execPath, [...command, '--exact'], { encoding: 'utf8' })
    assert.equal(strictText.status, 0, strictText.stderr)
    const exactReport = JSON.parse(readFileSync(output, 'utf8'))
    assert.equal(exactReport.sources.matching, 'exact-only')
    assert.equal(exactReport.summary.unmatchedGroups, 1)
    assert.equal(exactReport.summary.fuzzyGroups, 0)
  } finally { rmSync(directory, { recursive: true, force: true }) }
})
