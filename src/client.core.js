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
const STORAGE_FONT_BODY = 'dsh-skins-font-body-v1'
const STORAGE_FONT_CODE = 'dsh-skins-font-code-v1'
const STORAGE_BACKDROP = 'dsh-skins-backdrop-v1'
const FONT_AUTO = 'auto'

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

// ---- 字体轨道：独立于主题/皮肤，探测本机已安装字体（Canvas 度量，无权限/无网络） ----
const BODY_FONT_CANDIDATES = [
  { family: 'Microsoft YaHei', label: '微软雅黑 Microsoft YaHei' },
  { family: 'Microsoft YaHei UI', label: 'Microsoft YaHei UI' },
  { family: 'DengXian', label: '等线 DengXian' },
  { family: 'SimSun', label: '宋体 SimSun' },
  { family: 'NSimSun', label: '新宋体 NSimSun' },
  { family: 'SimHei', label: '黑体 SimHei' },
  { family: 'KaiTi', label: '楷体 KaiTi' },
  { family: 'FangSong', label: '仿宋 FangSong' },
  { family: 'YouYuan', label: '幼圆 YouYuan' },
  { family: 'STZhongsong', label: '华文中宋 STZhongsong' },
  { family: 'Segoe UI', label: 'Segoe UI' },
  { family: 'Arial', label: 'Arial' },
  { family: 'Verdana', label: 'Verdana' },
  { family: 'Tahoma', label: 'Tahoma' },
  { family: 'Georgia', label: 'Georgia' },
  { family: 'Times New Roman', label: 'Times New Roman' },
  { family: 'Calibri', label: 'Calibri' },
  { family: 'Cambria', label: 'Cambria' },
  { family: 'Trebuchet MS', label: 'Trebuchet MS' },
  { family: 'Comic Sans MS', label: 'Comic Sans MS' },
]

const CODE_FONT_CANDIDATES = [
  { family: 'Consolas', label: 'Consolas' },
  { family: 'Courier New', label: 'Courier New' },
  { family: 'Cascadia Mono', label: 'Cascadia Mono' },
  { family: 'Cascadia Code', label: 'Cascadia Code' },
  { family: 'JetBrains Mono', label: 'JetBrains Mono' },
  { family: 'Fira Code', label: 'Fira Code' },
  { family: 'Source Code Pro', label: 'Source Code Pro' },
  { family: 'Inconsolata', label: 'Inconsolata' },
  { family: 'MS Gothic', label: 'MS Gothic' },
  { family: 'DejaVu Sans Mono', label: 'DejaVu Sans Mono' },
]

/**
 * 宽度比对法探测字体是否安装：用统一测试串在 sans-serif/serif/monospace
 * 三种泛型回退上分别度量，若把候选字体放在回退前面时宽度发生变化，
 * 则说明候选字体真实参与渲染（已安装）。无权限弹窗、无网络请求。
 */
function createFontDetector() {
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (context === null) return () => false
  const TEST = 'MiWm字经0123456789-+=|'
  const GENERICS = ['sans-serif', 'serif', 'monospace']
  const baseline = {}
  const width = (font) => {
    context.font = font
    return context.measureText(TEST).width
  }
  for (const generic of GENERICS) baseline[generic] = width(`72px ${generic}`)
  return (family) => {
    for (const generic of GENERICS) {
      if (width(`72px '${family}', ${generic}`) !== baseline[generic]) return true
    }
    return false
  }
}
const detectFont = createFontDetector()
const detectInstalled = (candidates) => candidates.filter((item) => detectFont(item.family))

