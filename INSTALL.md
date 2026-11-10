# 安装说明（dsh-tencent-docs 0.3.2）

一个 DSH 插件：左侧栏加一个「腾讯文档」入口，面板里可以直接看**最近打开的文件**、
按**目录树浏览云文档**、按标题**搜索**，另外还有一个**本机清单**放手工粘贴的链接。

## 一、装插件

1. 解压 `dsh-tencent-docs-0.3.2.zip`，得到一个目录 `dsh-tencent-docs`（里面有 `package.json`、`index.js`、`client.js`、`cordis.patch.yml`、`icon.svg`）。
2. 把目录放到一个**不会被随手删掉**的位置，例如 `C:\dsh-plugins\dsh-tencent-docs`。
   - 注意：DSH 装的是目录本身（本机做的是 Junction 链接），装完后**不要删这个目录**，删了插件就没了。
3. 让 DSH 安装它，任选一种：
   - 在 DSH 对话里说：「用 plugin_manager 安装 C:\dsh-plugins\dsh-tencent-docs」，由 agent 执行；
   - 或在设置 → 插件里用「安装本地包」，选这个目录。
4. 刷新 DSH 网页（`http://127.0.0.1:6551`，端口以实际为准），左侧栏应该多出一个文档图标。

## 二、接上腾讯文档账号

1. 点左侧图标 → 面板会提示需要授权。
2. 打开 <https://docs.qq.com/scenario/open-claw.html>，用 QQ 或微信登录，复制页面给的访问令牌。
3. 粘贴到面板输入框 → 保存。保存后自动拉取最近文件。

令牌只存在本机 `%USERPROFILE%\.dsh\tencent-docs\auth.json`，插件后端持有，页面脚本读不到。
换电脑要重新粘一次（令牌跟账号走，不跟插件包走）。点面板上的「断开」可清除。

## 三、自检

- `GET http://127.0.0.1:6551/tencent-docs/api/auth` 应返回 `{"ok":true,"configured":true,...}`；
  没授权时 `configured` 为 `false`，属正常。
- 左侧栏图标点开后，默认落在「最近」标签，每页 20 条，「加载更多」翻页。

## 四、已知边界

- 腾讯文档禁止第三方 iframe 内嵌，点文件是**新标签页打开**，不在面板内预览。
- 「最近」接口单页上限 20 条（官方限制）。
- 官方频率限制：免费账号 2000 次/天。
- 「本机清单」的数据在浏览器 localStorage 里，换机器不跟随；
  如果要带走，把 `%USERPROFILE%\.dsh\tencent-docs\docs.json` 一起拷过去，或重新粘链接。

## 五、卸载

在设置 → 插件里停用/移除该条目，然后删掉第 2 步那个目录。
