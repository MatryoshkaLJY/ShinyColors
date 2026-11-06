import { CHOICE_HINT_KEY } from '../../utils/choiceEffects.js'

// AdvPlayer is shared by normal events and shuffled morning/audition lists.
// Record the actual node created for each track, before any layout/shuffling.
export const installChoiceHooks = (AdvPlayer, show, hide, report = () => {}) => {
  const proto = AdvPlayer?.prototype
  if (!proto || typeof proto._addSelectItem !== 'function' || typeof proto._onAppearSelectList !== 'function') return false
  const hints = new WeakMap()
  const watchedLists = new WeakSet()
  const guard = callback => {
    try { return callback() } catch (error) { report(error) }
  }
  const add = proto._addSelectItem
  proto._addSelectItem = function (...args) {
    const list = this._selectList
    const hint = this._trackManager?.currentTrack?.[CHOICE_HINT_KEY]
    if (!list || typeof list.addItem !== 'function') return add.apply(this, args)
    const addItem = list.addItem
    const own = Object.getOwnPropertyDescriptor(list, 'addItem')
    list.addItem = function (...itemArgs) {
      const before = new Set(this.items || [])
      const result = addItem.apply(this, itemArgs)
      guard(() => {
        for (const item of this.items || []) {
          if (!before.has(item) && hint) hints.set(item, hint)
        }
      })
      return result
    }
    try {
      return add.apply(this, args)
    } finally {
      if (own) Object.defineProperty(list, 'addItem', own)
      else delete list.addItem
    }
  }
  const appear = proto._onAppearSelectList
  proto._onAppearSelectList = function (...args) {
    const result = appear.apply(this, args)
    guard(() => {
      const list = this._selectList
      if (typeof list.on === 'function' && !watchedLists.has(list)) {
        watchedLists.add(list)
        // The game animates the chosen bubble before emitting "select".
        list.on('selectStart', () => guard(() => hide(this)))
      }
      show(this, (list.items || []).map(item => ({ item, hint: hints.get(item) })))
    })
    return result
  }
  for (const method of ['_onSelect', 'ezgPostDestroy', '_openLog']) {
    if (typeof proto[method] !== 'function') continue
    const original = proto[method]
    proto[method] = function (...args) {
      guard(() => hide(this))
      return original.apply(this, args)
    }
  }
  if (typeof proto._closeLog === 'function') {
    const close = proto._closeLog
    proto._closeLog = function (...args) {
      const result = close.apply(this, args)
      if (this._selectList?.active) guard(() => show(this,
        (this._selectList.items || []).map(item => ({ item, hint: hints.get(item) }))))
      return result
    }
  }
  return true
}
