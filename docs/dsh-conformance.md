# DSH 接口规范符合性核对（2.0.0）

> 对照对象：运行中的 DSH **0.2.2-rc.1**、`cordis-plugin-development` 参考文档、实时 `cordis_inspect_query`
> 核对时间：2026-11-10
> 代码快照：00:39（评审期间工作区正在改动：`src/host/instance.js`、SSE `event: ping` 已加入；行号以该快照为准）
> 结论：**硬契约全部符合，可以被安装/加载/展示；但架构用法有 2 处、UI 有 2 处偏离 DSH 推荐路径。**

---

## 0. 一句话结论

| 问题 | 回答 |
|---|---|
| 能按 DSH 规范安装、加载、出现在侧栏/主面板/浮层吗？ | **能**，逐项可验证 |
| 是按 DSH 推荐方式扩展的吗？ | **部分是**：数据派生与 Client↔Host 通道是自建方案；弹窗主题与可访问性不符合 UI 规范 |
| 有会让插件装不上/不生效的硬错误吗？ | **没有**。`engines.dsh` 也已验证通过（见 §1） |

| 层 | 判定 |
|---|---|
| 包清单 / 加载契约 | ✅ 完全符合 |
| Host 导出 / 路由 | ✅ 完全符合 |
| Client 工厂 / Slot | ✅ 完全符合（实时 occupant 已验证） |
| Locale / 图标 / 元数据 | ✅ 符合 |
| 主题 token | ✅ 已修（2.0）：弹窗/页面对齐 `--dsw-alias-*` |
| 可访问性 | ✅ 已修（2.0）：`aria-modal` + Escape + 焦点陷阱/还原 |
| 数据与传输架构 | ⚠️ 可用，但未走 `sessionProjections` + `wire.view` / `host.call` |
| 平台能力复用 | ⚠️ 未用 `ctx.subprocess`（`/usr/bin/open` 无平台替代，可接受） |

---

## 1. 硬契约核对（全部通过）

