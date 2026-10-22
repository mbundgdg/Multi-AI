# 口袋俄罗斯方块

移动优先的复古掌机风格俄罗斯方块，使用原生 TypeScript、Vite 与 Canvas 2D 实现，用于验证 Orchestrator–Implementer 协同开发架构。

## 安装

```bash
npm install
```

## 运行

```bash
npm run dev
```

默认开发地址由 Vite 输出（通常为 `http://localhost:5173/`）。

## 测试

```bash
npm test -- --run
```

## 构建

```bash
npm run build
npm run preview
```

构建产物位于 `dist/`。

## 操作

| 动作 | 键盘 | 触控 |
| --- | --- | --- |
| 左移 | `ArrowLeft` / `A` | 左移按钮 |
| 右移 | `ArrowRight` / `D` | 右移按钮 |
| 软降 | `ArrowDown` / `S` | 软降按钮（可按住） |
| 顺时针旋转 | `ArrowUp` / `X` / `W` | 旋转按钮 |
| 逆时针旋转 | `Z` | 长按旋转按钮 |
| 硬降 | `Space` | 硬降按钮 |
| 暂存 | `C` / `Shift` | 暂存按钮 |
| 暂停 / 继续 | `P` / `Escape` | 状态栏暂停按钮 |
| 重新开始 | `R` | 结束覆盖层按钮 |

## 功能

- 10×20 可见棋盘（内部 24 行，顶部 4 行隐藏出生区）。
- 7-bag 随机与固定种子复现。
- Next、Hold、幽灵块。
- 软降、硬降、动态重力、等级与计分。
- 暂停、游戏结束、重新开始。
- 手机竖屏与桌面响应式布局，键盘和触控操作。

## 目录结构

```text
.
├── index.html                      页面外壳与可访问 DOM
├── package.json                    脚本与开发依赖
├── tsconfig.json                   严格 TypeScript 配置
├── src/
│   ├── game/                       纯游戏规则与测试
│   │   ├── tetrominoes.ts          方块、随机数与 7-bag
│   │   ├── tetrominoes.test.ts
│   │   ├── engine.ts               棋盘、计分与状态机
│   │   ├── engine.test.ts
│   │   └── README.md
│   ├── render/                     Canvas 渲染
│   │   ├── canvas.ts
│   │   └── README.md
│   ├── input/                      键盘与触控映射
│   │   ├── controls.ts
│   │   ├── controls.test.ts
│   │   └── README.md
│   ├── main.ts                     组合根与动画循环
│   ├── styles.css                  复古掌机视觉
│   └── README.md
├── Docs/                           计划、评审与架构文档
└── README.md
```

## 架构

`src/game/` 不依赖 DOM；`src/render/canvas.ts` 只读取不可变快照；`src/input/controls.ts` 只发出命令；`src/main.ts` 组合三者并管理覆盖层与 `requestAnimationFrame`。
