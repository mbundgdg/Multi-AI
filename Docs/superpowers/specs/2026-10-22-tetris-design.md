# 俄罗斯方块游戏设计规格

> 日期：2026-10-22  
> 状态：已批准  
> 架构：Orchestrator–Implementer  
> Orchestrator：当前 Codex 会话（DSV4.1 Flash）  
> Implementer：`opencode/deepseek-v4.1-flash-free`

## 1. 目标

构建一个可在现代浏览器中完整游玩的单机俄罗斯方块。项目用于验证 Orchestrator–Implementer 协同架构，因此实现必须具备清晰边界、可自动验证的核心规则、可复现构建和真实视觉验收。

成功标准：

- 手机竖屏优先，同时保留桌面键盘体验。
- 核心玩法形成完整闭环：开始、移动、旋转、软降、硬降、Hold、消行、升级、暂停、结束、重开。
- 核心规则由 Vitest 覆盖，生产构建成功。
- Orchestrator 能独立运行、检查 diff 并截图验证。

## 2. 范围

### 2.1 包含

- 10×20 可见棋盘，内部 24 行（顶部 4 行为隐藏出生区）。
- 标准 7 种方块：I、O、T、S、Z、J、L。
- 7-bag 随机与确定性种子支持。
- Next 1 个、Hold 1 个、幽灵方块。
- 键盘和触控操作。
- 分数、消行数、等级、动态重力速度。
- 暂停、继续、游戏结束、重新开始。
- 复古掌机视觉、移动优先响应式布局、消行闪烁反馈。
- 基础可访问性与 `prefers-reduced-motion` 支持。

### 2.2 不包含

- 音效和背景音乐。
- 粒子特效、复杂过场动画。
- 最高分持久化、排行榜、用户账户。
- 联机、多人对战。
- T-spin、Back-to-Back、Combo、Perfect Clear 等竞技计分规则。
- 自定义键位或手柄支持。

## 3. 视觉与布局

### 3.1 视觉语言

- 米色掌机外壳、深绿 LCD、低饱和绿色方块。
- 字体使用等宽字体栈，不依赖外部网络字体。
- 方块使用不同深浅的绿色区分类型，保持单色 LCD 氛围。
- 页面背景为暖灰米色，掌机主体居中并带有轻微内阴影和实体按键质感。

### 3.2 手机布局（< 768px）

- 页面基准验收尺寸：390×844。
- 棋盘占据主要可用高度，状态栏位于棋盘上方。
- Hold 与 Next 放在棋盘右侧窄栏。
- 触控键固定在游戏区域下方，包含：左移、右移、旋转、软降、Hold、硬降。
- 页面不得出现横向滚动。
- 触控键最小可点击区域为 44×44 CSS 像素。

### 3.3 桌面布局（≥ 768px）

- 页面基准验收尺寸：1440×900。
- 掌机外壳最大宽度约 960px。
- LCD 内棋盘与信息面板横向排列。
- 信息面板显示 Score、Lines、Level、Hold、Next 和键盘提示。
- 键盘提示不得挤占棋盘空间。

### 3.4 覆盖层

- `ready`：显示标题、简短操作说明和“开始游戏”按钮。
- `paused`：显示“已暂停”和“继续游戏”按钮。
- `gameover`：显示最终分数和“重新开始”按钮。
- 覆盖层必须可通过键盘获得焦点，按钮有明确可见的焦点样式。\n- 棋盘 Canvas 必须设置 `tabindex="0"`；开始或重开后焦点移回棋盘，确保键盘操作立即可用。

## 4. 游戏规则

### 4.1 棋盘与坐标

- 棋盘宽 10 列、总高 24 行；仅渲染底部 20 行。
- 顶部 4 行为隐藏出生区。
- 单元格类型为 7 种方块标识或空值。
- 方块使用 4×4 矩阵表示，旋转状态为 0、1、2、3。
- 新方块出生位置为 `x = 3`、`y = 2`，使用当前旋转状态 0。
- O 方块旋转不改变形状和位置。

### 4.2 随机生成

- 使用 7-bag：每袋包含 7 种方块各一次，洗牌后依次消费。
- 默认种子为 `Date.now()`，允许调用方传入固定数字种子以复现序列。
- 随机数生成器使用可重复的 Mulberry32 算法。
- 当队列不足时自动补充新袋。
- 快照只暴露 `next` 的第一个方块，不暴露完整队列。

### 4.3 移动、旋转与锁定

