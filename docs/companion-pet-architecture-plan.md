# 伴生型桌面宠物架构方案（2.0+，长期方向）

> 前提：**宠物必须伴随 DSH；DSH 退出，宠物退出。** 宠物可以显示在 DSH 窗口之外（常驻桌面、跨应用置顶），
> 但不独立于 DSH 生命周期。
> 结论：**当前“DSH Host + Electron sidecar”方向正确；长期优化不是拆独立 App，而是把状态/生命周期/传输的边界做对。**


## 0. 一句话结论

```
宠物是 DSH 的伴生卫星：
  DSH 启动 → Host 拉起唯一宠物窗口
  DSH 运行 → 宠物可离开 DSH 窗口置顶
  DSH 退出/崩溃 → 宠物在 ~2s 内退出，无孤儿
```

因此**不要** petd 独立守护进程、登录自启、Tauri 双壳、adapter 平台；这些都与前提冲突。

## 1. 当前架构哪里对、哪里不对

**对：**

- Host 在 DSH 进程树内，生命周期天然绑定；
- Electron 子进程提供独立透明置顶窗口；
- core 三端复用，renderer 可移植；
- Host 单点负责路由/安全/子进程/持久化。

**不对（长期债）：**

- 会话状态由 Web client 派生并 `POST /status`，Host relay（D1）；
- 浮窗 claim/hide 生命周期在 client effect 里，产生 #14 类竞态；
- Web/浮窗走公开 HTTP/SSE；无 token、body 无上限、无 CSP；
- 运行时 zip 从第三方镜像下载，无 SHA256/签名；
- Host 路由无单测、无 CI；Host/Client 仍有大文件。

## 2. 目标架构（伴生型）

```
DSH Host（唯一所有者）
├─ PetService
│  ├─ state machine: off/starting/on/stopping/failed
│  ├─ session projection（DSH sessionProjections/wire.view）
│  ├─ child supervisor（spawn/kill/restart/parent-death）
│  ├─ Config / prefs / runtime / security
│  └─ IPC server（UDS/named pipe 或 stdio JSON-RPC）
│
├─ Web client（薄）
│  └─ 设置页/侧栏：host.call 读写；不再派生状态/不再 claim
│
└─ 浮窗 child（Electron，dumb renderer）
   ├─ 窗口/气泡/拖拽/菜单
   ├─ 只收 status、只发 command
   └─ 父进程消失 → 2s 内 app.quit
```

唯一状态所有者：**Host**。浮窗只做渲染；Web 只做设置。

## 3. 生命周期（核心）

### 3.1 Host 状态机

```
Off ── enable ──→ Starting ──spawn ok──→ On
 ↑                    │ fail             │ disable
 │                    ▼                  ▼
 └──── Failed ←── retry             Stopping ──→ Off
```

- `desiredOn` 是唯一意图；spawn/kill 只在 Host；
- 隐藏 ≠ Off：隐藏只隐藏窗口，不销毁进程；
- DSH 退出：Host `ctx.effect` dispose → `Stopping` → `kill` → 等待 → SIGKILL fallback；
- DSH 崩溃：子进程心跳/父 PID 看门狗 → `app.quit`（目标 ≤2s）；
- 子进程崩溃：Host 收到 exit → `Failed`/有限重试；用户可见 chip/错误，不自动无限重启。

### 3.2 子进程看门狗

当前是“Host 45s 收不到子进程 ping 就判定子进程挂掉”。伴生型需要反过来：

- Host 每 500ms 向子进程发 `ping`；
- 子进程 2s 收不到 `ping` → 自行 `app.quit`；
- 子进程同时检查父 PID；父不存在立即退出；
- Host 正常 dispose 时主动 `kill`，不依赖看门狗；
- 目标：DSH 正常退出/崩溃，**都不留孤儿**。

### 3.3 多 profile

- 一个 DSH profile = 一个 Host = 一个宠物；
- 每个 Host 使用 `instances/<profile>/` 的 settings/pos；
- 两个 profile 的 Host 不共享子进程，不互杀；
- DSH 单窗口内多会话仍是一只宠物，由状态聚合决定显示。

