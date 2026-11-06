## 使用
1. 在浏览器中安装 [Tampermonkey（油猴）](https://www.tampermonkey.net/) 扩展。Chrome 用户打开 `chrome://extensions/` → Tampermonkey → 详情，开启“允许运行用户脚本”；没有该选项时，开启扩展页面右上角的“开发者模式”。[油猴官方说明](https://www.tampermonkey.net/faq.php#Q209)
2. 扩展安装完成后，点击 [个人增强版固定安装地址](https://github.com/MatryoshkaLJY/ShinyColors/releases/latest/download/ShinyColors.user.js)，根据扩展的提示安装脚本
3. 回到游戏页面刷新

每台设备从同一地址安装一次，并开启脚本管理器中的自动更新。此前如果关闭过更新检查，需要重新开启。更新完成后，整页刷新游戏以加载新版。仓库每次推送到 `master` 后，会自动构建并发布新版；各设备按脚本管理器的检查周期获取更新。

游戏地址：[直接打开](https://shinycolors.enza.fun/home) ，新用户也可以通过我的 [招待链接](https://go.enza.fun/YLZXbw) 来开始游戏。

__如果是用手机，可以安装支持用户脚本的浏览器。__

已知支持用户脚本的手机浏览器
- iOS: Safari (iOS 15以上)
- Android: Kiwi

iOS安装方法参考视频：https://www.bilibili.com/video/BV1WT411T7dU/

Android 的 Kiwi 浏览器安装同 PC 的 Chrome 一样，先安装 Violentmonkey 再点击脚本地址。

<details>
    <summary>iOS使用Alook浏览器的方法（不推荐）</summary>
iOS 的 Alook 可以直接通过这个网址安装插件：[https://www.shiny.fun/install.html](https://www.shiny.fun/install.html) ，注意把 _运行时间_ 改为 _尽早_ 。

另外Alook也可以选择手动添加 js 脚本，和上面的链接效果一样，代码如下：

```javascript
(function () {
  let scriptContent = '';
  let version = '';
  const script = document.createElement('script');
  try {
    scriptContent = localStorage.getItem('sczh-script');
    version = localStorage.getItem('sczh-version');
  } catch (e) {}
  if (!scriptContent) {
    script.setAttribute('src', 'https://www.shiny.fun/ShinyColors.user.js');
    script.setAttribute('defer', true);
  } else {
    script.textContent = scriptContent;
  }
  document.documentElement.appendChild(script);
  fetch('https://www.shiny.fun/manifest.json')
    .then(res => res.json())
    .then(async function (data) {
      if (data.version !== version) {
        const text = await (await fetch('https://www.shiny.fun/ShinyColors.user.js')).text();
        localStorage.setItem('sczh-script', text);
        localStorage.setItem('sczh-version', data.version);
      }
    })
})();
```

</details>

### 使用插件提取文本和预览翻译

插件提供了提取剧情文本并预览的功能，如果你经常录翻译视频，可以考虑使用这个功能节省手动添加字幕的步骤。
[查看详情](https://github.com/biuuu/ShinyColors/blob/master/data/README.md)

**将自己的翻译录成视频并没有任何限制，但录制他人的翻译前需要取得译者的同意。**

--------------------
### 插件选项
_如果使用的是PC浏览器，可以通过点击浏览器上的扩展图标里的Violentmonkey图标，打开插件的选项。_

_通过点击选项可以直接完成下方提到的操作。_

[![QQ截图20220223095820](https://user-images.githubusercontent.com/10892119/155250068-885723a5-4953-4f51-b271-2de24a2ba94b.png)

**关于机翻**

如果当前剧情还没有人提交翻译的话，插件可以进行机翻。

开启方法是在游戏 URL 后面加上 #auto=on ，关闭则是 #auto=off 。

也可以直接点这两个链接来开启或关闭，[开启机翻](https://shinycolors.enza.fun/home#auto=on)  /  [关闭机翻](https://shinycolors.enza.fun/home#auto=off)

**失去焦点后保持游戏声音**

游戏默认会在失去窗口焦点后停止声音的播放，而插件可以让声音持续播放。

开启方法是在游戏 URL 后面加上 #bgm=on ，关闭则是 #bgm=off 。

也可以直接点这两个链接来开启或关闭，[保持BGM持续播放](https://shinycolors.enza.fun/home#bgm=on)  /  [取消保持BGM播放](https://shinycolors.enza.fun/home#bgm=off)

### 选项效果提示

默认开启。在剧情分支、早间对话和试镜前对话出现选项时，会在对应选项下方显示 Wiki 收录的基础效果，包括 Vo / Da / Vi / Me / SP、亲爱度或心情变化。

提示直接绘制在游戏画布内，会随画布缩放、旋转和进入全屏，跟随选项的位置且不影响点击。未收录或无法匹配的选项显示“效果数据暂缺”。事件加成等因素可能影响最终增长值。

可在用户脚本菜单中选择“关闭选项效果提示”，或在游戏 URL 后加上 `#choiceHints=off`；使用 `#choiceHints=on` 恢复。

### 其它
**无法访问脚本链接**

如果点不开脚本地址，可能是因网络问题无法访问 `www.shiny.fun` 这个域名。

可以试着用 https://cdn.jsdelivr.net/gh/biuuu/ShinyColors@gh-pages/ShinyColors.user.js 这个地址安装。

并在进入游戏后通过在游戏 URL 后面加上 `#origin=https://cdn.jsdelivr.net/gh/biuuu/ShinyColors@gh-pages` 修改数据源。

改回默认数据源则是 `#origin=` 。

也可以直接点这两个链接来修改或恢复，
修改数据源](https://shinycolors.enza.fun/home#origin=https://cdn.jsdelivr.net/gh/biuuu/ShinyColors@gh-pages)  /  [取消修改](https://shinycolors.enza.fun/home#origin=)

上面涉及到 `www.shiny.fun` 地方的操作都可以替换为 `cdn.jsdelivr.net/gh/biuuu/ShinyColors@gh-pages`
