import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { build } from '../../build.mjs'

test('build output is deterministic (idempotent)', async () => {
  const first = await build()
  const second = await build()
  assert.equal(second.output, first.output, 'two consecutive builds must produce identical bytes')
})

test('build embeds at least one theme family and one skin', async () => {
  const { output, themeCount, skinCount } = await build()
  assert.ok(themeCount >= 1, 'expected at least one theme family')
  assert.ok(skinCount >= 1, 'expected at least one skin')
  assert.ok(output.includes('window.__ModuleLoader__.load'), 'output must use the module-loader entry contract')
  assert.ok(output.includes('id: "dsh-skins"'), 'output must register the dsh-skins bundle id')
})

test('every theme family carries valid { light, dark } pairs and no font defaults', async () => {
  const { output, themeCount } = await build()
  const themesStart = output.indexOf('const THEMES = ')
  const themesEnd = output.indexOf('const SKINS = ', themesStart)
  assert.ok(themesStart !== -1 && themesEnd !== -1, 'expected inlined THEMES/SKINS constants')
  const themes = JSON.parse(output.slice(themesStart + 'const THEMES = '.length, themesEnd).trim())
  assert.equal(themes.length, themeCount)
  const ids = new Set()
  for (const family of themes) {
    assert.equal(typeof family.id, 'string')
    assert.ok(!ids.has(family.id), `duplicate theme id ${family.id}`)
    ids.add(family.id)
    for (const [name, value] of Object.entries(family.tokens)) {
      assert.equal(typeof value.light, 'string', `${family.id} token ${name} light must be a string`)
      assert.equal(typeof value.dark, 'string', `${family.id} token ${name} dark must be a string`)
    }
    assert.ok(!family.tokens['--dsw-font-family'], `${family.id} must not set --dsw-font-family (fonts are theme-independent)`)
    assert.ok(!family.tokens['--ds-font-family-code'], `${family.id} must not set --ds-font-family-code`)
  }
})

test('every skin css is scoped to its own body attribute in both variants', async () => {
  const { output, skinCount } = await build()
  const skinsStart = output.indexOf('const SKINS = ')
  const skinsEnd = output.indexOf('// ---- localStorage', skinsStart)
  assert.ok(skinsStart !== -1 && skinsEnd !== -1, 'expected inlined SKINS constant')
  const skins = JSON.parse(output.slice(skinsStart + 'const SKINS = '.length, skinsEnd).trim())
  assert.equal(skins.length, skinCount)
  const attrs = new Set()
  for (const skin of skins) {
    assert.ok(/^data-dsh-skin-[a-z0-9-]+$/.test(skin.bodyAttr), `${skin.id} bodyAttr shape`)
    assert.ok(!attrs.has(skin.bodyAttr), `duplicate bodyAttr ${skin.bodyAttr}`)
    attrs.add(skin.bodyAttr)
    assert.ok(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(skin.accent), `${skin.id} accent must be hex`)
    assert.ok(skin.css.includes(`body[${skin.bodyAttr}]`), `${skin.id} css must scope its base variant`)
    assert.ok(skin.css.includes(`body[${skin.bodyAttr}][data-ds-dark-theme]`), `${skin.id} css must scope its dark variant`)
    assert.ok(skin.css.includes('--dsw-font-family'), `${skin.id} css must set --dsw-font-family`)
    assert.ok(skin.css.includes('--ds-font-family-code'), `${skin.id} css must set --ds-font-family-code`)
  }
})

test('font track is independent, persisted, and system-probed', async () => {
  const { output } = await build()
  assert.ok(output.includes('dsh-skins-font-body-v1'), 'expected the font body storage key')
  assert.ok(output.includes('dsh-skins-font-code-v1'), 'expected the font code storage key')
  assert.ok(output.includes('data-dsh-skins-font'), 'expected the font layer style marker')
  assert.ok(output.includes('BODY_FONT_CANDIDATES'), 'expected the system font candidate list')
  assert.ok(output.includes('createFontDetector'), 'expected the canvas probing detector')
  assert.ok(output.includes('--dsw-font-family'), 'font layer must override the body font variable')
  assert.ok(output.includes('--ds-font-family-code'), 'font layer must override the code font variable')
})

test('theme track carries a background-image setting with presets and custom sources', async () => {
  const { output } = await build()
  assert.ok(output.includes('dsh-skins-backdrop-v1'), 'expected the backdrop storage key')
  assert.ok(output.includes('data-dsh-skins-backdrop'), 'expected the backdrop body attribute')
  assert.ok(output.includes('--dsk-backdrop-image'), 'expected the backdrop image variable')
  assert.ok(output.includes('--dsk-glass-bg-base'), 'expected the glass tint variables')
  assert.ok(output.includes('dsh-skins-glass-v1'), 'expected the glass opacity storage key')
  assert.ok(output.includes('--dsw-alias-bg-base: var(--dsk-glass-bg-base)'), 'frame must consume the glass tint via the alias token')
  assert.ok(output.includes("type: 'range'"), 'expected the glass opacity slider')
  assert.ok(output.includes("'theme/change'"), 'expected theme-change recompute subscription')
  assert.ok(output.includes('BACKDROPS'), 'expected the preset backdrop list')
  assert.ok(output.includes("data:image/svg+xml;charset=utf-8,"), 'presets must be inline SVG data URIs')
  assert.ok(output.includes('FileReader'), 'expected local file reading support')
  assert.ok(output.includes('presetStarfield') && output.includes('presetNightCity'), 'expected preset artwork builders')
  assert.ok(output.includes('url:'), 'expected custom URL storage format')
})

