/**
 * dsh-skins — ACG 外观包（浏览器端）
 *
 * 两条互斥轨道：
 *   - theme 轨道：token 覆盖型主题族，经 themeService.overrideTokens 叠加
 *     { light, dark } 双套值，跟随 DSH「外观」明暗设置自动切换；
 *   - skin  轨道：完整皮肤（body 属性作用域 CSS），替换背景、面板、配色与字体，
 *     明暗变体由 body[data-ds-dark-theme] 选择器承载。
 * 同一时刻至多一条轨道激活；任一选择清退另一轨道。选择经 localStorage 持久化，
 * 刷新自动恢复；插件停用时 teardown() 回收全部副作用。
 *
 * 数据（THEMES / SKINS）由 build.mjs 构建期内联进下方标记位。
 */

const React = require('react')

const THEMES = /*@__THEMES__@*/
const SKINS = /*@__SKINS__@*/

// ---- localStorage 常量与安全读写 ----
const STORAGE_THEME = 'dsh-skins-theme-v1'
const STORAGE_SKIN = 'dsh-skins-skin-v1'
const STORAGE_TRACK = 'dsh-skins-track-v1'

function readStored(key, fallback) {
  try {
    const value = localStorage.getItem(key)
    return value === null || value === '' ? fallback : value
  } catch {
    return fallback
  }
}
function writeStored(key, value) {
  try { localStorage.setItem(key, value) } catch {}
}

// ---- 轨道状态（模块级，apply 注入 service 后可用） ----
let themeService = null
let removeOverride = null
let selectedThemeId = null
let selectedSkinId = null
let activeTrack = '' // 'theme' | 'skin' | ''

const listeners = new Set()
function subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener) } }
function notify() { for (const listener of listeners) listener() }

const skinStyleSelector = (skinId) => `style[data-dsh-skins="${skinId}"]`

/** 清除当前主题 override 层（若有）。 */
function clearThemeOverride() {
  if (removeOverride !== null) {
    try { removeOverride() } catch {}
    removeOverride = null
  }
}

/** 清除当前皮肤：移除 style 节点与 body 属性。 */
function clearSkin() {
  if (selectedSkinId !== null) {
    const skin = SKINS.find((item) => item.id === selectedSkinId)
    const tag = document.querySelector(skinStyleSelector(selectedSkinId))
    if (tag !== null) tag.remove()
    if (skin && document.body.hasAttribute(skin.bodyAttr)) document.body.removeAttribute(skin.bodyAttr)
  }
  selectedSkinId = null
}

/** 激活一款主题族：清皮肤 → 重挂 token override 层 → 持久化。 */
function activateTheme(themeId) {
  if (themeService === null) return
  const family = THEMES.find((item) => item.id === themeId) || THEMES[0]
  if (family === undefined) return
  clearSkin()
  clearThemeOverride()
  removeOverride = themeService.overrideTokens('dsh-skins', family.tokens)
  selectedThemeId = family.id
  activeTrack = 'theme'
  writeStored(STORAGE_THEME, family.id)
  writeStored(STORAGE_TRACK, 'theme')
  notify()
}

/** 激活一款皮肤：清主题层 → 注入/更换皮肤 CSS → 设置 body 属性 → 持久化。 */
function activateSkin(skinId) {
  const skin = SKINS.find((item) => item.id === skinId)
  if (skin === undefined) return
  clearThemeOverride()
  clearSkin()
  let tag = document.querySelector(skinStyleSelector(skin.id))
  if (tag === null) {
    tag = document.createElement('style')
    tag.setAttribute('data-dsh-skins', skin.id)
    document.head.appendChild(tag)
  }
  tag.textContent = `${skin.css}\n${skin.a11y || ''}`
  document.body.setAttribute(skin.bodyAttr, '')
  selectedSkinId = skin.id
  activeTrack = 'skin'
  writeStored(STORAGE_SKIN, skin.id)
  writeStored(STORAGE_TRACK, 'skin')
  notify()
}

/** 恢复 DSH 默认：清空两条轨道的全部效果。 */
function resetTracks() {
  clearThemeOverride()
  clearSkin()
  selectedThemeId = null
  activeTrack = ''
  writeStored(STORAGE_TRACK, '')
  notify()
}

/** 切到主题轨道：恢复上次主题（无记录则第一族）。 */
function openThemeTrack() {
  if (activeTrack === 'theme') return
  const id = selectedThemeId !== null ? selectedThemeId : (THEMES[0] ? THEMES[0].id : null)
  if (id !== null) {
    activateTheme(id)
  } else {
    activeTrack = 'theme'
    writeStored(STORAGE_TRACK, 'theme')
    notify()
  }
}

/** 切到皮肤轨道：清主题层；曾选过皮肤则恢复。 */
function openSkinTrack() {
  if (activeTrack === 'skin') return
  clearThemeOverride()
  activeTrack = 'skin'
  writeStored(STORAGE_TRACK, 'skin')
  if (selectedSkinId !== null && SKINS.some((item) => item.id === selectedSkinId)) activateSkin(selectedSkinId)
  else notify()
}

