const { version: baseVersion } = require('../package.json')

const repository = 'MatryoshkaLJY/ShinyColors'
const releaseRoot = `https://github.com/${repository}/releases/latest/download`
const downloadURL = `${releaseRoot}/ShinyColors.user.js`
const updateURL = `${releaseRoot}/ShinyColors.meta.js`

const scriptVersion = (env = process.env) => {
  if (env.GITHUB_ACTIONS !== 'true') return baseVersion
  const { GITHUB_RUN_NUMBER: run, GITHUB_RUN_ATTEMPT: attempt } = env
  if (!/^[1-9]\d*$/.test(run) || !/^[1-9]\d*$/.test(attempt)) {
    throw new Error('GitHub release builds require positive run and attempt numbers')
  }
  // Keep the translation-data compatibility version separate from the script
  // update version. Every publish/retry must be newer for userscript managers.
  return `${baseVersion}.${run}.${attempt}`
}

const createHeader = (env = process.env) => `// ==UserScript==
// @name         偶像大师ShinyColors汉化
// @namespace    https://github.com/biuuu/ShinyColors
// @version      ${scriptVersion(env)}
// @description  汉化与选项效果提示。录剧情视频到公开的网站请先取得译者同意。
// @icon         https://shinycolors.enza.fun/icon_192x192.png
// @author       biuuu, MatryoshkaLJY
// @homepageURL  https://github.com/${repository}
// @match        https://shinycolors.enza.fun/*
// @run-at       document-start
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @connect      api.interpreter.caiyunai.com
// @connect      translate.google.cn
// @connect      fanyi.baidu.com
// @updateURL    ${updateURL}
// @downloadURL  ${downloadURL}
// @supportURL   https://github.com/${repository}/issues
// @copyright    Original code: Copyright (c) 2019 biuuu, MIT
// @copyright    Effect data: Shinycolors Wiki contributors, CC BY-NC-SA 4.0
// ==/UserScript==`

module.exports = { repository, downloadURL, updateURL, scriptVersion, createHeader }