- 左右移动每次 1 列。
- 顺时针与逆时针旋转各旋转 90 度。
- 旋转使用简化墙踢偏移顺序：`(0,0)`、`(-1,0)`、`(1,0)`、`(-2,0)`、`(2,0)`、`(0,-1)`。
- 碰撞条件：任一实心格越出左右边界、超过底部，或与已固定方块重叠。
- 方块无法继续下移时立即锁定，不实现锁延迟。
- 锁定后若任一方块格位于隐藏区（`y < 4`），立即游戏结束。
- 新方块生成后若与固定方块碰撞，立即游戏结束。

### 4.4 下落与 Hold

- 重力按累计时间推进。
- 每次重力步进若可下移则下移 1 行，否则锁定。
- 软降每次下移 1 行并加 1 分；无法下移时立即锁定。
- 硬降移动至幽灵位置，每移动 1 行加 2 分，然后立即锁定。
- Hold 在每次方块锁定前只能使用一次。
- Hold 为空时保存当前方块并生成下一个；已有 Hold 时交换当前方块与 Hold。
- 新 Hold 方块从出生位置以旋转状态 0 生成。

### 4.5 消行与计分

- 同时消除 1、2、3、4 行的基础分分别为 100、300、500、800。
- 消行得分 = 基础分 × 当前等级。
- 软降和硬降得分不受等级影响。
- 被消除行上方的行整体下移，顶部补空行。

### 4.6 等级与速度

- 等级 = `min(15, floor(lines / 10) + 1)`。
- 重力间隔 = `max(100, 800 - (level - 1) * 70)` 毫秒。
- 等级在消行后立即更新，并影响下一次重力步进。

### 4.7 状态机

状态集合：

- `ready`：初始状态，方块已生成，但重力暂停。
- `playing`：正常游戏。
- `paused`：重力暂停，游戏命令被忽略。
- `gameover`：停止所有游戏命令，只允许重新开始。

状态转换：

- `start()`：`ready → playing`。
- `togglePause()`：`playing ↔ paused`。
- 锁定失败或出生碰撞：`playing → gameover`。
- `restart()`：任意状态重置分数、行数、等级、棋盘、Hold 和队列，并进入 `playing`。

暂停状态下 `move`、`rotate`、`softDrop`、`hardDrop`、`hold` 和 `tick` 均不得改变游戏状态。

## 5. 输入映射

| 动作 | 键盘 | 触控 |
| --- | --- | --- |
| 左移 | ArrowLeft / A | 左移按钮 |
| 右移 | ArrowRight / D | 右移按钮 |
| 软降 | ArrowDown / S | 软降按钮，按住可连续触发 |
| 顺时针旋转 | ArrowUp / X / W | 旋转按钮 |
| 逆时针旋转 | Z | 无独立触控键，可由长按旋转键触发 |
| 硬降 | Space（`KeyboardEvent.key` 为 `' '` 或 `'Space'`） | 硬降按钮 |
| Hold | C / Shift | Hold 按钮 |
| 暂停/继续 | P / Escape | 状态栏暂停按钮 |
| 重开 | R | 覆盖层重新开始按钮 |

浏览器默认滚动行为必须在游戏按键触发时被阻止。输入在覆盖层按钮获得焦点时不得误触游戏动作。

## 6. 技术架构

### 6.1 技术栈

- TypeScript 5.x。
- Vite 7.x。
- Vitest 3.x。
- 原生 DOM 与 Canvas 2D，不使用 UI 框架。

### 6.2 文件结构

```text
.
├── index.html
├── package.json
├── tsconfig.json
├── src/
│   ├── game/
│   │   ├── tetrominoes.ts
│   │   ├── engine.ts
│   │   └── engine.test.ts
│   ├── render/
│   │   └── canvas.ts
│   ├── input/
│   │   └── controls.ts
│   ├── main.ts
│   ├── styles.css
│   └── README.md
├── Docs/
│   └── ...
└── README.md
```

`src` 下每个子目录必须提供 README，说明目录职责、文件职责和主要导出函数。

### 6.3 模块边界

- `tetrominoes.ts` 只负责方块定义、矩阵旋转、7-bag 和随机数生成，不依赖 DOM。
- `engine.ts` 只负责纯游戏状态与规则，不依赖 DOM、Canvas 或计时器。
- `canvas.ts` 只读取 `GameSnapshot` 绘制棋盘与预览，不修改游戏状态。
- `controls.ts` 将键盘与指针事件转换为命令回调，不直接修改引擎。
- `main.ts` 组合引擎、渲染器和输入，并管理 `requestAnimationFrame` 循环及 DOM 覆盖层。
- `styles.css` 只负责视觉与响应式布局。

