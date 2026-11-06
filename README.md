<a href="https://www.shiny.fun/ShinyColors.user.js"><img src="https://www.shiny.fun/data/image/banner.jpg?v=2" alt="检查更新"></a>
<p align="center">
<a href="https://github.com/biuuu/ShinyColors/actions/workflows/pages/pages-build-deployment"><img alt="Build Status" src="https://github.com/biuuu/ShinyColors/actions/workflows/pages/pages-build-deployment/badge.svg?branch=gh-pages"></a>
<a href="https://github.com/biuuu/ShinyColors/blob/master/LICENSE"><img alt="GitHub license" src="https://img.shields.io/github/license/biuuu/ShinyColors.svg"></a>
<a href="https://idolmaster.jp/"><img alt="THE IDOLM@STER" src="https://img.shields.io/badge/IDOL-M%40STER-ff779c.svg"></a>
<a href="https://shinycolors.enza.fun/"><img alt="283 Production" src="https://img.shields.io/badge/283-Production-9a77ff.svg"></a>
</p>

---

## 简介
安装插件：[说明](https://github.com/biuuu/ShinyColors/blob/master/src/README.md)

提交翻译：[说明](https://github.com/ShinyGroup/SCTranslationData)

## Devlopment
```bash
# 全局安装 pnpm
npm install -g pnpm

# 用 pnpm 安装模块
pnpm install

# 调试模式，构建一个用户脚本，并使用本地数据源
pnpm dev

# 构建用户脚本
pnpm build

# 打包CSV和构建用户脚本，并push到当前repo的gh-pages分支
pnpm deploy
```

### 选项效果提示

默认在剧情分支、早间对话和试镜前对话的选项下方显示效果。在用户脚本菜单中选择“关闭选项效果提示”，或使用 `#choiceHints=off` 关闭；`#choiceHints=on` 恢复。

效果库随用户脚本打包，位于 `src/data/choice-effects.json`，来源为 [Shinycolors Wiki](https://shinycolors.wiki/wiki/Card_List/Produce)。它按原始日文匹配，不依赖汉化文本或随机排列后的位置。早间对话会从剧情中的说话者或角色模型识别角色，优先匹配整组选项；整组未匹配时，在该角色的选项库内逐条查找，避免一条原文差异让整组提示消失。数值表示 Wiki 基础效果；未收录、原文不一致或来源冲突的选项显示“效果数据暂缺”。

更新效果库（需要 Python 3 和网络）：

```bash
npm run choices:update
npm test
python3 -m unittest discover -s test -p 'test_*.py'
npm run build
```

更新脚本缓存 Wiki 响应，支持中断后重跑。要重新获取最新页面，指定新的缓存目录：`python3 script/updateChoiceEffects.py --cache /tmp/sc-choice-wiki-new`。请求失败或解析结果不完整时不会覆盖已有数据。

手动补充时，在 `groups` 中添加 `kind`（`event` / `morning` / `audition`）、`title`、`source` 和完整的 `choices`。剧情选项使用 `effects`（`vocal`、`dance`、`visual`、`mental`、`sp`）；早间对话使用 `character`（`choice-characters.json` 中的键）和 `grade`（`perfect` / `good` / `normal`），试镜前对话使用 `grade`（`up` / `neutral` / `down`）。每个 `text` 必须是游戏原始日文。已核实的抄录错误可写入 `src/data/choice-effect-corrections.json`，附上核对来源；更新脚本会自动应用这些修正，避免重建时丢失。修正也应同步反馈 Wiki。

`npm run build` 可独立构建包含效果库的 `dist/ShinyColors.user.js`，汉化译文仍使用脚本配置的数据源，不需要先下载翻译仓库。

## License
The code is [MIT](https://github.com/biuuu/ShinyColors/blob/master/LICENSE) licensed,
but the translation text has another License. see [details](https://github.com/biuuu/ShinyColors/tree/master/data)

