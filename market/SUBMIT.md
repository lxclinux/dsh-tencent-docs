# 上架资料（对齐 dshmarket 卡片要求）

市场卡片上会显示的东西，逐项对应本仓库里的文件：

| 卡片元素 | 来源 | 本仓库位置 |
|---|---|---|
| 图标 | `icon` 字段（256×256 PNG） | `market/icon-256.png`（源文件 `market/icon-256.svg`） |
| 名称 | `name` | `package.json` → `dsh-tencent-docs` |
| 作者 | `owner` = GitHub 用户名 | `liuxc` |
| 版本 / 下载量 | npm registry | `package.json` → `version` |
| 星标 | GitHub API | 仓库 star 数 |
| 中文简介 | `description.zh` | `market/listing.json` |
| 英文简介 | `description.en` | `market/listing.json` |
| 分类 | `category` | `docs`（Docs & Rendering） |
| 能力标签 | 沙箱静态扫描（shell / fs-read / fs-write / network / env / credentials / llm） | 本插件只有 `fs-read` `fs-write` `network` |
| 「未声明宿主要求」 | `package.json` 的 `engines.dsh` 缺失时出现 | 已声明，不再出现 |
| 截图 | `screenshots[]` | `market/shot-recent.png`、`shot-cloud.png`、`shot-local.png` |

## 提交到 awesome-dsh-plugin（README 一行）

仓库：`https://github.com/awesome-dsh-plugin/awesome-dsh-plugin`，在 `docs` 分类下加：

```markdown
- [liuxc/dsh-tencent-docs](https://github.com/liuxc/dsh-tencent-docs) - Tencent Docs in the DSH sidebar: recent files, folder tree and title search over the official MCP endpoint, plus a local link list.
```

CI 每天刷新 `https://awesome-dsh-plugin.com/plugins.json`，dshmarket 打开时实时拉这份数据。

## 前置条件检查（提交前跑一遍）

- [ ] 仓库 public，含 `LICENSE`（MIT）、`README.md`、`package.json`
- [ ] npm 上 `dsh-tencent-docs` 已发布且版本号与仓库一致
- [ ] `package.json` 有 `engines.dsh`（否则卡片挂「未声明宿主要求」）
- [ ] 图标是 256×256 PNG，仓库可直链（`raw.githubusercontent.com`）
- [ ] 截图 3 张、只含示意数据，不含真实文档标题
- [ ] `dsh plugin --profile <profile> add dsh-tencent-docs` 在干净 profile 能装上

## 自建索引源（不等市场收录）

`dist/publish/index.json` 是格式 1 的官方索引源，丢到任意静态地址即可，团队在
`设置 → 插件 → 发现 → 索引源` 里添加它的 URL。卡片字段同样取 `market/listing.json` 的信息。
