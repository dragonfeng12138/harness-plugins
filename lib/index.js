import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import z from '@deepseek-ai/schemastery'

export const name = 'dsh-skins'

/** 本插件持久化命名空间：host 设置文档，跨端口/重启存活。 */
const NS = settingsNamespace('dsh-skins')

/** 全字段字符串（含默认值），与客户端 PERSIST_FIELDS 一致。 */
const Schema = z.object({
  track: z.string().default(''),
  themeId: z.string().default(''),
  skinId: z.string().default(''),
  fontBody: z.string().default('auto'),
  fontCode: z.string().default('auto'),
  backdrop: z.string().default(''),
  glass: z.string().default('60'),
})

export function apply(ctx) {
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.register(NS, Schema)
  })
}