### 6.4 冻结公共接口

```ts
export type TetrominoType = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L';
export type Cell = TetrominoType | null;
export type GameStatus = 'ready' | 'playing' | 'paused' | 'gameover';

export interface ActivePiece {
  type: TetrominoType;
  rotation: 0 | 1 | 2 | 3;
  x: number;
  y: number;
}

export interface GameSnapshot {
  board: readonly (readonly Cell[])[];
  active: Readonly<ActivePiece> | null;
  ghostY: number | null;
  next: TetrominoType;
  hold: TetrominoType | null;
  canHold: boolean;
  score: number;
  lines: number;
  level: number;
  status: GameStatus;
}

export interface TetrisGame {
  snapshot(): GameSnapshot;
  start(): void;
  tick(deltaMs: number): void;
  move(dx: -1 | 1): void;
  rotate(direction: 1 | -1): void;
  softDrop(): void;
  hardDrop(): void;
  hold(): void;
  togglePause(): void;
  restart(): void;
}

export function createGame(seed?: number): TetrisGame;
```

测试可额外使用以下纯函数导出：

```ts
export function createBoard(): Cell[][];
export function collides(board: readonly (readonly Cell[])[], piece: ActivePiece): boolean;
export function clearLines(board: Cell[][]): { board: Cell[][]; cleared: number };
export function calculateLineScore(cleared: number, level: number): number;
export function levelForLines(lines: number): number;
export function gravityInterval(level: number): number;
```

### 6.5 渲染约定

- 棋盘 Canvas 使用逻辑尺寸 300×600，并按 `devicePixelRatio` 缩放。
- 每个可见格为 30×30 CSS 像素。
- 活动方块、固定方块和幽灵块均绘制为带内边框的 LCD 色块。
- 幽灵块使用半透明轮廓，不覆盖固定方块。
- Hold 与 Next 使用独立小 Canvas，各 80×80。
- DOM 状态栏每帧或状态变化后同步文本，不通过 Canvas 绘制文字。

## 7. 性能约束

- 核心循环使用单个 `requestAnimationFrame`。
- 引擎操作保持 O(棋盘格数)，单帧绘制最多 10×20 个可见格。
- 不在每帧创建新的输入监听器、Canvas 或 DOM 节点。
- 快照生成允许复制 24×10 棋盘，但不得引入外部依赖或递归遍历。
- 页面在 390×844 移动端视口下保持可交互，不得因布局抖动改变触控键位置。

## 8. 测试策略

### 8.1 单元测试

必须覆盖：

- 7-bag 每袋 7 种方块各一次。
- 固定种子生成相同序列。
- 左右边界、底部和固定方块碰撞。
- 顺时针与逆时针旋转。
- 墙踢偏移顺序。
- 单行、双行、三行、四行消除及上方行下移。
- 消行分数与等级倍数。
- 等级每 10 行提升，最高 15。
- 重力间隔按等级下降，最低 100ms。
- Hold 首次保存、交换、每次锁定前只能用一次。
- 软降与硬降分数。
- 暂停期间状态不变。
- 游戏结束与重开重置。

### 8.2 集成与构建验证

- `npm test -- --run` 全部通过。
- `npm run build` 成功生成 `dist/`。
- 使用本地开发服务器进行浏览器验证。
- 在 390×844 和 1440×900 视口检查布局、覆盖层、键盘和触控操作。

## 9. 验收标准

只有以下条件全部满足才算完成：

1. `npm install`、`npm test -- --run`、`npm run build` 可复现执行。
2. 核心规则测试覆盖第 8.1 节列出的行为。
3. 手机竖屏与桌面布局无横向溢出，触控键可用。
4. 键盘可完成移动、旋转、软降、硬降、Hold、暂停和重开。
5. 开始、暂停、游戏结束覆盖层行为正确。
6. Orchestrator 完成真实 diff 审查、独立测试和截图验证。
7. `Docs/00.todo.md` 与 `Docs/01.history.md` 已按角色更新。
8. 辅助脚本和临时文件已清理。

## 10. 交付契约

Implementer 必须提供：

- 修改文件完整清单。
- 接口变化说明。
- 可直接复现的测试与构建命令。
- 测试结果和关键输出。
- `dist/` 构建产物路径。
- 产物 SHA-256。
- 未完成项和需 Orchestrator 处理的事项。
- 按架构要求更新 `Docs/00.todo.md` 的 `[Implementer]` 章节和 `Docs/01.history.md` 的 `[Implementer]` 章节。
