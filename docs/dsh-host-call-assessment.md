# DSH host.call 可行性评估（2.0.0）

结论：**当前 Cordis client module 不能直接使用 DSH `host.call`**。

## 证据

- DSH Client Inspect `Builtin` 列出 `host.call(method, args)`，但描述限定为
  “Package-private JSON RPC from Client to this Package's Host half”，即 **dynamic browser half**。
- Client `Service` 目录只有 layout/locale/sessions/slots/theme/timer/uiWorkspace/workspaces，没有 `host`。
- 本插件的 `client.js` 是 Cordis client module（`plugin = { inject, apply }`），不是 dynamic package；
  `ctx` 没有 host 服务，bundle 也未注入 host 参数。
- 因此 `/pending`、`/config`、安装仍走 same-origin HTTP，并由 per-instance token 保护。

## 后续迁移条件

若 DSH 给 Cordis client module 暴露 `ctx.host`（或允许把插件转成 dynamic package 而不失去 slot 能力），
再把以下路径迁到 `host.call`：

1. `/pending` → `host.call('pending', ...)`
2. `/config` → `host.call('config', ...)`
3. install/remove → `host.call(...)`

迁移前保持 token + 同源策略，不新增公开 mutation。
