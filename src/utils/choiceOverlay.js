import { formatChoiceEffect, projectChoiceBounds } from './choiceEffects.js'

const css = `
#sczh-choice-hints{position:fixed;inset:0;pointer-events:none!important;z-index:2147483000;font-family:HummingStd-E,"Microsoft YaHei",sans-serif}
#sczh-choice-hints[hidden],#sczh-choice-hints [hidden]{display:none!important}
#sczh-choice-hints .sczh-choice-hint{position:absolute;box-sizing:border-box;transform:translate(-50%,0);text-align:center;line-height:1.35;padding:5px 9px;border-radius:8px;background:rgba(26,29,43,.92);color:#fff;border:1px solid rgba(255,255,255,.7);box-shadow:0 2px 7px #0005;white-space:normal;overflow-wrap:anywhere}
#sczh-choice-hints .sczh-choice-hint[data-grade="perfect"],#sczh-choice-hints .sczh-choice-hint[data-grade="up"]{background:rgba(22,87,65,.94)}
#sczh-choice-hints .sczh-choice-hint[data-grade="down"]{background:rgba(120,39,57,.94)}
#sczh-choice-hints .sczh-choice-hint[data-missing="true"]{color:#e5e5ea;background:rgba(65,67,79,.9)}
#sczh-choice-hints .sczh-choice-source{display:block;font-size:.72em;opacity:.75;margin-top:1px}
`

export const createChoiceOverlay = (game, enabled, report = () => {}) => {
  let root, owner, entries = [], frame = null
  const ensureRoot = () => {
    if (!root) {
      const style = document.createElement('style')
      style.textContent = css
      document.head.appendChild(style)
      root = document.createElement('div')
      root.id = 'sczh-choice-hints'
      root.setAttribute('aria-label', '选项效果提示')
      root.hidden = true
    }
    // Fullscreen only displays descendants of the fullscreen element.
    const parent = document.fullscreenElement || document.body
    if (root.parentNode !== parent) parent.appendChild(root)
  }
  const stop = () => {
    if (frame !== null) cancelAnimationFrame(frame)
    frame = null
  }
  const hide = player => {
    if (player && player !== owner) return
    stop()
    if (root) { root.hidden = true; root.replaceChildren() }
    owner = null
    entries = []
  }
  const visible = item => {
    if (!item || item.destroyed || item._destroyed) return false
    for (let node = item; node; node = node.parent) {
      if (node.visible === false || node.renderable === false || node.alpha === 0) return false
    }
    return item.worldAlpha !== 0
  }
  const update = () => {
    frame = null
    try {
      if (!owner || owner.destroyed || owner._destroyed || !owner._selectList?.active || !owner.parent) return hide()
      ensureRoot()
      const renderer = game.renderer
      const canvas = renderer?.view
      const rect = canvas?.getBoundingClientRect()
      const screen = renderer?.screen || { width: game.width, height: game.height }
      root.hidden = !enabled() || document.hidden || !rect || !canvas.isConnected
      if (!root.hidden) {
        for (const { item, element } of entries) {
          const box = visible(item) ? projectChoiceBounds(item.getBounds(), rect, screen) : null
          element.hidden = !box
          if (!box) continue
          const fontSize = Math.max(10, Math.min(19, 17 * box.scale))
          const width = Math.min(Math.max(box.width, 150 * box.scale), rect.width * .48)
          element.style.fontSize = `${fontSize}px`
          element.style.width = `${width}px`
          // Bounds come from the option itself, so bubbles can move or shuffle.
          const left = Math.max(rect.left + width / 2, Math.min(rect.right - width / 2, box.left))
          element.style.left = `${left}px`
          const height = element.offsetHeight
          element.style.top = `${Math.max(rect.top, Math.min(rect.bottom - height, box.top + 3 * box.scale))}px`
        }
      }
      frame = requestAnimationFrame(update)
    } catch (error) {
      report(error)
      hide()
    }
  }
  const show = (player, choices) => {
    hide()
    // Other menus use the same player; only annotated produce choices qualify.
    if (!choices.some(choice => choice.hint)) return
    ensureRoot()
    owner = player
    entries = choices.map(({ item, hint }) => {
      const element = document.createElement('div')
      element.className = 'sczh-choice-hint'
      element.dataset.grade = hint?.effect?.grade || ''
      element.dataset.missing = String(!hint?.effect)
      element.textContent = formatChoiceEffect(hint?.kind, hint?.effect)
      const source = document.createElement('span')
      source.className = 'sczh-choice-source'
      source.textContent = hint?.effect ? 'Wiki · 基础效果' : 'Wiki 暂未收录或选项未匹配'
      element.appendChild(source)
      root.appendChild(element)
      return { item, hint, element }
    })
    update()
  }
  return { show, hide }
}
