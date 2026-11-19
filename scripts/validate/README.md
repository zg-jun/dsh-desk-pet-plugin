# 验证脚本（B0）

这些脚本不改源码，只读取 `dist/index.js` / `dist/client.js`（构建产物），用于建立与比对行为基线。

## 一键门禁

```bash
npm run check
```

依次执行：build（index/client/dist/screen）→ 语法 → TypeScript 类型检查 → Vitest → 指标 → DOM parity（含 CSS 解析）→ 重复度棘轮。
`check:dom` 在 jsdom 缺失时打印 `SKIP` 并返回 0；但只要样式表解析失败就直接失败。
重复度棘轮（`check:debt`）只允许计数下降，`node scripts/check-debt.mjs --update` 才可重新基线。

## 静态指标

```bash
node scripts/validate/metrics.mjs dist/index.js dist/client.js
```

输出行数、函数数、最长函数、近似复杂度、颜色/定时器/文本重复。只依赖 Node。

## 会话语义（parity）

由 `test/core/view-model.test.ts` 承担：读 `test/fixtures/sessions/{cases,expected}.json`，
逐字段对比 `deriveViewModel` 与 v1.4.4 golden。旧的 `semantics.mjs` 已随客户端接入内核退役。

## 浮窗 DOM（jsdom）

```bash
node scripts/validate/float-dom.mjs
```

- 读取构建产物 `dist/screen/float.html`，注入 `window.deskPet` / `fetch` / canvas 桩。
- 输出 `test/fixtures/status/expected.json`（en/zh × 状态 × 外观）。
- **前置条件**：FLOAT_HTML 的 `<style>` 必须能被 jsdom 解析。B0 已修复两处孤立 `50% {}` 块；脚本现在会在解析失败时直接报错。
- **限制**：jsdom 无布局（`offsetWidth=0`），bounds 必须用 Electron 探针。
- 依赖：`jsdom@24` 已作为 devDependency 安装（Node 20 不支持 jsdom 31）；`npm install` 后即可运行。

## 浮窗布局/截图（Electron）

```bash
npm run build   # dist/pet-core.js（prepare/float-dom 会把它注入页面）
node scripts/archive/electron/prepare.mjs
PET_ELECTRON="$HOME/.petdex/dsh-float/runtime/Electron.app/Contents/MacOS/Electron"
env -u ELECTRON_RUN_AS_NODE "$PET_ELECTRON" .tmp/electron-eval \
  --no-sandbox --disable-gpu --user-data-dir=/tmp/dsh-pet-eval-userdata \
  > .tmp/layout.json
```

- 产物目录：`.tmp/electron-eval/`（`index.html` 由当前 FLOAT_HTML 生成，`main.js` 为探针）。
- 输出：每个场景的 `pet/bubble` 矩形、`offsetWidth/Height`、计算透明度、`fitContent` 请求；`shot-*.png` 截图。
- 必须加 `--no-sandbox --disable-gpu`：在受限沙箱环境中 Electron 自身的沙箱无法初始化；`--user-data-dir` 避免写 `~/Library`。
- `ELECTRON_RUN_AS_NODE=1` 必须去掉，否则 Electron 会以 Node 模式启动（`--version` 也会报 Node 版本）。
- 截图前注入 `transition: none`，否则测量会落在过渡中间态。

## 端到端宿主（隔离 HOME）

```bash
npm run e2e
```

在 `.tmp/e2e` 复制一份插件、把 `killStaleChild`/`killOrphanChildren` 置为 no-op，
用随机端口 + 临时 `HOME` 启动真实 `dist/index.js`，再真实拉起 Electron 浮窗，验证：
SSE 初始帧/广播、跨源 POST 403、同源 POST、`petOn` 落盘、浮窗页/SSE 连接、子进程存活、
`float-close` 后置回关闭、关闭后 `float-open` 被拒。
需要本机 Electron 运行时，否则打印 `SKIP` 并退出 0。会短暂出现一个临时宠物窗口。

## 已知限制

| 项 | 原因 |
|---|---|
| 真实 CPU/内存 | `top`/`ps` 在沙箱中被拒绝；需在 B0 增加 dev-only 采样 |
| 客户端 React 页面 | 尚无 `__ModuleLoader__` 测试宿主 |
| 生产窗口 resize 时序 | 探针直接 `setBounds`，真实链路是 IPC + `setBounds` |
