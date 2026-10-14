# 每日资讯

面向中文读者的公开静态资讯站，包含「全球新闻简报」和「AI 动态」。网站与每日归档都存放在本仓库；GitHub Actions 在每天北京时间 07:30 尝试采集、核查、提交并部署 GitHub Pages。电脑无需保持开机。

## 本地运行

```sh
cd /workspace/daily_tasks
python3 -m http.server 8000
```

在浏览器打开 `http://localhost:8000`。采集器仅使用 Python 3 标准库。运行 `python3 -m unittest discover -s tests -v` 验证关键安全规则，运行 `python3 scripts/collect.py --dry-run` 检查实时来源（需要访问列出的 RSS 和文章域名）。

## 页面、Markdown 与图表

首页采用单列新闻流和简洁侧栏，便于从标题进入原文；阅读页使用较窄的正文宽度。正文保存在 `content/*.md`，并在 `content/index.json` 登记标题、摘要和日期。浏览器直接渲染 Markdown，无需构建步骤。支持标题、列表、引用、表格、代码和链接；原始 HTML 被禁用。

在 Markdown 中使用语言名为 `chart` 的代码围栏可插入柱状图（`bar`）或折线图（`line`）。JSON 须包含标题、标签、非负数值、来源名称和来源链接；`dataset: "latest-sections"` 可直接读取当前简报两个栏目的条目数。用法见 [阅读指南](content/reading-guide.md)。图表由本仓库的 SVG 代码绘制，不依赖外部图表服务。Markdown 解析器固定为仓库内的 markdown-it 14.1.0，许可证见 `vendor/markdown-it-LICENSE.txt`。

界面研究参考了 [Simon Willison 的开源博客](https://github.com/simonw/simonwillisonblog) 的日期与来源组织、[Hugo PaperMod](https://github.com/adityatelange/hugo-PaperMod) 的窄正文阅读布局，以及 [Tailwind Next.js Starter Blog](https://github.com/timlrx/tailwind-nextjs-starter-blog) 的 Markdown 长文和目录体验。本站的 HTML、CSS 与图表代码是针对新闻阅读重新编写的。

## 视频文稿交接

首页的「视频文稿」与每日新闻分开。当前发布了三条视频的阅读稿，其中孙宇晨访谈另有一篇快速导读。正文使用接近 ChatGPT 网页阅读区的系统无衬线字体、16px 字号与宽松行距，桌面和手机保持相同字号。文稿保留原视频链接和时间轴；嘉宾观点未经本站逐项核实，语音转写可能有同音字、专名或数字错误。

交接源是私有仓库 `Zhangsfish/video-transcript-library` 的 `index.json`，本次导入源提交为 `52a2d30caa9d027967f23abcf60bad30c6827962`。网站只发布索引指向的 `primary_markdown` 和 `transcript_markdown`；`raw.srt` 与 `info.json` 留在私有仓库。要在新的、**已有只读权限的**云端会话更新文稿，可先检出源仓库，再执行：

```sh
python3 scripts/import_transcripts.py /path/to/video-transcript-library
```

脚本会核对索引、来源和元数据，整体通过后更新 `content/index.json` 与公开 Markdown；从源索引移除的文稿也会从本站移除。不要把私有仓库的访问令牌、Deploy Key 或整个仓库放入此公开站点。此交接目前由有权限的会话执行，未配置跨仓库自动同步。

## 自动更新与发布

`.github/workflows/daily.yml` 每天北京时间 07:30（UTC 23:30）运行，也可以手动触发；采集代码或工作流变更时也运行一次。采集成功且两个栏目都有经交叉核查的条目时，工作流才更新 `data/latest.json`、`archive/YYYY-MM-DD.json` 和 `archive/index.json`，随后提交至 `main`，并在同一工作流部署 Pages。采集或核查失败时以非零状态退出，不修改数据文件，也不部署。

首次发布需在 GitHub 仓库 **Settings → Pages → Build and deployment** 将 Source 设为 **GitHub Actions**；仓库 Actions 权限须允许工作流写入内容和 Pages。站点地址通常为 `https://zhangsfish.github.io/daily_tasks/`，以 Pages 设置页显示的实际地址为准。工作流的 `schedule` 由 GitHub 托管，可能延迟；若未达到核查门槛，网页继续展示最后一次已核查的归档，而非未经证实的新内容。

`.github/workflows/bootstrap.yml` 在网站代码变化时运行一次独立的托管检查：执行测试、将实时采集诊断写入 `ops/source-check.txt`，把云端运行记录写入 `ops/automation-check.json`，并部署当前站点。这些记录只用于排障，不代表当天新闻已通过核查；新闻发布仍必须通过上面的每日工作流。

## 采集与核查规则

公开规则见 [skills/news-collection/SKILL.md](skills/news-collection/SKILL.md)。每条展示原文来源、发布时间、核查时间、第二独立来源和不确定性说明。本站只引用原文标题，不自动编造摘要或推断结论。两家媒体标题相似只能交叉印证报道主题，不能证明所有细节；页面会明确标注此限制。

## 数据结构

- `data/latest.json`：最近一次成功核查的快照。
- `archive/YYYY-MM-DD.json`：按北京时间日期保存的不可变日归档；同日重跑会更新该日文件。
- `archive/index.json`：归档日期清单。

所有数据均为公开文件；不要把密钥写入仓库。站点不使用跟踪脚本或外部字体。