/** apply 时恢复持久化选择；无效 id 回退，首次运行默认第一族。 */
function restoreSelection() {
  const track = readStored(STORAGE_TRACK, '')
  if (track === 'skin') {
    const id = readStored(STORAGE_SKIN, '')
    if (SKINS.some((item) => item.id === id)) {
      activateSkin(id)
      return
    }
  }
  if (track === 'theme') {
    const id = readStored(STORAGE_THEME, '')
    if (THEMES.some((item) => item.id === id)) {
      activateTheme(id)
      return
    }
  }
  if (THEMES.length > 0) activateTheme(THEMES[0].id)
}

/** 插件停用：回收全部副作用。 */
function teardown() {
  clearThemeOverride()
  clearSkin()
}

// ---- 画廊 UI 样式（自持，随插件卸载移除） ----
const UI_CSS = `
.dsk-wrap { display: grid; gap: 10px; padding: 4px 0; }
.dsk-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.dsk-title { color: var(--dsw-alias-label-primary); font-size: 14px; font-weight: 600; }
.dsk-count { color: var(--dsw-alias-label-secondary); font-size: 12px; }
.dsk-hint { color: var(--dsw-alias-label-secondary); font-size: 11px; line-height: 17px; }
.dsk-tabs { display: flex; gap: 4px; padding: 2px; background: var(--dsw-alias-bg-layer-2); border-radius: 9px; }
.dsk-tab { flex: 1; padding: 6px 10px; border: none; border-radius: 7px; background: transparent; color: var(--dsw-alias-label-secondary); font: inherit; font-size: 12px; cursor: pointer; }
.dsk-tab.is-active { background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); font-weight: 600; box-shadow: 0 0 0 1px var(--dsw-alias-border-l1); }
.dsk-search { box-sizing: border-box; width: 100%; height: 34px; padding: 0 11px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 9px; outline: none; background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); font: inherit; font-size: 12px; }
.dsk-search:focus { border-color: var(--dsw-alias-brand-primary); box-shadow: 0 0 0 2px color-mix(in srgb, var(--dsw-alias-brand-primary) 18%, transparent); }
.dsk-root { display: grid; gap: 8px; }
.dsk-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 7px; max-height: 300px; overflow: auto; padding: 2px; contain: content; }
.dsk-card { display: grid; grid-template-columns: 32px minmax(0, 1fr); align-items: center; gap: 8px; min-width: 0; padding: 8px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); cursor: pointer; font: inherit; text-align: left; }
.dsk-card:hover { border-color: var(--dsw-alias-brand-primary); }
.dsk-card.is-active { border-color: var(--dsw-alias-brand-primary); box-shadow: 0 0 0 2px color-mix(in srgb, var(--dsw-alias-brand-primary) 20%, transparent); }
.dsk-swatches { display: grid; grid-template-columns: 1fr 1fr; width: 30px; height: 22px; overflow: hidden; border-radius: 6px; border: 1px solid rgba(127,127,127,.3); }
.dsk-swatches.is-single { grid-template-columns: 1fr; }
.dsk-swatch { position: relative; min-width: 0; }
.dsk-swatch span { position: absolute; right: 2px; bottom: 3px; width: 7px; height: 7px; border-radius: 50%; }
.dsk-copy { min-width: 0; display: grid; gap: 2px; }
.dsk-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
.dsk-meta { color: var(--dsw-alias-label-secondary); font-size: 10px; }
.dsk-empty { padding: 14px; border: 1px dashed var(--dsw-alias-border-l2); border-radius: 10px; color: var(--dsw-alias-label-secondary); text-align: center; font-size: 12px; }
@media (max-width: 900px) { .dsk-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 680px) { .dsk-grid { grid-template-columns: 1fr; } }
`

