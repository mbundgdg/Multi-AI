# game 游戏规则目录

纯 TypeScript 游戏规则，不依赖 DOM、Canvas 或计时器，可独立单元测试。

## 文件

| 文件 | 作用 |
| --- | --- |
| `tetrominoes.ts` | 方块类型、4×4 矩阵、颜色、Mulberry32 随机数、7-bag 与矩阵旋转。 |
| `tetrominoes.test.ts` | 7-bag 完整性与确定性、顺/逆时针旋转测试。 |
| `engine.ts` | 棋盘常量与辅助函数、碰撞、消行、计分、等级、重力间隔和游戏状态机。 |
| `engine.test.ts` | 棋盘辅助函数与完整状态机行为的测试。 |

## `tetrominoes.ts` 导出

| 导出 | 说明 |
| --- | --- |
| `TETROMINO_TYPES` | `['I','O','T','S','Z','J','L']` 只读元组。 |
| `TetrominoType` | 由元组推导的方块类型。 |
| `TetrominoMatrix` | `number[][]` 矩阵类型。 |
| `TETROMINOES` | 每种方块出生状态的 4×4 矩阵。 |
| `TETROMINO_COLORS` | 每种方块的低饱和 LCD 绿色。 |
| `createSeededRandom(seed)` | Mulberry32 可复现随机数生成器。 |
| `createBag(random)` | Fisher–Yates 洗牌生成一袋 7 种方块各一次。 |
| `rotateMatrix(matrix, direction)` | 返回旋转 90° 的新方阵。 |
| `getRotatedMatrix(type, rotation)` | 返回指定旋转次数后的新矩阵。 |

## `engine.ts` 导出

| 导出 | 说明 |
| --- | --- |
| `BOARD_WIDTH` / `BOARD_HEIGHT` / `HIDDEN_ROWS` | 10 列、24 行、顶部 4 行隐藏。 |
| `Cell` / `GameStatus` / `ActivePiece` / `GameSnapshot` / `TetrisGame` | 冻结公共类型。 |
| `createBoard()` | 生成 24×10 空棋盘。 |
| `collides(board, piece)` | 判断方块是否越界或与固定格重叠。 |
| `clearLines(board)` | 消除完整行并返回新棋盘与消行数。 |
| `calculateLineScore(cleared, level)` | 1/2/3/4 行基础分乘以等级。 |
| `levelForLines(lines)` | 每 10 行升 1 级，最高 15 级。 |
| `gravityInterval(level)` | 按等级计算重力间隔，最低 100ms。 |
| `dropDistance(board, piece)` | 返回当前方块可下移的最大行数。 |
| `tryRotate(board, piece, direction)` | 按墙踢顺序返回旋转后的新方块或 `null`。 |
| `createGame(seed?)` | 创建独立游戏实例，种子可复现序列。 |
