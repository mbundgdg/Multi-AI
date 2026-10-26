# Multi-AI

> 可审计、可复现、可验证的多角色 AI 协同开发框架。

Multi-AI 面向本地代码项目，将 AI 开发任务组织为 Orchestrator（编排者）与多个按领域分工的 Implementer（实施者）。

Orchestrator 负责需求澄清、角色拆分、接口冻结、计划制定、Diff 审查和独立验证；Implementer 通过 OpenCode、CodeBuddy 或通用 CLI 执行具体任务。项目内置统一 CLI Supervisor，将子进程输出归一化为 JSONL 事件与原子状态文件，支持审批、补充输入、checkpoint、暂停和异常分类，使多 Agent 协作过程可追踪、可恢复、可审计。

## 核心能力

- **统一编排**：由 Orchestrator 负责计划、分工、审查和最终验收。
- **领域实施**：Implementer 按 MCU、后端、前端、算法等领域独立执行任务。
- **CLI 托管**：支持 OpenCode、CodeBuddy 和通用 CLI 子进程。
- **过程留痕**：统一输出原始日志、JSONL 事件和原子状态文件。
- **交互控制**：支持审批、补充输入、checkpoint、暂停和停止。
- **异常处理**：识别审批等待、输入等待、超时、失败、取消和完成状态。
- **工程闭环**：强调独立验证、跨角色集成测试和最终文档归档。

## 项目结构

| 路径 | 说明 |
| --- | --- |
| `02.Multi-AI/` | 统一 CLI Supervisor 源码、测试和用法说明。 |
| `Docs/00.todo.md` | 当前任务计划、验证结果和 Review 记录。 |
| `Docs/01.history.md` | 项目经验、问题根因和可复用教训。 |
| `Docs/02.Multi-AI_cli.md` | 当前 CLI 协作架构基线。 |
| `Docs/02.Multi-AI_paseo.md` | Paseo 管理方式的历史架构记录。 |
| `Docs/README.md` | Docs 目录索引。 |
| `02.Multi_cli.md` | `Docs/02.Multi-AI_cli.md` 的根目录兼容副本。 |
| `02.Multi_paseo.md` | `Docs/02.Multi-AI_paseo.md` 的根目录兼容副本。 |

## 快速验证

```powershell
python -B 02.Multi-AI\test_cli_supervisor.py
python -B -m py_compile 02.Multi-AI\cli_supervisor.py 02.Multi-AI\test_cli_supervisor.py
```

## 使用边界

CLI Supervisor 只负责进程托管、事件归一化和状态留痕，不承担代码实现、Diff 审查、测试验收或项目文档归档。详细协议、provider 命令和 Orchestrator 等待闭环见 [`Docs/02.Multi-AI_cli.md`](Docs/02.Multi-AI_cli.md)，Supervisor 用法见 [`02.Multi-AI/README.md`](02.Multi-AI/README.md)。