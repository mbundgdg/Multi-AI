# src 源码目录

浏览器端俄罗斯方块的 TypeScript 源码。按职责分为 `game`、`render`、`input` 三个子目录，`main.ts` 是组合根。

## 文件

| 文件 | 作用 |
| --- | --- |
| `main.ts` | 组合引擎、渲染器与输入，管理 `requestAnimationFrame` 循环、状态栏和覆盖层。 |
| `styles.css` | 复古掌机视觉、移动优先响应式布局、触控键与覆盖层样式。 |

## 子目录

| 目录 | 职责 |
| --- | --- |
| `game/` | 纯游戏规则：方块定义、7-bag、碰撞、消行、计分与状态机。不依赖 DOM。 |
| `render/` | 将只读 `GameSnapshot` 绘制到 Canvas，不修改游戏状态。 |
| `input/` | 键盘与指针事件到游戏命令的映射，不直接修改引擎。 |

## 数据流

`input` → `main` 命令分发 → `game` 状态机 → `GameSnapshot` → `render` Canvas 与 DOM 状态栏。

每个子目录都提供独立 README，说明其中文件与导出。