test('host half registers a durable settings namespace without external imports', async () => {
  const host = await readFile(new URL('../../lib/index.js', import.meta.url), 'utf8')
  assert.ok(!/(from '@|from ")/.test(host), 'host must not import external packages (junction real-path resolution breaks them)')
  assert.ok(host.includes('createRequire('), 'host must anchor-load schemastery from the profile node_modules')
  assert.ok(host.includes('settings.register('), 'host must register the namespace via the settings service')
  assert.ok(host.includes("rpc.handle('/dsh-skins'"), 'host must register the background file RPC channel')
  assert.ok(host.includes('saveBackground') && host.includes('readBackground'), 'host must expose save/read endpoints')
  for (const field of ['track', 'themeId', 'skinId', 'fontBody', 'fontCode', 'backdrop', 'glass']) {
    assert.ok(host.includes(field), `host schema must cover the persisted field ${field}`)
  }
})

test('host half loads in this environment and registers via the settings service', async () => {
  const host = await import('../../lib/index.js')
  assert.equal(typeof host.apply, 'function')
  const calls = []
  host.apply({
    inject: (deps, callback) => {
      if (deps && deps[0] === 'settings') {
        calls.push(deps)
        callback({
          settings: {
            register: (ns, schema) => {
              const resolved = schema({ track: 'skin' })
              assert.equal(resolved.track, 'skin')
              assert.equal(resolved.glass, '60', 'schema must apply defaults')
            },
          },
        })
      }
    },
    get: () => undefined,
  })
  if (calls.length > 0) {
    assert.deepEqual(calls, [['settings']], 'host must inject the settings service')
  }
})

test('host background RPC saves a file, reads it back, and rejects foreign paths', async () => {
  const host = await import('../../lib/index.js')
  let captured = null
  host.apply({
    inject: (deps, callback) => {
      if (deps && deps[0] === 'connection') {
        callback({
          connection: {
            rpc: {
              handle: (channel, handler, options) => {
                captured = { channel, handler, options }
                return () => Promise.resolve()
              },
            },
          },
        })
      }
    },
    effect: (fn) => fn(),
    get: () => undefined,
  })
  assert.ok(captured !== null, 'host must register the RPC channel when connection is available')
  assert.equal(captured.channel, '/dsh-skins')
  assert.equal(captured.options.authority, 'loopback')

  const save = await captured.handler('saveBackground', { name: 'probe.png', data: 'data:image/png;base64,' + Buffer.from('png-probe').toString('base64') })
  assert.equal(save.ok, true, 'save must succeed')
  assert.equal(typeof save.value.path, 'string')

  const read = await captured.handler('readBackground', { path: save.value.path })
  assert.equal(read.ok, true)
  assert.ok(String(read.value.data).startsWith('data:image/png;base64,'), 'read must return a data URL')
  assert.ok(String(read.value.data).includes(Buffer.from('png-probe').toString('base64')), 'read must return the saved bytes')

  const missing = await captured.handler('readBackground', { path: 'C:/definitely/not/there.png' })
  assert.equal(missing.ok, true)
  assert.equal(missing.value, null, 'missing file must resolve to null')

  const evil = await captured.handler('readBackground', { path: 'C:/Windows/win.ini' })
  assert.equal(evil.value, null, 'paths outside the plugin dir must be rejected')

  const badPayload = await captured.handler('saveBackground', { name: 'x', data: 'data:text/plain;base64,AA==' })
  assert.equal(badPayload.ok, false, 'non-image payloads must be rejected')

  const { unlinkSync, rmdirSync } = await import('node:fs')
  const { dirname } = await import('node:path')
  try {
    unlinkSync(save.value.path)
    rmdirSync(dirname(save.value.path))
  } catch {}
})

test('client persists via the host settings scope with a localStorage fallback', async () => {
  const { output } = await build()
  assert.ok(output.includes('settingsScope'), 'client must read the settingsScope service')
  assert.ok(output.includes("bind({ namespace: 'dsh-skins' })"), 'client must bind the dsh-skins namespace')
  assert.ok(output.includes('adoptHostState'), 'client must adopt saved host state on ready')
  assert.ok(output.includes('persistReady'), 'client must gate host writes on readiness')
  assert.ok(output.includes('getPersist') && output.includes('setPersist'), 'client must route all state through the persist layer')
  assert.ok(output.includes('saveBackgroundFile') && output.includes('readBackgroundFile'), 'client must save/read background files through host RPC')
  assert.ok(output.includes("ctx.inject(['connection']"), 'client must wait for the connection service via inject')
  assert.ok(output.includes('BACKDROPS[0]'), 'client must fall back to the first preset when the file is missing')
  assert.ok(!output.includes("type: 'file', name: file.name, data:"), 'the settings value must never embed image data')
})
