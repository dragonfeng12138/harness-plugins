# dsh-skins 开发：本地安装通道（A/B 切换）

本机 `~/.dsh/profiles` 下**同一插件只允许一条挂载通道**——双通道并存 = 双挂载双实例（插件加载两份，行为异常）。

## 通道 A：源码直挂（当前，开发推荐）

插件经 junction 直挂源码目录，**改源码 `node build.mjs` 重建后刷新网页即生效**（host 半段 `lib/index.js` 改动需重启 DSH 应用）。

恢复/切换步骤：

```powershell
# 1. 若当前在 B 通道，先卸载官方登记（清 bundles 登记 + node_modules + lockfile）
node <DSH安装目录>\lib\bin.js plugin --profile web remove dsh-skins

# 2. 建 junction 指向源码目录（本机源码：D:\claude-workspace\1003\dsh-skins\dsh-skins）
$j = "$env:USERPROFILE\.dsh\profiles\node_modules\dsh-skins"
if (Test-Path $j) { [System.IO.Directory]::Delete($j) }   # 只删链接，不动目标
New-Item -ItemType Junction -Path $j -Target "<源码目录>" 

# 3. 在 ~/.dsh/profiles/web/cordis.patch.yml 加 manual row（已存在则跳过）
#    - insert:
#        - id: dsh-skins
#          name: "dsh-skins"

# 4. 清理 pnpm-workspace.yaml 的 minimumReleaseAgeExclude 里的 dsh-skins（可选）
```

## 通道 B：官方 npm 命令

面向「使用者」的安装方式。本机切过去后加载的是 **npm 包副本**，改源码不再即时生效，需 `npm publish` 发新版再重装。

```powershell
# 发布新版（在包目录 dsh-skins/ 内执行；需 npm login）
npm publish

# 官方命令安装（会登记进 profiles/web/package.json 的 dsh.profile.bundles）
node <DSH安装目录>\lib\bin.js plugin --profile web add dsh-skins
```

新发布不足 24 小时的包若被 pnpm 以版本年龄拒绝，把 `dsh-skins` 加入
`profiles/web/pnpm-workspace.yaml` 的 `minimumReleaseAgeExclude`。

## 从 B 回 A 的清理（必做）

1. `node <DSH安装目录>\lib\bin.js plugin --profile web remove dsh-skins`（清 bundles 登记 / node_modules / lockfile）
2. 移除 pnpm-workspace.yaml 豁免
3. 按上面 A 的步骤 2–3 恢复 junction + manual row

## 坑位速查

- **双挂载**：同一包同时出现在 `dsh.profile.bundles`（B 通道）与 `cordis.patch.yml` manual insert（A 通道）= 双实例。
- **junction 真实路径解析**：经 junction 挂载的包，Node 按真实路径解析依赖——host 半段（`lib/index.js`）严禁 import 外部包（`@deepseek-ai/*` 会 ERR_MODULE_NOT_FOUND 导致插件加载失败），只用 `node:` 内建；schemastery 用 `createRequire` 锚定 `DSH_HOME/profiles/node_modules` 加载。
- **npm 全新包 + Granular Token**：创建 token 时只能选已存在的包，全新包必须用 **All packages** 范围 + **Read and write** + **Bypass 2FA**，否则报 `403 You may not perform that action with these credentials`。
- 官方通道安装的 bundle 需**重启应用/刷新网页**才挂载（客户端 bundle 按请求动态下发）。
- 本地背景图等数据不受通道切换影响（存 `DSH_HOME/storages/dsh-skins/`，与插件代码分离）。
