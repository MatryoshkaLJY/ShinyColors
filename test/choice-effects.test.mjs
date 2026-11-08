import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  CHOICE_HINT_KEY, normalizeChoice, choiceKind, createChoiceResolver,
  captureChoiceGroups, formatChoiceEffect, projectChoiceBounds, resolveDisplayedChoices, createChoiceCharacterResolver
} from '../src/utils/choiceEffects.js'
import { installChoiceHooks } from '../src/modules/story/choiceHooks.js'

const characters = JSON.parse(readFileSync(new URL('../src/data/choice-characters.json', import.meta.url)))
const identifyCharacter = createChoiceCharacterResolver(characters)

const choices = [
  { text: '公園にしよう', effects: { vocal: 20, mental: 10, sp: 10 } },
  { text: 'デパートの屋上にしよう', effects: { dance: 20, mental: 10, sp: 10 } },
  { text: 'ショッピングモールにしよう', effects: { visual: 20, mental: 10, sp: 10 } }
]
const group = { kind: 'event', title: 'いつかの気持ち', source: 'https://shinycolors.wiki/wiki/P-SSR1_Mano', choices }
const resolve = createChoiceResolver([group])

test('shuffled options keep their effects; whitespace and ellipses are normalized', () => {
  const results = resolve('event', ['ショッピングモールに\nしよう', '公園にしよう', 'デパートの屋上にしよう'])
  assert.equal(results[0].effects.visual, 20)
  assert.equal(results[1].effects.vocal, 20)
  assert.equal(results[2].effects.dance, 20)
  assert.equal(normalizeChoice('ほわっ……\n\u200bＡ！'), normalizeChoice('ほわっ… A！'))
})

test('a shared option alone, incomplete groups and another event category cannot match', () => {
  assert.equal(resolve('event', ['公園にしよう', '別の選択肢']), null)
  assert.equal(resolve('event', ['公園にしよう']), null)
  assert.equal(resolve('audition', choices.map(c => c.text)), null)
})

test('conflicting sources suppress only the ambiguous effect', () => {
  const other = { ...group, choices: choices.map((c, i) => i === 0 ? { ...c, effects: { visual: 40 } } : c) }
  const results = createChoiceResolver([group, other])('event', choices.map(c => c.text))
  assert.equal(results[0], null)
  assert.equal(results[1].effects.dance, 20)
})

test('original matching survives translation, JSON scenario caches and multiple branch groups', () => {
  const tracks = [{ text: 'opening' }, ...choices.map((c, i) => ({ select: c.text, nextLabel: String(i) })),
    { text: 'another branch' }, { select: '未知甲' }, { select: '未知乙' }, { label: 'end' }]
  captureChoiceGroups(tracks, '/assets/json/produce_events/123.json', resolve)
  tracks[1].select = '去公园吧'
  const cached = JSON.parse(JSON.stringify(tracks))
  assert.equal(cached[1][CHOICE_HINT_KEY].effect.effects.vocal, 20)
  assert.equal(cached[1][CHOICE_HINT_KEY].original, '公園にしよう')
  assert.equal(cached[5][CHOICE_HINT_KEY].effect, null)
  assert.equal(cached[0][CHOICE_HINT_KEY], undefined)
  assert.equal(cached[7][CHOICE_HINT_KEY], undefined)
})

test('only the requested produce scenario families get annotated', () => {
  assert.equal(choiceKind('/assets/json/produce_communications/100.json'), 'morning')
  assert.equal(choiceKind('/assets/json/produce_communication_cheers/100.json'), 'audition')
  assert.equal(choiceKind('/assets/json/produce_communication_auditions/100.json'), 'audition')
  assert.equal(choiceKind('/assets/json/game_event_communications/100.json'), null)
  assert.equal(choiceKind('/assets/json/produce_communications_promises/100.json'), null)
})

