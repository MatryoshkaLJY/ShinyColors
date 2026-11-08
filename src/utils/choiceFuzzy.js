const textsOf = choice => [choice.text, ...(choice.aliases || [])]
const effectsKey = choices => JSON.stringify(choices.map(choice => [choice.grade || null,
  Object.entries(choice.effects || {}).sort()]))

// Formatting and kana script can be compared without a dictionary. Kanji are
// retained; small kanji/kana transcription differences use edit distance.
const form = text => text.replace(/[ァ-ヶ]/g, char => String.fromCharCode(char.charCodeAt(0) - 0x60))
  .replace(/[\p{P}\p{S}\s]/gu, '')
const polarity = text => JSON.stringify([
  /ない|なく|なけ|ません/.test(text), /無理|むり|やめ|止め|だめ|駄目/.test(text)
])
const numbers = text => JSON.stringify(text.match(/\d+|[〇零一二三四五六七八九十百千]+(?=回|人|位|番|日|年|月|個|枚|時間|分|点|勝|周|円)/g) || [])

const similarity = (a, b) => {
  if (a === b) return 1
  const length = Math.max(a.length, b.length)
  if (Math.min(a.length, b.length) / length < .7) return 0
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index)
  for (let row = 1; row <= a.length; row++) {
    const current = [row]
    for (let col = 1; col <= b.length; col++) {
      current[col] = Math.min(current[col - 1] + 1, previous[col] + 1,
        previous[col - 1] + (a[row - 1] === b[col - 1] ? 0 : 1))
    }
    previous = current
  }
  return 1 - previous[b.length] / length
}

export const createFuzzyChoiceResolver = (groups, normalize, characters = {}) => {
  const actors = [...new Set([...Object.keys(characters), ...groups.map(group => group.character).filter(Boolean)])]
  const actorOf = group => {
    if (group.character) return group.character
    let source
    try { source = decodeURIComponent(group.source || '').replace(/\s/g, '') } catch { return null }
    return actors.find(actor => source.includes(`/wiki/${actor}/`) || source.endsWith(`_${actor.split('_')[0]}`) ||
      characters[actor]?.names.filter(name => name.replace(/\s/g, '').length >= 3)
        .some(name => source.endsWith(name.replace(/\s/g, '')))) || null
  }
  const describe = value => {
    const exact = normalize(value)
    const comparable = form(exact)
    return { exact, form: comparable, numbers: numbers(exact), polarity: polarity(comparable) }
  }
  const prepared = groups.filter(group => group.choices.length >= 2 && group.choices.length <= 3)
    .map(group => ({ group, actor: actorOf(group), choices: group.choices.map(choice => textsOf(choice).map(describe)) }))
  const cache = new Map()
  return (kind, texts, character) => {
    const key = JSON.stringify([kind, character, texts.map(normalize)])
    if (cache.has(key)) return cache.get(key)
    const input = texts.map(describe)
    let result = null
    if (texts.length >= 2 && texts.length <= 3 && input.every(text => text.form) &&
      new Set(input.map(text => text.form)).size === texts.length && (kind !== 'morning' || character)) {
      const candidates = []
      for (const entry of prepared) {
        const { group, actor } = entry
        if (group.kind !== kind || group.choices.length !== texts.length ||
          (character && actor && actor !== character)) continue
        const scoped = !!character && actor === character
        const matrix = input.map(text => entry.choices.map(variants => {
          let best = { score: 0, exact: false, sameForm: false }
          for (const variant of variants) {
            if (!variant.form || text.numbers !== variant.numbers || text.polarity !== variant.polarity) continue
            const score = similarity(text.form, variant.form)
            if (score > best.score || score === best.score && text.exact === variant.exact) {
              best = { score, exact: text.exact === variant.exact, sameForm: text.form === variant.form,
                short: Math.min(text.form.length, variant.form.length) < 6, matchedText: variant.exact }
            }
          }
          return best
        }))
        if (matrix.some(row => row.every(pair => pair.score < .7))) continue
        const visit = (order, pairs) => {
          if (order.length < texts.length) {
            for (let next = 0; next < texts.length; next++) {
              if (!order.includes(next) && matrix[order.length][next].score >= .7) {
                visit([...order, next], [...pairs, matrix[order.length][next]])
              }
            }
            return
          }
          const score = pairs.reduce((sum, pair) => sum + pair.score, 0) / pairs.length
          if (score < .85) return
          const anchors = pairs.filter(pair => pair.exact).length
          const minimum = Math.min(...pairs.map(pair => pair.score))
          // Two exact anchors allow one modest transcription error; fewer
          // anchors need a known character and much stronger pair scores.
          // Short changed answers have too little context for edit distance.
          const eligible = pairs.every(pair => pair.sameForm) ||
            !pairs.some(pair => pair.short && !pair.sameForm) && (
              texts.length === 3 && anchors >= 2 && minimum >= .7 && score >= .9 ||
              scoped && anchors >= 1 && minimum >= .84 && score >= .92 ||
              scoped && minimum >= .9 && score >= .94)
          const aligned = order.map(index => group.choices[index])
          candidates.push({ group, choices: aligned, pairs, score, eligible, effects: effectsKey(aligned) })
        }
        visit([], [])
      }
      candidates.sort((a, b) => b.score - a.score)
      const best = candidates[0]
      // Compare aligned effects, including alternative permutations within a
      // group. A close rival must not silently exchange two answer effects.
      if (best?.eligible && !candidates.some(candidate => candidate.effects !== best.effects && best.score - candidate.score < .06)) {
        result = best.choices.map((choice, index) => ({ ...choice,
          source: choice.source || best.group.source, title: best.group.title,
          match: { type: 'fuzzy', similarity: Number(best.pairs[index].score.toFixed(3)),
            groupSimilarity: Number(best.score.toFixed(3)), matchedText: best.pairs[index].matchedText } }))
      }
    }
    if (cache.size >= 256) cache.delete(cache.keys().next().value)
    cache.set(key, result)
    return result
  }
}
