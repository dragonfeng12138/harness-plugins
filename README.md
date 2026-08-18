# dsh-skins — ACG 外观包

给 DSH 网页端换装：**主题族**（明/暗双套 token 配色）、**皮肤**（背景、面板、配色全套 CSS）与**独立的字体设置**（本机已安装字体，正文/代码分开选择），ACG 风格原创绘制，零运行时依赖、零网络请求。

## 内容

### 主题族（4 款，跟随 DSH「外观」明暗设置自动切换）

| id | 名称 | 方向 |
| --- | --- | --- |
| `sakura` | 樱语 / Sakura | 粉白亮 · 深梅子暗 |
| `aurora` | 极光 / Aurora | 青绿 + 紫罗兰双色 |
| `violet` | 紫罗兰之夜 / Violet Night | 紫调深色为主 |
| `cyber` | 赛博霓虹 / Cyber Neon | 青/品红霓虹点缀 |

每族覆盖 13 个核心 `--dsw-alias-*` token + 按钮 / 交互 / 代码块 / 滚动条等扩展 token。主题族**只改配色、不带字体默认值**——字体完全由「字体」页签（或 DSH/皮肤默认）决定。

主题页签内还可设置**背景图像**：5 款内置原创 SVG 预设（星野银河 / 极光天幕 / 樱花空 / 像素夕阳 / 夜城霓虹，离线可用），或自定义图片 URL / 本地文件（≤3.5MB）。**本地图片由 host 落盘到 `DSH_HOME/storages/dsh-skins/backgrounds/`，配置/设置文档只存文件路径（不存图像数据）**；加载时按路径读回，**文件不存在时自动回退第一个预设**。背景为**全屏工作区背景**（不改变窗口尺寸、无留边），工作区各背景层（框架 / 面板 / 侧栏）按主题色玻璃化，**「毛玻璃透明度」滑杆（0–100%）**控制透出程度；明暗切换自动重算玻璃色。激活皮肤时皮肤自带背景优先，回到主题轨道自动恢复。

### 皮肤（3 款，body 属性作用域 CSS，含明暗变体）

| id | 名称 | 特色 |
| --- | --- | --- |
| `neon-tokyo` | 霓虹东京 | 深夜都市渐变 + 品红青霓虹辉光 + 扫描线 + 玻璃面板 |
| `sakura-hanami` | 樱花祭 | 粉白花见天空 + 花瓣光斑 + 半透明花瓣面板 + 圆润字体 |
| `retro-arcade` | 复古街机 | CRT 荧光绿 + 像素网格 + 扫描线 + 全等宽字体 |

每款皮肤附 `a11y.css` 对比度修正层（后注入、同优先级后定义者胜），目标 WCAG AA。

### 字体（独立页签）

「字体」页签与主题/皮肤完全独立：正文字体（`--dsw-font-family`）与代码字体（`--ds-font-family-code`）分开选择。字体列表**只显示本机已安装的字体**——通过 Canvas 宽度比对自动探测（无权限弹窗、无网络请求），并可一键重新检测。选定后以 `!important` 覆盖皮肤自带的字体；选「默认」则交还（皮肤字体生效，无皮肤时用 DSH 默认字体）。

### 持久化

全部选择（主题 / 皮肤 / 字体 / 背景 / 毛玻璃透明度）经 DSH **host 设置文档**持久化（`dsh-skins` 命名空间），跨后端重启与端口变化存活——重启应用或重新打开网页都会加载上次保存的主题。localStorage 仅作兜底，升级后旧选择自动迁移写入。停用/移除插件时全部视觉副作用（token 层、皮肤 CSS、字体/背景/玻璃层）自动清理。

## 安装（手动渠道）

1. 构建（在包目录内）：

   ```powershell
   node build.mjs          # 把 src/themes/skins 内联进 lib/client.js
   node build.mjs --check  # 校验产物最新（CI 用）
   node --test --experimental-test-isolation=none --test-force-exit "tests/unit/*.test.mjs"
   ```

2. 复制运行时文件到共享 node_modules：

   ```powershell
   $dst = "$env:USERPROFILE\.dsh\profiles\node_modules\dsh-skins"
   Remove-Item $dst -Recurse -Force -ErrorAction SilentlyContinue
   New-Item -ItemType Directory -Force $dst | Out-Null
   Copy-Item package.json, cordis.patch.yml, README.md, LICENSE $dst
   Copy-Item lib $dst -Recurse
   ```

3. 在 `$env:USERPROFILE\.dsh\profiles\web\cordis.patch.yml` 追加一行（如已存在则跳过）：

   ```yaml
   - insert:
       - id: dsh-skins
         name: dsh-skins
   ```

4. **刷新网页 GUI**（客户端 bundle 按请求动态下发，刷新即生效；host 端 HMR 自动重组）。

5. 打开 **设置 →「ACG 外观」页签**（紧随「常规」之后），在「主题 / 皮肤 / 字体」三个页签间挑选；「DSH 默认」卡片可一键恢复，字体页签可单独选择本机字体，主题页签底部可设置背景图像。

选择经 localStorage 持久化，刷新页面自动恢复。插件停用/移除时，token override 层、皮肤 style 与 body 属性全部自动清理。

## 与 dsh-theme-gallery 共存

两者各自注册独立入口、互不冲突：本插件是设置面板里的独立页签，theme-gallery 是「常规」里的行。两者均通过 token override 层叠加，同 token 上后激活者胜。皮肤各自使用独立 body 属性作用域，可同时选择（视觉上皮肤轨道优先级更高，因为皮肤 CSS 后注入且作用于同一批变量）。

## 扩展新主题/皮肤

- 主题族：在 `themes/` 加一个 JSON（`id`、`label`、`preview.light/dark`、`tokens`，token 值必须是 `{ light, dark }` 字符串对），`node build.mjs` 后覆盖安装。
- 皮肤：在 `skins/<id>/` 加 `skin.json`（`bodyAttr` 必须是 `data-dsh-skin-<id>`、`accent` 为 hex）+ `skin.css`（必须同时覆盖 `body[attr]` 与 `body[attr][data-ds-dark-theme]` 两个变体、并设置两个字体变量）+ 可选 `a11y.css`，重新构建覆盖安装。
- `build.mjs` 会做 schema 校验与产物语法自检，`node build.mjs --check` 保证产物与源一致。

## 目录

```
lib/client.js     构建产物（勿手改）
lib/index.js      host 端 no-op（手动渠道契约）
lib/invariant.js  no-op
src/client.core.js  客户端引擎 + 画廊 UI（手写源）
themes/*.json     主题族数据
skins/<id>/       皮肤 manifest + CSS
build.mjs         内联构建
tests/unit/       构建与数据规范单测
```

## License

MIT
