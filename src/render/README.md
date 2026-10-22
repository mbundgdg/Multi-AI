# render 渲染目录

只读取 `GameSnapshot` 并绘制到 Canvas，不修改游戏状态，也不查询 DOM 之外的全局状态。

## 文件

| 文件 | 作用 |
| --- | --- |
| `canvas.ts` | 创建棋盘、暂存和预览 Canvas 渲染器。 |

## 导出

| 导出 | 说明 |
| --- | --- |
| `TetrisRenderer` | 具有 `render(snapshot)` 方法的渲染器接口。 |
| `createRenderer(boardCanvas, holdCanvas, nextCanvas)` | 配置 `devicePixelRatio` 后返回渲染器。 |

## 渲染约定

- 棋盘逻辑尺寸 300×600，每格 30×30 CSS 像素，仅绘制第 4–23 行。
- 固定块与活动块使用深色外框和浅色内高光。
- 幽灵块使用半透明轮廓，先绘制幽灵再绘制活动块。
- 暂存与下一个方块各使用 80×80 小 Canvas 居中绘制。
- DOM 引用与 2D 上下文在创建时缓存，不在每帧重新查询。
