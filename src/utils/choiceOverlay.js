import { formatChoiceEffect, formatChoiceStats } from './choiceEffects.js'

const colors = { vocal: 0xff82b3, dance: 0x70c7ff, visual: 0xffe071 }

// Render hints in the same scene as the options. DOM overlays are not drawn in
// canvas fullscreen and do not inherit the game's mobile CSS rotation/scaling.
export const createChoiceOverlay = (aoba, enabled, report = () => {}) => {
  const game = aoba.game
  let root, owner, entries = [], frame = null
  const stop = () => {
    if (frame !== null) cancelAnimationFrame(frame)
    frame = null
  }
  const hide = player => {
    if (player && player !== owner) return
    stop()
    if (root) {
      if (root.parent) root.parent.removeChild(root)
      // Text textures belong to this overlay, not the game's shared assets.
      if (!root.destroyed && !root._destroyed) root.destroy({ children: true })
    }
    root = owner = null
    entries = []
  }
  const visible = item => {
    if (!item || item.destroyed || item._destroyed) return false
    for (let node = item; node; node = node.parent) {
      if (node.visible === false || node.renderable === false || node.alpha === 0) return false
    }
    return item.worldAlpha !== 0
  }
  // getBounds() is in renderer coordinates. Convert all four corners into the
  // overlay parent's coordinates, including scaled/translated scene parents.
  const localBounds = bounds => {
    const points = [
      [bounds.x, bounds.y], [bounds.x + bounds.width, bounds.y],
      [bounds.x, bounds.y + bounds.height], [bounds.x + bounds.width, bounds.y + bounds.height]
    ].map(([x, y]) => root.toLocal({ x, y }))
    const xs = points.map(p => p.x), ys = points.map(p => p.y)
    const x = Math.min(...xs), y = Math.min(...ys)
    return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y }
  }
  const text = (value, fontSize, fill = 0xffffff) => {
    const label = new aoba.Text(value, {
      fontFamily: 'HummingStd-E,"Microsoft YaHei",sans-serif',
      fontSize, fill, align: 'center', wordWrap: true, breakWords: true,
      wordWrapWidth: 300
    })
    label.interactive = false
    return label
  }
  const update = () => {
    frame = null
    try {
      if (!owner || owner.destroyed || owner._destroyed || !owner._selectList?.active || !owner.parent) return hide()
      // Keep the layer above the bubbles, without putting it inside an item:
      // children of an item would change getBounds() and feed back into layout.
      if (root.parent !== owner.parent) owner.parent.addChild(root)
      const screen = game.renderer?.screen || { x: 0, y: 0, width: game.width, height: game.height }
      const viewport = localBounds({ x: screen.x || 0, y: screen.y || 0, width: screen.width, height: screen.height })
      const canvasRect = game.renderer?.view?.getBoundingClientRect()
      // Use the long edge so a 90-degree CSS rotation has the same text size.
      const displayScale = canvasRect && Math.max(canvasRect.width, canvasRect.height) / Math.max(screen.width, screen.height)
      const unit = viewport.width / screen.width
      const fontSize = (displayScale > 0 ? Math.max(17, 10 / displayScale) : 17) * unit
      root.visible = enabled() && !document.hidden && visible(owner)
      if (root.visible && viewport.width > 0 && viewport.height > 0) {
        for (const entry of entries) {
          const { item, panel, background, labels, source } = entry
          const box = visible(item) ? localBounds(item.getBounds()) : null
          panel.visible = !!box && [box.x, box.y, box.width, box.height].every(Number.isFinite) && box.width > 0 && box.height > 0
          if (!panel.visible) continue
          const width = Math.min(Math.max(box.width, 150), viewport.width * .48)
          const contentWidth = Math.max(1, width - 18)
          let x = 0, y = 5, rowHeight = 0
          const rows = [[]]
          for (const label of labels) {
            if (label.style.fontSize !== fontSize) label.style.fontSize = fontSize
            if (label.style.wordWrapWidth !== contentWidth) label.style.wordWrapWidth = contentWidth
            if (x && x + label.width > contentWidth) {
              y += rowHeight
              x = rowHeight = 0
              rows.push([])
            }
            label.position.set(x, y)
            rows[rows.length - 1].push(label)
            x += label.width + 6
            rowHeight = Math.max(rowHeight, label.height)
          }
          for (const row of rows) {
            const used = row.reduce((sum, label) => sum + label.width + 6, -6)
            row.forEach(label => { label.x += (width - used) / 2 })
          }
          if (source.style.fontSize !== fontSize * 12 / 17) source.style.fontSize = fontSize * 12 / 17
          if (source.style.wordWrapWidth !== contentWidth) source.style.wordWrapWidth = contentWidth
          source.position.set((width - source.width) / 2, y + rowHeight + 1)
          const height = source.y + source.height + 5
          if (entry.width !== width || entry.height !== height) {
            background.clear()
            background.lineStyle(1, 0xffffff, .7)
            background.beginFill(entry.color, .94)
            background.drawRoundedRect(0, 0, width, height, 8)
            background.endFill()
            entry.width = width
            entry.height = height
          }
          panel.position.set(
            Math.max(viewport.x, Math.min(viewport.x + viewport.width - width, box.x + (box.width - width) / 2)),
            Math.max(viewport.y, Math.min(viewport.y + viewport.height - height, box.y + box.height + 3)))
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
    if (!choices.some(choice => choice.hint)) return
    try {
      owner = player
      root = new aoba.Container()
      // Hints must never intercept a tap or change selection hit testing.
      root.interactive = false
      root.interactiveChildren = false
      owner.parent.addChild(root)
      entries = choices.map(({ item, hint }) => {
        const panel = new aoba.Container()
        panel.interactive = panel.interactiveChildren = false
        const background = new aoba.Graphics()
        panel.addChild(background)
        const stats = hint?.kind === 'event' ? formatChoiceStats(hint.effect) : []
        const labels = stats.length
          ? stats.map(stat => text(stat.text, 17, colors[stat.stat] || 0xffffff))
          : [text(formatChoiceEffect(hint?.kind, hint?.effect), 17)]
        labels.forEach(label => panel.addChild(label))
        const source = text(hint?.effect?.match?.type === 'fuzzy' ? '近似匹配 · Wiki 基础效果' :
          hint?.effect ? 'Wiki · 基础效果' : 'Wiki 暂未收录或选项未匹配', 12)
        source.alpha = .75
        panel.addChild(source)
        root.addChild(panel)
        const color = !hint?.effect ? 0x41434f : ['perfect', 'up'].includes(hint.effect.grade) ? 0x165741 : 0x1a1d2b
        return { item, panel, background, labels, source, color }
      })
      update()
    } catch (error) {
      report(error)
      hide()
    }
  }
  return { show, hide }
}
