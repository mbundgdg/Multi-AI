"""CLI Supervisor 的单元与进程集成测试。

测试只使用 Python 标准库和临时目录，不调用真实模型，避免测试消耗额度或
受 OpenCode/CodeBuddy 登录状态影响。
"""

from __future__ import annotations

import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import cli_supervisor as sup


class CommandAdapterTests(unittest.TestCase):
    def test_opencode_adds_json_output(self) -> None:
        command = sup.prepare_command(
            "opencode",
            ["run", "--session", "ses_test", "任务"],
        )
        self.assertEqual(command[:3], ["opencode", "run", "--format"])
        self.assertEqual(command[3], "json")
        self.assertIn("ses_test", command)

    def test_opencode_keeps_existing_json_output(self) -> None:
        command = sup.prepare_command(
            "opencode",
            ["run", "--format", "json", "任务"],
        )
        self.assertEqual(command.count("--format"), 1)

    def test_codebuddy_adds_headless_stream_json(self) -> None:
        command = sup.prepare_command(
            "codebuddy",
            ["--resume", "session-1", "任务"],
        )
        self.assertIn("--print", command)
        self.assertIn("stream-json", command)
        self.assertEqual(command[command.index("--output-format") + 1], "stream-json")

    def test_provider_binary_environment_override(self) -> None:
        with tempfile.NamedTemporaryFile() as binary:
            with mock.patch.dict(os.environ, {"ECU_OPENCODE_BIN": binary.name}):
                command = sup.resolve_provider_command(
                    "opencode",
                    ["opencode", "run"],
                )
            self.assertEqual(command[0], binary.name)
            self.assertEqual(command[1:], ["run"])
    def test_generic_requires_executable(self) -> None:
        with self.assertRaises(ValueError):
            sup.prepare_command("generic", [])


class EventClassifierTests(unittest.TestCase):
    def test_plain_progress(self) -> None:
        event = sup.classify_line("正在编译 workspace")
        self.assertEqual(event.kind, "progress")
        self.assertIn("正在编译", event.message)

    def test_structured_approval(self) -> None:
        event = sup.classify_line(
            json.dumps(
                {
                    "type": "permission.asked",
                    "message": "需要批准 Bash 命令",
                    "sessionId": "ses_demo",
                },
                ensure_ascii=False,
            )
        )
        self.assertEqual(event.kind, "approval_required")
        self.assertEqual(event.session_id, "ses_demo")
        self.assertIn("批准", event.message)

    def test_tool_result_text_is_not_waiting_input(self) -> None:
        line = json.dumps(
            {
                "type": "user",
                "message": {
                    "role": "user",
                    "content": [
                        {
                            "type": "tool_result",
                            "content": [{"type": "text", "text": "waiting for user input: select a parameter"}],
                        }
                    ],
                },
            },
            ensure_ascii=False,
        )
        event = sup.classify_line(line)
        self.assertEqual(event.kind, "progress")

    def test_structured_is_error_is_actionable(self) -> None:
        event = sup.classify_line(
            json.dumps(
                {
                    "type": "result",
                    "subtype": "error",
                    "is_error": True,
                    "result": "工具执行失败",
                },
                ensure_ascii=False,
            )
        )
        self.assertEqual(event.kind, "error")
        self.assertTrue(event.actionable)
    def test_structured_input_wait(self) -> None:
        event = sup.classify_line(
            json.dumps({"event": "question", "message": "请选择目标目录"})
        )
        self.assertEqual(event.kind, "waiting_input")

    def test_structured_error_is_actionable(self) -> None:
        event = sup.classify_line(
            json.dumps({"type": "error", "message": "provider failed"})
        )
        self.assertEqual(event.kind, "error")
        self.assertTrue(event.actionable)

    def test_checkpoint_pattern(self) -> None:
        event = sup.classify_line("git commit 完成 abc1234")
        self.assertEqual(event.kind, "checkpoint")

    def test_cancel_pattern(self) -> None:
        event = sup.classify_line("Session interrupted: user canceled")
        self.assertEqual(event.kind, "canceled")

    def test_help_option_text_is_not_waiting_input(self) -> None:
        line = "--model <model> Model for the current session. Please provide the model ID."
        event = sup.classify_line(line)
        self.assertEqual(event.kind, "progress")
    def test_utf8_round_trip(self) -> None:
        event = sup.classify_line("中文事件：权限审批后继续")
        self.assertEqual(event.kind, "approval_required")
        self.assertIn("权限审批", event.message)


