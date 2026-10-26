# Multi-AI
多角色 AI 协同开发框架：Orchestrator 统一编排与验收，CLI Implementer 按领域实施，并提供 OpenCode、CodeBuddy 等 CLI 的统一监督、事件留痕和异常处理。
## 核心能力

- **统一编排**：由 Orchestrator 负责计划、分工、审查和最终验收。
- **领域实施**：Implementer 按 MCU、后端、前端、算法等领域独立执行任务。
- **CLI 托管**：支持 OpenCode、CodeBuddy 和通用 CLI 子进程。
- **过程留痕**：统一输出原始日志、JSONL 事件和原子状态文件。
- **交互控制**：支持审批、补充输入、checkpoint、暂停和停止。
- **异常处理**：识别审批等待、输入等待、超时、失败、取消和完成状态。
- **工程闭环**：强调独立验证、跨角色集成测试和最终文档归档。
