# 架构（2.0.0）

> 版本：2.0.0（2026-11-11）
> 相关：`docs/baseline.md`、`docs/dsh-conformance.md`

## 0. 2.0 总览

```
DSH profile: ~/.dsh/profiles/<profile>/node_modules/dsh-desk-pet-plugin
├─ index.js                 DSH loader shim → dist/index.js
├─ client.js                DSH client compat copy（build 生成）
├─ dist/index.js            Host bundle（ESM，src/index.js + src/host/*）
├─ dist/client.js           Web slot bundle（__ModuleLoader__ 包装）
├─ dist/pet-core.js         浮窗共享内核（IIFE，src/core/*）
├─ dist/screen/
│  ├─ float.html            浮窗页面（内联 style + renderer + PetCore）
│  ├─ main.cjs              Electron 主进程（窗口/菜单/拖拽/退出）
│  └─ preload.cjs           contextBridge：deskPet.*
├─ locale/{en,zh}.json
└─ cordis.patch.yml         DSH bundle patch
```

依赖方向：

```
src/scene/web ─┐
src/scene/screen ─┼─→ src/core（无反向依赖）
src/index.js ────┘
src/host/* ──────→ src/core
```

`core` 同时被 Host、Web、Electron renderer 复用；`scene` 不反向依赖 Host。

## 1. 分层职责

| 层 | 入口 | 职责 |
|---|---|---|
| DSH 插件入口 | `src/index.js` → `dist/index.js` | `apply`/`inject`、HTTP/SSE、路由、安全、运行时安装、Electron 子进程、设置持久化 |
| Host 模块 | `src/host/` | `sse.js`（hub）、`security.js`（Origin/方法）、`instance.js`（实例 key/目录） |
| Web 客户端 | `src/scene/web/client.js` → `dist/client.js` | 三个 slot（main/sidebar/overlay）、设置页/图鉴、状态桥、弹窗、a11y、SSE ui-events、runtime/claim 生命周期 |
| 浮窗 | `src/scene/screen/` | Electron 主/预加载、气泡/宠物 DOM、拖拽/吸附、右键菜单、`PetPlayer` 帧调度 |
| 共享内核 | `src/core/` | protocol、tokens、types、view-model、atlas、player、layout、image-cache |
| UI/资产 | `src/ui/`、`src/assets/` | 按钮原语、猫图标 |
| 验证 | `test/`、`scripts/validate/` | 114 tests、DOM parity、e2e、探针、bench、视觉检查、指标/债务棘轮 |

## 2. 目录

| 路径 | 职责 |
|---|---|
| `src/core/` | `protocol`（API/MODES）、`tokens`、`view-model`、`atlas`、`player`、`layout`、`image-cache`、`types`、`browser` |
| `src/index.js` | Host 源码；esbuild 打包为 `dist/index.js` |
| `src/host/` | `sse.js`、`security.js`、`instance.js` |
| `src/scene/web/` | `client.js` 入口；`runtime-dialog`、`modal-a11y`、`ui-events`、`pet-lifecycle`、`status-report`；`locale/{en,zh}.js` |
| `src/scene/screen/` | `index.html`、`style.css`、`renderer.js`、`main.cjs`、`preload.cjs`、`globals.d.ts` |
| `src/ui/`、`src/assets/` | `button.js`、`cat.js` |
| `dist/index.js` | Host 产物（ESM） |
| `dist/client.js` | Web 产物（`__ModuleLoader__`） |
| `dist/pet-core.js` | core IIFE，`/float` 内联 |
| `dist/screen/` | 浮窗产物：`float.html`、`main.cjs`、`preload.cjs`、`display.cjs`、`host-watchdog.cjs` |
| `scripts/` | `build`、`dev-install`、`check-live`、`bench`、`visual-check`、`validate/*`；历史探针在 `scripts/archive/` |
| `test/` | core/host/web 单测、DOM parity fixture、快照 |

## 3. 数据流

1. `StatusBridge` 订阅 DSH 会话 store → `core.deriveViewModel()` → mode/kind/task/pending。
2. `useStatusReport` POST `/status`（含 opacity/size）→ Host `liveStatus`。
3. Host SSE `/stream` 广播 `status`；浮窗 `applyStatus()` 更新气泡/外观，`PetPlayer` 按帧时间轴绘制。
4. 浮窗审批/选项/跳转 → `POST /ui-event` → Host 广播 `ui-event` → Web 客户端 `useUiEvents` 分发（answer/openSession/quit）。
5. `/config` 的 `petOn` → `usePetLifecycle` check → claim（`/float-open`）→ Electron 子进程；`float-state` 轮询只做存活检测。
6. 隐藏/退出：`quit-pet` → Host 事件 + 子进程退出；`petOn=false` 持久化到实例目录。

## 4. 传输与安全

| 接口 | 方法 | 说明 |
|---|---|---|
| `/stream` | GET | SSE；压缩中间件跳过 `text/event-stream` |
| `/status` | GET | 只读；投影驱动 mode/task（POST 已删） |
| `/pending` | POST/GET | 只合并 pending（审批/问答） |
| `/config` | POST | `petOn`/外观；Host 持久化 |
| `/install` `/remove` | POST | `{slug}` |
| `/float-open` `/float-close` | POST | 子进程生命周期 |
| `/ui-event` | POST/GET | 浮窗→Host→Web 事件；ack |
| `/runtime/*` | POST | check/install/cancel |
| `/manifest` `/installed` `/pet/*` `/asset` | GET | 只读 |