test('filters and translates a larger pool before resolving the displayed answers', () => {
  const tracks = [...choices.map(c => ({ select: c.text })), { select: '隐藏选项' }]
  captureChoiceGroups(tracks, '/assets/json/produce_events/100.json', resolve)
  assert.equal(tracks[0][CHOICE_HINT_KEY].effect, null)
  const displayed = tracks.slice(0, 3).reverse().map(track => ({ item: {}, hint: track[CHOICE_HINT_KEY] }))
  const resolved = resolveDisplayedChoices(displayed, resolve)
  assert.equal(resolved[0].hint.effect.effects.visual, 20)
  assert.equal(resolved[2].hint.effect.effects.vocal, 20)
  assert.equal(tracks[0][CHOICE_HINT_KEY].effect, null)
})

test('formats actual base stats, grade effects and missing records separately', () => {
  assert.equal(formatChoiceEffect('event', choices[0]), 'Vo +20 · Me +10 · SP +10')
  assert.match(formatChoiceEffect('morning', { grade: 'perfect' }), /亲爱度 \+3/)
  assert.equal(formatChoiceEffect('audition', { grade: 'down' }), '心情下降')
  assert.equal(formatChoiceEffect('event', null), '效果数据暂缺')
})

test('canvas projection respects its CSS rectangle rather than browser viewport or backing pixels', () => {
  const rect = { left: 80, top: 100, width: 568, height: 320 }
  assert.deepEqual(projectChoiceBounds({ x: 100, y: 40, width: 300, height: 150 }, rect, { width: 1136, height: 640 }),
    { left: 205, top: 195, width: 150, scale: .5 })
  assert.equal(projectChoiceBounds({ x: 0, y: 0, width: NaN, height: 1 }, rect, { width: 1136, height: 640 }), null)
})

test('player hooks bind effects to nodes before shuffle and restore the original addItem', () => {
  let shown, hidden = 0
  class Player {
    constructor() {
      this._trackManager = {}
      this._selectList = {
        items: [], active: false,
        on: (event, callback) => { this[event] = callback },
        addItem(text) { this.items.push({ text }) }
      }
    }
    _addSelectItem(text) {
      this._selectList.addItem(text)
      if (this._selectList.items.length === 3) {
        this._selectList.items.reverse()
        this._selectList.active = true
        this._onAppearSelectList()
      }
      return 'original result'
    }
    _onAppearSelectList() { this.appeared = true }
    _onSelect() { return 'selected' }
    ezgPostDestroy() { return 'destroyed' }
  }
  const player = new Player()
  const addItem = player._selectList.addItem
  installChoiceHooks(Player, (p, entries) => { shown = entries }, () => { hidden++ })
  const tracks = choices.map(c => ({ select: c.text }))
  captureChoiceGroups(tracks, '/assets/json/produce_events/123.json', resolve)
  for (const track of tracks) {
    player._trackManager.currentTrack = track
    assert.equal(player._addSelectItem('translated ' + track.select), 'original result')
    assert.equal(player._selectList.addItem, addItem)
  }
  assert.equal(player.appeared, true)
  assert.equal(shown[0].hint.effect.effects.visual, 20)
  assert.equal(shown[2].hint.effect.effects.vocal, 20)
  player.selectStart()
  assert.equal(hidden, 1)
  assert.equal(player._onSelect(), 'selected')
  assert.equal(player.ezgPostDestroy(), 'destroyed')
  assert.equal(hidden, 3)
})

test('hint failures leave selection and game errors intact', () => {
  const failure = new Error('game failure')
  class Player {
    constructor() { this._selectList = { items: [], addItem() {} } }
    _addSelectItem() { throw failure }
    _onAppearSelectList() { return 42 }
    _onSelect() { return 'ok' }
  }
  let errors = 0
  installChoiceHooks(Player, () => { throw new Error('overlay failure') }, () => { throw new Error('hide failure') }, () => { errors++ })
  const player = new Player()
  const original = player._selectList.addItem
  assert.equal(player._onAppearSelectList(), 42)
  assert.equal(player._onSelect(), 'ok')
  assert.throws(() => player._addSelectItem(), error => error === failure)
  assert.equal(player._selectList.addItem, original)
  assert.equal(errors, 2)
})

