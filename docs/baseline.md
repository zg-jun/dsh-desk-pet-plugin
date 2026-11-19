# 基线（B0 实测）

> 采集时间：2026-11-09
> 对象：工作区代码（`index.js` / `client.js`），运行中宿主为同一份 JS（字节一致）
> 工具：`scripts/validate/*`（静态扫描、语义特征化、jsdom DOM、Electron 布局/截图）

---

## 1. 代码规模

| 单元 | 行数 | 函数数 | hex | rgba | setInterval | setTimeout | rAF |
|---|---|---|---|---|---|---|---|
| `index.js`（宿主） | 1835 | 46 | 55 | 35 | 6 | 4 | 1 |
| `index.js#FLOAT_HTML`（浮窗内联脚本） | 593 | 26 | 0 | 1 | 5 | 4 | 1 |
| `src/scene/web/client.js`（Web 源码） | 1646 | 65 | 52 | 33 | 5 | 4 | 8 |
| **合计（不含内联重复）** | **3481** | **111** | **107** | **68** | **11** | **8** | **9** |

颜色字面量合计 **175** 处（hex 107 + rgba 68；不含 `src/core/tokens.ts` 的受控色值，内联脚本不重复计）。

> B1 起浮窗的几何/时间轴/表现映射/圆点色改由 `src/core` 提供，浮窗内联脚本的 hex 已降为 0。
> `client.js` 是由 `src/scene/web/client.js` + `src/core` 构建的产物，规模按源码统计。
> 内联脚本属于 `index.js` 的一部分，合计里不重复计入。

## 2. 最长函数（近似圈复杂度）

| 函数 | 文件:行 | 行数 | 复杂度 |
|---|---|---|---|
| `PetPage` | client.js:417 | **542** | 120 |
| `DeskPet` | client.js:987 | **426** | 140 |
| `apply`（客户端插件注册） | client.js:1417 | 227 | 13 |
| `renderActBubble` | FLOAT_HTML:380 | 121 | 17 |
| `route` | index.js:1782 | 64 | 41 |
| `installRuntime` | index.js:361 | 71 | 17 |
| `render` | FLOAT_HTML:230 | 67 | 23 |
| `openFloatWindow` | index.js:1544 | 56 | 18 |

> 复杂度为扫描器近似值（`if/for/while/case/catch/&&/||/?.`），仅用于趋势对比；正式门禁使用 ESLint 的口径。

## 3. 定时器与请求

| 来源 | 频率 | req/s 或 wakeups/s |
|---|---|---|
| 浮窗 `poll('/status')` | 350ms | 2.86 req/s |
| 客户端 `poll('/ui-event')` | 350ms | 2.86 req/s |
| 客户端心跳 `postStatus` | 10s | 0.10 req/s |
| 浮窗 `render` 巡检 | 200ms | 5.0 次/s |
| 设置页 `runtime` 轮询 | 3s | 0.33 req/s |
| 客户端 `float-state` | 5s | 0.20 req/s |
| **HTTP 合计** | | **≈5.7 req/s** |
| **唤醒合计（含渲染巡检）** | | **≈11.3 次/s** |

> 2.0：两条 350ms 轮询由一条 SSE 取代（`/stream`，15s ping + 15s 注释心跳）；空闲 HTTP **≈0.3 req/s**（10s 心跳 + 5s float-state），浮窗绘制改为按帧时长的定时调度（≈3–10 次/s），不再每帧 rAF；`setInterval(render, 200)` 仍在。

## 4. 真实素材几何（`~/.petdex/pets`，5 只）

| slug | 尺寸 | 8 列单元格 | 行数（整除推导） | 宽高比 |
|---|---|---|---|---|
| huidou | 1536×1872 | 192×208 | 9 | 1.0833 |
| line-dog | 1536×1872 | 192×208 | 9 | 1.0833 |
| lulu-capybara-2 | 1536×1872 | 192×208 | 9 | 1.0833 |
| lumei | 1536×1872 | 192×208 | 9 | 1.0833 |
| shinchan-4 | 1536×1872 | 192×208 | 9 | 1.0833 |

- `208/192 = 1.0833`，与浮窗常量 `RATIO = 208/192` 完全一致。
- `pet.json` 只有 `id/displayName/description/spritesheetPath`，**没有** rows/animations 声明。
- 结论：三处几何实现（浮窗硬编码、预览推导、缩略图推导）在当前素材上**结果一致**；行 5 与行 8 未被任何动画使用。

## 5. 命中测试

| 指标 | 实测 |
|---|---|
| `getImageData(1×1)` | **0.0015 ms/次**（5000 次 7.7ms，软件 canvas，DPR 1） |
| 1/4 分辨率 alpha 掩码查表 | 0.00000002 s/次（20ns，约 75× 于 getImageData） |
| 非透明像素占比（lumei） | **36.6%** |
| 每格 alpha 包围盒 | 约 130×198（单元格 192×208） |
| 单宠物 1/4 掩码内存 | **179,712 B**（9×8 格，需 LRU 限制） |

