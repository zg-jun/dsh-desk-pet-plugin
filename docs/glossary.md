# 术语表

代码与文档共用一套词。新增同义词前先在这里登记，否则视为可读性缺陷。

| 词 | 含义 | 不要混用 |
|---|---|---|
| `mode` | 会话语义：`idle / working / waiting / done` | 不要用 state/status/phase 表示它 |
| `phase` | 运行环境阶段：`checking / missing / ready / downloading …` | 不要用它表示会话状态 |
| `anim` | 精灵动画：`idle / running / waving / jumping / waiting` | 不要用 kind 表示动画 |
| `bubble` | 气泡外观：`status / alert / greet / act` | 不要用 kind 表示气泡 |
| `pending` | 待处理交互（审批/提问），含 `kind: approval/question/other` | 不要用 action 表示 |
| `scene` | 渲染场景：`screen`（浮窗）/ `web`（设置页） | 不要用 platform 表示 |
| `vm` | `PetViewModel`，由 `deriveViewModel()` 产出 | 不要用 state 表示 |
| `atlas` | 精灵图集及其几何元数据 | 不要用 sprite 表示几何 |
| `frame` | 图集中的一格；`FrameSpec` 是列号 + 时长 | 不要用 cell 表示帧 |
| `tier` | 缩放档位：small / medium / large | 不要用 size 表示档位（size 是数值） |
| `source` | 运行环境来源：`env / bundled / detected / downloaded` | 不要用 origin 表示 |

## 命名规则

- 函数用动词短语：`deriveViewModel`、`frameRect`、`jumpIdOf`。
- 布尔用 `is/has/can`：`isMain`、`hasPending`。
- 事件用 `onX`；协议常量用 `SCREAMING_SNAKE`。
- 禁止 `data`、`obj`、`ctx2d`、`btxtAEl` 这类名字。
