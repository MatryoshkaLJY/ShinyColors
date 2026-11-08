import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createChoiceResolver, captureChoiceGroups, CHOICE_HINT_KEY, resolveDisplayedChoices, choiceKind, normalizeChoice } from '../src/utils/choiceEffects.js'

const choices = [
  { text: '帰りに公園を一緒に散歩しよう', effects: { vocal: 20 } },
  { text: '次の仕事の話をしよう', effects: { dance: 20 } },
  { text: '練習の成果を見せてほしい', effects: { visual: 20 } }
]
const group = { kind: 'event', title: 'example', source: 'wiki', character: 'Hana_Suzuki', choices }
const texts = choices.map(choice => choice.text)

test('an unseen wording error is aligned to its own option after shuffling, with an approximate label', () => {
  const lookup = createChoiceResolver([group])
  const input = [texts[2], '次のお仕事の話をしよう', texts[0]]
  const effects = lookup('event', input, 'Hana_Suzuki')
  assert.deepEqual(effects.map(choice => choice.effects), [{ visual: 20 }, { dance: 20 }, { vocal: 20 }])
  assert.ok(effects.every(choice => choice.match.type === 'fuzzy'))
  assert.ok(effects[1].match.similarity < 1)
  assert.equal(lookup('event', input, 'Mei_Izumi'), null)
  assert.equal(lookup('audition', input, 'Hana_Suzuki'), null)
  assert.equal(createChoiceResolver([group], { fuzzy: false })('event', input, 'Hana_Suzuki'), null)
  assert.ok(lookup('event', texts, 'Hana_Suzuki').every(choice => !choice.match))
})

test('format-only differences and an unlisted kanji/kana spelling can match as a complete group', () => {
  const punctuated = { ...group, choices: choices.map(choice => ({ ...choice, text: `（${choice.text}――！）` })) }
  const effects = createChoiceResolver([punctuated])('event', texts.map(text => `${text}──！`))
  assert.deepEqual(effects.map(choice => choice.effects), choices.map(choice => choice.effects))
  const kana = createChoiceResolver([group])('event', ['帰りに公園を一緒にさんぽしよう', ...texts.slice(1)], 'Hana_Suzuki')
  assert.equal(kana[0].effects.vocal, 20)
  assert.equal(kana[0].match.type, 'fuzzy')
})

test('a negation or changed number is rejected even with two identical answers', () => {
  const guarded = { ...group, choices: [
    { text: 'この仕事は引き受けても大丈夫だ', effects: { vocal: 20 } },
    { text: 'レッスンをあと10回続けてみよう', effects: { dance: 20 } }, choices[2]
  ] }
  const lookup = createChoiceResolver([guarded])
  assert.equal(lookup('event', ['この仕事は引き受けても大丈夫じゃない', guarded.choices[1].text, texts[2]], 'Hana_Suzuki'), null)
  assert.equal(lookup('event', [guarded.choices[0].text, 'レッスンをあと11回続けてみよう', texts[2]], 'Hana_Suzuki'), null)
  const stop = { ...group, choices: [{ text: 'そんなことをするのはやめよう', effects: { vocal: 20 } }, ...choices.slice(1)] }
  assert.equal(createChoiceResolver([stop])('event', ['そんなことをするのはやめない', ...texts.slice(1)], 'Hana_Suzuki'), null)
  const kanji = { ...group, choices: [{ text: 'レッスンをあと十回続けてみよう', effects: { vocal: 20 } }, ...choices.slice(1)] }
  assert.equal(createChoiceResolver([kanji])('event', ['レッスンをあと十一回続けてみよう', ...texts.slice(1)], 'Hana_Suzuki'), null)
})

test('short answers, an unrelated replacement, missing records and unknown morning characters stay unknown', () => {
  const short = { ...group, choices: [{ text: 'A', effects: { vocal: 20 } }, ...choices.slice(1)] }
  assert.equal(createChoiceResolver([short])('event', ['B', ...texts.slice(1)], 'Hana_Suzuki'), null)
  assert.equal(createChoiceResolver([group])('event', ['別の話をしよう', ...texts.slice(1)], 'Hana_Suzuki'), null)
  assert.equal(createChoiceResolver([])('event', texts, 'Hana_Suzuki'), null)
  assert.equal(createChoiceResolver([{ ...group, kind: 'morning' }])('morning', ['次のお仕事の話をしよう', texts[0], texts[2]]), null)
})

test('close competing groups and conflicting exact records cannot be bypassed by fuzzy matching', () => {
  const rival = { ...group, title: 'other', choices: choices.map((choice, index) => index === 1
    ? { text: '次の仕事のお話をしよう', effects: { vocal: 40 } } : choice) }
  const lookup = createChoiceResolver([group, rival])
  assert.equal(lookup('event', [texts[0], '次のお仕事のお話をしよう', texts[2]], 'Hana_Suzuki'), null)
  const exactConflict = { ...group, choices: choices.map((choice, index) => index === 1
    ? { ...choice, effects: { vocal: 40 } } : choice) }
  assert.equal(createChoiceResolver([group, exactConflict])('event', texts, 'Hana_Suzuki')[1], null)
})