## 6. 布局与视觉（Electron 45.2.2，300×175 窗口）

| 场景 | fit 请求 | 缩放后气泡位置 | 结论 |
|---|---|---|---|
| working | 300×181 | y=14.4 | 完整 |
| waiting-approval | 300×219 | y=14.4 | 完整 |
| waiting-question | 300×322 | y=13.5 | 完整 |
| done | 300×175 | — | 不增高 |
| **waiting-approval @ scale 1.3（B3 后）** | **390×285** | **y=19（高 115）** | **完整，不再裁切** |

- 缩放 1.3 时：宠物视觉 124.8×135.2，气泡视觉高 115.2，但 `fitContent` 用未缩放的 `offsetHeight`（89）计算，窗口只增到 219；需要约 **276**。
- 透明度 0.6：修复前 `#pet` 与 `.bubble` 各 0.6，气泡有效 **0.36**；B0 后只保留 `#pet` 一层，有效 **0.6**（线性）。
- 截图：`docs/validation/layout-question-fit.png`（正常）、`docs/validation/layout-scale-1.3-clipped.png`（裁切）。

> B0 修复后复测：`fit` 为 219/322，圆点已恢复（status `::before` content `''`、7px；act 头部内联 dot）。
> B3 布局单一来源后：scale 1.3 的 `fit` 为 390×285，气泡 y=19，不再裁切；截图见 `docs/validation/layout-scale-1.3-fit.png`。resize 前的一帧仍可能短暂裁切（宿主 IPC 异步）。

## 7. CSS 完整性

| 环境 | 修复前 | 修复后（B0） |
|---|---|---|
| jsdom 24 | **整个 stylesheet 解析失败**（2 次，en/zh） | 解析成功，0 错误 |
| Chromium（Electron） | 57 条规则；`.bubble.alert` `animation-name = none` | 58 条规则；`animation-name = alertPulse` |
| `.bubble.has-dot::before` | `content: none`（**状态圆点完全未渲染**） | `content: ''`、7×7px（圆点恢复） |
| 影响 | 圆点与呼吸光效同时失效；jsdom 不可用 | 两者恢复；jsdom 可作为 DOM 基线 |

## 8. 运行态与契约

| 项 | 结果 |
|---|---|
| 宿主/端口 | `127.0.0.1:56777`，`/api/desk-pet/*` 可无凭证访问 |
| 安装版本 | profile 声明 1.4.1，`node_modules` 内 `package.json` 为 **1.4.3**，但 `index.js`/`client.js` 与工作区 **字节一致**（1.4.4） |
| `/float` | 与工作区 `FLOAT_HTML` **sha256 一致**，运行中就是本仓库代码 |
| `/status` 形状 | 与 `handleStatus` 一致（mode/kind/task/sessionId/pending/opacity/size/petOn） |
| 变更类接口 | 仍为 GET；`Origin: https://evil.example` 请求成功；宿主文档明确 **无服务级认证与 Origin 策略** |
| SSE | `dsh-host-webserver` 文档：handler 拥有完整响应；压缩显式跳过 `text/event-stream`；`res.flushHeaders()` 可用 |

## 9. 特征化语料

| 语料 | 数量 | 位置 |
|---|---|---|
| 会话语义（`readStatus`/`describePending`） | 16 例 | `test/fixtures/sessions/expected.json` |
| 浮窗 DOM（en/zh × 11 状态 + 外观） | 24 组 | `test/fixtures/status/expected.json` |
| 布局 | 6 场景 × 前后 | 本文 §6；复跑 `scripts/validate/electron/`（`prepare.mjs` + `layout.cjs`） |

---

## 10. 渲染基准（2.0 B2）

工具：`npm run bench -- --seconds 20`。隐藏窗口 + `backgroundThrottling:false`，用 SVG 假图集（1536×1872）跑真实 drawImage 路径，计数仅在 `?bench=1` 时挂载。

| 场景 | renders/s | draws/s | p95 帧 |
|---|---|---|---|
| B2 前（`setInterval(render, 200)`） | 6.00 | 6.40 | 0.40 ms |
| B2 后（事件驱动，20s） | **0.20** | **5.95** | **0.50 ms** |
| 2.0 最终（B3 后，10s） | 0.40 | 6.20 | 0.50 ms |

- 控制器渲染 6.0 → 0.2/s：20s 内只剩 4 次启动事件（初始状态/换装完成），**稳态为 0**；
- draws 是 idle 动画本身（6 帧 / 1.1s ≈ 5.5/s），已无可去除的轮询；总唤醒 ≈6.2/s，基线 11.3/s；
- p95 0.5 ms，低于 2 ms 目标；
- B3 重构后 10s 复跑 4 次渲染（0.4/s）是窗口内启动事件，20s 窗口仍是 4 次（0.2/s），稳态为 0；
- `getImageData` 1.5 µs，**alpha mask 的收益低于测量阈值**：本版保留 `willReadFrequently`，不引入命中测试回归风险，等 CPU/功耗证据再改。