变更接口：`requirePost` + 同源/非浏览器 `Origin`/`Sec-Fetch-Site` 检查（`src/host/security.js`）；跨源/跨站 403，GET 405。Web server 无全局认证；非 loopback 绑定会告警。

## 5. 持久化

| 数据 | 位置 |
|---|---|
| `petOn` | `~/.petdex/dsh-float/instances/<profile>/settings.json`（Host 独占写） |
| 窗口位置 | 同实例目录 `pos.json`（子进程） |
| pid / userData | 同实例目录（`child.pid`、`userData/`） |
| Electron runtime | `~/.petdex/dsh-float/runtime/`（共享） |
| activeSlug / opacity / size | Web `localStorage`（`desk-pet:*`） |
| 已安装宠物 | `~/.petdex/pets/<slug>/`（`/installed` 按 birthtime 倒序） |

实例 key 优先从安装路径 `profiles/<name>/` 推导，GUI 无 `DSH_PROFILE` 也能隔离；旧 `instances/default` 自动迁移。

## 6. 构建与门禁

```bash
npm run build        # dist/index.js + dist/client.js + dist/pet-core.js + dist/screen/
npm run check        # build → node --check → tsc/checkJs → lint → vitest → metrics → DOM parity → debt
npm run e2e          # 隔离 HOME + 随机端口 + 真实 Electron：20 项
node scripts/check-live.mjs --origin <url>       # 运行中的代际
node scripts/archive/acceptance-probe.mjs --origin <url> # 只读 live 探针：11 项
npm run bench -- --seconds 10                    # 空闲渲染/绘制/p95
node scripts/visual-check.mjs ...                # Electron capturePage 视觉检查
npm pack --dry-run                               # 17 文件（2.0.0）
```

- `check`：**127 tests**（32 个测试文件）；DOM parity 24 组；`check-debt` 棘轮。
- e2e：**31/31**；live probe：11 pass / 0 warn / 0 fail。
- 当前回归看 `docs/regression-2.0.0.md`。

## 7. 对比重构前（1.4.4 基线）

| 维度 | 重构前（1.4.4） | 2.0.0 |
|---|---|---|
| Host | `src/index.js` 1,835 行单文件 | `src/index.js` **904** + `host/{library,http,sse,security,instance}`；产物 51 kB |
| Web 客户端 | `client.js` 1,646 行 | `client/shared/pet-page*` + hooks；产物 89 kB |
| 浮窗 | `FLOAT_HTML` 内联脚本 593 行 | `index.html` + `style.css` + `renderer.js` 681 + `main/preload`；产物 38 kB；core 14 kB |
| 组件 | `PetPage` 541 / `DeskPet` 425 | `PetPage` **7**、`DeskPet` **130**；组件全部 ≤150；`PetPoolCard` 79、`RuntimeDialog` 113 |
| 长函数 | 多个 100–500 行 | 组件达标；hook 仍有 `usePetPageModel` 241 / `usePetCarousel` 165 / `usePetLifecycle` ~148；`route` 68、`installRuntime` 72 |
| 测试 | **0** | **127** tests + 24 DOM parity + e2e 33 |
| 类型/lint | 无 | host + renderer `checkJs`；ESLint 预算门禁 |
| API base | 多处手写 | `core/protocol.ts` 单源（`DESK_PET_API` 下发） |
| 颜色 | 175 处 | 57 hex + 45 rgba（多数为浮窗 artwork）；Web UI 仅 2 个 `#fff` 前景色；页面/弹窗用 `--dsw-alias-*` |
| 空闲请求 | ≈5.7 req/s | ≈0.3 req/s |
| 控制器渲染 | 6.0 次/s（200ms 轮询） | 0.2 次/s（20s 稳态；10s 窗口 0.4） |
| 唤醒/绘制 | 11.3 次/s 唤醒 | ≈6.2–7.2 次/s（动画帧本身）；p95 0.2–0.5 ms |
| 实例隔离 | GUI 退化为 `default` | 路径推导 `instances/desktop`，旧目录迁移 |
| 安全 | 无 Origin 策略 | 跨源/跨站 403、GET 405；e2e/probe 覆盖 |
| 打包 | 手抄文件清单 | `package.json.files` 派生 + `prepack` + `check`；17 文件 |
| 验收 | 24 项全空 | 26 项回归矩阵 + 127 tests + e2e 33 |

## 8. 已知取舍（2.0.0）

| 项 | 原因/状态 |
|---|---|
| Hook 级长函数 | `usePetPageModel`/`usePetCarousel`/`usePetLifecycle` 仍 >60；组件层已 ≤150 |
| `route`/`installRuntime` | Host 内 if 链/安装流程，68/72 行；收益低于改动风险 |
| 浮窗色板 | `style.css` 的纸片/暖光/阴影按 artwork 例外保留；Web 页面/弹窗已 token 化 |
| B4：DSH 对齐 | `sessionProjections`/wire view 已接入；`host.call` 不可用（见评估）；`Config` 未做 |
| 全量 TS | `src/index.js` 与 web 仍是 JS；host + renderer 已 `checkJs` |
| 指标偏软 | `metrics` 只打印、`check-debt` 按个数；`float-dom` 缺 jsdom 时 SKIP |
| 平台 | 仅 macOS/Electron 45.2.2 验证 |

## 9. 颜色/主题例外

浮窗 `style.css` 的气泡渐变、暖光、阴影与高光保留字面色：它是独立 Electron 窗口的 artwork 表面，不参与应用主题。`src/core/tokens.ts` 仍拥有跨场景语义色（圆点/品牌/告警）与 `--dp-*` 映射；Web 页面/弹窗使用 `--dsw-alias-*`。
