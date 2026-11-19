# 扩展性 seam（2.0.0）

这些是**数据/接口 seam**，不是可执行插件运行时。所有版本字段在进入产品路径前校验；未知值必须降级而不是崩溃。

## PetSource

`src/host/sources.js`

```js
const registry = createSourceRegistry();
registry.register({
  id: 'session',
  priority: 100,
  ttlMs: 60_000,
  read(now) { return { mode: 'working', task: '...', sessionId, updatedAt: now }; },
});
registry.snapshot(); // 最高优先级、未过期、未抛错的源
```

- `version` 目前为 1；不匹配的 source 拒绝注册。
- 同一 id 重复注册抛错；dispose 只移除自己的 source。
- 源抛错/返回 null/过期时，回退到下一个优先级。

## BubbleSpec

`src/core/bubbles.js`

- `toBubbleSpec(pending)` → `{ schemaVersion, kind, summary, actions, ... }`。
- 未知 `kind` 降级为 `other`；action 只保留 label/value/recommended，不携带可执行内容。

## pet-pack@1

`src/core/pet-pack.js`

- 仅接受 `schemaVersion: "pet-pack@1"`、id/version/displayName/atlas/animations。
- 拒绝 `main/script/entry/exec/command/bin` 等可执行字段。
- 未接入安装器；安装器接入前必须先 parse 再落盘。

## 版本策略

- 每个 seam 独立版本号；未知版本拒绝，未知枚举降级。
- 新增字段保持可选；删除/改语义必须升 major。
- 未来 `subagent/task/build` 通过 PetSource 注册，浮窗协议不改。
