# 发布清单（本地已就绪，仅剩账号授权的两步）

## 已完成

- `C:\deepseek-harness\主对话\release\dsh-tencent-docs\`：独立 git 仓库（分支 `main`，root commit `b14f70c`），9 个文件，`npm publish --dry-run` 通过（153.8 KB，8 个文件入包，包名 `dsh-tencent-docs` 在 npm 上未被占用）。
- `C:\deepseek-harness\主对话\dist\publish\`：`dsh-tencent-docs-0.3.4.tgz`（153.8 KB，SHA256 `95859826A3928658AF6D7BBA588EFAFF4A86D2D96C3BBB661A38ED39926FC185`）+ 格式 1 的 `index.json`（`validate-index.mjs` 通过）。

## 第一步：发到 npm（需要一个 npm 账号）

```powershell
cd C:\deepseek-harness\主对话\release\dsh-tencent-docs
.\publish-npm.ps1
```

脚本会：检查登录 → 必要时 `npm login`（浏览器授权）→ 检查包名 → `npm publish --access public`。
成功即得 `https://www.npmjs.com/package/dsh-tencent-docs`，任何机器可以：

```powershell
dsh plugin --profile desktop add dsh-tencent-docs
```

> 注意：本机默认 registry 是 `registry.npmmirror.com`（只读镜像，不能发布），所以脚本里显式带 `--registry=https://registry.npmjs.org`。

## 第二步：推到 GitHub（本机没有 gh CLI，先在网页建空仓库）

在 <https://github.com/new> 建一个空仓库，名字 `dsh-tencent-docs`，不要勾 README / .gitignore / license。然后：

```powershell
cd C:\deepseek-harness\主对话\release\dsh-tencent-docs
git remote add origin https://github.com/<你的用户名>/dsh-tencent-docs.git
git push -u origin main
```

推完把仓库地址补进两处（告诉我用户名，我直接改）：

- `release\dsh-tencent-docs\package.json` 的 `"repository"` / `"homepage"`
- `dist\publish\index.json` 的 `repository` / `homepage`

## 第三步（可选）：进 dshmarket 市场

市场读的是 `https://awesome-dsh-plugin.com/plugins.json`，条目由 `awesome-dsh-plugin/awesome-dsh-plugin` 仓库的 README 生成（CI 每日刷新）。提 PR，在 `tools` 分类下加一行：

```markdown
- [<你的用户名>/dsh-tencent-docs](https://github.com/<你的用户名>/dsh-tencent-docs) - Left-sidebar Tencent Docs browser for DSH: recent files, folder tree and search over the official Tencent Docs MCP endpoint, with a local link list.
```

前提：仓库有 LICENSE、README、可跑的 `package.json`（都已具备），且 npm 上能装到。

## 第四步（可选）：自建索引源给团队用

`dist\publish\` 整个目录丢到任意静态服务器（内网 nginx / OSS / GitHub Pages），然后在 DSH 里：设置 → 插件 → 发现 → 索引源 → 添加该 `index.json` 的 URL。团队的安装走 `dsh plugin --profile <profile> add dsh-tencent-docs@0.3.4`，源指向 `registry.npmjs.org`。

## 版本升级流程

1. 改 `plugins\dsh-tencent-docs\`（开发目录，profile 里是 Junction 指向它，秒生效）。
2. 同步到 `release\dsh-tencent-docs\`：`Copy-Item index.js,client.js,cordis.patch.yml,icon.svg,package.json,INSTALL.md`。
3. `package.json` 升版本 → `git commit` → `npm publish` → 更新 `index.json` 的 `versions`。