| # | 规范要求 | 实现 | 证据 |
|---|---|---|---|
| 1 | 包声明 `dsh.bundle.patch` | `./cordis.patch.yml` | `package.json` `dsh.bundle` |
| 2 | patch 用 `insert` 行，`id`/`name` 唯一 | `{id: desk-pet, name: dsh-desk-pet-plugin}` | 实时 `Config.listConfigs` 返回 `patchId: desk-pet`、`name: dsh-desk-pet-plugin` |
| 3 | `exports` 暴露 `.` / `./client` / `./locale/*.json` / `./icon` | 四项齐全 | `package.json` |
| 4 | `files` 覆盖全部运行期文件 | `dist/index.js`、`dist/client.js`、patch、locale、icon、`dist/pet-core.js`、`src/host/{security,sse}.js` 全在 | 与 `index.js` 的相对 import / `readFileSync` 一一对应 |
| 5 | `engines.dsh` 不阻断安装 | `>=0.2.1-rc.5` vs 运行 0.2.2-rc.1 | DSH 自身校验使用 `semver.satisfies(..., { includePrerelease: true })`（`dsh-app-boot/lib/index.js:1094`），实测 **true**；默认 semver 会误判 false，DSH 已处理 |
| 6 | Host 导出 `inject` + `apply(ctx)` | `export const inject = ['webServer']` + `apply` | `src/index.js` |
| 7 | 资源注册走 `ctx.effect` 并返回清理 | 路由、SSE、子进程均在 effect 内清理 | `src/index.js` |
| 8 | 路由用 `webServer.register({kind,path,handler})` | `{kind:'prefix', path:'/api/desk-pet', handler}` | `WebRouteKind = 'exact' \| 'prefix'`；handler 签名 `(IncomingMessage, ServerResponse)` 匹配 |
| 9 | Client 产物是 `__ModuleLoader__.load({id, factory})`，`id` = 包名 | `id: 'dsh-desk-pet-plugin'` | `dist/client.js` 首行；`src/scene/web/client.js` 由 esbuild 产出 |
| 10 | React 从浏览器模块表取，不自带 | `require('react')` | 打包 `external: ['react']`；Builtin 列表含 `React` |
| 11 | 主面板 Slot：`main` 是 keyed，只能传 `key` | `{name:'main', key:'desk-pet'}` | 实时 occupant：`main` 下 `desk-pet` **active** |
| 12 | 侧栏图标 Slot：`sidebar.panellist` 是 list，需 `id` | `{name:'sidebar.panellist', id:'desk-pet', order:20, label}` | Slot 存在，registration 形状匹配 |
| 13 | 浮层 Slot：`shell.overlay` 是 list，需 `id` | `{name:'shell.overlay', id:'desk-pet', order:0, label}` | 实时 occupant：`shell.overlay` 下 `desk-pet` **active** |
| 14 | 浮层组件可拿到会话 hooks | `useSessions` / `useSessionStatus` 在 `shell.overlay` 的 `standardProps` 内 | 实时 Slot catalog |
| 15 | 组件卸载即注销 | 所有 slot 注册包在 `ctx.effect(() => ctx.slots.inject(...))` | `src/scene/web/client.js:1611-1638`；`inject` 返回值是幂等 disposer |
| 16 | Locale 用 Client locale 服务 | `register(ns, 'en'/'zh', dict)` + `bind` + `subscribe`/`getSnapshot` | 三个方法均在实时 `locale` 服务契约内；`desk-pet` 不在 `LocaleNamespaceMap`，用 untyped 形式是文档允许的 |
| 17 | 面板导航 / 打开会话用平台服务 | `ctx.layout.selectPanel('desk-pet')`、`ctx.uiWorkspace.openSession(id)` | 两个服务均存在且签名匹配；`selectPanel` 未注册时抛错，代码已 try/catch |
| 18 | 展示元数据 `meta.title` / `meta.description` | en/zh 均齐全 | `locale/en.json`、`locale/zh.json` |
| 19 | 图标是有效图片、导出 `./icon`、≤256 KiB | 629 B 合法 SVG，`<svg viewBox="0 0 64 64">` | `icon.svg` |
| 20 | 无 `Config` 时不报错 | 行状态 `absent` | `Config.listConfigs`；`Config` 是可选项 |

> 第 9/10 条与打包相关：`dist/pet-core.js` 由 `prepublishOnly` 构建；当前 git 未跟踪 `dist/`，从 git 直接安装的目录不会自动带上它（`/float` 会 500）。这是打包稳健性问题，不是接口违规。

---

## 2. 偏离项（按影响排序）

### D1 · 会话状态在 Client 侧派生，而不是 Host projection + `wire.view`（架构，中）

