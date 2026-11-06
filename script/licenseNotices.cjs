const { readFileSync, readdirSync, existsSync } = require('node:fs')
const path = require('node:path')

const bundledNotices = (moduleIds, root = process.cwd()) => {
  const packages = new Map()
  for (const id of moduleIds) {
    if (id.startsWith('\0') || !id.includes('node_modules')) continue
    let directory = path.dirname(id.split('?')[0])
    while (directory !== path.dirname(directory)) {
      const manifest = path.join(directory, 'package.json')
      if (existsSync(manifest)) {
        const pkg = JSON.parse(readFileSync(manifest, 'utf8'))
        if (pkg.name) {
          if (!packages.has(pkg.name)) {
            const files = readdirSync(directory).filter(name => /^(licen[cs]e|copying|notice)(\.[^/]*)?$/i.test(name)).sort()
            if (!files.some(name => /^(licen[cs]e|copying)/i.test(name))) {
              throw new Error(`Missing bundled dependency license: ${pkg.name}`)
            }
            const notices = files.map(name => readFileSync(path.join(directory, name), 'utf8').trim()).join('\n\n')
            packages.set(pkg.name, `${pkg.name} ${pkg.version || ''}\n${notices}`)
          }
          break
        }
      }
      directory = path.dirname(directory)
    }
  }
  const dependencies = [...packages.entries()].sort(([a], [b]) => a.localeCompare(b))
    .map(([, notice]) => notice).join('\n\n----------------------------------------\n\n')
  const notices = [
    'Program code — MIT\nOriginal project: https://github.com/biuuu/ShinyColors',
    readFileSync(path.join(root, 'LICENSE'), 'utf8').trim(),
    'Effect data — separate data license',
    readFileSync(path.join(root, 'src/data/LICENSE'), 'utf8').trim(),
    'Bundled runtime dependencies — their respective licenses',
    dependencies
  ].join('\n\n')
  // Insert after minification so the self-contained installer retains every
  // required notice even when downloaded without the adjacent license assets.
  return { comment: `/*!\n${notices.replace(/\*\//g, '* /')}\n*/\n`, dependencies }
}

module.exports = { bundledNotices }
