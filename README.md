# dsh-tencent-docs

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh`) plugin: a **腾讯文档 (Tencent Docs) panel in the left sidebar**.

Click the sidebar icon and the panel lists your real documents — no folder syncing, no export step. The host half talks to Tencent Docs' official MCP endpoint (`https://docs.qq.com/openapi/mcp`) with a token you paste once; the client half renders the tree.

![sidebar entry](icon.svg)

> 由 **YG** 制作 · MIT · v0.3.2

## What it does

| Tab | Source | What you get |
|---|---|---|
| 最近 | `manage.recent_online_file` | Recently opened/edited files, 20 per page, "load more" paging |
| 云文档 | `manage.folder_list` | Real folder tree: drill into folders, open any file, breadcrumb path, search by title (`manage.search_file`) |
| 本机清单 | local | A hand-kept list of links, mirrored to `~/.dsh/tencent-docs/docs.json` |

Files open in a new tab — Tencent Docs forbids third-party iframe embedding (`frame-ancestors`), so no in-panel preview is possible.

## Install

```sh
dsh plugin --profile <profile> add dsh-tencent-docs
```

Or from a local checkout / tarball:

```sh
dsh plugin --profile <profile> add "C:\path\to\dsh-tencent-docs"
dsh plugin --profile <profile> add "C:\path\to\dsh-tencent-docs-0.3.2.tgz"
```

Restart or reload the host, refresh the web GUI, and a document icon appears in the left rail.

## Authorize

1. Click the icon — the panel asks for a token.
2. Open <https://docs.qq.com/scenario/open-claw.html>, sign in with QQ/WeChat, copy the access token.
3. Paste it into the panel and save.

The token is written to `%USERPROFILE%\.dsh\tencent-docs\auth.json` with mode `0600` by the **host** half only; the browser never receives it. "断开" (disconnect) clears it.

## HTTP surface (host half, same origin)

| Route | Method | Purpose |
|---|---|---|
| `/tencent-docs/api/load` | GET | local link list |
| `/tencent-docs/api/save` | POST | write the local link list |
| `/tencent-docs/api/auth` | GET/POST | token status / save token |
| `/tencent-docs/api/auth/clear` | POST | forget the token |
| `/tencent-docs/api/tools` | GET | MCP tool inventory, cached 60 s |
| `/tencent-docs/api/tree?folder=&start=` | GET | folder listing |
| `/tencent-docs/api/search?q=` | GET | title search |
| `/tencent-docs/api/recent?page=&count=` | GET | recent files (count capped at 20 by the API) |

Errors answer `{ ok: false, error, authRequired }`; a missing token is `401`.

## Notes and limits

- Tool names are resolved at runtime (`manage.folder_list`, `manage.search_file`, `manage.recent_online_file`, …) by regex over `tools/list`, not hard-coded — the endpoint exposes ~227 tools and renames happen.
- `count` above 20 on the recent endpoint returns `count exceeds maximum value of 20`; the host clamps it.
- Free Tencent Docs accounts: 2000 MCP calls/day.
- No credentials, no telemetry, no network calls beyond `docs.qq.com`.

## Author

**YG** — idea, host bridge, client panel, packaging.

If you fork or redistribute this plugin, keep the `author` field in `package.json` and the footer credit in the panel (「由 YG 制作」) intact — MIT requires the copyright notice anyway.

## License

MIT © 2026 YG
