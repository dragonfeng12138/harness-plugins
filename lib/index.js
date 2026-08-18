import { createRequire } from 'node:module'
import { join, resolve, sep } from 'node:path'
import { homedir } from 'node:os'
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { randomBytes } from 'node:crypto'

export const name = 'dsh-skins'

/**
 * 手动渠道 + junction 挂载的坑：Node 按导入文件的「真实路径」解析依赖，
 * 而本包经 junction 出现在 profiles\node_modules，真实路径在工作区——
 * 所以顶层 import('@deepseek-ai/...') 必然 ERR_MODULE_NOT_FOUND（与
 * dsh-vs-bridge 同款）。因此 host 半段只依赖 node: 内建模块，外部包一律
 * 用 createRequire 锚定 profiles\node_modules 加载（schemastery 走
 * require 条件 -> index.cjs，CJS 可直接 require）。
 */
const DSH_HOME = process.env.DSH_HOME || join(homedir(), '.dsh')
const profileModules = join(DSH_HOME, 'profiles', 'node_modules')

let z = null
try {
  const schemaModule = createRequire(join(profileModules, 'dsh-skins-anchor.js'))('@deepseek-ai/schemastery')
  z = schemaModule && schemaModule.default ? schemaModule.default : schemaModule
} catch {
  // schemastery 不可用时降级：不注册持久化，客户端回退 localStorage。
}

/** 本插件持久化命名空间（与客户端 settingsScope.bind 一致）。 */
const NS = 'dsh-skins'

const Schema = z === null ? null : z.object({
  track: z.string().default(''),
  themeId: z.string().default(''),
  skinId: z.string().default(''),
  fontBody: z.string().default('auto'),
  fontCode: z.string().default('auto'),
  backdrop: z.string().default(''),
  glass: z.string().default('60'),
})

// ---- 背景图文件存储：图片落盘到 DSH_HOME/storages/dsh-skins/background，配置只存路径 ----
const BG_DIR = join(DSH_HOME, 'storages', 'dsh-skins', 'background')
const MIME_EXT = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/svg+xml': '.svg',
  'image/bmp': '.bmp',
  'image/avif': '.avif',
}
const MAX_BASE64_LEN = 20_000_000 // 约 15MB

function dataUrlInfo(dataUrl) {
  const match = /^data:([^;,]+);base64,([\s\S]*)$/.exec(String(dataUrl))
  return match === null ? null : { mime: match[1], base64: match[2] }
}
function mimeOfPath(path) {
  for (const [mime, ext] of Object.entries(MIME_EXT)) {
    if (path.endsWith(ext)) return mime
  }
  return 'image/png'
}
/** 只允许读写插件自己的背景目录，杜绝任意路径访问。 */
function safeBgPath(candidate) {
  if (typeof candidate !== 'string' || candidate === '') return null
  const resolved = resolve(candidate)
  const root = resolve(BG_DIR)
  if (resolved !== root && !resolved.startsWith(root + sep)) return null
  return resolved
}

/** `/dsh-skins` 通道：saveBackground / readBackground。 */
async function rpcHandler(endpoint, payload) {
  const input = payload && typeof payload === 'object' ? payload : {}
  if (endpoint === 'saveBackground') {
    const info = dataUrlInfo(input.data)
    const ext = info === null ? null : MIME_EXT[info.mime]
    if (ext === undefined || ext === null) return { ok: false, error: { code: 'bad-request', message: '仅接受 image/* 的 data URL' } }
    if (info.base64.length > MAX_BASE64_LEN) return { ok: false, error: { code: 'payload-too-large', message: '图片过大' } }
    try {
      mkdirSync(BG_DIR, { recursive: true })
      const file = `bg-${Date.now()}-${randomBytes(4).toString('hex')}${ext}`
      const target = join(BG_DIR, file)
      writeFileSync(target, Buffer.from(info.base64, 'base64'))
      return { ok: true, value: { path: target, name: String(input.name || file) } }
    } catch (error) {
      return { ok: false, error: { code: 'write-failed', message: String(error && error.message || error) } }
    }
  }
  if (endpoint === 'readBackground') {
    const target = safeBgPath(input.path)
    if (target === null) return { ok: true, value: null }
    try {
      if (!existsSync(target)) return { ok: true, value: null }
      const data = `data:${mimeOfPath(target)};base64,${readFileSync(target).toString('base64')}`
      return { ok: true, value: { data } }
    } catch {
      return { ok: true, value: null }
    }
  }
  return { ok: false, error: { code: 'not-found', message: `unknown endpoint ${endpoint}` } }
}

export function apply(ctx) {
  if (Schema !== null) {
    ctx.inject(['settings'], (settingsCtx) => {
      settingsCtx.settings.register(NS, Schema)
    })
  }
  // 背景图存取通道（loopback 信任域）；connection 不可用时跳过，客户端降级为预设/URL。
  const connection = ctx.get('connection')
  if (connection !== undefined && connection.rpc !== undefined) {
    const dispose = connection.rpc.handle('/dsh-skins', rpcHandler, { authority: 'loopback' })
    ctx.effect(() => () => { void dispose() })
  }
}
