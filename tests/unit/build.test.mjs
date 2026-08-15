import test from 'node:test'
import assert from 'node:assert/strict'
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

test('every theme family carries valid { light, dark } pairs and both font stacks', async () => {
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
    assert.ok(family.tokens['--dsw-font-family'], `${family.id} must set --dsw-font-family`)
    assert.ok(family.tokens['--ds-font-family-code'], `${family.id} must set --ds-font-family-code`)
    assert.equal(family.tokens['--dsw-font-family'].light, family.tokens['--dsw-font-family'].dark, 'font stacks are scheme-invariant')
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
