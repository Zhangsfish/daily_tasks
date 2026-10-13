# 每日资讯

面向中文读者的公开静态资讯站，包含「全球新闻简报」和「AI 动态」。网站与每日归档都存放在本仓库；GitHub Actions 在每天北京时间 07:30 尝试采集、核查、提交并部署 GitHub Pages。电脑无需保持开机。

## 本地运行

```sh
cd /workspace/daily_tasks
python3 -m http.server 8000
```

在浏览器打开 `http://localhost:8000`。采集器仅使用 Python 3 标准库。运行 `python3 -m unittest discover -s tests -v` 验证关键安全规则，运行 `python3 scripts/collect.py --dry-run` 检查实时来源（需要访问列出的 RSS 和文章域名）。

## 自动更新与发布

`.github/workflows/daily.yml` 每天北京时间 07:30（UTC 23:30）运行，也可以手动触发；采集代码或工作流变更时也运行一次。采集成功且两个栏目都有经交叉核查的条目时，工作流才更新 `data/latest.json`、`archive/YYYY-MM-DD.json` 和 `archive/index.json`，随后提交至 `main`，并在同一工作流部署 Pages。采集或核查失败时以非零状态退出，不修改数据文件，也不部署。

首次发布需在 GitHub 仓库 **Settings → Pages → Build and deployment** 将 Source 设为 **GitHub Actions**；仓库 Actions 权限须允许工作流写入内容和 Pages。站点地址通常为 `https://zhangsfish.github.io/daily_tasks/`，以 Pages 设置页显示的实际地址为准。工作流的 `schedule` 由 GitHub 托管，可能延迟；若未达到核查门槛，网页继续展示最后一次已核查的归档，而非未经证实的新内容。

## 采集与核查规则

公开规则见 [skills/news-collection/SKILL.md](skills/news-collection/SKILL.md)。每条展示原文来源、发布时间、核查时间、第二独立来源和不确定性说明。本站只引用原文标题，不自动编造摘要或推断结论。两家媒体标题相似只能交叉印证报道主题，不能证明所有细节；页面会明确标注此限制。

## 数据结构

- `data/latest.json`：最近一次成功核查的快照。
- `archive/YYYY-MM-DD.json`：按北京时间日期保存的不可变日归档；同日重跑会更新该日文件。
- `archive/index.json`：归档日期清单。

所有数据均为公开文件；不要把密钥写入仓库。站点不使用跟踪脚本或外部字体。
