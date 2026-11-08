#!/usr/bin/env node
// Reads an existing translation checkout. This command makes no network calls.
import { readFileSync, readdirSync, mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, relative, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { createHash } from 'node:crypto'
import Papa from 'papaparse'
import {
  CHOICE_HINT_KEY, choiceKind, normalizeChoice, captureChoiceGroups,
  createChoiceResolver, createChoiceCharacterResolver, resolveDisplayedChoices
} from '../src/utils/choiceEffects.js'

const root = fileURLToPath(new URL('../', import.meta.url))
const filesIn = directory => readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
  .flatMap(entry => entry.isDirectory() ? filesIn(join(directory, entry.name)) :
    entry.isFile() && entry.name.endsWith('.csv') ? [join(directory, entry.name)] : [])

export const readChoiceScenario = (csv, file) => {
  const parsed = Papa.parse(csv, { header: true, skipEmptyLines: true })
  const rows = parsed.data
  const choiceRows = rows.filter(row => row.id?.trim() === 'select').length
  const metadata = { file, choiceRows, errors: parsed.errors }
  const paths = [...new Set(rows.filter(row => row.id?.trim() === 'info').map(row => row.name?.trim()).filter(Boolean))]
  // A source with several scenario IDs cannot safely provide group boundaries.
  if (paths.length !== 1) return { ...metadata, excluded: 'ambiguous_scenario_path', paths }
  const path = paths[0].replace(/^\/?(?:assets\/json\/)?/, '/')
  const kind = choiceKind(path)
  if (!kind) return { ...metadata, path, excluded: 'outside_supported_scenarios' }
  const tracks = rows.map(row => ({ speaker: row.name || '',
    ...(row.id?.trim() === 'select' ? { select: row.text || '' } : { text: row.text || '' }),
    translation: row.trans || '' }))
  return { ...metadata, path, kind, tracks }
}

const choiceSet = texts => texts.map(normalizeChoice).sort().join('\0')
const sharedChoices = (originals, choices) => {
  const remaining = originals.slice()
  return choices.reduce((count, choice) => {
    const index = remaining.indexOf(normalizeChoice(choice.text))
    if (index < 0) return count
    remaining.splice(index, 1)
    return count + 1
  }, 0)
}
const diagnose = (kind, originals, character, groups) => {
  const exact = groups.filter(group => group.kind === kind &&
    (kind !== 'morning' || !character || group.character === character) &&
    choiceSet(group.choices.map(choice => choice.text)) === choiceSet(originals))
  if (exact.length) return { reason: 'conflicting_effects', candidates: exact }
  const texts = originals.map(normalizeChoice)
  const candidates = groups.filter(group => group.kind === kind &&
    (kind !== 'morning' || !character || group.character === character) && group.choices.length === texts.length)
    .map(group => ({ ...group, sharedChoices: sharedChoices(texts, group.choices) }))
    .filter(group => group.sharedChoices >= 2)
    .sort((a, b) => b.sharedChoices - a.sharedChoices)
  return { reason: candidates.length ? 'text_mismatch_candidate' : 'no_close_catalogue_group', candidates: candidates.slice(0, 5) }
}

export const auditScenarios = (scenarios, groups, characters, { fuzzy = true } = {}) => {
  const lookup = createChoiceResolver(groups, { fuzzy, characters })
  const identify = createChoiceCharacterResolver(characters)
  const summary = { files: scenarios.length, filesWithChoices: scenarios.filter(scenario => scenario.choiceRows > 0).length,
    scopedFiles: 0, scopedFilesWithChoices: 0, choiceGroups: 0, matchedGroups: 0,
    partialGroups: 0, unmatchedGroups: 0, fuzzyGroups: 0, singleChoices: 0, filteredPools: 0, excludedFiles: 0 }
  const byKind = {}
  const failures = [], fuzzyMatches = [], filteredPools = [], exclusions = []
  const csvWarnings = scenarios.filter(scenario => scenario.errors?.length).map(({ file, errors }) => ({ file, errors }))
  for (const scenario of scenarios) {
    if (scenario.excluded) { summary.excludedFiles++; exclusions.push(scenario); continue }
    summary.scopedFiles++
    if (scenario.choiceRows) summary.scopedFilesWithChoices++
    const { tracks, kind } = scenario
    const counts = byKind[kind] ||= { groups: 0, matched: 0, partial: 0, unmatched: 0, fuzzy: 0, choices: 0, matchedChoices: 0 }
    const character = identify(tracks)
    captureChoiceGroups(tracks, scenario.path, lookup, identify)
    // Replay the same annotations through translated text, a JSON cache and a
    // reversed on-screen order before calling the production display resolver.
    const cached = JSON.parse(JSON.stringify(tracks.map(track => ({ ...track,
      ...(track.select ? { select: track.translation || track.select } : {}) }))))
    let pending = []
    const flush = () => {
      if (!pending.length) return
      const choices = pending
      pending = []
      if (choices.length === 1) { summary.singleChoices++; return }
      const originals = choices.map(choice => choice.hint?.original || choice.text)
      const base = { file: scenario.file, path: scenario.path, kind, character, originals,
        translations: choices.map(choice => choice.text) }
      if (choices.length > 3) {
        // The CSV omits game conditions. Checking every triple is diagnostic;
        // it cannot establish which triples actually appear in the game.
        let supportedTriples = 0, triples = 0
        for (let a = 0; a < choices.length; a++) for (let b = a + 1; b < choices.length; b++) {
          for (let c = b + 1; c < choices.length; c++) {
            triples++
            if (lookup(kind, [originals[a], originals[b], originals[c]], character)?.every(Boolean)) supportedTriples++
          }
        }
        filteredPools.push({ ...base, triples, supportedTriples })
        summary.filteredPools++
        return
      }
      summary.choiceGroups++; counts.groups++; counts.choices += choices.length
      const displayed = resolveDisplayedChoices(choices.slice().reverse(), lookup)
      const matched = displayed.filter(choice => choice.hint?.effect).length
      counts.matchedChoices += matched
      if (displayed.some(choice => choice.hint?.effect?.match?.type === 'fuzzy')) {
        summary.fuzzyGroups++; counts.fuzzy++
        fuzzyMatches.push({ ...base, matches: displayed.map(choice => ({ original: choice.hint.original,
          effect: choice.hint.effect })) })
      }
      if (matched === choices.length) { summary.matchedGroups++; counts.matched++; return }
      if (matched) { summary.partialGroups++; counts.partial++ } else { summary.unmatchedGroups++; counts.unmatched++ }
      failures.push({ ...base, matchedChoices: matched,
        missing: displayed.filter(choice => !choice.hint?.effect).map(choice => choice.hint?.original || choice.text),
        ...diagnose(kind, originals, character, groups) })
    }
    for (const track of cached) {
      if (typeof track.select === 'string' && track.select) {
        pending.push({ item: {}, hint: track[CHOICE_HINT_KEY], text: track.select })
      } else flush()
    }
    flush()
  }
  summary.choices = Object.values(byKind).reduce((total, counts) => total + counts.choices, 0)
  summary.matchedChoices = Object.values(byKind).reduce((total, counts) => total + counts.matchedChoices, 0)
  summary.missingChoices = summary.choices - summary.matchedChoices
  summary.csvWarningFiles = csvWarnings.length
  const byReason = {}
  failures.forEach(failure => { byReason[failure.reason] = (byReason[failure.reason] || 0) + 1 })
  return { summary, byKind, byReason, failures, fuzzyMatches, filteredPools, exclusions, csvWarnings }
}

export const runAudit = (translationRoot, cataloguePath, options = {}) => {
  const characters = JSON.parse(readFileSync(join(root, 'src/data/choice-characters.json'), 'utf8'))
  const catalogueText = readFileSync(cataloguePath, 'utf8')
  const hash = createHash('sha256')
  const scenarios = filesIn(join(translationRoot, 'data/story')).map(file => {
    const text = readFileSync(file, 'utf8')
    const name = relative(translationRoot, file).split('\\').join('/')
    hash.update(name).update('\0').update(text).update('\0')
    return readChoiceScenario(text, name)
  })
  const audit = auditScenarios(scenarios, JSON.parse(catalogueText).groups, characters, options)
  const snapshot = join(translationRoot, 'snapshot.json')
  return { generatedAt: new Date().toISOString(),
    sources: { translationRoot, translationSha256: hash.digest('hex'), catalogue: cataloguePath,
      matching: options.fuzzy === false ? 'exact-only' : 'exact-then-fuzzy',
      ...(existsSync(snapshot) ? { snapshot: JSON.parse(readFileSync(snapshot, 'utf8')) } : {}),
      catalogueSha256: createHash('sha256').update(catalogueText).digest('hex') },
    limitations: [
      'Only original Japanese choices preserved in this local translation snapshot are checked; absent or untranslated scenarios remain untested.',
      'CSV rows do not include runtime conditions or all character model fields. Pools over three choices and unavailable character identity need separate verification.',
      'Unmatched scenarios are coverage gaps, not proof of a transcription bug or of a stat-changing choice. Fuzzy results are marked separately; a similarity score is not a probability of correctness.',
      'This checks lookup coverage, translation/cache/shuffle handling; it does not independently verify Wiki effect values or in-game overlay rendering.'
    ], ...audit }
}

const markdownText = text => String(text).replace(/[\\`*_\[\]<>|]/g, '\\$&').replace(/\r?\n/g, ' ')
const sourceLink = (report, file) => {
  const snapshot = report.sources.snapshot
  const label = markdownText(file)
  return snapshot?.repository && snapshot?.commit ?
    `[${label}](https://github.com/${snapshot.repository}/blob/${snapshot.commit}/${file.split('/').map(encodeURIComponent).join('/')})` : label
}
export const renderAuditMarkdown = report => {
  const { summary, sources } = report
  const lines = ['# 选项效果离线检查', '',
    `生成时间：${report.generatedAt}。剧情来源：${sources.snapshot?.url ? `[SCTranslationData](${sources.snapshot.url})` : markdownText(sources.translationRoot)}。`, '',
    `扫描 ${summary.files} 份剧情 CSV，检查支持类别中的 ${summary.choiceGroups} 组选项：${summary.matchedGroups} 组全部匹配，${summary.partialGroups} 组部分匹配，${summary.unmatchedGroups} 组未匹配。`, '',
    `匹配模式：${sources.matching}。完整匹配中有 ${summary.fuzzyGroups} 组为近似匹配，单独列在下方；这些结果是推测，尚需核实。`, '',
    `共 ${summary.choices} 个选项，${summary.missingChoices} 个未匹配。动态选项池 ${summary.filteredPools} 个，CSV 解析警告 ${summary.csvWarningFiles} 份。`, '',
    `按现象分类：${report.byReason.text_mismatch_candidate || 0} 组存在原文差异候选，${report.byReason.no_close_catalogue_group || 0} 组没有找到近似记录，${report.byReason.conflicting_effects || 0} 组存在效果冲突。`, '',
    '范围：仅覆盖该本地快照保留的原始日文。缺失表示当前查找器无法返回效果，不等同于已确认 Wiki 错字；数值本身及游戏内渲染仍需另行核实。近似匹配不会验证 Wiki 数值，文本相似度也不是正确率。', '',
    'Wiki 候选内容来自 Shinycolors Wiki 贡献者，按 [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) 提供；本报告提取并整理了选项文字用于比对，各候选保留来源链接。剧情原文和译文的权利归各自权利人。', '',
    `剧情数据 SHA-256：${sources.translationSha256}`, '', `效果库 SHA-256：${sources.catalogueSha256}`, '']
  const kindNames = { event: '剧情分支', morning: '早间对话', audition: '试镜前对话' }
  const reasons = { text_mismatch_candidate: '有至少两个原文相同的候选组，需核对其余文字',
    conflicting_effects: '相同选项组存在不同效果，匹配器保留缺失', no_close_catalogue_group: '没有找到至少两个原文相同的候选组' }
  if (report.fuzzyMatches.length) {
    lines.push(`## 近似匹配：${report.fuzzyMatches.length} 组需要确认`, '')
    for (const item of report.fuzzyMatches) {
      lines.push(`### ${markdownText(item.file.replace(/^data\/story\//, '').replace(/\.csv$/, ''))}`, '',
        `剧情：\`${item.path}\` · 原文文件：${sourceLink(report, item.file)}`, '')
      for (const { original, effect } of item.matches) {
        lines.push(`- ${markdownText(original)} → [${markdownText(effect.match.matchedText)}](${effect.source})（文本相似度 ${Math.round(effect.match.similarity * 100)}%）`)
      }
      lines.push('')
    }
  }
  for (const kind of Object.keys(kindNames)) {
    const failures = report.failures.filter(item => item.kind === kind)
    if (!failures.length) continue
    lines.push(`## ${kindNames[kind]}：${failures.length} 组需要核对`, '')
    for (const item of failures) {
      lines.push(`### ${markdownText(item.file.replace(/^data\/story\//, '').replace(/\.csv$/, ''))}`, '',
        `剧情：\`${item.path}\` · ${item.matchedChoices}/${item.originals.length} 个选项已匹配 · ${reasons[item.reason]}`, '',
        `原文文件：${sourceLink(report, item.file)}`, '', '缺失原文：', '',
        ...item.missing.map(text => `- ${markdownText(text)}`), '')
      for (const candidate of item.candidates) {
        lines.push(`候选：[${markdownText(candidate.title)}](${candidate.source})`, '',
          ...candidate.choices.map(choice => `- ${markdownText(choice.text)}`), '')
      }
    }
  }
  if (report.filteredPools.length) {
    lines.push('## 需要实际筛选条件的选项池', '')
    for (const item of report.filteredPools) lines.push(`- ${sourceLink(report, item.file)}：${item.originals.length} 个原始选项，${item.supportedTriples}/${item.triples} 个三选项组合能匹配；实际显示组合未知。`)
    lines.push('')
  }
  if (report.csvWarnings.length) {
    lines.push('## CSV 解析警告', '', '以下是输入快照中的格式警告，需结合原文件核对；它们不等同于选项原文有误。行号是去掉表头后的 CSV 记录序号。', '')
    for (const item of report.csvWarnings) {
      const errors = item.errors.map(error => `${error.code}${Number.isInteger(error.row) ? `（第 ${error.row + 1} 条记录）` : ''}`).join('、')
      lines.push(`- ${sourceLink(report, item.file)}：${errors}`)
    }
    lines.push('')
  }
  return lines.join('\n').trimEnd() + '\n'
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: { translations: { type: 'string' }, catalogue: { type: 'string' },
    report: { type: 'string', default: 'dist/choice-effects-audit.json' }, markdown: { type: 'string' },
    strict: { type: 'boolean', default: false }, exact: { type: 'boolean', default: false } } })
  if (!values.translations) throw new Error('Usage: npm run choices:audit -- --translations /path/to/SCTranslationData [--report report.json] [--markdown report.md] [--exact] [--strict]')
  const report = runAudit(resolve(values.translations), resolve(values.catalogue || join(root, 'src/data/choice-effects.json')), { fuzzy: !values.exact })
  const output = resolve(values.report)
  mkdirSync(dirname(output), { recursive: true })
  writeFileSync(output, JSON.stringify(report, null, 2) + '\n')
  if (values.markdown) {
    mkdirSync(dirname(resolve(values.markdown)), { recursive: true })
    writeFileSync(resolve(values.markdown), renderAuditMarkdown(report))
  }
  console.log(JSON.stringify({ ...report.summary, byKind: report.byKind, byReason: report.byReason, report: output }, null, 2))
  if (values.strict && (report.summary.partialGroups || report.summary.unmatchedGroups || report.summary.fuzzyGroups || report.summary.filteredPools || report.summary.csvWarningFiles ||
    report.exclusions.some(item => item.excluded === 'ambiguous_scenario_path'))) process.exitCode = 1
}
