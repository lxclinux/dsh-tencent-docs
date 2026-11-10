/**
 * Host half of the Tencent Docs hub.
 *
 * Two jobs:
 *
 *  1. Mirror the panel's local link list to `~/.dsh/tencent-docs/docs.json`
 *     (see `client.js`, which owns `localStorage`).
 *  2. Talk to the **official Tencent Docs MCP endpoint**
 *     (`https://docs.qq.com/openapi/mcp`) so the panel can show the real
 *     account tree — folders and files — instead of only hand-kept links.
 *
 * Routes (all under one prefix so the Client resolves them against the page
 * base, see `client.js`):
 *   GET  /tencent-docs/api/load          -> { ok, docs }
 *   POST /tencent-docs/api/save          -> { ok, count }        body: { docs }
 *   GET  /tencent-docs/api/auth          -> { ok, configured, hint }
 *   POST /tencent-docs/api/auth          -> { ok, configured }   body: { token }
 *   POST /tencent-docs/api/auth/clear    -> { ok, configured }
 *   GET  /tencent-docs/api/tools         -> { ok, tools: [name] }
 *   GET  /tencent-docs/api/tree?folder=&start=
 *   GET  /tencent-docs/api/search?q=
 *   GET  /tencent-docs/api/recent
 *
 * The MCP endpoint is a streamable-HTTP JSON-RPC server: `initialize`, then
 * `notifications/initialized`, then `tools/call`, with the `Mcp-Session-Id`
 * the server hands back on `initialize` echoed on every later request.
 */
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

export const name = 'dsh-tencent-docs'
export const inject = ['webServer']

const ROUTE = '/tencent-docs/api'
const BODY_LIMIT = 1_000_000
const DATA_DIR = join(homedir(), '.dsh', 'tencent-docs')
const storePath = join(DATA_DIR, 'docs.json')
const authPath = join(DATA_DIR, 'auth.json')

const MCP_URL = 'https://docs.qq.com/openapi/mcp'
const MCP_PROTOCOL = '2025-06-18'
const CALL_TIMEOUT_MS = 20_000
const TOKEN_PAGE = 'https://docs.qq.com/scenario/open-claw.html'

/** `?'`-free status codes the Client treats as "set the token first". */
class AuthError extends Error {}

// ── http plumbing ─────────────────────────────────────────────────────────

function reply(res, status, payload) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(JSON.stringify(payload))
}

