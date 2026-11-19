# 扩展指南

## 新增一个动画

1. `src/core/atlas.ts` 的 `ANIMATIONS` 增加 `{ row, frames: [col, durationMs] }`。
2. 若动作预览要出现：`src/scene/web/client.js` 的 `ACTIONS` 增加 `{ key, anim }`，并补 `pgAct_<key>` 文案（`en` / `zh` 两份）。
3. 测试：`test/core/atlas.test.ts` 增加行号/帧数断言；`test/core/player.test.ts` 增加时间轴用例。
4. 不需要改浮窗绘制代码：`PetPlayer` 会按新表播放。

## 新增一种气泡

当前仍是「DOM + CSS + 映射」三步（注册表未落地）：

1. `FLOAT_HTML` 增加气泡节点（与 `.bubble` 同构），并在 `render()` 的显隐列表中登记。
2. `src/core/view-model.ts` 的 `presentationFor` 给出新的 `bubble` 取值；浮窗 `render()` 用它决定显示。
3. `fitWindowToContent` 的 `bubbles` 数组加入新节点（否则窗口不会为它增高）。
4. CSS 放在浮窗 `<style>`，颜色从 `src/core/tokens.ts` 取。
5. 断言：`test/fixtures/status/expected.json` 增加一组快照；`test/core/view-model.test.ts` 增加映射用例。

## 新增一个平台（Windows/Linux 实测）

1. `src/host`/`index.js`：`runtimeBinPath`、`electronCandidates`、`isStandaloneElectron`、`killOrphanChildren` 的平台分支。
2. `CHILD_MAIN`：解压命令、`focus-app` 的平台实现、窗口吸附行为。
3. `scripts/validate/electron/layout.cjs` 在该平台跑一遍布局/截图。
4. 在 `docs/architecture.md` 的平台表登记。

## 新增一个可复用 UI 元素

1. 先查 `src/ui/` 是否已有同义原语（`button.js`）。
2. 有 → 扩展 variant/size；无 → 新建并在 `docs/architecture.md` 登记。
3. 禁止在场景内复制一份样式；`npm run check` 的重复度棘轮会拦住新增重复。

## 新增文案

1. `src/scene/web/client.js` 的 `ctx.locale.register` en/zh 两份必须同时加。
2. 浮窗内联文案仍硬编码 zh/en（`STATUS_TEXT` / `KIND_TEXT` / `ACT_WORD`）；改文案要两处一起改。
3. `npm run check` 会校验 en/zh key 对齐。

## 修改协议

1. `src/core/protocol.ts` 加常量/类型守卫，并补测试。
2. Host 路由与客户端/浮窗同步改；SSE 事件名以 `protocol.ts` 为准。
3. 不要恢复已删除的事件（`activate-pet` / `set-pet` / `set-pet-on`）；`test/core/protocol.test.ts` 会失败。
