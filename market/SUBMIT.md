# 上架资料（对齐 dshmarket 卡片 + awesome-dsh-plugin 收录规则）

## 卡片元素从哪来

| 卡片元素 | 来源 | 本仓库位置 |
|---|---|---|
| 图标 | 256×256 PNG | `market/icon-256.png`（源 `market/icon-256.svg`），另存 `docs/icon.png` |
| 名称 / 版本 | npm registry | `package.json` |
| 作者 / 星标 | GitHub 仓库 | `liuxc/dsh-tencent-docs` |
| 简介（中/英） | `data/plugins/<owner>__<repo>.yml` | `market/awesome-entry.yml` |
| 分类 | 同上 `category` | `docs`（Docs & Rendering） |
| 能力标签 | 沙箱静态扫描 | 本插件只有 `fs-read` `fs-write` `network` |
| 「未声明宿主要求」标签 | `package.json` 缺 `engines.dsh` 时出现 | 已声明，标签消失 |
| 截图 | 仓库内图片 | `market/shot-*.png`，另存 `docs/screenshots/{recent,cloud,local}.png` |

## awesome-dsh-plugin 的硬性规则（原文要点）

- `package.json` 必须声明 **`dsh.bundle`** 清单——只有 `dsh.client` 不能装，PR 里自动检查。本仓库已有 `dsh.bundle.patch: ./cordis.patch.yml`。
- 仓库至少 **1 天**历史（新建仓库等一天再提）。
- GitHub 仓库要打 **`dsh-plugin`** topic（仓库首页 → About 齿轮 → Topics）。
- 一个插件一个文件：`data/plugins/liuxc__dsh-tencent-docs.yml`，内容见 `market/awesome-entry.yml`。
- 不要手改 README——合并后 CI 重新生成，`plugins.json` 每日刷新。

## 提 PR 的步骤

1. fork `awesome-dsh-plugin/awesome-dsh-plugin`；
2. 新建 `data/plugins/liuxc__dsh-tencent-docs.yml`，粘贴 `market/awesome-entry.yml`；
3. PR 标题 `Add liuxc/dsh-tencent-docs`，说明里放一眼能看懂的一句话 + 截图直链；
4. 合并后 24h 内 `https://awesome-dsh-plugin.com/plugins.json` 出现条目，dshmarket 打开即可见。

## 提交前自检

- [ ] 仓库 public，含 `LICENSE`(MIT)、`README.md`、`package.json`
- [ ] `package.json` 有 `dsh.bundle`、`engines.dsh`、`author`
- [ ] npm 上 `dsh-tencent-docs@<版本>` 已发布，且与仓库版本一致
- [ ] 仓库有 `dsh-plugin` topic
- [ ] 图标 256×256 PNG 可直链
- [ ] 截图只含示意数据（不含真实文档标题）
- [ ] 干净 profile 里 `dsh plugin --profile <profile> add dsh-tencent-docs` 能装上

## 徽章

```markdown
[![Awesome DSH Plugin](https://awesome-dsh-plugin.com/badge.svg)](https://awesome-dsh-plugin.com)
```

## 不等收录也能用

`dist/publish/index.json` 是格式 1 的官方索引源，丢到任意静态地址，团队在
`设置 → 插件 → 发现 → 索引源` 里添加 URL 即可。