// ---- 画廊 React 组件（settings.general.item 行） ----
function Gallery() {
  const [, force] = React.useReducer((value) => value + 1, 0)
  const [query, setQuery] = React.useState('')
  React.useEffect(() => subscribe(force), [])

  const normalized = query.trim().toLowerCase()
  const visibleThemes = THEMES.filter((item) => !normalized || (item.label + ' ' + item.id).toLowerCase().includes(normalized))
  const visibleSkins = SKINS.filter((item) => !normalized || (item.name + ' ' + item.nameEn + ' ' + item.id).toLowerCase().includes(normalized))

  const defaultCard = React.createElement('button', { key: 'dsk-default', type: 'button', className: 'dsk-card', onClick: resetTracks },
    React.createElement('span', { className: 'dsk-swatches' },
      React.createElement('span', { className: 'dsk-swatch', style: { background: '#f9fafb' } }),
      React.createElement('span', { className: 'dsk-swatch', style: { background: '#111318' } }),
    ),
    React.createElement('span', { className: 'dsk-copy' },
      React.createElement('span', { className: 'dsk-name' }, 'DSH 默认'),
      React.createElement('span', { className: 'dsk-meta' }, '恢复默认外观'),
    ),
  )

  const tabs = React.createElement('div', { className: 'dsk-tabs', role: 'tablist', 'aria-label': '外观轨道' },
    React.createElement('button', {
      type: 'button', role: 'tab', 'aria-selected': activeTrack === 'theme',
      className: 'dsk-tab' + (activeTrack === 'theme' ? ' is-active' : ''),
      onClick: openThemeTrack,
    }, '主题'),
    React.createElement('button', {
      type: 'button', role: 'tab', 'aria-selected': activeTrack === 'skin',
      className: 'dsk-tab' + (activeTrack === 'skin' ? ' is-active' : ''),
      onClick: openSkinTrack,
    }, '皮肤'),
  )

  const body = activeTrack === 'skin' ? renderSkinBody() : renderThemeBody()

  function renderThemeBody() {
    return React.createElement('div', { className: 'dsk-root' },
      React.createElement('div', { className: 'dsk-hint' }, '配色与字体随明暗外观自动切换；明暗模式请在「外观」行选择。'),
      React.createElement('input', {
        className: 'dsk-search', type: 'search', value: query, placeholder: '搜索主题…', 'aria-label': '搜索主题',
        onChange: (event) => setQuery(event.target.value),
      }),
      visibleThemes.length === 0
        ? React.createElement('div', { className: 'dsk-empty' }, '没有匹配的主题')
        : React.createElement('div', { className: 'dsk-grid' },
            defaultCard,
            ...visibleThemes.map((item) => React.createElement('button', {
              key: item.id, type: 'button',
              className: 'dsk-card' + (activeTrack === 'theme' && selectedThemeId === item.id ? ' is-active' : ''),
              'aria-pressed': activeTrack === 'theme' && selectedThemeId === item.id,
              onClick: () => activateTheme(item.id),
            },
              React.createElement('span', { className: 'dsk-swatches' },
                React.createElement('span', { className: 'dsk-swatch', style: { background: item.preview.light.background } }, React.createElement('span', { style: { background: item.preview.light.accent } })),
                React.createElement('span', { className: 'dsk-swatch', style: { background: item.preview.dark.background } }, React.createElement('span', { style: { background: item.preview.dark.accent } })),
              ),
              React.createElement('span', { className: 'dsk-copy' },
                React.createElement('span', { className: 'dsk-name' }, item.label),
                React.createElement('span', { className: 'dsk-meta' }, '明暗双套 · 含字体'),
              ),
            )),
          ),
    )
  }

  function renderSkinBody() {
    return React.createElement('div', { className: 'dsk-root' },
      React.createElement('div', { className: 'dsk-hint' }, '皮肤替换背景、面板、配色与字体；刷新页面自动恢复，明暗变体跟随外观设置。'),
      React.createElement('input', {
        className: 'dsk-search', type: 'search', value: query, placeholder: '搜索皮肤…', 'aria-label': '搜索皮肤',
        onChange: (event) => setQuery(event.target.value),
      }),
      visibleSkins.length === 0
        ? React.createElement('div', { className: 'dsk-empty' }, '没有匹配的皮肤')
        : React.createElement('div', { className: 'dsk-grid' },
            defaultCard,
            ...visibleSkins.map((item) => React.createElement('button', {
              key: item.id, type: 'button',
              className: 'dsk-card' + (activeTrack === 'skin' && selectedSkinId === item.id ? ' is-active' : ''),
              'aria-pressed': activeTrack === 'skin' && selectedSkinId === item.id,
              onClick: () => activateSkin(item.id),
            },
              React.createElement('span', { className: 'dsk-swatches is-single' },
                React.createElement('span', { className: 'dsk-swatch', style: { background: item.accent } }),
              ),
              React.createElement('span', { className: 'dsk-copy' },
                React.createElement('span', { className: 'dsk-name' }, item.name),
                React.createElement('span', { className: 'dsk-meta' }, item.author + ' · ' + item.accent),
              ),
            )),
          ),
    )
  }

  return React.createElement('div', { className: 'dsk-wrap' },
    React.createElement('div', { className: 'dsk-heading' },
      React.createElement('div', { className: 'dsk-title' }, 'ACG 外观'),
      React.createElement('div', { className: 'dsk-count' }, activeTrack === 'skin' ? SKINS.length + ' 皮肤' : THEMES.length + ' 主题'),
    ),
    tabs,
    body,
  )
}

// ---- 插件客户端入口 ----
function apply(ctx) {
  const theme = ctx.get('theme')
  const slots = ctx.get('slots')
  if (theme === undefined || slots === undefined) return
  themeService = theme

  // 恢复持久化选择（首次运行默认第一族）。
  restoreSelection()

  // 插件停用：回收 override 层、皮肤 style 与 body 属性。
  ctx.effect(() => () => teardown())

  // 画廊 UI 样式：自持 style 节点，随插件卸载移除。
  ctx.effect(() => {
    const tag = document.createElement('style')
    tag.setAttribute('data-dsh-skins-ui', '')
    tag.textContent = UI_CSS
    document.head.appendChild(tag)
    return () => tag.remove()
  })

  // 设置 → 常规：注册「ACG 外观」行（与「精选外观」等行并存）。
  slots.inject('settings.general.item', () => slots.register(
    { name: 'settings.general.item', id: 'dsh-skins', order: 12 },
    Gallery,
  ))
}