## 4. 传输

### 4.1 Web ↔ Host

- 用 DSH `host.call` / 投影，不再 `POST /status`；
- 设置页只读写 Config/偏好；不承载宠物状态机；
- 删除 10s 心跳与 `/status` POST。

### 4.2 Host ↔ 浮窗

- **优先 IPC**：UDS（macOS/Linux）/ named pipe（Windows）上的 JSON-RPC；
- 或 `ctx.subprocess`/`utilityProcess` 提供的 stdio 通道（若 DSH 暴露）；
- 不监听公开 TCP；不暴露 `/float*`、`/stream`、`/status` 给浮窗；
- 每条连接做 peer uid/ACL + 每实例 token；schema/长度上限；
- 消息：
  - Host→child：`status`（mode/task/pending/opacity/size）、`ping`、`config`
  - child→Host：`ready`、`answer`、`open-session`、`hide`、`quit`
- 若短期保留 SSE 作为过渡，必须 loopback + token + CSP，并在 Phase 3 删除。

### 4.3 命令回源

浮窗的 answer/open-session 只发给 Host；Host 通过 DSH `host.call`/session API 执行。
浮窗不知道 DSH 会话细节，避免第二套状态。

## 5. 扩展性设计

### 5.1 原则

- **扩展发生在伴生边界内**：只扩展 DSH 内部的状态源、气泡/动作、宠物包；不做外部 adapter、不做独立 petd。
- **数据驱动，不执行第三方代码**：扩展包只提供声明/资源，不能带可执行脚本。
- **契约先行**：Host↔child 协议、`PetSource`、`BubbleSpec`、宠物包、配置都有版本号与兼容规则。
- **单一所有者不变**：Host 仍拥有状态/生命周期；扩展只提供数据或受控动作，不能自己 spawn/kill。
- **只留 seam，不预建框架**：有第二个实现才抽象；现在把接口/降级路径定义好，不引入插件运行时。

### 5.2 扩展点

| 扩展点 | 现在 | 未来示例 | 契约 |
|---|---|---|---|
| 状态源 | DSH 当前会话 | 子代理、审批队列、构建/长任务 | `PetSource`（Host 内注册） |
| 气泡/交互 | approval / question / other | 表单、富卡片、多步骤确认 | `Pending` 判别联合 + `BubbleSpec` |
| 动作 | answer / open-session / hide | 运行命令、打开设置页、复制摘要 | `PetAction` + capability allowlist |
| 宠物包 | 图集/动画 | 主题包、动作包、声音包 | `pet-pack@1`（数据-only） |
| 设置 | 全局偏好 | 按状态源/按宠物包的设置段 | `ConfigSchema` + `configVersion` |
| DSH API | projections / host.call | DSH 版本升级、窗口/utility API | capability 探测 + 版本矩阵 |
| 平台 | macOS | Windows/Linux 的 UDS/pipe、窗口行为 | `ctx.subprocess` + 平台适配层 |
| 协议 | Host↔child v1 | v2 字段/命令 | JSON-RPC `protocolVersion` + capabilities |

### 5.3 核心接口（示意）

```ts
interface PetSource {
  id: string;
  priority: number;
  read(): SourceView | null;                 // 纯投影，不产生副作用
  subscribe?(onChange: () => void): () => void;
  answer?(requestId: string, answer: unknown): Promise<void>;
  open?(target: { sessionId?: string; kind: 'session' | 'settings' }): Promise<void>;
}

type Pending =
  | { kind: 'approval'; requestId: string; summary: string; options: string[] }
  | { kind: 'question'; requestId: string; questionId?: string; summary: string; options: Option[]; multi?: boolean }
  | { kind: 'other'; requestId: string; summary: string };

type PetAction =
  | { kind: 'answer'; requestId: string; value: unknown }
  | { kind: 'open-session'; sessionId: string }
  | { kind: 'open-settings' }
  | { kind: 'command'; command: string; payload?: unknown }; // 仅 allowlist
```

