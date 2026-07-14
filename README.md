# 哔力大增

一个 Manifest V3 Chrome 侧边栏插件：在 Bilibili 视频页一键读取 AI 字幕，通过 DeepSeek 兼容 API 生成总摘要、关键要点和可点击跳转的章节时间线。

## 功能

- 自动识别当前视频的 BV 号、CID 和分 P
- 调用 `x/player/v2` 读取登录用户可见的字幕元数据
- 优先选择 `ai-zh`，并兼容其他中文字幕
- 把 `{ from, to, content }` 字幕转换为带时间戳文本
- 长视频自动分段整理，再合并成完整摘要与章节
- 点击章节时间戳跳转 Bilibili 播放器
- 完整字幕原文列表，点击任意字幕即可跳转对应播放时间
- 可开关“跟随播放”，开启时自动高亮并滚动到当前字幕
- 抓取结果绑定到明确的视频标签页，避免多窗口或多视频串源
- 同时校验地址栏、页面主运行环境、播放器网络请求和 Bilibili 接口的 BVID/CID
- 为每份字幕生成唯一指纹，并拒绝显示指纹不一致的大模型响应
- 在来源卡片直接展示实际下载字幕的首段、中段和尾段作为核对证据
- 字幕时间轴必须覆盖视频主体时长；覆盖明显不足或超过视频时长时禁止分析
- 大模型必须判断字幕与视频标题相关，否则拒绝显示摘要
- API 地址、Key、模型、温度与最大输出长度均可在界面配置
- API Key 仅保存在 `chrome.storage.local`

## 本地运行与构建

```bash
npm install
npm run test
npm run build
```

构建成功后，在 Chrome 打开 `chrome://extensions`：

1. 开启右上角“开发者模式”。
2. 点击“加载已解压的扩展程序”。
3. 选择本项目生成的 `dist` 目录。
4. 打开 Bilibili 视频并登录，刷新一次视频页面。
5. 点击工具栏里的“哔力大增”，侧边栏会自动打开并可直接抓取字幕。

开发预览可运行 `npm run dev`，然后打开：

- 空状态：`http://127.0.0.1:5173/sidepanel.html`
- 完成态演示：`http://127.0.0.1:5173/sidepanel.html?demo=1`

## DeepSeek 配置

默认配置：

- API 地址：`https://api.deepseek.com`
- 模型：`deepseek-v4-flash`


插件会请求 `${API 地址}/chat/completions`。如果粘贴的地址已经以 `/chat/completions` 结尾，则不会重复拼接。自定义 API 域名在保存设置时会触发 Chrome 的单域名访问授权。

## 工作链路

```text
Bilibili 视频页
  -> pagelist 获取当前分 P 的 CID
  -> player/v2 获取字幕列表
  -> 下载 subtitle_url 对应 JSON
  -> 转换带时间戳字幕
  -> DeepSeek JSON 输出
  -> 摘要 / 关键要点 / 章节时间线
  -> 点击章节回到播放器时间点
```

## 边界与隐私

- 游客通常无法取得 AI 字幕，需要先登录 Bilibili。
- 视频本身必须提供字幕；没有字幕时插件会给出明确提示。
- 字幕内容会发送到用户配置的模型 API，用于生成摘要。
- API Key 不会写入源码、日志或同步存储，仅保存在当前浏览器本地。
- Bilibili 接口属于站点内部接口，未来若字段变化，需要同步调整 `public/content.js`。

视觉实现基于 [界面概念图](design/extension-concept.png)。