/** Read one JSON body, refusing bodies above {@link BODY_LIMIT} bytes. */
async function readJson(req) {
  const chunks = []
  let total = 0
  for await (const chunk of req) {
    total += chunk.length
    if (total > BODY_LIMIT) throw new Error('body too large')
    chunks.push(chunk)
  }
  if (total === 0) return undefined
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

// ── the mirrored link list (unchanged behaviour) ──────────────────────────

/** Trim one stored row to the fields the panel understands. */
function normalizeDoc(raw, index) {
  if (raw === null || typeof raw !== 'object') return undefined
  const title = typeof raw.title === 'string' ? raw.title.trim() : ''
  const url = typeof raw.url === 'string' ? raw.url.trim() : ''
  if (title === '' || url === '') return undefined
  const doc = {
    id: typeof raw.id === 'string' && raw.id !== '' ? raw.id : `doc-${index}`,
    title: title.slice(0, 200),
    url: url.slice(0, 2000),
    pinned: raw.pinned === true,
    updatedAt: Number.isFinite(raw.updatedAt) ? raw.updatedAt : Date.now(),
  }
  if (typeof raw.note === 'string' && raw.note.trim() !== '') doc.note = raw.note.trim().slice(0, 500)
  return doc
}

async function loadDocs() {
  try {
    const raw = await readFile(storePath, 'utf8')
    const parsed = JSON.parse(raw)
    const list = Array.isArray(parsed?.docs) ? parsed.docs : []
    return list.map(normalizeDoc).filter((doc) => doc !== undefined)
  } catch {
    return []
  }
}

async function saveDocs(docs) {
  await mkdir(dirname(storePath), { recursive: true })
  const body = JSON.stringify({ version: 1, savedAt: Date.now(), docs }, null, 2)
  await writeFile(storePath, body, 'utf8')
}

// ── token store ───────────────────────────────────────────────────────────

async function readToken() {
  try {
    const raw = await readFile(authPath, 'utf8')
    const parsed = JSON.parse(raw)
    const token = typeof parsed?.token === 'string' ? parsed.token.trim() : ''
    return token === '' ? '' : token
  } catch {
    return ''
  }
}

async function writeToken(token) {
  await mkdir(DATA_DIR, { recursive: true })
  const body = JSON.stringify({ version: 1, savedAt: Date.now(), token }, null, 2)
  await writeFile(authPath, body, { encoding: 'utf8', mode: 0o600 })
  try {
    await chmod(authPath, 0o600)
  } catch {
    // Windows ignores POSIX modes; the profile directory already confines it.
  }
}

/** `len32:83ca…` — enough to recognise a token, never enough to reuse it. */
function fingerprint(token) {
  if (token === '') return ''
  const head = token.slice(0, 4)
  return `len${token.length}:${head}…`
}

// ── MCP client ────────────────────────────────────────────────────────────

let sessionId = ''
let requestId = 0
let toolCache

/** Parse one JSON-RPC reply that may arrive as `application/json` or as SSE. */
async function readRpc(res) {
  const contentType = res.headers.get('content-type') ?? ''
  const text = await res.text()
  if (contentType.includes('text/event-stream')) {
    const messages = []
    for (const block of text.split(/\r?\n\r?\n/)) {
      const data = block
        .split(/\r?\n/)
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim())
        .join('\n')
      if (data === '') continue
      try {
        messages.push(JSON.parse(data))
      } catch {
        // Keep scanning: one malformed frame must not lose the real reply.
      }
    }
    return messages.find((message) => message && message.id !== undefined) ?? messages.at(-1) ?? null
  }
  const trimmed = text.trim()
  if (trimmed === '') return null
  try {
    return JSON.parse(trimmed)
  } catch {
    return { raw: trimmed }
  }
}

/**
 * One JSON-RPC round trip against the Docs MCP endpoint.
 *
 * `authorization` is `Bearer <token>` per the MCP bridge docs; a bare token is
 * retried once because the endpoint accepts both spellings in the wild.
 */
async function rpc(method, params, { notification = false } = {}) {
  const token = await readToken()
  if (token === '') throw new AuthError('no token')

  const headers = {
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
    authorization: `Bearer ${token}`,
  }
  if (sessionId !== '') headers['mcp-session-id'] = sessionId

  const payload = notification
    ? { jsonrpc: '2.0', method, params }
    : { jsonrpc: '2.0', id: ++requestId, method, params }

  const res = await fetch(MCP_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
  })

  if (res.status === 401 || res.status === 403) {
    throw new AuthError(`token rejected (HTTP ${res.status})`)
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`MCP HTTP ${res.status} ${body.slice(0, 200)}`.trim())
  }

  const nextSession = res.headers.get('mcp-session-id')
  if (nextSession) sessionId = nextSession

  const message = await readRpc(res)
  if (message === null) return null
  if (message.error) {
    const code = message.error.code ?? 'error'
    throw new Error(`${code}: ${message.error.message ?? ''}`.trim())
  }
  return message.result ?? message
}

async function ensureSession() {
  if (sessionId !== '') return
  await rpc('initialize', {
    protocolVersion: MCP_PROTOCOL,
    capabilities: {},
    clientInfo: { name: 'dsh-tencent-docs', version: '0.2.0' },
  })
  // Acknowledge; the server answers this notification with 202 and no body.
  await rpc('notifications/initialized', {}, { notification: true }).catch(() => undefined)
}

/** `tools/list`, cached for a minute — the endpoint advertises ~226 tools. */
async function listTools() {
  if (toolCache !== undefined && Date.now() - toolCache.at < 60_000) return toolCache.names
  await ensureSession()
  const result = await rpc('tools/list', {})
  const tools = Array.isArray(result?.tools) ? result.tools : []
  const names = tools.map((tool) => String(tool?.name ?? '')).filter((tool) => tool !== '')
  toolCache = { at: Date.now(), names }
  return names
}

function pickTool(names, patterns) {
  for (const pattern of patterns) {
    const hit = names.find((candidate) => pattern.test(candidate))
    if (hit !== undefined) return hit
  }
  return undefined
}

