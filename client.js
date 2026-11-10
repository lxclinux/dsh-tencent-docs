/**
 * Client half of the Tencent Docs hub.
 *
 * Registers two slots under one id (`tencent-docs`):
 *   - `sidebar.panellist` — the left-column icon; its `id` is what the shell
 *     uses to select the matching `main` panel, so no extra wiring is needed.
 *   - `main` (keyed) — the panel itself.
 *
 * The panel has three tabs:
 *   - 最近: recently opened/edited files (`manage.recent_online_file`, 20 per page).
 *   - 云文档: the real account tree, read from the official Tencent Docs MCP
 *     endpoint through this bundle's host half (`index.js`).
 *   - 本机清单: hand-kept links. `localStorage` is the source of truth so the
 *     tab works even when the host route is missing; every write is mirrored
 *     to `/tencent-docs/api/save` too.
 *
 * Nothing here ever sees the access token: it lives in
 * `~/.dsh/tencent-docs/auth.json` on the host side.
 */
window.__ModuleLoader__.load({
  id: 'dsh-tencent-docs',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useCallback, useEffect, useMemo, useState } = React

    const PANEL_ID = 'tencent-docs'
    const STORAGE_KEY = 'dsh-tencent-docs:v1'
    const API_PATH = 'tencent-docs/api'
    const ROOT = { id: '', title: '我的文档' }

    // ── transport ───────────────────────────────────────────────────────
    function apiUrl(method, query) {
      let href
      try {
        href = new URL(`${API_PATH}/${method}`, document.baseURI).href
      } catch {
        href = `/${API_PATH}/${method}`
      }
      if (query === undefined) return href
      const pairs = Object.entries(query)
        .filter(([, value]) => value !== undefined && value !== '')
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
      return pairs.length === 0 ? href : `${href}?${pairs.join('&')}`
    }

    /** One JSON round trip; `{ ok:false, error, authRequired }` on failure. */
    async function apiGet(method, query) {
      try {
        const res = await fetch(apiUrl(method, query), { headers: { accept: 'application/json' } })
        const payload = await res.json().catch(() => undefined)
        if (payload === undefined) return { ok: false, error: `HTTP ${res.status}` }
        if (!res.ok && payload.ok !== false) return { ok: false, error: `HTTP ${res.status}` }
        return payload
      } catch (error) {
        return { ok: false, error: String(error && error.message ? error.message : error) }
      }
    }

    async function apiPost(method, body) {
      try {
        const res = await fetch(apiUrl(method), {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body ?? {}),
        })
        const payload = await res.json().catch(() => undefined)
        if (payload === undefined) return { ok: res.ok, error: res.ok ? undefined : `HTTP ${res.status}` }
        return payload
      } catch (error) {
        return { ok: false, error: String(error && error.message ? error.message : error) }
      }
    }

    // ── local link list ─────────────────────────────────────────────────
    function isDoc(value) {
      return value !== null
        && typeof value === 'object'
        && typeof value.title === 'string'
        && typeof value.url === 'string'
        && value.title !== ''
        && value.url !== ''
    }

    function readLocal() {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY)
        if (raw === null) return null
        const parsed = JSON.parse(raw)
        return Array.isArray(parsed) ? parsed.filter(isDoc) : null
      } catch {
        return null
      }
    }

    function writeLocal(docs) {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(docs))
        return true
      } catch {
        return false
      }
    }

    function newId() {
      return `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
    }

    function hostLabel(url) {
      try {
        return new URL(url).host.replace(/^www\./, '')
      } catch {
        return url
      }
    }

    function normalizeUrl(raw) {
      const value = raw.trim()
      if (value === '') return ''
      if (/^https?:\/\//i.test(value)) return value
      return `https://${value}`
    }

    // ── styles ──────────────────────────────────────────────────────────
    const C = {
      fg: 'var(--dsh-text-primary, #1d2129)',
      dim: 'var(--dsh-text-secondary, #6b7280)',
      line: 'var(--dsh-border, rgba(127, 127, 127, 0.22))',
      soft: 'var(--dsh-surface-muted, rgba(127, 127, 127, 0.08))',
      accent: 'var(--dsh-accent, #247bbf)',
      danger: '#d14343',
    }

    const S = {
      panel: {
        height: '100%',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        color: C.fg,
        font: 'inherit',
      },
      head: {
        padding: '24px 28px 12px',
        display: 'flex',
        alignItems: 'baseline',
        gap: 12,
        flexWrap: 'wrap',
      },
      title: { fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: '0.2px' },
      count: { fontSize: 13.5, color: C.dim },
      tabs: {
        display: 'flex',
        gap: 6,
        padding: '0 28px',
        borderBottom: `1px solid ${C.line}`,
        marginBottom: 16,
      },
      tab: (active) => ({
        padding: '10px 16px',
        fontSize: 15,
        cursor: 'pointer',
        border: 'none',
        borderBottom: `2.5px solid ${active ? C.accent : 'transparent'}`,
        background: 'transparent',
        color: active ? C.fg : C.dim,
        fontWeight: active ? 700 : 500,
      }),
      body: { flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 28px 28px' },
      foot: {
        padding: '10px 28px 14px',
        borderTop: `1px solid ${C.line}`,
        fontSize: 12.5,
        color: C.dim,
        display: 'flex',
        gap: 8,
        alignItems: 'center',
        flexWrap: 'wrap',
      },
      footName: { fontWeight: 600, color: C.fg },
      form: {
        display: 'grid',
        gridTemplateColumns: '1.1fr 1.6fr 1fr auto',
        gap: 10,
        margin: '0 0 16px',
      },
      input: {
        width: '100%',
        boxSizing: 'border-box',
        padding: '10px 12px',
        borderRadius: 10,
        border: `1px solid ${C.line}`,
        background: 'transparent',
        color: 'inherit',
        fontSize: 15,
        outline: 'none',
      },
      button: {
        padding: '10px 16px',
        borderRadius: 10,
        border: `1px solid ${C.line}`,
        background: C.soft,
        color: 'inherit',
        fontSize: 14.5,
        cursor: 'pointer',
      },
      primary: {
        padding: '10px 18px',
        borderRadius: 10,
        border: '1px solid transparent',
        background: C.accent,
        color: '#fff',
        fontSize: 14.5,
        fontWeight: 600,
        cursor: 'pointer',
      },
      searchRow: { display: 'flex', gap: 10, margin: '0 0 16px' },
      row: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 14px',
        border: `1px solid ${C.line}`,
        borderRadius: 12,
        marginBottom: 8,
        background: 'transparent',
      },
      rowButton: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        flex: 1,
        minWidth: 0,
        padding: 0,
        border: 'none',
        background: 'transparent',
        color: 'inherit',
        font: 'inherit',
        textAlign: 'left',
        cursor: 'pointer',
      },
      rowMain: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 },
      link: {
        color: C.fg,
        fontWeight: 600,
        fontSize: 15.5,
        lineHeight: 1.35,
        textDecoration: 'none',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      },
      meta: {
        fontSize: 13,
        color: C.dim,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      },
      ghost: {
        padding: '6px 10px',
        borderRadius: 8,
        border: `1px solid ${C.line}`,
        background: 'transparent',
        color: C.dim,
        fontSize: 13,
        cursor: 'pointer',
        flex: 'none',
      },
      crumbs: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', margin: '0 0 14px' },
      crumb: {
        padding: '3px 8px',
        border: 'none',
        borderRadius: 6,
        background: 'transparent',
        color: C.dim,
        fontSize: 13.5,
        cursor: 'pointer',
      },
      notice: { fontSize: 13.5, color: C.dim, margin: '0 0 14px' },
      empty: {
        border: `1px dashed ${C.line}`,
        borderRadius: 12,
        padding: '26px 20px',
        color: C.dim,
        fontSize: 15,
        lineHeight: 1.9,
      },
      card: {
        border: `1px solid ${C.line}`,
        borderRadius: 12,
        padding: '18px 20px',
        fontSize: 14.5,
        lineHeight: 1.9,
        maxWidth: 720,
      },
      code: {
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: 13,
        padding: '1px 5px',
        borderRadius: 4,
        background: C.soft,
      },
    }

    function DocGlyph({ size }) {
      const s = typeof size === 'number' && size > 0 ? size : 20
      return h(
        'svg',
        {
          viewBox: '0 0 24 24',
          width: s,
          height: s,
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.7,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': true,
        },
        h('path', { d: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z' }),
        h('path', { d: 'M14 3v5h5' }),
        h('path', { d: 'M9 13h6' }),
        h('path', { d: 'M9 17h4' }),
      )
    }

    function FolderGlyph({ size }) {
      const s = typeof size === 'number' && size > 0 ? size : 20
      return h(
        'svg',
        {
          viewBox: '0 0 24 24',
          width: s,
          height: s,
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.7,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          opacity: 0.8,
          'aria-hidden': true,
        },
        h('path', { d: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' }),
      )
    }

    function SidebarEntry(props) {
      return h(DocGlyph, { size: typeof props.size === 'number' ? props.size : 20 })
    }

    // ── token setup card ────────────────────────────────────────────────
    function TokenCard({ tokenPage, onSave, busy, error }) {
      const [draft, setDraft] = useState('')
      const [localError, setLocalError] = useState('')
      const submit = (event) => {
        event.preventDefault()
        const token = draft.trim()
        if (token.length < 16) {
          setLocalError('这串太短了，请把整段 Token 复制过来')
          return
        }
        setLocalError('')
        onSave(token)
      }
      const message = error !== '' ? error : localError
      return h(
        'div',
        { style: S.card },
        h('div', { style: { fontWeight: 600, marginBottom: 6 } }, '先接上你的腾讯文档账号'),
        h(
          'ol',
          { style: { margin: '0 0 10px', paddingLeft: 20 } },
          h('li', null, '打开官方授权页，用 QQ 或微信登录，复制页面给出的访问令牌：',
            h('a', { href: tokenPage, target: '_blank', rel: 'noreferrer noopener', style: { color: C.accent } }, '打开授权页')),
          h('li', null, '把它粘到下面，保存后就能看到真实目录。'),
        ),
        h(
          'form',
          { onSubmit: submit, style: { display: 'flex', gap: 8, margin: '4px 0 8px' } },
          h('input', {
            style: S.input,
            placeholder: '粘贴访问令牌',
            value: draft,
            spellCheck: false,
            autoComplete: 'off',
            onChange: (event) => setDraft(event.target.value),
          }),
          h('button', { style: S.primary, type: 'submit', disabled: busy }, busy ? '验证中…' : '保存'),
        ),
        message === '' ? null : h('div', { style: { color: C.danger, fontSize: 12 } }, message),
        h('div', { style: { color: C.dim, fontSize: 12, marginTop: 8 } },
          '令牌只写进本机 ',
          h('code', { style: S.code }, '~/.dsh/tencent-docs/auth.json'),
          '，由插件后端持有，面板和页面脚本都读不到它。'),
      )
    }

    // ── auth state, shared by the tabs that hit the cloud ────────────────
    function useDocsAuth() {
      const [auth, setAuth] = useState(null)
      const [tokenSaving, setTokenSaving] = useState(false)
      const [authError, setAuthError] = useState('')

      const refreshAuth = useCallback(async () => {
        const payload = await apiGet('auth')
        setAuth({
          configured: payload.configured === true,
          fingerprint: typeof payload.fingerprint === 'string' ? payload.fingerprint : '',
          tokenPage: typeof payload.tokenPage === 'string' ? payload.tokenPage : 'https://docs.qq.com/scenario/open-claw.html',
        })
        return payload.configured === true
      }, [])

      const saveToken = useCallback(async (token) => {
        setTokenSaving(true)
        setAuthError('')
        const payload = await apiPost('auth', { token })
        if (payload.ok !== true) {
          setTokenSaving(false)
          setAuthError(payload.error ?? '保存失败')
          return false
        }
        const configured = await refreshAuth()
        setTokenSaving(false)
        return configured
      }, [refreshAuth])

      const clearToken = useCallback(async () => {
        await apiPost('auth/clear', {})
        await refreshAuth()
      }, [refreshAuth])

      const markAuthLost = useCallback(() => {
        setAuth((prev) => ({ ...(prev ?? {}), configured: false }))
      }, [])

      useEffect(() => { refreshAuth() }, [refreshAuth])

      return { auth, authError, tokenSaving, saveToken, clearToken, markAuthLost }
    }

    function CloudTab() {
      const { auth, authError, tokenSaving, saveToken, clearToken, markAuthLost } = useDocsAuth()

      const [path, setPath] = useState([ROOT])
      const [items, setItems] = useState([])
      const [next, setNext] = useState(0)
      const [finish, setFinish] = useState(true)
      const [loading, setLoading] = useState(false)
      const [error, setError] = useState('')

      const [term, setTerm] = useState('')
      const [hits, setHits] = useState(null)

      const current = path[path.length - 1]

      const readFolder = useCallback(async (folderId, start) => {
        setLoading(true)
        setError('')
        const payload = await apiGet('tree', { folder: folderId, start: start > 0 ? start : undefined })
        setLoading(false)
        if (payload.ok !== true) {
          if (payload.authRequired === true) markAuthLost()
          setError(payload.error ?? '读取失败')
          return
        }
        const rows = Array.isArray(payload.items) ? payload.items : []
        setItems((prev) => (start > 0 ? [...prev, ...rows] : rows))
        setNext(typeof payload.next === 'number' ? payload.next : rows.length)
        setFinish(payload.finish !== false)
      }, [markAuthLost])

      const configured = auth !== null && auth.configured === true

      useEffect(() => {
        if (!configured) return
        setPath([ROOT])
        setHits(null)
        setTerm('')
        readFolder('', 0)
      }, [configured, readFolder])

      const openFolder = useCallback((row) => {
        const nextPath = [...path, { id: row.id, title: row.title }]
        setPath(nextPath)
        setHits(null)
        setTerm('')
        setItems([])
        readFolder(row.id, 0)
      }, [path, readFolder])

      const goTo = useCallback((index) => {
        const nextPath = path.slice(0, index + 1)
        setPath(nextPath)
        setHits(null)
        setTerm('')
        setItems([])
        readFolder(nextPath[nextPath.length - 1].id, 0)
      }, [path, readFolder])

      const runSearch = useCallback(async (event) => {
        event.preventDefault()
        const keyword = term.trim()
        if (keyword === '') {
          setHits(null)
          return
        }
        setLoading(true)
        setError('')
        const payload = await apiGet('search', { q: keyword })
        setLoading(false)
        if (payload.ok !== true) {
          setError(payload.error ?? '搜索失败')
          return
        }
        setHits(Array.isArray(payload.items) ? payload.items : [])
      }, [term])

      if (auth === null) {
        return h('div', { style: S.notice }, '正在检查授权状态…')
      }

      if (!auth.configured) {
        return h(TokenCard, { tokenPage: auth.tokenPage, onSave: saveToken, busy: tokenSaving, error: authError })
      }

      const listing = hits !== null ? hits : items

      return h(
        'div',
        null,
        h(
          'div',
          { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' } },
          h(
            'div',
            { style: S.crumbs },
            path.map((node, index) => h(
              'span',
              { key: `${node.id}-${index}`, style: { display: 'inline-flex', alignItems: 'center', gap: 4 } },
              index === 0 ? null : h('span', { style: { color: C.dim, fontSize: 12 } }, '/'),
              h('button', {
                type: 'button',
                style: { ...S.crumb, color: index === path.length - 1 ? C.fg : C.dim },
                onClick: () => { if (index !== path.length - 1) goTo(index) },
              }, node.title),
            )),
          ),
          h('div', { style: { flex: 1 } }),
          h('button', {
            type: 'button',
            style: S.ghost,
            onClick: () => { setHits(null); setTerm(''); readFolder(current.id, 0) },
          }, loading ? '刷新中…' : '刷新'),
          h('button', { type: 'button', style: S.ghost, onClick: clearToken, title: '清除本机保存的令牌' }, '断开'),
        ),
        h(
          'form',
          { style: S.searchRow, onSubmit: runSearch },
          h('input', {
            style: S.input,
            placeholder: '在云文档里搜索标题',
            value: term,
            onChange: (event) => setTerm(event.target.value),
          }),
          h('button', { style: S.button, type: 'submit' }, '搜索'),
          hits === null ? null : h('button', {
            style: S.button,
            type: 'button',
            onClick: () => { setHits(null); setTerm('') },
          }, '退出搜索'),
        ),
        error === '' ? null : h('p', { style: { ...S.notice, color: C.danger } }, error),
        hits !== null ? h('p', { style: S.notice }, `搜索「${term.trim()}」：${hits.length} 条`) : null,
        listing.length === 0 && !loading
          ? h('div', { style: S.empty },
            h('div', null, hits !== null ? '没有匹配的文档。' : current.id === '' ? '这一层没有内容。' : '这个文件夹是空的。'))
          : listing.map((row) => h(
            'div',
            { key: row.id === '' ? row.title : row.id, style: S.row },
            row.isFolder
              ? h(
                'button',
                { type: 'button', style: S.rowButton, onClick: () => openFolder(row) },
                h(FolderGlyph, { size: 20 }),
                h('span', { style: S.rowMain },
                  h('span', { style: S.link }, row.title),
                  h('span', { style: S.meta }, '文件夹')),
                h('span', { style: { color: C.dim, fontSize: 12 } }, '›'),
              )
              : h(
                'a',
                {
                  style: S.rowButton,
                  href: row.url === '' ? undefined : row.url,
                  target: '_blank',
                  rel: 'noreferrer noopener',
                  title: row.url,
                },
                h(DocGlyph, { size: 20 }),
                h('span', { style: S.rowMain },
                  h('span', { style: S.link }, row.title),
                  h('span', { style: S.meta }, row.url === '' ? '无链接' : hostLabel(row.url))),
              ),
          )),
        hits === null && !finish
          ? h('button', {
            type: 'button',
            style: { ...S.button, marginTop: 6 },
            onClick: () => readFolder(current.id, next),
          }, loading ? '加载中…' : '加载更多')
          : null,
        h('p', { style: { ...S.notice, marginTop: 10 } },
          auth.fingerprint === '' ? '' : `令牌 ${auth.fingerprint} · 数据来自腾讯文档官方 MCP 接口`),
      )
    }

    // ── recent tab ──────────────────────────────────────────────────────
    function RecentTab() {
      const { auth, authError, tokenSaving, saveToken, markAuthLost } = useDocsAuth()
      const [items, setItems] = useState([])
      const [page, setPage] = useState(1)
      const [finish, setFinish] = useState(true)
      const [loading, setLoading] = useState(false)
      const [error, setError] = useState('')

      const load = useCallback(async (target) => {
        setLoading(true)
        setError('')
        const payload = await apiGet('recent', { page: target, count: 20 })
        setLoading(false)
        if (payload.ok !== true) {
          if (payload.authRequired === true) markAuthLost()
          setError(payload.error ?? '读取失败')
          return
        }
        const rows = Array.isArray(payload.items) ? payload.items : []
        setItems((prev) => (target > 1 ? [...prev, ...rows] : rows))
        setPage(typeof payload.page === 'number' ? payload.page : target)
        setFinish(payload.finish !== false)
      }, [markAuthLost])

      const configured = auth !== null && auth.configured === true

      useEffect(() => {
        if (configured) load(1)
      }, [configured, load])

      if (auth === null) return h('div', { style: S.notice }, '正在检查授权状态…')
      if (!configured) {
        return h(TokenCard, { tokenPage: auth.tokenPage, onSave: saveToken, busy: tokenSaving, error: authError })
      }

      return h(
        'div',
        null,
        h(
          'div',
          { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 } },
          h('span', { style: S.notice }, `最近打开/编辑的文件${items.length === 0 ? '' : ` · 已显示 ${items.length} 条`}`),
          h('div', { style: { flex: 1 } }),
          h('button', {
            type: 'button',
            style: S.ghost,
            onClick: () => load(1),
          }, loading ? '刷新中…' : '刷新'),
        ),
        error === '' ? null : h('p', { style: { ...S.notice, color: C.danger } }, error),
        items.length === 0 && !loading
          ? h('div', { style: S.empty }, '最近没有记录，或者刚授权还没生成足迹。')
          : items.map((row) => h(
            'div',
            { key: row.id === '' ? row.title : row.id, style: S.row },
            row.url === ''
              ? h(
                'span',
                { style: S.rowButton },
                h(DocGlyph, { size: 20 }),
                h('span', { style: S.rowMain },
                  h('span', { style: S.link }, row.title),
                  h('span', { style: S.meta }, '接口未返回链接')),
              )
              : h(
                'a',
                { style: S.rowButton, href: row.url, target: '_blank', rel: 'noreferrer noopener', title: row.url },
                h(DocGlyph, { size: 20 }),
                h('span', { style: S.rowMain },
                  h('span', { style: S.link }, row.title),
                  h('span', { style: S.meta }, hostLabel(row.url))),
              ),
          )),
        !finish
          ? h('button', {
            type: 'button',
            style: { ...S.button, marginTop: 6 },
            onClick: () => load(page + 1),
          }, loading ? '加载中…' : '加载更多')
          : null,
      )
    }

    // ── local list tab ──────────────────────────────────────────────────
    function LocalTab() {
      const [docs, setDocs] = useState(() => readLocal() ?? [])
      const [query, setQuery] = useState('')
      const [draft, setDraft] = useState({ title: '', url: '', note: '' })
      const [error, setError] = useState('')
      const [mirrored, setMirrored] = useState(true)

      // First mount: fetch the mirrored copy and adopt it only when the browser
      // has nothing of its own (so a stale file never overwrites live edits).
      useEffect(() => {
        let alive = true
        const local = readLocal()
        if (local !== null && local.length > 0) return undefined
        fetch(apiUrl('load'), { headers: { accept: 'application/json' } })
          .then((res) => (res.ok ? res.json() : undefined))
          .then((payload) => {
            if (!alive || payload === undefined || !Array.isArray(payload.docs)) return
            const restored = payload.docs.filter(isDoc)
            if (restored.length === 0) return
            writeLocal(restored)
            setDocs(restored)
          })
          .catch(() => undefined)
        return () => { alive = false }
      }, [])

      const commit = useCallback((nextDocs) => {
        setDocs(nextDocs)
        writeLocal(nextDocs)
        fetch(apiUrl('save'), {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ docs: nextDocs }),
        })
          .then((res) => setMirrored(res.ok))
          .catch(() => setMirrored(false))
      }, [])

      const addDoc = useCallback((event) => {
        event.preventDefault()
        const title = draft.title.trim()
        const url = normalizeUrl(draft.url)
        if (title === '' || url === '') {
          setError('标题和链接都要填')
          return
        }
        if (!/^https?:\/\/[^\s.]+\.[^\s]+$/i.test(url)) {
          setError('链接看起来不对，示例：https://docs.qq.com/doc/xxxx')
          return
        }
        setError('')
        commit([
          {
            id: newId(),
            title,
            url,
            ...(draft.note.trim() === '' ? {} : { note: draft.note.trim() }),
            pinned: false,
            updatedAt: Date.now(),
          },
          ...docs,
        ])
        setDraft({ title: '', url: '', note: '' })
      }, [commit, docs, draft])

      const togglePin = useCallback((id) => {
        commit(docs.map((doc) => (doc.id === id ? { ...doc, pinned: !doc.pinned, updatedAt: Date.now() } : doc)))
      }, [commit, docs])

      const removeDoc = useCallback((doc) => {
        if (typeof window.confirm === 'function' && !window.confirm(`删除「${doc.title}」？`)) return
        commit(docs.filter((item) => item.id !== doc.id))
      }, [commit, docs])

      const visible = useMemo(() => {
        const needle = query.trim().toLowerCase()
        const matched = needle === ''
          ? docs
          : docs.filter((doc) => `${doc.title} ${doc.note ?? ''} ${doc.url}`.toLowerCase().includes(needle))
        return [...matched].sort((a, b) => {
          if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
          return (b.updatedAt ?? 0) - (a.updatedAt ?? 0)
        })
      }, [docs, query])

      return h(
        'div',
        null,
        h(
          'form',
          { style: S.form, onSubmit: addDoc },
          h('input', {
            style: S.input,
            placeholder: '标题',
            value: draft.title,
            onChange: (event) => setDraft({ ...draft, title: event.target.value }),
          }),
          h('input', {
            style: S.input,
            placeholder: 'https://docs.qq.com/doc/...',
            value: draft.url,
            onChange: (event) => setDraft({ ...draft, url: event.target.value }),
          }),
          h('input', {
            style: S.input,
            placeholder: '备注（选填）',
            value: draft.note,
            onChange: (event) => setDraft({ ...draft, note: event.target.value }),
          }),
          h('button', { style: S.primary, type: 'submit' }, '添加'),
        ),
        error === '' ? null : h('p', { style: { ...S.notice, color: C.danger } }, error),
        docs.length === 0 ? null : h('input', {
          style: { ...S.input, marginBottom: 14 },
          placeholder: '搜索标题、备注、链接',
          value: query,
          onChange: (event) => setQuery(event.target.value),
        }),
        visible.length === 0
          ? h(
            'div',
            { style: S.empty },
            h('div', null, docs.length === 0 ? '还没有手记的链接。' : '没有匹配的文档。'),
            h('div', null, docs.length === 0
              ? '把腾讯文档的分享链接粘到上面一栏，点「添加」即可。条目只在本机保存。'
              : '换个关键词试试。'),
          )
          : visible.map((doc) => h(
            'div',
            { key: doc.id, style: S.row },
            h(
              'div',
              { style: S.rowMain },
              h('a', {
                style: S.link,
                href: doc.url,
                target: '_blank',
                rel: 'noreferrer noopener',
                title: doc.url,
              }, doc.title),
              h('span', { style: S.meta }, doc.note ? `${hostLabel(doc.url)} · ${doc.note}` : hostLabel(doc.url)),
            ),
            h('button', {
              style: S.ghost,
              type: 'button',
              onClick: () => togglePin(doc.id),
              title: doc.pinned ? '取消置顶' : '置顶',
            }, doc.pinned ? '已置顶' : '置顶'),
            h('button', {
              style: S.ghost,
              type: 'button',
              onClick: () => removeDoc(doc),
              title: '删除',
            }, '删除'),
          )),
        docs.length === 0 ? null : h(
          'p',
          { style: { ...S.notice, marginTop: 8 } },
          mirrored ? '已同步到 ~/.dsh/tencent-docs/docs.json' : '仅保存在本浏览器（host 路由不可用）',
        ),
      )
    }

    // ── panel ───────────────────────────────────────────────────────────
    const TABS = [
      { id: 'recent', label: '最近', hint: '最近打开与编辑' },
      { id: 'cloud', label: '云文档', hint: '云文档目录' },
      { id: 'local', label: '本机清单', hint: '本机链接清单' },
    ]

    function TencentDocsPanel() {
      const [tab, setTab] = useState('recent')
      const active = TABS.find((item) => item.id === tab) ?? TABS[0]
      return h(
        'div',
        { style: S.panel },
        h(
          'div',
          { style: S.head },
          h('h2', { style: S.title }, '腾讯文档'),
          h('span', { style: S.count }, active.hint),
        ),
        h(
          'div',
          { style: S.tabs },
          TABS.map((item) => h('button', {
            key: item.id,
            type: 'button',
            style: S.tab(tab === item.id),
            onClick: () => setTab(item.id),
          }, item.label)),
        ),
        h('div', { style: S.body },
          tab === 'recent' ? h(RecentTab) : tab === 'cloud' ? h(CloudTab) : h(LocalTab)),
        h(
          'div',
          { style: S.foot },
          h('span', null, '腾讯文档 · 由'),
          h('span', { style: S.footName }, 'YG'),
          h('span', null, '制作 · v0.3.2 · MIT'),
        ),
      )
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register(
          { name: 'sidebar.panellist', id: PANEL_ID, order: 25, label: () => '腾讯文档' },
          SidebarEntry,
        ))
        ctx.slots.inject('main', () => ctx.slots.register(
          { name: 'main', key: PANEL_ID },
          TencentDocsPanel,
        ))
      },
    }
  },
})
