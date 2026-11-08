import test from 'node:test'
import assert from 'node:assert/strict'
import { createChoiceOverlay } from '../src/utils/choiceOverlay.js'

// A scene-graph double: no DOM overlay API is available, just as canvas-only
// fullscreen cannot display HTML children. Geometry uses renderer coordinates.
class Container {
  constructor() {
    this.children = []
    this.visible = true
    this.x = this.y = 0
    this.position = { set: (x, y) => { this.x = x; this.y = y } }
  }
  addChild(child) {
    child.parent?.removeChild(child)
    this.children.push(child)
    child.parent = this
    return child
  }
  removeChild(child) {
    this.children.splice(this.children.indexOf(child), 1)
    child.parent = null
  }
  toLocal({ x, y }) {
    const { scale = 1, tx = 0, ty = 0 } = this.parent || {}
    return { x: (x - tx) / scale, y: (y - ty) / scale }
  }
  destroy(options) {
    this.destroyed = true
    if (options?.children) this.children.forEach(child => child.destroy(options))
  }
}
class Text extends Container {
  constructor(text, style) { super(); this.text = text; this.style = style }
  get width() { return Math.min(this.text.length * this.style.fontSize * .6, this.style.wordWrapWidth) }
  get height() { return Math.ceil(this.text.length * this.style.fontSize * .6 / this.style.wordWrapWidth) * this.style.fontSize * 1.35 }
}
class Graphics extends Container {
  clear() {}
  lineStyle() {}
  beginFill() {}
  drawRoundedRect(x, y, width, height) { this.rect = { x, y, width, height } }
  endFill() {}
}
const setup = t => {
  const frames = new Map(), errors = []
  let serial = 0, enabled = true
  t.mock.method(globalThis, 'requestAnimationFrame', callback => { frames.set(++serial, callback); return serial })
  t.mock.method(globalThis, 'cancelAnimationFrame', id => frames.delete(id))
  const parent = new Container()
  const player = parent.addChild(new Container())
  player._selectList = { active: true }
  const bounds = { x: 200, y: 100, width: 300, height: 100 }
  const item = player.addChild(new Container())
  item.getBounds = () => bounds
  const aoba = { Container, Text, Graphics, game: { renderer: { screen: { width: 1136, height: 640 } } } }
  const overlay = createChoiceOverlay(aoba, () => enabled, error => errors.push(error))
  const choices = [{ item, hint: { kind: 'event', effect: { effects: { vocal: 20, dance: 10, sp: 5 } } } }]
  const tick = () => {
    const pending = [...frames.values()]
    frames.clear()
    pending.forEach(callback => callback())
    assert.deepEqual(errors, [])
  }
  return { aoba, parent, player, item, bounds, overlay, choices, frames, errors, tick, disable: () => { enabled = false } }
}
// Supply only frame scheduling and visibility; createElement/fullscreen DOM
// placement would fail these tests instead of silently becoming invisible.
globalThis.requestAnimationFrame = () => {}
globalThis.cancelAnimationFrame = () => {}
globalThis.document = { hidden: false }

test('hints live in the canvas scene, preserve stat colors, and do not intercept taps', t => {
  const s = setup(t)
  s.overlay.show(s.player, s.choices)
  const root = s.parent.children[1], panel = root.children[0]
  assert.equal(root.interactive, false)
  assert.equal(root.interactiveChildren, false)
  assert.equal(panel.interactiveChildren, false)
  assert.equal(panel.y, 203)
  assert.equal(panel.children[1].text, 'Vo +20')
  assert.equal(panel.children[1].style.fill, 0xff82b3)
  assert.equal(panel.children[2].style.fill, 0x70c7ff)
  assert.equal(s.item.children.length, 0, 'hints must not enlarge option bounds')
  s.bounds.y += 25
  s.tick()
  assert.equal(panel.y, 228)
  s.disable()
  s.tick()
  assert.equal(root.visible, false)
  s.overlay.hide()
  assert.equal(root.destroyed, true)
  assert.ok(panel.children.every(child => child.destroyed))
  assert.equal(s.frames.size, 0)
  assert.equal(s.parent.children.length, 1)
})

test('approximate effects are visibly marked while retaining their stat values', t => {
  const s = setup(t)
  s.choices[0].hint.effect.match = { type: 'fuzzy', similarity: .91 }
  s.overlay.show(s.player, s.choices)
  const panel = s.parent.children[1].children[0]
  assert.equal(panel.children[1].text, 'Vo +20')
  assert.match(panel.children.at(-1).text, /近似匹配/)
  s.overlay.hide()
})

test('scaled/translated parents use local coordinates; missing hints and viewport edges remain visible', t => {
  const s = setup(t)
  s.parent.scale = 2
  s.parent.tx = 100
  s.parent.ty = 50
  s.choices[0].hint.effect = null
  s.overlay.show(s.player, s.choices)
  const panel = s.parent.children[1].children[0]
  assert.equal(panel.x, 50)
  assert.equal(panel.y, 78)
  assert.equal(panel.children[1].text, '效果数据暂缺')
  s.bounds.y = 630
  s.tick()
  const height = panel.children[0].rect.height
  assert.ok(panel.y + height <= (640 - 50) / 2)
  s.item.visible = false
  s.tick()
  assert.equal(panel.visible, false)
  s.overlay.hide()
})

test('selection end, player destruction and replacement clean the overlay and frame loop', t => {
  const s = setup(t)
  s.overlay.show(s.player, s.choices)
  const first = s.parent.children[1]
  s.overlay.show(s.player, s.choices)
  assert.equal(first.destroyed, true)
  assert.equal(s.frames.size, 1)
  const second = s.parent.children[1]
  s.overlay.hide({})
  assert.equal(second.destroyed, undefined, 'another player cannot hide this overlay')
  s.player._selectList.active = false
  s.tick()
  assert.equal(second.destroyed, true)
  assert.equal(s.frames.size, 0)
  s.player._selectList.active = true
  s.overlay.show(s.player, s.choices)
  s.player.destroyed = true
  s.tick()
  assert.equal(s.parent.children.length, 1)
  assert.equal(s.frames.size, 0)
  s.overlay.show(s.player, [{ item: s.item }])
  assert.equal(s.parent.children.length, 1)
})


test('small and CSS-rotated mobile canvases keep the main hint at least 10 CSS pixels', t => {
  const s = setup(t)
  let rect = { width: 390, height: 220 }
  s.aoba.game.renderer.view = { getBoundingClientRect: () => rect }
  s.overlay.show(s.player, s.choices)
  const label = s.parent.children[1].children[0].children[1]
  const size = label.style.fontSize
  assert.ok(size * 390 / 1136 >= 10)
  rect = { width: 220, height: 390 }
  s.tick()
  assert.equal(label.style.fontSize, size)
  rect = { width: 1136, height: 640 }
  s.tick()
  assert.equal(label.style.fontSize, 17)
  s.overlay.hide()
})