- `PetSource` 由 Host 注册：内置会话源、未来的 subagent/任务源；
- 优先级/TTL 由 Host 聚合，扩展不能绕过；
- `Pending`/`PetAction` 用判别联合；未知 `kind` 降级为 `other`，不崩；
- 动作执行前校验 capability/来源/过期，**不接受任意 shell/URL**。

### 5.4 宠物包与配置兼容

- `pet-pack@1` manifest：`id/version/displayName/atlas/animations/theme?/checksum`；禁止可执行文件；
- 安装时校验：slug、manifest schema、atlas 尺寸/帧数、checksum、包版本；
- 未知字段忽略、未知动作降级、缺动画回退默认；破坏性变更升 `packVersion`；
- `configVersion` + 迁移函数；写入原子化；旧版本可读；
- 第三方包只有数据权限，失败不影响主宠物。

### 5.5 代码边界（仍是单包）

```
src/host/sources/          # PetSource 注册与聚合
src/host/actions/          # allowlist/命令路由
src/host/child/            # supervisor/协议
src/core/protocol/         # 版本、schema、类型
src/core/packs/            # 包校验/迁移
src/scene/screen/bubbles/  # 气泡注册表（未知降级）
```

- 不拆 monorepo；扩展点是包内模块边界；
- 只有出现第二个独立消费方时才考虑拆包；
- 第三方扩展不通过 npm 动态加载，不引入运行时代码执行。

### 5.6 扩展性测试

- 未知 `BubbleSpec` → `other` 降级，不崩；
- 多状态源 → 优先级/pending 优先/TTL 正确；
- 非法宠物包 → 拒绝安装，默认宠物仍可用；
- 协议 v1/v2 → 未知字段忽略、缺失字段默认、版本不兼容拒绝；
- DSH 能力探测 → 缺 projection/host.call 时明确报错/降级；
- 动作越权/过期 → 拒绝且不执行。

### 5.7 扩展性边界

- **不做**外部 adapter/独立 petd（与 DSH 退出即退出冲突）；
- **不做**任意插件代码/动态 npm 执行；
- **不做**无界队列/轮询；状态源必须 push + TTL；
- **不做**绕过 Host 的浮窗直连会话；
- **不预建**插件市场/多租户；先服务 DSH 内部扩展。

## 6. 状态与投影

- Host 用 DSH `sessionProjections` + `wire.view` 派生 `PetView`；
- Web/浮窗都不再自己 derive；
- 多客户端/多窗口不再“最后 POST 赢”；
- Host 保存 `liveStatus` 仍可保留，但它是**投影结果**，不是客户端输入；
- pending 由 Host 持有；浮窗命令带 `requestId`，Host 校验来源/过期；
- DSH 退出时 Host 状态随进程销毁；无需 TTL 清理（伴生型）。

## 7. 配置与持久化

| 数据 | 所有者/位置 |
|---|---|
| `petOn` / 默认外观 / 主题 | Host Config + `instances/<profile>/settings.json` |
| activePet / opacity / size | Host Config（Web 设置页通过 host.call 写） |
| 窗口位置 | 子进程写 `instances/<profile>/pos.json` |
| 已安装宠物 | `~/.petdex/pets/`（Host `/installed`） |
| Electron runtime | 共享/ pinned；Host 管理 |
| Web 旧 localStorage | 迁移后删除 |

浮窗不再拥有业务偏好；localStorage 只保留纯 UI 状态（如果还有）。

## 8. 运行时

- DSH 公开面提供 `ctx.subprocess`（spawn/resolveExecutable），用于替换裸 spawn；是否支持 detached GUI 子进程需按 D6 核对；
- 当前 DSH 未见 BrowserWindow/utilityProcess 窗口 API，因此 Electron child 是正确的边界；
- 若未来 DSH 暴露 `BrowserWindow`/`utilityProcess`，把 child 折叠为 Host 内窗口/utility process；**这是唯一更优的终态**；
- 在 child 方案下：
  - 固定 Electron 版本；
  - 下载 zip 必须 **SHA256/签名校验**；
  - 镜像只作为下载源，失败回退官方；
  - 不再把 121MB 运行时当作“可选缓存”；失败要显式错误卡片。

