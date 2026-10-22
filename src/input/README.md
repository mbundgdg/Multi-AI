# input 输入目录

把键盘和指针事件转换成游戏命令并回调，不直接修改引擎状态。

## 文件

| 文件 | 作用 |
| --- | --- |
| `controls.ts` | 键盘映射、键盘监听、触控按钮和长按重复、清理函数。 |
| `controls.test.ts` | `keyToAction` 纯映射测试。 |

## 导出

| 导出 | 说明 |
| --- | --- |
| `GameAction` | `left`、`right`、`soft-drop`、`rotate-cw`、`rotate-ccw`、`hard-drop`、`hold`、`pause`、`restart`。 |
| `keyToAction(key)` | 将 `KeyboardEvent.key` 转成动作，未知键返回 `null`。 |
| `bindControls({ touchRoot, pauseButton, dispatch })` | 绑定键盘、触控和暂停按钮，返回移除全部监听与计时器的清理函数。 |

## 生命周期

- 键盘事件在按钮、输入框或文本域获得焦点时被忽略。
- 已识别游戏键调用 `preventDefault()`，避免页面滚动。
- 左移、右移、软降按住时先立即触发一次，250ms 后按 110ms 间隔重复。
- `pointerup`、`pointercancel`、`pointerleave` 停止重复。
