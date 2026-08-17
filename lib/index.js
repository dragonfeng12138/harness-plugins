import { createRequire } from 'node:module'
import { join } from 'node:path'
import { homedir } from 'node:os'

export const name = 'dsh-skins'

/**
 * 手动渠道 + junction 挂载的坑：Node 按导入文件的「真实路径」解析依赖，
 * 而本包经 junction 出现在 profiles\node_modules，真实路径在工作区——
 * 所以顶层 import('@deepseek-ai/...') 必然 ERR_MODULE_NOT_FOUND（与
 * dsh-vs-bridge 同款）。因此 host 半段只依赖 node: 内建模块，外部包一律
 * 用 createRequire 锚定 profiles\node_modules 加载（schemastery 走
 * require 条件 -> index.cjs，CJS 可直接 require）。
 */
const profileModules = join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'profiles', 'node_modules')

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

export function apply(ctx) {
  if (Schema === null) return
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.register(NS, Schema)
  })
}