async function resolveTool(kind) {
  const names = await listTools()
  const table = {
    folderList: [/folder[_.]?list/i, /list[_.]?folder/i, /folder/i],
    search: [/search[_.]?file/i, /file[_.]?search/i, /search/i],
    recent: [
      /^manage[._]recent[._]?online[._]?file$/i,
      /recent[._]?online[._]?file/i,
      /^manage[._]recent/i,
      /^doc[._]recent/i,
    ],
  }
  const tool = pickTool(names, table[kind] ?? [])
  if (tool === undefined) throw new Error(`endpoint has no ${kind} tool`)
  return tool
}

/** Pull a JSON object out of one `tools/call` result. */
function unwrap(result) {
  if (result === null || result === undefined) return undefined
  if (result.structuredContent !== null && typeof result.structuredContent === 'object') {
    return result.structuredContent
  }
  const parts = Array.isArray(result.content) ? result.content : []
  const text = parts
    .filter((part) => part && part.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text)
    .join('\n')
    .trim()
  if (text === '') return undefined
  try {
    return JSON.parse(text)
  } catch {
    return { text }
  }
}

async function callTool(name, args) {
  await ensureSession()
  const result = await rpc('tools/call', { name, arguments: args })
  if (result?.isError === true) {
    const detail = unwrap(result)
    throw new Error(typeof detail?.text === 'string' ? detail.text.slice(0, 400) : 'tool reported an error')
  }
  return unwrap(result)
}

// ── normalisation ─────────────────────────────────────────────────────────

function asString(value) {
  return typeof value === 'string' ? value : value === undefined || value === null ? '' : String(value)
}

/** One row of `manage.folder_list`. */
function folderRow(raw) {
  if (raw === null || typeof raw !== 'object') return undefined
  const id = asString(raw.id ?? raw.ID).trim()
  const title = asString(raw.title ?? raw.file_name).trim()
  if (id === '' && title === '') return undefined
  const isFolder = raw.is_folder === true || raw.type === 'folder'
  const row = {
    id,
    title: title === '' ? '(未命名)' : title,
    url: asString(raw.url),
    isFolder,
  }
  if (isFolder) row.url = ''
  return row
}

function searchRow(raw) {
  if (raw === null || typeof raw !== 'object') return undefined
  const id = asString(raw.file_id ?? raw.id).trim()
  const title = asString(raw.title ?? raw.file_name).trim()
  if (id === '' && title === '') return undefined
  return { id, title: title === '' ? '(未命名)' : title, url: asString(raw.url ?? raw.file_url), isFolder: false }
}

function recentRow(raw) {
  if (raw === null || typeof raw !== 'object') return undefined
  const id = asString(raw.file_id ?? raw.id).trim()
  const title = asString(raw.file_name ?? raw.title).trim()
  if (id === '' && title === '') return undefined
  return { id, title: title === '' ? '(未命名)' : title, url: asString(raw.file_url ?? raw.url), isFolder: false }
}

function tidy(rows) {
  return rows.filter((row) => row !== undefined)
}

// ── operations ────────────────────────────────────────────────────────────

async function readTree(folderId, start) {
  const tool = await resolveTool('folderList')
  const args = {}
  if (folderId !== '') args.folder_id = folderId
  if (start > 0) args.start = start
  const data = await callTool(tool, args)
  const list = Array.isArray(data?.list) ? data.list : []
  return {
    ok: true,
    folderId,
    items: tidy(list.map(folderRow)),
    finish: data?.finish !== false,
    next: start + list.length,
  }
}

async function readSearch(keyword) {
  const tool = await resolveTool('search')
  const data = await callTool(tool, { search_key: keyword })
  const list = Array.isArray(data?.list) ? data.list : []
  return { ok: true, items: tidy(list.map(searchRow)) }
}

async function readRecent(page, count) {
  const tool = await resolveTool('recent')
  const size = Number.isFinite(count) && count > 0 ? Math.min(count, 20) : 20
  const data = await callTool(tool, { num: Number.isFinite(page) && page > 0 ? page : 1, count: size })
  const list = Array.isArray(data?.files) ? data.files : Array.isArray(data?.file) ? data.file : []
  const items = tidy(list.map(recentRow))
  return {
    ok: true,
    page: Number.isFinite(page) && page > 0 ? page : 1,
    items,
    finish: items.length < size,
    next: (Number.isFinite(page) && page > 0 ? page : 1) + 1,
  }
}

