import babel from '@rollup/plugin-babel'
import json from '@rollup/plugin-json'
import resolve from '@rollup/plugin-node-resolve'
import cmjs from '@rollup/plugin-commonjs'
import { terser } from 'rollup-plugin-terser'
import { readFileSync } from 'fs'
// Rollup 2 loads the compiled config as CommonJS.
const userscript = require('./userscript.cjs')

const banner = userscript.createHeader()

const plugins = [
  {
    name: 'userscript-release-files',
    generateBundle () {
      this.emitFile({ type: 'asset', fileName: 'ShinyColors.meta.js', source: `${banner}\n` })
      this.emitFile({ type: 'asset', fileName: 'LICENSE-code.txt', source: readFileSync('./LICENSE', 'utf8') })
      this.emitFile({ type: 'asset', fileName: 'LICENSE-effects.txt', source: readFileSync('./src/data/LICENSE', 'utf8') })
    }
  },
  resolve({ preferBuiltins: false }),
  cmjs({ ignore: ['stream'], include: /node_modules/ }),
  json(),
  babel({
    babelHelpers: 'runtime',
    exclude: 'node_modules/**',
    plugins: ['@babel/plugin-transform-runtime', '@babel/plugin-proposal-optional-chaining', '@babel/plugin-proposal-nullish-coalescing-operator'],
    presets: [['@babel/preset-env', {
      modules: false,
      targets: 'last 2 iOS versions'
    }]]
  })
]

if (!process.env.DEV) {
  plugins.push(terser({
    output: {
      comments: function (node, comment) {
        var text = comment.value;
        var type = comment.type;
        if (type == "comment1") {
          // multiline comment
          return /^\s@|\s==\/?UserScript==/i.test(text);
        }
      }
    }
  }))
}

export default {
  input: 'src/main.js',
  plugins,
  output: {
    file: './dist/ShinyColors.user.js',
    format: 'iife',
    name: 'shinycolors_zh',
    banner: banner,
    intro: `const ENVIRONMENT = "${process.env.BUILD === 'development' ? 'development' : ''}";
    const USERSCRIPT_DOWNLOAD_URL = ${JSON.stringify(userscript.downloadURL)};
    const DEV = ${process.env.DEV ? true : false};
    const SHOW_UPDATE_TEXT = ${process.env.TEXT ? true : false};
    const COLLECT_CARD_RATE = ${process.env.CARD ? true : false};`
  }
};