## 9. 仓库/构建（保持单包）

伴生型不需要 monorepo：

```
src/
├─ host/            # PetService/state machine/supervisor/runtime/security/ipc
├─ core/            # protocol/view-model/atlas/player/layout/tokens
├─ scene/web/       # 薄设置页（host.call）
├─ scene/screen/    # dumb child（main/preload/renderer）
├─ ui/ assets/
index.js client.js dist/pet-core.js screen/*
test/ scripts/
```

- 仍单包、单插件、单构建；
- 产物入库，`prepack` + `check` + CI；
- 不拆 petd/adapter/monorepo。

## 10. 分阶段

### Phase 0 · 契约与状态机（2–3 天）

> 进度（2026-11-10）：**父死看门狗 + Host 状态机已实现**（`screen/host-watchdog.cjs`、`src/host/pet-state.js`，6 单测；
> `/float-state.state`；e2e 19/19）。**Phase 1 已完成**：client claim/openFloat/float-state 已删除，Host 的 `applyPetOn` 是唯一 spawn/kill；
> `usePetLifecycle` 仅保留 runtime check/install/cancel。IPC 契约、Phase 2 projection 待做。

- Host `PetStateMachine` + supervisor 单测；
- Host↔child JSON-RPC schema/版本；
- `PetSource`/`Pending`/`PetAction`/`BubbleSpec`/`pet-pack@1` 的 schema 与版本策略（只定义 seam，不实现插件运行时）；
- 父死看门狗（2s）与正常 dispose kill；
- 目标：DSH 退出/崩溃，child 2s 内退出。

### Phase 1 · 生命周期上移（3–5 天）

> 进度（2026-11-10）：已完成；`npm run check` 92 tests，e2e 19/19。

- 删除 client `usePetLifecycle`/claim/hide 逻辑；Web 只发 intent；
- Host 统一 spawn/kill/hide/show；
- 修 #14 类竞态（不是再打补丁）；
- 增加 e2e：正常退出、SIGKILL Host、hide/show、多 profile。

### Phase 2 · 投影与薄客户端（1 周）

> **Spike 发现（2026-11-10）**：`sessionProjections.register({ key, stateVersion, stateSchema, init, apply, wire: { viewSchema, view } })`
> 确认可用，`projection.stateOf(session)` 可读；但 DSH 的 pending approval 存在 **Client `uiSession.sessionStatus`**
> （`pendingInteraction`），Host 当前拿不到。因此“Host 完全拥有 status”会丢失审批/问答。
> 建议把 Phase 2 拆成：Host projection 负责 running/task/completion；Client 只推 pending（变更时推送，非 10s 心跳）；
> 或等待 DSH 暴露 Host pending API。
**进度（2026-11-10）**：`deskPetStatus` projection + `onChanged` 驱动 `liveStatus`；Client 只推 `/pending`，全量 status/心跳已删；127 tests / e2e 33/33；2.0.0 已发布；**真机 2026-11-11**：projection task 正确、`POST /status` 405、`state=on`；/pending 有 fallback。

**补充契约（2026-11-10 Inspect 实测）**：
- Host `ctx.sessionProjections` 有 `onChanged(listener(session,key,value,seq))` / `onEventChanged`，
  `ProjectionHandle` 有 `stateOf` / `readerFor` / `dispose`；所以 Host 可以订阅投影更新，而不只是 `stateOf`。
- Client 通过 `ctx.sessions.binding(id).session.projections.faceOf(key)` 读 wire value；
  `SessionSnapshot` 已有 `running` / `subagent`，但 `pendingInteraction` 仍在 `uiSession.sessionStatus`。
- 结论：Phase 2A 可做——Host projection 负责 running/task，Client 读投影 + 只在 pending 变化时推送。