/** 字体覆盖层：用户选定字体时以 !important 覆盖主题/皮肤的字体变量。 */
let fontLayerTag = null
function applyFontLayer() {
  const body = String(readStored(STORAGE_FONT_BODY, FONT_AUTO)).replace(/['"]/g, '')
  const code = String(readStored(STORAGE_FONT_CODE, FONT_AUTO)).replace(/['"]/g, '')
  if (body === FONT_AUTO && code === FONT_AUTO) {
    teardownFontLayer()
    return
  }
  if (fontLayerTag === null) {
    fontLayerTag = document.createElement('style')
    fontLayerTag.setAttribute('data-dsh-skins-font', '')
    document.head.appendChild(fontLayerTag)
  }
  const declarations = []
  if (body !== FONT_AUTO) declarations.push(`--dsw-font-family: '${body}', 'Microsoft YaHei', 'PingFang SC', 'Segoe UI', sans-serif !important;`)
  if (code !== FONT_AUTO) declarations.push(`--ds-font-family-code: '${code}', 'Cascadia Mono', Consolas, 'Courier New', 'Microsoft YaHei', monospace !important;`)
  fontLayerTag.textContent = `body {\n  ${declarations.join('\n  ')}\n}`
}
function teardownFontLayer() {
  if (fontLayerTag !== null) {
    fontLayerTag.remove()
    fontLayerTag = null
  }
}

// ---- 背景图像：预设（原创 SVG 数据 URI，离线可用）+ 自定义 URL + 本地文件 ----
function svgUri(svg) {
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
}
function seededRand(seed) {
  return () => {
    seed = (seed * 16807) % 2147483647
    return seed / 2147483647
  }
}

function presetStarfield() {
  const rand = seededRand(20240815)
  const stars = []
  for (let i = 0; i < 48; i++) {
    stars.push(`<circle cx="${(rand() * 1600).toFixed(0)}" cy="${(rand() * 840).toFixed(0)}" r="${(0.7 + rand() * 1.5).toFixed(1)}" fill="#ffffff" opacity="${(0.35 + rand() * 0.65).toFixed(2)}"/>`)
  }
  return svgUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900"><defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0a0f2e"/><stop offset=".55" stop-color="#1c2c60"/><stop offset="1" stop-color="#452a72"/></linearGradient><radialGradient id="n" cx=".8" cy=".15" r=".55"><stop offset="0" stop-color="#7a4dff" stop-opacity=".35"/><stop offset="1" stop-color="#7a4dff" stop-opacity="0"/></radialGradient></defs><rect width="1600" height="900" fill="url(#s)"/><rect width="1600" height="900" fill="url(#n)"/><path d="M150 130 L330 166" stroke="#cfe9ff" stroke-opacity=".85" stroke-width="2" stroke-linecap="round"/><path d="M96 158 L186 168" stroke="#cfe9ff" stroke-opacity=".5" stroke-width="1.4" stroke-linecap="round"/><circle cx="1320" cy="170" r="58" fill="#ffe9f4"/><circle cx="1293" cy="148" r="48" fill="#0a0f2e" opacity=".92"/>${stars.join('')}</svg>`)
}

function presetAurora() {
  const rand = seededRand(42)
  const stars = []
  for (let i = 0; i < 30; i++) {
    stars.push(`<circle cx="${(rand() * 1600).toFixed(0)}" cy="${(rand() * 420).toFixed(0)}" r="${(0.6 + rand() * 1.2).toFixed(1)}" fill="#dff6ff" opacity="${(0.3 + rand() * 0.6).toFixed(2)}"/>`)
  }
  return svgUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#04121c"/><stop offset="1" stop-color="#0b2f36"/></linearGradient><filter id="b" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="22"/></filter></defs><rect fill="url(#g)" width="1600" height="900"/>${stars.join('')}<g filter="url(#b)" opacity=".55"><path d="M-100 520 Q300 380 700 540 T1600 460" stroke="#35e0a1" stroke-width="26" fill="none"/><path d="M-100 600 Q400 470 800 620 T1600 540" stroke="#2ee6ff" stroke-width="20" fill="none"/><path d="M-100 660 Q500 560 900 680 T1600 620" stroke="#9d7bff" stroke-width="18" fill="none"/></g><path d="M0 760 L240 620 L420 700 L640 560 L880 720 L1100 600 L1340 720 L1600 560 L1600 900 L0 900 Z" fill="#03131b"/></svg>`)
}

function presetSakura() {
  const rand = seededRand(7)
  const petals = []
  for (let i = 0; i < 18; i++) {
    const cx = (rand() * 1600).toFixed(0)
    const cy = (rand() * 900).toFixed(0)
    const angle = (rand() * 360).toFixed(0)
    petals.push(`<ellipse cx="${cx}" cy="${cy}" rx="${(5 + rand() * 7).toFixed(0)}" ry="${(2.5 + rand() * 3.5).toFixed(1)}" fill="#ffb7d5" opacity="${(0.35 + rand() * 0.5).toFixed(2)}" transform="rotate(${angle} ${cx} ${cy})"/>`)
  }
  return svgUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff4f8"/><stop offset=".6" stop-color="#ffe4ee"/><stop offset="1" stop-color="#ffd3e4"/></linearGradient></defs><rect width="1600" height="900" fill="url(#g)"/><circle cx="1280" cy="180" r="90" fill="#ffd9a8" opacity=".85"/>${petals.join('')}</svg>`)
}

function presetPixelSunset() {
  return svgUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" shape-rendering="crispEdges"><rect width="1600" height="900" fill="#1a0b2e"/><rect y="0" width="1600" height="120" fill="#3d1a5e"/><rect y="120" width="1600" height="110" fill="#6b2a6e"/><rect y="230" width="1600" height="100" fill="#a93a68"/><rect y="330" width="1600" height="90" fill="#e05a4e"/><rect y="420" width="1600" height="80" fill="#f78f45"/><rect y="500" width="1600" height="400" fill="#2a1140"/><circle cx="1180" cy="300" r="84" fill="#ffd94a"/><g fill="#ffd94a" opacity=".8"><rect x="1060" y="280" width="36" height="40"/><rect x="1004" y="296" width="24" height="8"/><rect x="1276" y="296" width="24" height="8"/><rect x="1264" y="236" width="8" height="24"/></g><g fill="#1a0b2e"><rect x="0" y="560" width="260" height="340"/><rect x="220" y="480" width="300" height="420"/><rect x="480" y="600" width="240" height="300"/><rect x="1240" y="520" width="360" height="380"/></g><g fill="#f78f45" opacity=".5"><rect x="60" y="600" width="12" height="12"/><rect x="140" y="660" width="12" height="12"/><rect x="300" y="540" width="12" height="12"/><rect x="560" y="640" width="12" height="12"/><rect x="1320" y="580" width="12" height="12"/><rect x="1450" y="660" width="12" height="12"/></g></svg>`)
}

function presetNightCity() {
  const rand = seededRand(99)
  const far = []
  let x = 0
  while (x < 1600) {
    const w = 60 + rand() * 90
    const h = 120 + rand() * 160
    far.push(`<rect x="${x.toFixed(0)}" y="${(900 - 320 - h).toFixed(0)}" width="${w.toFixed(0)}" height="${(320 + h).toFixed(0)}" fill="#101a3a"/>`)
    x += w + 4
  }
  const near = []
  const windows = []
  x = 0
  while (x < 1600) {
    const w = 90 + rand() * 80
    const h = 200 + rand() * 260
    const bx = x
    const by = 900 - h
    near.push(`<rect x="${bx.toFixed(0)}" y="${by.toFixed(0)}" width="${w.toFixed(0)}" height="${h.toFixed(0)}" fill="#0a1128"/>`)
    for (let wy = by + 16; wy < 900 - 26; wy += 34) {
      for (let wx = bx + 12; wx < bx + w - 14; wx += 26) {
        if (rand() < 0.2) windows.push(`<rect x="${wx.toFixed(0)}" y="${wy.toFixed(0)}" width="8" height="12" fill="${rand() < 0.5 ? '#ffd94a' : '#2ee6ff'}" opacity="${(0.5 + rand() * 0.5).toFixed(2)}"/>`)
      }
    }
    x += w + 6
  }
  return svgUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0a1030"/><stop offset=".6" stop-color="#141c4a"/><stop offset="1" stop-color="#2a1a4a"/></linearGradient></defs><rect width="1600" height="900" fill="url(#g)"/><circle cx="220" cy="150" r="46" fill="#f2e9ff"/><circle cx="205" cy="138" r="40" fill="#0a1030" opacity=".9"/><g opacity=".85">${far.join('')}</g>${near.join('')}${windows.join('')}</svg>`)
}

const BACKDROPS = [
  { id: 'starfield', name: '星野银河', uri: presetStarfield() },
  { id: 'aurora-veil', name: '极光天幕', uri: presetAurora() },
  { id: 'sakura-sky', name: '樱花空', uri: presetSakura() },
  { id: 'pixel-sunset', name: '像素夕阳', uri: presetPixelSunset() },
  { id: 'night-city', name: '夜城霓虹', uri: presetNightCity() },
]

/** 解析持久化的背景值：预设 id | url:<raw> | file 的 JSON 串；无效返回 null。 */
function parseBackdrop(value) {
  if (typeof value !== 'string' || value === '') return null
  if (value.startsWith('url:')) {
    const url = value.slice(4)
    if (url === '') return null
    return { kind: 'url', url }
  }
  if (value.startsWith('{')) {
    try {
      const parsed = JSON.parse(value)
      if (parsed && parsed.type === 'file' && typeof parsed.data === 'string' && parsed.data.startsWith('data:image/')) {
        return { kind: 'file', name: typeof parsed.name === 'string' ? parsed.name : '', data: parsed.data }
      }
    } catch {}
    return null
  }
  const preset = BACKDROPS.find((item) => item.id === value)
  return preset ? { kind: 'preset', id: preset.id } : null
}

function escapeCssUrl(raw) {
  return String(raw).replace(/(["\\])/g, '\\$1')
}

/** 背景层的 CSS 图像值：仅当主题轨道激活时生效；皮肤轨道清退。 */
function applyBackdropLayer() {
  if (activeTrack !== 'theme') {
    removeBackdropAttr()
    return
  }
  const parsed = parseBackdrop(readStored(STORAGE_BACKDROP, ''))
  if (parsed === null) {
    removeBackdropAttr()
    return
  }
  let raw = ''
  if (parsed.kind === 'preset') {
    const preset = BACKDROPS.find((item) => item.id === parsed.id)
    if (preset === undefined) { removeBackdropAttr(); return }
    raw = preset.uri
  } else if (parsed.kind === 'url') raw = parsed.url
  else raw = parsed.data
  document.body.setAttribute('data-dsh-skins-backdrop', '')
  document.body.style.setProperty('--dsk-backdrop-image', `url("${escapeCssUrl(raw)}")`)
}

function removeBackdropAttr() {
  document.body.removeAttribute('data-dsh-skins-backdrop')
  document.body.style.removeProperty('--dsk-backdrop-image')
}

/** 持久化背景并立即生效；返回是否成功（本地文件可能超出容量）。 */
function setBackdrop(value) {
  try {
    localStorage.setItem(STORAGE_BACKDROP, value)
  } catch {
    return false
  }
  applyBackdropLayer()
  notify()
  return true
}

// ---- 轨道状态（模块级，apply 注入 service 后可用） ----
let themeService = null
let removeOverride = null
let selectedThemeId = null
let selectedSkinId = null
let activeTrack = '' // 'theme' | 'skin' | ''
let activeView = 'theme' // 'theme' | 'skin' | 'font'（UI 视图，字体视图不与轨道互斥）

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
  applyBackdropLayer()
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
  applyBackdropLayer()
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
  applyBackdropLayer()
  writeStored(STORAGE_TRACK, '')
  notify()
}

/** 切到主题轨道：恢复上次主题（无记录则第一族）。 */
function openThemeTrack() {
  activeView = 'theme'
  if (activeTrack === 'theme') {
    notify()
    return
  }
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
  activeView = 'skin'
  if (activeTrack === 'skin') {
    notify()
    return
  }
  clearThemeOverride()
  activeTrack = 'skin'
  applyBackdropLayer()
  writeStored(STORAGE_TRACK, 'skin')
  if (selectedSkinId !== null && SKINS.some((item) => item.id === selectedSkinId)) activateSkin(selectedSkinId)
  else notify()
}

/** 切到字体视图：纯 UI 切换，不动主题/皮肤轨道。 */
function openFontView() {
  activeView = 'font'
  notify()
}

/** apply 时恢复持久化选择；无效 id 回退，首次运行默认第一族。 */
function restoreSelection() {
  const track = readStored(STORAGE_TRACK, '')
  if (track === 'skin') {
    const id = readStored(STORAGE_SKIN, '')
    if (SKINS.some((item) => item.id === id)) {
      activateSkin(id)
      activeView = 'skin'
      return
    }
  }
  if (track === 'theme') {
    const id = readStored(STORAGE_THEME, '')
    if (THEMES.some((item) => item.id === id)) {
      activateTheme(id)
      activeView = 'theme'
      return
    }
  }
  if (THEMES.length > 0) activateTheme(THEMES[0].id)
  activeView = 'theme'
}

/** 插件停用：回收全部副作用。 */
function teardown() {
  clearThemeOverride()
  clearSkin()
  teardownFontLayer()
  removeBackdropAttr()
}

// ---- 画廊 UI 样式（自持，随插件卸载移除） ----
const UI_CSS = `
.dsk-wrap { display: grid; gap: 10px; padding: 4px 0; }
.dsk-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.dsk-title { color: var(--dsw-alias-label-primary); font-size: 14px; font-weight: 600; }
.dsk-count { color: var(--dsw-alias-label-secondary); font-size: 12px; }
.dsk-hint { color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 18px; }
.dsk-tabs { display: flex; gap: 4px; padding: 2px; background: var(--dsw-alias-bg-layer-2); border-radius: 9px; }
.dsk-tab { flex: 1; padding: 6px 10px; border: none; border-radius: 7px; background: transparent; color: var(--dsw-alias-label-secondary); font: inherit; font-size: 12px; cursor: pointer; }
.dsk-tab.is-active { background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); font-weight: 600; box-shadow: 0 0 0 1px var(--dsw-alias-border-l1); }
.dsk-search { box-sizing: border-box; width: 100%; height: 34px; padding: 0 11px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 9px; outline: none; background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); font: inherit; font-size: 12px; }
.dsk-search:focus { border-color: var(--dsw-alias-brand-primary); box-shadow: 0 0 0 2px color-mix(in srgb, var(--dsw-alias-brand-primary) 18%, transparent); }
.dsk-root { display: grid; gap: 10px; }
.dsk-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 10px; padding: 2px; }
.dsk-card { display: grid; grid-template-columns: 34px minmax(0, 1fr); align-items: center; gap: 8px; min-width: 0; padding: 10px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); cursor: pointer; font: inherit; text-align: left; }
.dsk-card:hover { border-color: var(--dsw-alias-brand-primary); }
.dsk-card.is-active { border-color: var(--dsw-alias-brand-primary); box-shadow: 0 0 0 2px color-mix(in srgb, var(--dsw-alias-brand-primary) 20%, transparent); }
.dsk-swatches { display: grid; grid-template-columns: 1fr 1fr; width: 34px; height: 24px; overflow: hidden; border-radius: 6px; border: 1px solid rgba(127,127,127,.3); }
.dsk-swatches.is-single { grid-template-columns: 1fr; }
.dsk-swatch { position: relative; min-width: 0; }
.dsk-swatch span { position: absolute; right: 2px; bottom: 3px; width: 7px; height: 7px; border-radius: 50%; }
.dsk-copy { min-width: 0; display: grid; gap: 2px; }
.dsk-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
.dsk-meta { color: var(--dsw-alias-label-secondary); font-size: 10px; }
.dsk-empty { padding: 14px; border: 1px dashed var(--dsw-alias-border-l2); border-radius: 10px; color: var(--dsw-alias-label-secondary); text-align: center; font-size: 12px; }
.dsk-font-row { display: grid; grid-template-columns: 96px minmax(0, 1fr); align-items: center; gap: 10px; }
.dsk-font-label { color: var(--dsw-alias-label-secondary); font-size: 12px; }
.dsk-select { box-sizing: border-box; width: 100%; height: 34px; padding: 0 10px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 9px; outline: none; background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); font: inherit; font-size: 12px; }
.dsk-select:focus { border-color: var(--dsw-alias-brand-primary); box-shadow: 0 0 0 2px color-mix(in srgb, var(--dsw-alias-brand-primary) 18%, transparent); }
.dsk-font-preview { padding: 10px 12px; border: 1px dashed var(--dsw-alias-border-l2); border-radius: 10px; font-size: 13px; color: var(--dsw-alias-label-primary); }
.dsk-font-toolbar { display: flex; align-items: center; gap: 10px; }
.dsk-btn { padding: 6px 12px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); font: inherit; font-size: 12px; cursor: pointer; }
.dsk-btn:hover { border-color: var(--dsw-alias-brand-primary); }
.dsk-backdrop { display: grid; gap: 8px; padding-top: 10px; border-top: 1px solid var(--dsw-alias-border-l1); }
.dsk-backdrop-title { color: var(--dsw-alias-label-secondary); font-size: 12px; font-weight: 600; }
.dsk-backdrop-row { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.dsk-backdrop-thumb { width: 64px; height: 40px; padding: 0; border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; background-size: cover; background-position: center; cursor: pointer; overflow: hidden; position: relative; }
.dsk-backdrop-thumb:hover { border-color: var(--dsw-alias-brand-primary); }
.dsk-backdrop-thumb.is-active { border-color: var(--dsw-alias-brand-primary); box-shadow: 0 0 0 2px color-mix(in srgb, var(--dsw-alias-brand-primary) 20%, transparent); }
.dsk-backdrop-thumb.is-named { width: auto; padding: 0 10px; font: inherit; font-size: 11px; color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-layer-1); }
.dsk-backdrop-thumb-label { position: absolute; inset: auto 0 0 0; padding: 1px 4px; background: rgba(0,0,0,.45); color: #fff; font-size: 9px; line-height: 13px; text-align: center; }
.dsk-backdrop-url { display: flex; gap: 6px; }
.dsk-error { color: var(--dsw-alias-state-error-primary); font-size: 11px; }
body[data-dsh-skins-backdrop] {
  background-image: var(--dsk-backdrop-image);
  background-size: cover;
  background-position: center;
}
body[data-dsh-skins-backdrop] [id=root] {
  background: color-mix(in srgb, var(--dsw-alias-bg-base) 64%, transparent);
  -webkit-backdrop-filter: blur(7px);
  backdrop-filter: blur(7px);
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 14px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.18);
}
`

// ---- 字体设置面板（settings.section 页签内的字体视图） ----
function FontPanel() {
  const [, force] = React.useReducer((value) => value + 1, 0)
  const [tick, setTick] = React.useState(0)
  const bodyFonts = React.useMemo(() => detectInstalled(BODY_FONT_CANDIDATES), [tick])
  const codeFonts = React.useMemo(() => detectInstalled(CODE_FONT_CANDIDATES), [tick])
  const bodyValue = readStored(STORAGE_FONT_BODY, FONT_AUTO)
  const codeValue = readStored(STORAGE_FONT_CODE, FONT_AUTO)

  const pick = (key) => (event) => {
    writeStored(key, event.target.value)
    applyFontLayer()
    force()
  }

  const optionList = (value, fonts) => {
    const entries = fonts.slice()
    if (value !== FONT_AUTO && !entries.some((item) => item.family === value)) {
      entries.unshift({ family: value, label: value })
    }
    return entries
  }

  const picker = (labelText, key, value, fonts) => React.createElement('label', { className: 'dsk-font-row' },
    React.createElement('span', { className: 'dsk-font-label' }, labelText),
    React.createElement('select', { className: 'dsk-select', value, onChange: pick(key) },
      React.createElement('option', { value: FONT_AUTO }, '跟随主题 / 皮肤'),
      ...optionList(value, fonts).map((item) => React.createElement('option', {
        key: item.family, value: item.family, style: { fontFamily: `'${item.family}', sans-serif` },
      }, item.label)),
    ),
  )

  return React.createElement('div', { className: 'dsk-root' },
    React.createElement('div', { className: 'dsk-hint' }, '字体为独立设置：选定后覆盖主题/皮肤自带的字体，选「跟随主题 / 皮肤」则交还。列表只显示本机已安装的字体（自动探测，无需联网）。'),
    picker('正文字体', STORAGE_FONT_BODY, bodyValue, bodyFonts),
    picker('代码字体', STORAGE_FONT_CODE, codeValue, codeFonts),
    React.createElement('div', {
      className: 'dsk-font-preview',
      style: { fontFamily: bodyValue === FONT_AUTO ? undefined : `'${bodyValue}', sans-serif` },
    }, '预览 · ACG 字体示例 · Aa Bb 012 · 深蓝深海深霓虹'),
    React.createElement('div', { className: 'dsk-font-toolbar' },
      React.createElement('button', { type: 'button', className: 'dsk-btn', onClick: () => setTick((value) => value + 1) }, '重新检测字体'),
      React.createElement('span', { className: 'dsk-count' }, `正文 ${bodyFonts.length} 款 · 代码 ${codeFonts.length} 款`),
    ),
  )
}

// ---- 背景图像面板（主题页签内） ----
function BackdropPanel() {
  const [error, setError] = React.useState('')
  const [urlDraft, setUrlDraft] = React.useState('')
  const urlRef = React.useRef(null)
  const parsed = parseBackdrop(readStored(STORAGE_BACKDROP, ''))
  const current = parsed === null ? 'none' : parsed.kind === 'preset' ? parsed.id : 'custom'

  const applyUrl = () => {
    const value = urlDraft.trim()
    if (value === '') return
    if (!/^(https?:\/\/|data:image\/)/i.test(value)) {
      setError('URL 需以 http(s):// 开头，或为 data:image 数据')
      return
    }
    setError(setBackdrop('url:' + value) ? '' : '保存失败：本地存储容量不足')
  }

  const onFile = (event) => {
    const file = event.target.files && event.target.files[0]
    event.target.value = ''
    if (file === undefined) return
    if (!file.type.startsWith('image/')) { setError('请选择图片文件'); return }
    if (file.size > 3500000) { setError('图片过大（>3.5MB），请压缩后重试或改用 URL'); return }
    const reader = new FileReader()
    reader.onerror = () => setError('读取文件失败')
    reader.onload = () => {
      const ok = setBackdrop(JSON.stringify({ type: 'file', name: file.name, data: String(reader.result || '') }))
      setError(ok ? '' : '保存失败：本地存储容量不足，请改用 URL')
    }
    reader.readAsDataURL(file)
  }

  const thumb = (id, label, title, style) => React.createElement('button', {
    key: id, type: 'button', title,
    className: 'dsk-backdrop-thumb' + (id === 'none' || id === 'custom' ? ' is-named' : '') + (current === id ? ' is-active' : ''),
    'aria-pressed': current === id,
    style,
    onClick: () => {
      if (id === 'none') { setError(setBackdrop('') ? '' : '保存失败'); return }
      if (id === 'custom') {
        if (urlRef.current !== null) urlRef.current.focus()
        return
      }
      setError(setBackdrop(id) ? '' : '保存失败')
    },
  },
    id === 'none' ? '无' : id === 'custom' ? '自定义' : null,
    id !== 'none' && id !== 'custom' ? React.createElement('span', { className: 'dsk-backdrop-thumb-label' }, label) : null,
  )

  const customStyle = parsed && parsed.kind === 'file'
    ? { backgroundImage: `url("${escapeCssUrl(parsed.data)}")` }
    : parsed && parsed.kind === 'url'
      ? { backgroundImage: `url("${escapeCssUrl(parsed.url)}")` }
      : {}

  return React.createElement('div', { className: 'dsk-backdrop' },
    React.createElement('div', { className: 'dsk-backdrop-title' }, '背景图像'),
    React.createElement('div', { className: 'dsk-backdrop-row' },
      thumb('none', '无', '不使用背景图像'),
      ...BACKDROPS.map((item) => thumb(item.id, item.name, item.name, { backgroundImage: `url("${escapeCssUrl(item.uri)}")` })),
      thumb('custom', '自定义', '自定义图片（URL 或本地文件）', customStyle),
    ),
    React.createElement('div', { className: 'dsk-backdrop-url' },
      React.createElement('input', {
        ref: urlRef, className: 'dsk-search', type: 'text', value: urlDraft,
        placeholder: '粘贴图片 URL（https://…）', 'aria-label': '图片 URL',
        onChange: (event) => setUrlDraft(event.target.value),
        onKeyDown: (event) => { if (event.key === 'Enter') applyUrl() },
      }),
      React.createElement('button', { type: 'button', className: 'dsk-btn', onClick: applyUrl }, '应用 URL'),
      React.createElement('label', { className: 'dsk-btn', style: { cursor: 'pointer' } },
        parsed && parsed.kind === 'file' ? '已用本地图：' + parsed.name : '选择本地图片…',
        React.createElement('input', { type: 'file', accept: 'image/*', style: { display: 'none' }, onChange: onFile }),
      ),
    ),
    error !== '' ? React.createElement('div', { className: 'dsk-error' }, error) : null,
    React.createElement('div', { className: 'dsk-hint' }, '预设背景为内置原创图（离线可用）；自定义图片保存在浏览器本地。皮肤激活时皮肤自带背景优先，回主题轨道自动恢复。'),
  )
}

// ---- 画廊 React 组件（settings.section 独立页签内容） ----
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

  const tab = (view, label, onClick) => React.createElement('button', {
    type: 'button', role: 'tab', 'aria-selected': activeView === view,
    className: 'dsk-tab' + (activeView === view ? ' is-active' : ''),
    onClick,
  }, label)

  const tabs = React.createElement('div', { className: 'dsk-tabs', role: 'tablist', 'aria-label': '外观轨道' },
    tab('theme', '主题', openThemeTrack),
    tab('skin', '皮肤', openSkinTrack),
    tab('font', '字体', openFontView),
  )

  const body = activeView === 'skin' ? renderSkinBody() : activeView === 'font' ? React.createElement(FontPanel) : renderThemeBody()

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
      React.createElement(BackdropPanel),
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
      React.createElement('div', { className: 'dsk-count' }, activeView === 'skin' ? SKINS.length + ' 皮肤' : activeView === 'font' ? '独立设置' : THEMES.length + ' 主题'),
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

  // 恢复持久化选择（首次运行默认第一族）与字体覆盖层。
  restoreSelection()
  applyFontLayer()

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

  // 设置面板：独立「ACG 外观」页签（紧随「常规」之后，不占用通用设置行）。
  slots.inject('settings.section', () => slots.register(
    { name: 'settings.section', id: 'dsh-skins', order: 5, label: 'ACG 外观' },
    Gallery,
  ))
}