test('bundled Wiki catalogue includes real data for all three option types', () => {
  const catalogue = JSON.parse(readFileSync(new URL('../src/data/choice-effects.json', import.meta.url)))
  const counts = Object.fromEntries(['event', 'morning', 'audition'].map(kind => [kind,
    catalogue.groups.filter(g => g.kind === kind).length]))
  assert.ok(counts.event >= 500)
  assert.ok(counts.morning >= 300)
  assert.ok(counts.audition >= 100)
  const lookup = createChoiceResolver(catalogue.groups)
  assert.equal(lookup('event', choices.map(c => c.text))[0].effects.vocal, 20)
  for (const record of catalogue.groups) {
    assert.match(record.source, /^https:\/\/shinycolors\.wiki\/wiki\//)
    assert.ok(record.choices.length >= 2 && record.choices.length <= 3)
  }
})

test('identifies morning characters from original speakers, translated names or explicit character models', () => {
  assert.equal(identifyCharacter([{ speaker: 'プロデューサー' }, { speaker: '愛依' }]), 'Mei_Izumi')
  assert.equal(identifyCharacter([{ speaker: '和泉 爱依' }]), 'Mei_Izumi')
  assert.equal(identifyCharacter([{ charType: 'characters', charId: '019' }]), 'Mei_Izumi')
  assert.equal(identifyCharacter([{ speaker: '愛依' }, { speaker: '冬優子' }]), null)
  assert.equal(identifyCharacter([{ speaker: 'プロデューサー' }]), null)
})

test('a mismatched morning answer does not suppress known answers or borrow another character’s grade', () => {
  const base = { kind: 'morning', title: '1', source: 'wiki' }
  const mei = { ...base, character: 'Mei_Izumi', choices: [
    { text: '共通の回答', grade: 'perfect' }, { text: '愛依の回答', grade: 'good' }, { text: '愛依だけの回答', grade: 'normal' }
  ] }
  const fuyuko = { ...base, character: 'Fuyuko_Mayuzumi', choices: [
    { text: '共通の回答', grade: 'normal' }, { text: '冬優子の回答', grade: 'good' }, { text: '冬優子だけの回答', grade: 'perfect' }
  ] }
  const lookup = createChoiceResolver([mei, fuyuko])
  const result = lookup('morning', ['共通の回答', '愛依の回答', 'Wiki未収録'], 'Mei_Izumi')
  assert.equal(result[0].grade, 'perfect')
  assert.equal(result[1].grade, 'good')
  assert.equal(result[2], null)
  assert.equal(lookup('morning', ['共通の回答', 'Wiki未収録'], 'Fuyuko_Mayuzumi')[0].grade, 'normal')
  assert.equal(lookup('morning', ['冬優子の回答', '冬優子だけの回答'], 'Mei_Izumi'), null)
  assert.equal(lookup('morning', ['共通の回答', '愛依の回答', 'Wiki未収録']), null)
})

test('all 15 Mei morning conversations match verified Japanese choices, including the two transcription fixes', () => {
  const { groups } = JSON.parse(readFileSync(new URL('../src/data/choice-effects.json', import.meta.url)))
  const canonical = JSON.parse(readFileSync(new URL('./fixtures/mei-morning.json', import.meta.url)))
  const lookup = createChoiceResolver(groups)
  assert.equal(canonical.length, 15)
  assert.equal(groups.filter(g => g.kind === 'morning' && g.character === 'Mei_Izumi').length, 15)
  for (const conversation of canonical) {
    const tracks = [{ speaker: '愛依', text: 'opening' },
      ...Object.entries(conversation).map(([grade, select]) => ({ select, nextLabel: grade })), { label: 'end' }]
    captureChoiceGroups(tracks, '/assets/json/produce_communications/mei.json', lookup, identifyCharacter)
    // Simulate translation, the JSON cache, filtering and shuffled on-screen nodes.
    tracks.filter(t => t.select).forEach(t => { t.select = '中文选项' })
    const cached = JSON.parse(JSON.stringify(tracks))
    captureChoiceGroups(cached, '/assets/json/produce_communications/mei.json', lookup, identifyCharacter)
    const displayed = cached.filter(t => t.select).reverse().map(track => ({ item: {}, hint: track[CHOICE_HINT_KEY] }))
    const resolved = resolveDisplayedChoices(displayed, lookup)
    for (const { hint } of resolved) {
      assert.equal(hint.character, 'Mei_Izumi')
      const expected = Object.entries(conversation).find(([, text]) => text === hint.original)[0]
      assert.equal(hint.effect?.grade, expected, hint.original)
    }
  }
})

test('Hana Eyes On You choices match verified scenario text after translation, caching and shuffle', () => {
  const { groups } = JSON.parse(readFileSync(new URL('../src/data/choice-effects.json', import.meta.url)))
  const scenarios = JSON.parse(readFileSync(new URL('./fixtures/hana-ssr1-choices.json', import.meta.url)))
  const lookup = createChoiceResolver(groups)
  for (const { path, choices } of scenarios) {
    const tracks = [{ speaker: '羽那', text: '……？' }, ...choices.map(choice => ({ select: choice.original })), { label: 'end' }]
    captureChoiceGroups(tracks, path, lookup)
    tracks.slice(1, -1).forEach((track, index) => { track.select = choices[index].translation })
    const cached = JSON.parse(JSON.stringify(tracks))
    captureChoiceGroups(cached, path, lookup)
    const displayed = cached.filter(track => track.select).reverse().map(track => ({ item: {}, hint: track[CHOICE_HINT_KEY] }))
    for (const { hint } of resolveDisplayedChoices(displayed, lookup)) {
      const expected = choices.find(choice => choice.original === hint.original)
      assert.deepEqual(hint.effect?.effects, expected.effects, hint.original)
    }
  }
})


test('Amana audition choices retain all three grades after translation, caching and shuffling', () => {
  const { groups } = JSON.parse(readFileSync(new URL('../src/data/choice-effects.json', import.meta.url)))
  const scenarios = JSON.parse(readFileSync(new URL('./fixtures/amana-audition.json', import.meta.url)))
  const lookup = createChoiceResolver(groups)
  assert.equal(scenarios.length, 4)
  for (const { path, choices } of scenarios) {
    const tracks = [{ speaker: '甘奈', text: 'opening' }, ...choices.map(choice => ({ select: choice.original })), { label: 'end' }]
    captureChoiceGroups(tracks, path, lookup, identifyCharacter)
    for (const track of tracks.filter(track => track.select)) {
      const expected = choices.find(choice => choice.original === track.select)
      assert.equal(track[CHOICE_HINT_KEY].effect?.grade, expected.grade, `${path}: ${expected.original}`)
      track.select = expected.translation
    }
    const cached = JSON.parse(JSON.stringify(tracks))
    captureChoiceGroups(cached, path, lookup, identifyCharacter)
    const displayed = cached.filter(track => track.select).reverse().map(track => ({ item: {}, hint: track[CHOICE_HINT_KEY] }))
    for (const { hint } of resolveDisplayedChoices(displayed, lookup)) {
      const expected = choices.find(choice => choice.original === hint.original)
      assert.equal(hint.effect?.grade, expected.grade, `${path}: ${hint.original}`)
    }
  }
})

test('Chiyoko Big Chance choices retain their stat effects after translation, caching and shuffling', () => {
  const { groups } = JSON.parse(readFileSync(new URL('../src/data/choice-effects.json', import.meta.url)))
  const scenarios = JSON.parse(readFileSync(new URL('./fixtures/chiyoko-wing.json', import.meta.url)))
  const lookup = createChoiceResolver(groups)
  for (const { path, choices } of scenarios) {
    const tracks = [{ speaker: 'プロデューサー', text: 'opening' },
      ...choices.map(choice => ({ select: choice.original })), { label: 'end' }]
    captureChoiceGroups(tracks, path, lookup, identifyCharacter)
    tracks.slice(1, -1).forEach((track, index) => { track.select = choices[index].translation })
    const cached = JSON.parse(JSON.stringify(tracks))
    captureChoiceGroups(cached, path, lookup, identifyCharacter)
    const displayed = cached.filter(track => track.select).reverse().map(track => ({ item: {}, hint: track[CHOICE_HINT_KEY] }))
    for (const { hint } of resolveDisplayedChoices(displayed, lookup)) {
      const expected = choices.find(choice => choice.original === hint.original)
      assert.deepEqual(hint.effect?.effects, expected.effects, `${path}: ${hint.original}`)
    }
  }
})