- **现状**：`StatusBridge` 订阅整份 store（`useSessionStatus((s) => s)`、`useSessions((s) => s)`），每次变化 `Object.values(byId)` 全量扫描后 `deriveViewModel`（[client.js:961-975](../src/scene/web/client.js#L961-L975)）；再用 10s 心跳把结果 POST 给 Host（[client.js:1095](../src/scene/web/client.js#L1095)）。
- **规范**：`practices.md` 原则 3「框架驱动、插件计算」明确「订阅、重扫会绕过增量机制」；性能节要求把派生状态放进 `ctx.sessionProjections`；UI 节写「Client 需要由会话派生的值时，在 Host projection 上声明 `wire.view`」。
- **平台能力已确认存在**：`sessionProjections.register(definition)` 支持 `wire: { viewSchema, view }`（`@deepseek-ai/dsh-session-projection/lib/index.js:116-125`），wire 值会进入 Client 的 `SessionProjectionViewValues`。
- **代价**：每次流式更新 O(n) 扫描；状态真值实际存在插件内存里，而 DSH 的原则是「会话日志是唯一真值」；10s 心跳与 `/status` 通道都是为补这个缺口存在的。
- **建议**：注册一个 `deskPet` projection，`wire.view` 输出 `{running, completionUnread, pendingSummary}`；Client 只读该 projection 值并做 N 条聚合；Host 聚合后推给浮窗。这样 `/status` POST 与心跳可以删掉。

### D2 · Web 客户端自建 HTTP + SSE 通道，而不是 `host.call` / `ctx.connection`（架构，中）

- **现状**：`/api/desk-pet/*` 是公开前缀路由，自己实现 `requirePost` + `Origin`/`Sec-Fetch-Site` 校验（[src/index.js:497-508](../src/index.js#L497-L508)），Client 用 `EventSource` 收事件、`fetch` 发命令。
- **规范**：Client 侧 Builtin 明确提供 `host.call(method, args)` ——「Package-private JSON RPC from Client to this Package's Host half」；Host 侧有 `connection`（`admit` / `requestRejection` / `createSharedFetchHandler`）统一信任判定。
- **代价**：公开路由 + 自建策略意味着任何**无 Origin 的本机进程**都能调用（`isTrustedRequest` 对无 Origin 返回 true），且要自己维护重连/心跳/降级。
- **建议**：命令类（config/install/float-open/runtime）改走 `host.call`；推送类保留 SSE 仅服务**浮窗**（外部 Electron 进程，本来就不在 Client 通道内）。Web 客户端这一半不需要公开 HTTP。
- 注：这不是「违规」——`webServer.register` 是公开 API，§3.4 文档也允许路由所有者自建策略；只是重复了平台能力。

### D3 · 运行环境弹窗自建调色板，不跟随应用主题（UI，中）— ✅ 已修（2.0）

- **现状**：`.desk-pet-runtime` 定义整套 `--dp-*` 字面色（[client.js:27-56](../src/scene/web/client.js#L27-L56)），深色走 `@media (prefers-color-scheme: dark)`；注释写明「避免继承应用品牌色」。设置页主体使用 `--dsw-alias-*`，弹窗只在少数兜底处引用 alias。
- **规范**：`practices.md`「Style with the theme tokens … literal colors are for artwork only」；`ui-plugin.md`「继承宿主主题用于容器与控件，只有 artwork 可自带颜色」。实时 Theme token 列表含 `--dsw-alias-bg-layer-1` / `bg-overlay` / `border-l1,l2` / `label-primary,secondary` / `brand-primary` / `state-*-primary`，均要求 light+dark。
- **代价**：应用切主题时弹窗不跟随；token 重命名只降级观感，自建色则整块脱节。
- **建议**：把 `--dp-*` 映射到 `--dsw-alias-*`（品牌色仅在需要时用 `brand-primary` 覆盖），删除 `prefers-color-scheme` 分支。

### D4 · 弹窗缺少 Modal 语义与键盘行为（UI，低-中）— ✅ 已修（2.0）

- **现状**：`role="dialog"` + `aria-label`（[client.js:1397](../src/scene/web/client.js#L1397)），但没有 `aria-modal`、没有 Escape 关闭、没有初始焦点与焦点还原；全仓库搜不到 `Escape`/`keydown`。
- **规范**：`practices.md` 要求保留用户依赖的行为，例如「Modal focus and Escape handling」。
- **建议**：补 `aria-modal="true"`、`onKeyDown` Escape → dismiss、打开时 focus 首个按钮、关闭时还原焦点。

### D5 · 可调参数没有进 `Config`（工程约定，低-中）

- **现状**：`RUNTIME_VERSION = '45.2.2'`、npmmirror 下载地址、尺寸/透明度范围、心跳与看门狗间隔全部硬编码在 `src/index.js`；`Config.listConfigs` 显示 `status: absent`。
- **规范**：`practices.md`「可调值放进插件 `Config`，用户改 `cordis.patch.yml`，patch 层可跨升级保留」。
- **代价**：用户无法覆盖下载源/版本；升级会把值写死；插件没有配置入口。
- **建议**：`export const Config`（运行时版本/下载源/范围/间隔），把 `petOn` 之外的用户状态也迁到配置或 `configEditor`。

### D6 · 未复用 `ctx.subprocess`（平台能力，低）

- **现状**：`child_process.spawn` 拉 Electron、`ps` 扫孤儿、`/usr/bin/open -b com.deepseek.dsh` 唤起应用（[src/index.js](../src/index.js)、[src/index.js](../src/index.js)）。
- **规范/平台**：Host 有 `ctx.subprocess`（`spawn` / `resolveExecutable` / `terminalEnvironment`）。
- **说明**：已确认 Host 服务表里**没有** `openInApp` 之类的聚焦服务，所以 `/usr/bin/open` 目前无平台替代，属可接受 workaround；但它是 **macOS-only**，`focus-app` 在 Windows/Linux 是空操作。
- **建议**：核对 `ctx.subprocess.spawn` 是否支持 detached GUI 子进程；支持则替换裸 spawn，不支持则在 `docs/architecture.md` 登记原因；把「唤起应用」的平台差异写进 README。

### D7 · 小项

| 项 | 说明 | 建议 |
|---|---|---|
| Locale 分两次注册 | `register(ns,'en')` + `register(ns,'zh')` 各自 try/catch；typed bilingual 形式会强制双语齐全 | 改用 `register(ns, {en, zh})` 一次注册 |
| 硬依赖 `uiWorkspace`/`layout` | 两个服务都真实存在，但 minimal composition 下缺一会整插件不加载 | 可用 `ctx.get` + 降级（`uiprofile` 无工作区时只保留侧栏入口） |
| `dist/` 未入库 | `files` 声明了 `dist/pet-core.js`，git 安装目录需先 build | 入库或加 `prepare` 构建 |
| `engines` 只有下界 | 0.3 若破坏 Client 契约不会被拦 | 视稳定性加 `<0.3.0` 或 peer 约束 |

---

## 3. 运行时状态（重要）

- **文件层**：profile 在 00:38 写入过 `2.0.0-beta.1`，与**当时**工作区哈希一致；之后工作区又继续改动（`instance.js`、SSE ping 等），当前两者**已不一致**，需重新安装。
- **运行层**：DSH 仍加载 **1.4.3**：
  - `GET /api/desk-pet/stream` → **404**（2.0 才有）；
  - `GET /api/desk-pet/status` 仍返回 `postedAt` 与 `wx/wy/ww/wh`（2.0 已删除）。
- **含义**：替换已安装包需要重启才换 JS generation。当前实时 Slot occupant 证明的是 **1.4.3** 的注册形状；2.0 源码使用同一组 `main{key}` / `sidebar.panellist{id}` / `shell.overlay{id}`，形状一致，但**尚未在运行态验证**。
- **重启后的验收判据**：
  1. `/api/desk-pet/stream` 返回 `200 text/event-stream`；
  2. `/api/desk-pet/status` 不再含 `postedAt`/`wx/wy/ww/wh`；
  3. 侧栏「我的宠物」、主面板、浮窗三处仍能出现。

---

## 4. 建议的处理顺序

1. **发布前**：重启验证（§3）+ 补 D4（弹窗键盘/语义）+ D3（弹窗主题 token）。
2. **下一个迭代**：D1（projection + wire.view）→ 顺带删掉 10s 心跳与 `/status` POST；D2（`host.call`）。
3. **可选**：D5 `Config`、D6 `ctx.subprocess`、D7 小项。

> 如果"适配 DSH 接口规范"只指**能否被正确安装/加载/展示**，答案是**是**。如果指**按 DSH 推荐方式扩展**，当前是"能用但自建了一套"——D1/D2 是主要差距，D3/D4 是 UI 规范差距。

---

## 附 · 复跑

```bash
# 1) 运行代际
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:58792/api/desk-pet/stream   # 2.0: 200 / 1.4.3: 404
curl -s http://127.0.0.1:58792/api/desk-pet/status | grep -o 'postedAt\|"wx"'          # 2.0: 无输出

# 2) 实时契约（在 DSH 会话里）
#    cordis_inspect_query: client Slots.listSubTree root=main / shell.overlay
#    cordis_inspect_query: client Service.listService service=slots|locale|layout|uiWorkspace
#    cordis_inspect_query: host Config.listConfigs name=dsh-desk-pet-plugin
```
