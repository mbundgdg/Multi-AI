# Multi-AI

> 可审计、可复现、可验证的多角色 AI 协同开发框架。

Multi-AI 面向本地代码项目，将 AI 开发任务组织为 Orchestrator（编排者）与多个按领域分工的 Implementer（实施者）。

Orchestrator 负责需求澄清、角色拆分、接口冻结、计划制定、Diff 审查和独立验证；Implementer 通过 OpenCode、CodeBuddy 或通用 CLI 执行具体任务。项目内置统一 CLI Supervisor，将子进程输出归一化为 JSONL 事件与原子状态文件，支持审批、补充输入、checkpoint、暂停和异常分类，使多 Agent 协作过程可追踪、可恢复、可审计。
