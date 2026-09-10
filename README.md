# harness-plugins — DSH 插件合集

[DeepSeek Harness](https://github.com/deepseek-ai/)（DSH）桌面端插件合集。每个插件一个子目录独立管理，各自的 README 说明安装与使用。

## 插件列表

| 插件 | 说明 | 目录 |
| --- | --- | --- |
| dsh-skins | ACG 外观包：主题族 / 皮肤 / 字体 / 背景图像 | [dsh-skins/](dsh-skins/) |

## 从仓库源码注入 DSH（推荐）

本仓库**不发布 npm 包**，直接把仓库源码挂进 DSH 使用：改完代码 `node build.mjs` + 刷新页面即生效，无需发包或重装。以 `dsh-skins` 为例。

### 1. 前置

- 已安装 DSH 桌面端（或可用 `dsh` CLI），Node ≥ 20；
- 已克隆本仓库——下例假设仓库位于 `D:\github\harness-plugins`，按你的实际路径替换。

### 2. 把插件链接进 profile

DSH 从 `<DSH_HOME>/profiles/node_modules` 解析插件（`DSH_HOME` 默认 `~/.dsh`）。把它链接到仓库里的插件目录：

Windows（PowerShell，junction 不需要管理员权限）：

```powershell
$repo = "D:\github\harness-plugins"
$link = "$env:USERPROFILE\.dsh\profiles\node_modules\dsh-skins"
New-Item -ItemType Directory -Force -Path (Split-Path $link) | Out-Null
if (Test-Path $link) { [System.IO.Directory]::Delete($link, $false) }   # 只删链接，不动源码
New-Item -ItemType Junction -Path $link -Target "$repo\dsh-skins"
```

macOS / Linux：

```bash
ln -sfn /path/to/harness-plugins/dsh-skins ~/.dsh/profiles/node_modules/dsh-skins
```

> 必须是**目录链接**（junction / symlink）。复制文件的方式改完源码不会生效。

### 3. 在 profile 里挂载插件

编辑 `<DSH_HOME>/profiles/web/cordis.patch.yml`（文件不存在就新建），追加：

```yaml
- insert:
    - id: dsh-skins
      name: "dsh-skins"
```

### 4. 生效

- **重启 DSH**：host 半段随进程加载；
- 客户端半段刷新网页即生效——打开 **设置 →「ACG 外观」** 页签。

### 5. 日常改代码

```powershell
cd <仓库>\dsh-skins
node build.mjs          # 改 src/、themes/、skins/ 后重建 lib/client.js
node build.mjs --check  # 只校验产物是否最新（CI 用）
```

- 只改客户端（`src/client.core.js`、`themes/`、`skins/`）→ `node build.mjs` 后**硬刷新页面**（Ctrl+Shift+R）；
- 改了 `lib/index.js`（host 半段）→ 需重启 DSH；
- **不要手改 `lib/`**，它是构建产物。

### 6. 卸载

```powershell
[System.IO.Directory]::Delete("$env:USERPROFILE\.dsh\profiles\node_modules\dsh-skins", $false)
```

再从 `cordis.patch.yml` 删掉上面那段 `insert`，重启 DSH。

### 注意事项

- **不要同时走官方 `dsh plugin add`**：同一插件两条通道 = 双挂载双实例，行为异常；
- 本仓库插件不发布 npm，npm 上残留的旧版本不再维护；
- 每个插件更细的通道切换步骤与坑位见其目录内的 `DEVELOPMENT.md`。

## 使用

各插件的功能、配置与扩展方式见各自子目录的 README：

- [dsh-skins/README.md](dsh-skins/README.md)

## License

各插件目录内各自的 LICENSE。