// ── routes ────────────────────────────────────────────────────────────────

function describeError(error) {
  if (error instanceof AuthError) return 'auth'
  return String(error && error.message ? error.message : error)
}

export function apply(ctx) {
  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: ROUTE,
    handler: async (req, res) => {
      const url = new URL(req.url ?? '/', 'http://dsh.invalid')
      const pathname = url.pathname
      const method = pathname.startsWith(`${ROUTE}/`) ? pathname.slice(ROUTE.length + 1) : ''
      try {
        if (method === 'load') {
          if (req.method !== 'GET') return reply(res, 405, { ok: false, error: 'method not allowed' })
          return reply(res, 200, { ok: true, docs: await loadDocs() })
        }

        if (method === 'save') {
          if (req.method !== 'POST') return reply(res, 405, { ok: false, error: 'method not allowed' })
          const payload = await readJson(req)
          const raw = Array.isArray(payload?.docs) ? payload.docs : []
          const docs = raw.map(normalizeDoc).filter((doc) => doc !== undefined)
          await saveDocs(docs)
          return reply(res, 200, { ok: true, count: docs.length })
        }

        if (method === 'auth') {
          if (req.method === 'GET') {
            const token = await readToken()
            return reply(res, 200, {
              ok: true,
              configured: token !== '',
              fingerprint: fingerprint(token),
              tokenPage: TOKEN_PAGE,
            })
          }
          if (req.method === 'POST') {
            const payload = await readJson(req)
            const token = typeof payload?.token === 'string' ? payload.token.trim() : ''
            if (token.length < 16) return reply(res, 400, { ok: false, error: 'token 太短，请重新复制' })
            await writeToken(token)
            sessionId = ''
            toolCache = undefined
            return reply(res, 200, { ok: true, configured: true, fingerprint: fingerprint(token) })
          }
          return reply(res, 405, { ok: false, error: 'method not allowed' })
        }

        if (method === 'auth/clear') {
          if (req.method !== 'POST') return reply(res, 405, { ok: false, error: 'method not allowed' })
          await writeToken('')
          sessionId = ''
          toolCache = undefined
          return reply(res, 200, { ok: true, configured: false })
        }

        if (method === 'tools') {
          if (req.method !== 'GET') return reply(res, 405, { ok: false, error: 'method not allowed' })
          const names = await listTools()
          return reply(res, 200, { ok: true, count: names.length, tools: names })
        }

        if (method === 'tree') {
          if (req.method !== 'GET') return reply(res, 405, { ok: false, error: 'method not allowed' })
          const folder = (url.searchParams.get('folder') ?? '').trim()
          const start = Number.parseInt(url.searchParams.get('start') ?? '0', 10)
          const payload = await readTree(folder, Number.isFinite(start) && start > 0 ? start : 0)
          return reply(res, 200, payload)
        }

        if (method === 'search') {
          if (req.method !== 'GET') return reply(res, 405, { ok: false, error: 'method not allowed' })
          const keyword = (url.searchParams.get('q') ?? '').trim()
          if (keyword === '') return reply(res, 400, { ok: false, error: '缺少搜索词' })
          return reply(res, 200, await readSearch(keyword))
        }

        if (method === 'recent') {
          if (req.method !== 'GET') return reply(res, 405, { ok: false, error: 'method not allowed' })
          const page = Number.parseInt(url.searchParams.get('page') ?? '1', 10)
          const count = Number.parseInt(url.searchParams.get('count') ?? '50', 10)
          return reply(res, 200, await readRecent(page, count))
        }

        return reply(res, 404, { ok: false, error: 'unknown method' })
      } catch (error) {
        const message = describeError(error)
        const status = error instanceof AuthError ? 401 : 502
        return reply(res, status, { ok: false, error: message, authRequired: error instanceof AuthError })
      }
    },
  }), 'dsh-tencent-docs: /tencent-docs/api routes')
}
