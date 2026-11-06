# ShinyColors 汉化与选项效果提示

[![一键安装最新版](https://img.shields.io/badge/一键安装-最新版本-ff6499?style=for-the-badge)](https://github.com/MatryoshkaLJY/ShinyColors/releases/latest/download/ShinyColors.user.js)

**[点击安装脚本](https://github.com/MatryoshkaLJY/ShinyColors/releases/latest/download/ShinyColors.user.js)** · [详细安装说明](src/README.md) · [更新记录](https://github.com/MatryoshkaLJY/ShinyColors/releases)

先安装 [Tampermonkey（油猴）](https://www.tampermonkey.net/)，再点击上方按钮，在油猴弹出的页面确认安装，最后刷新[游戏页面](https://shinycolors.enza.fun/home)。Chrome 用户需在油猴扩展详情中允许用户脚本运行，操作见[安装说明](src/README.md)。

安装后开启油猴的自动更新，即可持续获取本仓库发布的新版。访客无需下载源码或自行构建。

<a href="https://github.com/MatryoshkaLJY/ShinyColors/releases/latest/download/ShinyColors.user.js"><img src="https://www.shiny.fun/data/image/banner.jpg?v=2" alt="安装个人增强版"></a>
<p align="center">
<a href="https://github.com/MatryoshkaLJY/ShinyColors/actions/workflows/publish-userscript.yml"><img alt="Build Status" src="https://github.com/MatryoshkaLJY/ShinyColors/actions/workflows/publish-userscript.yml/badge.svg?branch=master"></a>
<a href="https://github.com/biuuu/ShinyColors/blob/master/LICENSE"><img alt="GitHub license" src="https://img.shields.io/github/license/biuuu/ShinyColors.svg"></a>
<a href="https://idolmaster.jp/"><img alt="THE IDOLM@STER" src="https://img.shields.io/badge/IDOL-M%40STER-ff779c.svg"></a>
<a href="https://shinycolors.enza.fun/"><img alt="283 Production" src="https://img.shields.io/badge/283-Production-9a77ff.svg"></a>
</p>

---

## 简介
安装插件：[说明](https://github.com/MatryoshkaLJY/ShinyColors/blob/master/src/README.md)

提交翻译：[说明](https://github.com/ShinyGroup/SCTranslationData)

## Devlopment
```bash
# 全局安装 pnpm
npm install -g pnpm@10.11.0

# 用 pnpm 安装模块
pnpm install

# 调试模式，构建一个用户脚本，并使用本地数据源
pnpm dev

# 构建用户脚本
pnpm build

# 检查自动更新元数据和构建产物
pnpm verify:userscript

# 打包CSV和构建用户脚本，并push到当前repo的gh-pages分支
pnpm deploy
```

### 自动发布与多设备更新

固定安装地址：[安装最新个人增强版](https://github.com/MatryoshkaLJY/ShinyColors/releases/latest/download/ShinyColors.user.js)。首次发布完成后，该地址始终指向最新版本。

每台设备安装一次，然后在 Tampermonkey / Violentmonkey 中开启该脚本的更新检查。如果之前关闭过自动更新，需要重新开启；如果手工覆盖过更新地址，需要恢复为脚本元数据中的地址：

```text
更新检查：https://github.com/MatryoshkaLJY/ShinyColors/releases/latest/download/ShinyColors.meta.js
脚本下载：https://github.com/MatryoshkaLJY/ShinyColors/releases/latest/download/ShinyColors.user.js
```

以后修改代码或内置效果库并推送到 `master`，GitHub Actions 的 [Publish userscript](https://github.com/MatryoshkaLJY/ShinyColors/actions/workflows/publish-userscript.yml) 会测试、构建并发布 Release。每次运行自动生成递增的脚本版本（例如 `1.13.0.1.1`），无需为每次修改手动改版本号。发布失败时继续使用上一个成功版本。此流程使用 Node.js 22 和仓库内的 pnpm 锁文件，不需要个人访问令牌或 GitHub Pages。

新 fork 如果提示工作流未启用，在仓库 Actions 页面启用工作流，然后选择 Publish userscript → Run workflow → master 完成首次发布。后续推送会自动触发。

各设备按脚本管理器设置的周期检查更新；需要立即更新时，在管理器中手动检查更新。已打开的游戏页面应在更新完成后整页刷新。本地服务器只用于本地安装和调试，多设备更新直接使用上面的 HTTPS 地址。

程序和内置选项效果库随 Release 更新；汉化译文通过 `config.origin` 加载。

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

### 离线批量检查选项匹配

准备好本地 [SCTranslationData](https://github.com/ShinyGroup/SCTranslationData) 仓库或解压后的快照后，可以直接检查，不必逐段进入游戏：

```bash
npm run choices:audit -- --translations ../SCTranslationData --report dist/choice-effects-audit.json --markdown dist/choice-effects-audit.md
```

下载剧情快照需要网络；这个检查命令本身不访问网络，只读取本地 `data/story/**/*.csv` 和内置效果库。它通过 CSV 的 `info` 行识别剧情类型和场景 ID，使用运行时同一套匹配函数，并重放汉化、JSON 缓存和选项顺序打乱后的查找。

JSON 报告包含逐类覆盖数、缺失原文、剧情文件、候选 Wiki 来源、来源冲突、动态选项池及 CSV 解析警告；可选的 Markdown 报告便于直接阅读。候选相似记录仅供人工核对，不会自动填充效果。追加 `--strict` 可在发现缺失、解析警告或无法确定的场景时返回非零状态；`--catalogue /path/to/choice-effects.json` 可对比旧效果库。

本次完整检查的 [待核对清单](docs/choice-effects-audit.md) 基于翻译仓库提交 `60d451090aea86631815a0522238eb5f3d196e1b` 和报告中的效果库 SHA-256：共检查 1,309 组，1,136 组全部匹配，37 组部分匹配，136 组未匹配。这是该快照的覆盖情况，不包含快照缺少的剧情，也不能单独证明 Wiki 的数值正确。清单中的记录尚需逐项核对或补齐。

## License

本项目基于 [biuuu/ShinyColors](https://github.com/biuuu/ShinyColors)，本 fork 增加了选项效果提示、角色匹配和自动发布功能。

- 程序代码遵循 [MIT](LICENSE)，保留原作者 `Copyright (c) 2019 biuuu` 及完整许可声明。
- 从 Shinycolors Wiki 整理的效果数据按 [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/deed.zh-hans) 标注，保留贡献者署名、来源链接及提取、转换和修正说明；详见 [效果数据许可](src/data/LICENSE)。该数据的再分发及改编需遵守其非商业、署名和相同方式共享条件。
- 游戏素材、剧情原文和人工译文的权利归各自权利人，不因程序代码采用 MIT 而自动获得 MIT 授权。人工翻译来源见 [SCTranslationData](https://github.com/ShinyGroup/SCTranslationData)。
- 构建出的单文件 `ShinyColors.user.js` 内嵌原程序、效果数据和打包依赖的许可声明，Release 同时提供相应的许可证附件。

建议在项目介绍中说明上游来源和本 fork 的改动；这是独立维护的增强版，不表示原作者、Wiki 贡献者或游戏官方对本 fork 的认可。

