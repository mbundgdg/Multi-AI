# 02.Multi-AI Supervisor

本目录存放 Orchestrator 用于托管本地 CLI Implementer 的统一 Supervisor。实现不绑定具体业务工程，可原样复制到其它项目。

## 文件

| 文件 | 作用 |
| --- | --- |
| `cli_supervisor.py` | 托管 OpenCode、CodeBuddy 或 generic CLI 子进程；输出 `ecu.cli-event.v1` JSONL 事件，原子维护 `ecu.cli-status.v1` 状态文件，并支持审批、输入、checkpoint、暂停和异常分类。 |
| `test_cli_supervisor.py` | 30 项标准库单元/进程集成测试；覆盖 provider 适配、真实入口解析、UTF-8、审批、输入、checkpoint、心跳超时、失败、取消和暂停。 |

## 快速验证

```powershell
python -B 02.Multi-AI\test_cli_supervisor.py
python -B -m py_compile 02.Multi-AI\cli_supervisor.py 02.Multi-AI\test_cli_supervisor.py
```

## 使用边界

Supervisor 只负责进程托管、事件归一化和状态留痕，不承担代码实现、diff 审查、测试验收或项目文档归档。详细事件协议、provider 命令和 Orchestrator 等待闭环见 `Docs/02.Multi-AI_cli.md` 第 2.5 节。

```powershell
python -B 02.Multi-AI\cli_supervisor.py run `
  --provider opencode `
  --cwd C:\Users\82398\Desktop\ECU_Prj `
  --session-id ses_example `
  --event-log .git\codex-runs\run.events.jsonl `
  --status-file .git\codex-runs\run.status.json `
  --raw-log .git\codex-runs\run.raw.log `
  --control-stdin `
  -- run --session ses_example "执行冻结任务"
```

控制 stdin 使用单行 JSON：`{"action":"approve"}`、`{"action":"input","text":"继续"}`、`{"action":"checkpoint","message":"测试通过"}`、`{"action":"pause"}`。