- Host `sessionProjections`/`wire.view`；
- 内置 `PetSource` 注册表 + 优先级/TTL；气泡 `Pending` 判别联合与未知降级；
- 删除 `/status` POST 与 10s 心跳；
- Web 设置页走 `host.call`；
- 浮窗 status 来自 Host 投影（IPC）。

### Phase 3 · IPC 与安全（1 周）

> 进度（2026-11-10）：已完成 status Host schema + 64KB body 限流 + 运行时 zip SHA256 校验（99 tests，e2e 20/20）；
> token/IPC 待做。

- Host↔child 改 UDS/named pipe/stdio；删除 `/float*`/`/stream`/`/status` 公共面；
- 每实例 token/peer 校验；body/schema/长度上限；CSP；
- `PetAction` allowlist：answer/open-session/open-settings，拒绝任意命令/URL；
- 运行时 SHA256；
- 删除 45s 子进程 liveness，改为 2s 父看门狗。

### Phase 4 · 收尾（3–5 天）

> 进度（2026-11-10）：CI `check` + `pack` 已加（Ubuntu/macOS）；e2e 本地。

- 路由拆分 + 单测；CI（macOS runner）；
- 扩展性回归：未知气泡降级、非法宠物包拒绝、多 source 优先级、协议 v1/v2；
- 24 项回归 + 退出/崩溃/多 profile；
- 2.0.0 发布。

总计约 **4–5 周**，比独立 petd 小一个量级。

## 11. 验收（在 24 项之外）

- DSH 正常退出 → child ≤2s 退出，无进程残留；
- `kill -9` DSH Host → child ≤2s 退出；
- DSH 最小化/失焦/切 Space → 宠物仍可见并置顶；
- DSH 重启 → 新 child，旧 child 不残留，无重复宠物；
- 双 profile → 各自 child，互不杀；
- hide → 窗口隐藏但进程在；show 立即恢复；
- 审批命令只由 Host 执行，浮窗不直接碰会话；
- 未知 `BubbleSpec` → `other` 降级，不崩；非法宠物包被拒绝且默认宠物可用；
- 多 source：pending 优先、TTL 过期回 idle、协议不兼容拒绝；
- 无公开 `/status`/`/stream` 宠物通道（Phase 3 后）。

## 12. 与评审点对应

| 评审点 | 伴生型落点 |
|---|---|
| 运行时 zip 无校验 | 保留 Electron child；SHA256/签名；或 DSH 窗口 API 后折叠 |
| 生命周期在 client effect | Host 状态机 + supervisor；client 只发 intent |
| HTTP 无 token/body 限制 | Host↔child UDS/named pipe；token/schema/上限 |
| D1 client 派生状态 | Host projection；Web/浮窗只消费 |
| D2 自建 HTTP/SSE | Web host.call；浮窗 IPC |
| D5 无 Config | Host Config + DSH Config 映射 |
| Host 路由无单测/CI | route 单测 + CI |
| Client hooks 过大 | 删除 client 生命周期；设置页极薄 |
| 浮窗主题 | Host Config 下发 |
| 产物/CI | 单包构建 + CI |

## 13. 明确不做

- 不做 petd 独立进程/登录自启/Tauri 双壳（与 DSH 退出即退出冲突）；
- 不拆 monorepo（伴生型仍单插件）；
- 不让 Web client 拥有状态/生命周期；
- 不保留公开 HTTP/SSE 作为宠物主通道；
- 不在 DSH 退出后保留宠物；
- 不在 Host 已有窗口 API 的情况下继续维护 child（未来可折叠）。

## 14. 最终形态

```
DSH 启动 → Host 创建唯一 PetService
        → child 透明置顶窗口（可离开 DSH 窗口）
        → Host projection 推 status；浮窗只渲染
        → 用户在浮窗批准 → Host 调 DSH 会话 API
DSH 退出/崩溃 → Host 杀 child / child 看门狗自退（≤2s）
```

**宠物是 DSH 的伴生窗口，不是独立 App；Host 是唯一所有者，child 只做渲染。**