class ControlCommandTests(unittest.TestCase):
    def test_approve_forwards_y(self) -> None:
        command = sup.parse_control_command('{"action":"approve"}')
        self.assertEqual(command.action, "send")
        self.assertEqual(command.text, "y\n")

    def test_deny_forwards_n(self) -> None:
        command = sup.parse_control_command('{"action":"deny"}')
        self.assertEqual(command.action, "send")
        self.assertEqual(command.text, "n\n")

    def test_text_input(self) -> None:
        command = sup.parse_control_command(
            json.dumps({"action": "input", "text": "继续执行"}, ensure_ascii=False)
        )
        self.assertEqual(command.action, "send")
        self.assertEqual(command.text, "继续执行\n")

    def test_pause_action(self) -> None:
        command = sup.parse_control_command('{"action":"pause"}')
        self.assertEqual(command.action, "pause")


class EventSinkStatusTests(unittest.TestCase):
    def make_config(self, root: Path) -> sup.SupervisorConfig:
        return sup.SupervisorConfig(
            provider="generic",
            cwd=root,
            session_id="ses_test",
            event_log=root / "events.jsonl",
            status_file=root / "status.json",
            raw_log=root / "raw.log",
            heartbeat_seconds=1.0,
            heartbeat_timeout_seconds=10.0,
            emit_progress=False,
            emit_heartbeat=False,
            control_stdin=False,
            command=[sys.executable, "-c", "pass"],
        )

    def test_status_replace_retries_transient_permission_error(self) -> None:
        real_replace = sup.os.replace
        calls = 0

        def flaky_replace(src: str, dst: str) -> None:
            nonlocal calls
            calls += 1
            if calls == 1:
                raise PermissionError(13, "temporarily busy", dst)
            real_replace(src, dst)

        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            config = self.make_config(root)
            sink = sup.EventSink(config)
            with mock.patch.object(sup.os, "replace", side_effect=flaky_replace):
                sink.emit("progress", "测试状态重试", state="running")
            self.assertEqual(calls, 2)
            status = json.loads(config.status_file.read_text(encoding="utf-8"))
            self.assertEqual(status["state"], "running")

    def test_status_write_falls_back_without_crashing(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            config = self.make_config(root)
            sink = sup.EventSink(config)
            with mock.patch.object(
                sup.os,
                "replace",
                side_effect=PermissionError(13, "persistently busy"),
            ):
                sink.emit("progress", "测试直写降级", state="running")
            status = json.loads(config.status_file.read_text(encoding="utf-8"))
            self.assertEqual(status["state"], "running")
            self.assertEqual(status["last_message"], "测试直写降级")

class ProcessIntegrationTests(unittest.TestCase):
    def make_config(self, child_code: str, root: Path) -> sup.SupervisorConfig:
        return sup.SupervisorConfig(
            provider="generic",
            cwd=root,
            session_id="ses_test",
            event_log=root / "events.jsonl",
            status_file=root / "status.json",
            raw_log=root / "raw.log",
            heartbeat_seconds=0.05,
            heartbeat_timeout_seconds=10.0,
            emit_progress=False,
            emit_heartbeat=False,
            control_stdin=False,
            command=[sys.executable, "-u", "-c", child_code],
        )

    def read_events(self, path: Path) -> list[dict]:
        return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines()]

    def test_provider_resolution_failure_is_reported(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            config = self.make_config("print('never')", root)
            with mock.patch.object(
                sup,
                "resolve_provider_command",
                side_effect=FileNotFoundError("missing provider"),
            ):
                exit_code = sup.run_supervisor(config)
            self.assertEqual(exit_code, 127)
            events = self.read_events(config.event_log)
            self.assertEqual(events[-1]["kind"], "failed")
            self.assertIn("missing provider", events[-1]["message"])
    def test_successful_child_emits_approval_and_completed(self) -> None:
        code = (
            "import json\n"
            "print(json.dumps({'type':'permission.asked','message':'需要批准'}, ensure_ascii=False), flush=True)\n"
            "print('普通进度', flush=True)\n"
        )
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            config = self.make_config(code, root)
            exit_code = sup.run_supervisor(config)
            self.assertEqual(exit_code, 0)
            events = self.read_events(config.event_log)
            kinds = [event["kind"] for event in events]
            self.assertEqual(kinds[0], "started")
            self.assertIn("approval_required", kinds)
            self.assertEqual(kinds[-1], "completed")
            status = json.loads(config.status_file.read_text(encoding="utf-8"))
            self.assertEqual(status["state"], "completed")
            self.assertEqual(status["exit_code"], 0)
            self.assertIn("需要批准", config.raw_log.read_text(encoding="utf-8"))
            self.assertEqual(status["schema"], sup.STATUS_SCHEMA)

    def test_nonzero_child_emits_failed(self) -> None:
        code = "import sys\nprint('构建失败', flush=True)\nsys.exit(7)\n"
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            config = self.make_config(code, root)
            exit_code = sup.run_supervisor(config)
            self.assertEqual(exit_code, 7)
            events = self.read_events(config.event_log)
            self.assertEqual(events[-1]["kind"], "failed")
            status = json.loads(config.status_file.read_text(encoding="utf-8"))
            self.assertEqual(status["state"], "failed")
            self.assertEqual(status["exit_code"], 7)

    def test_structured_error_then_zero_exit_is_failure(self) -> None:
        code = (
            "print('{\"type\":\"error\",\"error\":\"No conversation found\"}', flush=True)\n"
            "raise SystemExit(0)\n"
        )
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            config = self.make_config(code, root)
            exit_code = sup.run_supervisor(config)
            self.assertEqual(exit_code, 1)
            events = self.read_events(config.event_log)
            self.assertEqual(events[-2]["kind"], "error")
            self.assertEqual(events[-1]["kind"], "failed")
            self.assertEqual(events[-1]["data"]["process_exit_code"], 0)
            status = json.loads(config.status_file.read_text(encoding="utf-8"))
            self.assertEqual(status["state"], "failed")
            self.assertEqual(status["exit_code"], 1)
    def test_signal_like_exit_emits_canceled(self) -> None:
        code = "import sys\nprint('canceled by user', flush=True)\nsys.exit(130)\n"
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            config = self.make_config(code, root)
            exit_code = sup.run_supervisor(config)
            self.assertEqual(exit_code, 130)
            events = self.read_events(config.event_log)
            self.assertEqual(events[-1]["kind"], "canceled")

    def test_jsonl_is_utf8_without_replacement(self) -> None:
        code = "print('中文进度', flush=True)\n"
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            config = self.make_config(code, root)
            sup.run_supervisor(config)
            decoded = config.event_log.read_text(encoding="utf-8")
            self.assertNotIn("\ufffd", decoded)
            self.assertIn("started", decoded)


    def test_heartbeat_timeout_then_completion(self) -> None:
        code = "import time\nprint('start', flush=True)\ntime.sleep(0.25)\nprint('done', flush=True)\n"
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            config = self.make_config(code, root)
            object.__setattr__(config, "heartbeat_seconds", 0.03)
            object.__setattr__(config, "heartbeat_timeout_seconds", 0.10)
            exit_code = sup.run_supervisor(config)
            self.assertEqual(exit_code, 0)
            events = self.read_events(config.event_log)
            kinds = [event["kind"] for event in events]
            self.assertIn("heartbeat_timeout", kinds)
            self.assertEqual(kinds[-1], "completed")

    def test_control_input_is_forwarded_to_child(self) -> None:
        code = "x=input()\nprint('ECHO:' + x, flush=True)\n"
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            config = self.make_config(code, root)
            object.__setattr__(config, "control_stdin", True)
            exit_code = sup.run_supervisor(
                config,
                control_lines=['{"action":"input","text":"继续执行"}'],
            )
            self.assertEqual(exit_code, 0)
            raw = config.raw_log.read_text(encoding="utf-8")
            self.assertIn("ECHO:继续执行", raw)

    def test_pause_control_emits_paused_event(self) -> None:
        code = "import time\nprint('ready', flush=True)\ntime.sleep(5)\n"
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            config = self.make_config(code, root)
            object.__setattr__(config, "control_stdin", True)
            exit_code = sup.run_supervisor(
                config,
                control_lines=['{"action":"pause"}'],
            )
            self.assertNotEqual(exit_code, 0)
            events = self.read_events(config.event_log)
            self.assertEqual(events[-1]["kind"], "paused")
            self.assertTrue(events[-1]["data"]["resumable"])
if __name__ == "__main__":
    unittest.main(verbosity=2)