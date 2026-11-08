// Match original choices as a set: morning communication shuffles their order.
// Keep this independent of the game and DOM so mismatches can be tested offline.
import { createFuzzyChoiceResolver } from './choiceFuzzy.js'

export const normalizeChoice = text => (typeof text === 'string' ? text : '')
  .normalize('NFKC')
  .replace(/\\n|\\r/g, '')
  .replace(/[\s\u200b-\u200d\ufeff]/g, '')
  .replace(/[.…⋯]{2,}|…+/g, '…')
  .replace(/[〜～]/g, '~')

export const choiceKind = path => {
  if (/\/produce_communications\//.test(path)) return 'morning'
  if (/\/produce_communication_(cheers|auditions)\//.test(path)) return 'audition'
  if (/\/produce_events\//.test(path)) return 'event'
  return null
}

export const CHOICE_HINT_KEY = '__sczhChoiceHint'

const signature = choices => choices.map(normalizeChoice).sort().join('\u0000')
const choiceTexts = choice => [choice.text, ...(choice.aliases || [])]
const groupSignatures = choices => choices.reduce((sets, choice) => sets.flatMap(texts =>
  choiceTexts(choice).map(text => [...texts, text])), [[]]).map(signature)
const effectSignature = choice => JSON.stringify([choice.grade || null,
  Object.entries(choice.effects || {}).sort()])

const unambiguousEffect = matches => matches.length && new Set(matches.map(effectSignature)).size === 1 ? matches[0] : null
const withSource = (choice, group) => ({ ...choice, source: choice.source || group.source, title: group.title })

export const createChoiceCharacterResolver = characters => {
  const names = new Map()
  const ids = new Map()
  Object.entries(characters).forEach(([key, character]) => {
    ids.set(String(Number(character.id)), key)
    character.names.forEach(name => names.set(normalizeChoice(name), key))
  })
  return tracks => {
    const actors = new Set()
    for (const track of tracks) {
      const name = names.get(normalizeChoice(track?.speaker))
      if (name) actors.add(name)
      // Character IDs are useful when the scenario hides the speaker's name.
      if (['character', 'characters'].includes(track?.charType) && /^\d+$/.test(track.charId)) {
        const actor = ids.get(String(Number(track.charId)))
        if (actor) actors.add(actor)
      }
    }
    return actors.size === 1 ? [...actors][0] : null
  }
}

export const createChoiceResolver = (groups, { fuzzy = true, characters = {} } = {}) => {
  const index = new Map()
  const morningByCharacter = new Map()
  let fuzzyResolve
  groups.forEach(group => {
    for (const sig of new Set(groupSignatures(group.choices))) {
      const key = `${group.kind}:${sig}`
      const candidates = index.get(key) || []
      candidates.push(group)
      index.set(key, candidates)
    }
    if (group.kind === 'morning' && group.character) {
      const character = morningByCharacter.get(group.character) || new Map()
      group.choices.forEach(choice => {
        for (const text of new Set(choiceTexts(choice).map(normalizeChoice))) {
          character.set(text, [...(character.get(text) || []), withSource(choice, group)])
        }
      })
      morningByCharacter.set(group.character, character)
    }
  })
  return (kind, texts, character = null) => {
    if (!kind || texts.length < 2 || texts.some(text => !normalizeChoice(text))) return null
    const candidates = (index.get(`${kind}:${signature(texts)}`) || [])
      .filter(group => kind !== 'morning' || !character || group.character === character)
    // Known exact conflicts stay unknown. Fuzzy matching only fills a missing
    // complete group, using a one-to-one assignment and a runner-up margin.
    if (!candidates.length && fuzzy) {
      if (!fuzzyResolve) fuzzyResolve = createFuzzyChoiceResolver(groups, normalizeChoice, characters)
      const results = fuzzyResolve(kind, texts, character)
      if (results) return results
    }
    // A typo or variant in one Wiki cell must not hide the other two answers.
    // Scope individual morning answers to their character; identical wording
    // can carry a different grade in another character's communication.
    if (!candidates.length && kind === 'morning' && character) {
      const answers = morningByCharacter.get(character)
      const results = texts.map(text => unambiguousEffect(answers?.get(normalizeChoice(text)) || []))
      return results.some(Boolean) ? results : null
    }
    if (!candidates.length) return null
    const results = texts.map(text => {
      const key = normalizeChoice(text)
      const matches = candidates.flatMap(group => group.choices
        .filter(choice => choiceTexts(choice).some(text => normalizeChoice(text) === key))
        .map(choice => withSource(choice, group)))
      // Contradictory Wiki entries must never turn into a confident hint.
      return unambiguousEffect(matches)
    })
    return results.some(Boolean) ? results : null
  }
}

// The game can filter a larger scenario down to three available answers. Match
// again using only the nodes that actually appear, still using original text.
export const resolveDisplayedChoices = (choices, resolve) => {
  if (!choices.length || choices.some(choice => !choice.hint)) return choices
  const kind = choices[0].hint.kind
  const character = choices[0].hint.character || null
  if (choices.some(choice => choice.hint.kind !== kind || (choice.hint.character || null) !== character)) return choices
  const effects = resolve(kind, choices.map(choice => choice.hint.original), character)
  if (!effects) return choices
  return choices.map((choice, index) => ({ ...choice,
    hint: { ...choice.hint, effect: effects[index] } }))
}

export const captureChoiceGroups = (tracks, path, resolve, identifyCharacter = () => null) => {
  if (!Array.isArray(tracks)) return
  const kind = choiceKind(path)
  if (!kind) return
  const character = identifyCharacter(tracks)
  let group = []
  const flush = () => {
    if (group.length > 1) {
      const originals = group.map(track => track[CHOICE_HINT_KEY]?.original || track.select)
      const actor = character || group[0][CHOICE_HINT_KEY]?.character || null
      const effects = resolve(kind, originals, actor)
      group.forEach((track, index) => {
        track[CHOICE_HINT_KEY] = { kind, character: actor, original: originals[index], effect: effects?.[index] || null }
      })
    }
    group = []
  }
  tracks.forEach(track => {
    if (typeof track?.select === 'string' && track.select) group.push(track)
    else flush()
  })
  flush()
}

const labels = { vocal: 'Vo', dance: 'Da', visual: 'Vi', mental: 'Me', sp: 'SP' }
export const formatChoiceStats = effect => Object.keys(labels)
  .filter(stat => Number.isFinite(effect?.effects?.[stat]) && effect.effects[stat] !== 0)
  .map(stat => ({ stat, text: `${labels[stat]} ${effect.effects[stat] > 0 ? '+' : ''}${effect.effects[stat]}` }))

export const formatChoiceEffect = (kind, effect) => {
  if (!effect) return '效果数据暂缺'
  if (kind === 'morning') {
    return {
      perfect: 'Perfect · 亲爱度 +3 · 心情上升',
      good: 'Good · 亲爱度 +1',
      normal: 'Normal · 亲爱度不变'
    }[effect.grade] || '效果数据暂缺'
  }
  if (kind === 'audition') {
    return { up: '心情上升', neutral: '心情不变', down: '心情下降' }[effect.grade] || '效果数据暂缺'
  }
  const parts = formatChoiceStats(effect).map(part => part.text)
  return parts.length ? parts.join(' · ') : '效果数据暂缺'
}

// PIXI bounds use renderer coordinates; DOM overlays use CSS pixels. Both the
// canvas's actual position and its displayed size matter (including letterbox).
export const projectChoiceBounds = (bounds, canvasRect, screen) => {
  if (!bounds || !screen || screen.width <= 0 || screen.height <= 0 ||
    canvasRect.width <= 0 || canvasRect.height <= 0) return null
  const sx = canvasRect.width / screen.width
  const sy = canvasRect.height / screen.height
  const values = [bounds.x, bounds.y, bounds.width, bounds.height]
  if (!values.every(Number.isFinite) || bounds.width <= 0 || bounds.height <= 0) return null
  return { left: canvasRect.left + (bounds.x - (screen.x || 0) + bounds.width / 2) * sx,
    top: canvasRect.top + (bounds.y - (screen.y || 0) + bounds.height) * sy,
    width: bounds.width * sx, scale: Math.min(sx, sy) }
}