test('an ambiguous assignment within the same group cannot reuse or swap effects confidently', () => {
  const similar = { ...group, choices: [
    { text: '帰りに大きな公園へ行こう', effects: { vocal: 20 } },
    { text: '帰りに小さな公園へ行こう', effects: { dance: 20 } }, choices[2]
  ] }
  assert.equal(createChoiceResolver([similar])('event', ['帰りに近くの公園へ行こう', '帰りに広場の公園へ行こう', texts[2]], 'Hana_Suzuki'), null)
})

test('approximate matching metadata survives translated scenario caches and displayed order changes', () => {
  const lookup = createChoiceResolver([group])
  const tracks = [{ speaker: '羽那' }, ...[texts[0], '次のお仕事の話をしよう', texts[2]].map(select => ({ select })), { label: 'end' }]
  captureChoiceGroups(tracks, '/assets/json/produce_events/1.json', lookup, () => 'Hana_Suzuki')
  tracks.filter(track => track.select).forEach(track => { track.select = '中文选项' })
  const cached = JSON.parse(JSON.stringify(tracks))
  const displayed = cached.filter(track => track.select).reverse().map(track => ({ item: {}, hint: track[CHOICE_HINT_KEY] }))
  const effects = resolveDisplayedChoices(displayed, lookup)
  assert.deepEqual(effects.map(choice => choice.hint.effect.effects), [{ visual: 20 }, { dance: 20 }, { vocal: 20 }])
  assert.ok(effects.every(choice => choice.hint.character === 'Hana_Suzuki' && choice.hint.effect.match.type === 'fuzzy'))
})

const readFixture = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'))
const catalogue = readFixture('../src/data/choice-effects.json').groups
const characters = readFixture('../src/data/choice-characters.json')
const verified = readFixture('./fixtures/verified-choice-repairs.json')
const effectKey = choice => JSON.stringify([choice?.grade || null, Object.entries(choice?.effects || {}).sort()])

test('verified historical spellings can recover without aliases while exact results stay exact', () => {
  const original = createChoiceResolver(catalogue, { characters })
  const withoutAliases = catalogue.map(group => ({ ...group, choices: group.choices.map(({ aliases, ...choice }) => choice) }))
  const exact = createChoiceResolver(withoutAliases, { characters, fuzzy: false })
  const approximate = createChoiceResolver(withoutAliases, { characters })
  let missed = 0, recovered = 0
  for (const scenario of verified) {
    const kind = choiceKind(scenario.path), texts = scenario.choices.map(choice => choice.original)
    const expected = scenario.choices.map(effectKey)
    const precise = original(kind, texts, scenario.character)
    assert.deepEqual(precise.map(effectKey), expected, scenario.path)
    assert.ok(precise.every(choice => !choice.match), scenario.path)
    if (exact(kind, texts, scenario.character)?.every(Boolean)) continue
    missed++
    const result = approximate(kind, texts, scenario.character)
    if (!result?.every(Boolean)) continue
    recovered++
    assert.deepEqual(result.map(effectKey), expected, scenario.path)
    assert.ok(result.some(choice => choice.match?.type === 'fuzzy'), scenario.path)
  }
  assert.ok(missed >= 15, 'exercise real historical spelling variants')
  assert.ok(recovered / missed >= .9, 'recover most historical variants without per-case aliases')
})

test('verified scenarios resist duplicate answers and negations while tolerating transcription loss', () => {
  const exact = createChoiceResolver(catalogue, { characters, fuzzy: false })
  const approximate = createChoiceResolver(catalogue, { characters })
  let mutations = 0, recovered = 0, duplicateCases = 0, negationCases = 0
  for (const scenario of verified) {
    const kind = choiceKind(scenario.path), texts = scenario.choices.map(choice => choice.original)
    const expected = scenario.choices.map(effectKey)
    for (let index = 0; index < texts.length; index++) {
      const text = normalizeChoice(texts[index])
      if (text.length >= 10) {
        // A reproducible single-character transcription loss inside an answer.
        const middle = Math.floor(text.length / 2)
        const changed = texts.slice()
        changed[index] = text.slice(0, middle) + text.slice(middle + 1)
        if (!exact(kind, changed, scenario.character)?.every(Boolean)) {
          mutations++
          const result = approximate(kind, changed, scenario.character)
          if (result?.every(Boolean)) {
            recovered++
            assert.deepEqual(result.map(effectKey), expected, `${scenario.path}: ${changed[index]}`)
          }
        }
      }
      if (text.length < 8 || /ない|なく|ません|無理|むり|やめ|止め|ダメ|駄目/.test(text)) continue
      const negated = texts.slice()
      negated[index] = text + 'じゃない'
      if (exact(kind, negated, scenario.character)?.every(Boolean)) continue
      negationCases++
      assert.ok(!approximate(kind, negated, scenario.character)?.every(Boolean), `${scenario.path}: negation`)
    }
    const duplicate = [texts[0], texts[0], texts[2]]
    if (exact(kind, duplicate, scenario.character)?.some(Boolean)) continue
    duplicateCases++
    assert.ok(!approximate(kind, duplicate, scenario.character)?.every(Boolean), `${scenario.path}: duplicate`)
  }
  assert.ok(mutations >= 200 && recovered / mutations >= .8, 'recover small transcription errors conservatively')
  assert.ok(duplicateCases >= 100 && negationCases >= 250, 'exercise rejection across independent verified scenarios')
})
