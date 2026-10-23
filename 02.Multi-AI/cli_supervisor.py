#!/usr/bin/env python3
"""统一 CLI Implementer Supervisor 事件桥。

职责边界：
- 启动并托管一个 CLI 子进程；
- 将 OpenCode JSON、CodeBuddy stream-json 或普通文本归一化为事件；
- 写原始日志、JSONL 事件日志和原子状态文件；
- 输出 action 事件供 Orchestrator 等待；
- 支持 stdin 控制命令转发输入、checkpoint、暂停与停止。

Supervisor 不执行 diff、测试、构建或最终验收；这些仍由 Orchestrator 完成。
"""

from __future__ import annotations

import argparse
import json
import os
import queue
import re
import shutil
import signal
import subprocess
import sys
import threading
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

EVENT_SCHEMA = "ecu.cli-event.v1"
STATUS_SCHEMA = "ecu.cli-status.v1"
EVENT_VERSION = 1

ACTIONABLE_KINDS = {
    "approval_required",
    "waiting_input",
    "checkpoint",
    "error",
    "paused",
    "completed",
    "failed",
    "canceled",
    "heartbeat_timeout",
}

TERMINAL_KINDS = {"paused", "completed", "failed", "canceled"}
CANCEL_EXIT_CODES = {130, 143, -2, -15}

_APPROVAL_PATTERNS = (
    r"permission\s+(?:is\s+)?(?:required|requested)",
    r"approval\s+(?:is\s+)?required",
    r"waiting\s+for\s+(?:approval|permission)",
    r"\bapprove\s+(?:this\s+)?(?:tool|action|command)\b",
    r"\bpermission\.asked\b",
    r"\btool\s+permission\b",
    r"(?:需要|权限)(?:授权|批准|审批)",
    r"等待(?:授权|批准|审批)",
    r"是否允许",
    r"请批准",
)
_WAITING_INPUT_PATTERNS = (
    r"waiting\s+for\s+(?:user\s+)?input",
    r"requires?\s+(?:your\s+)?input",
    r"\bquestion\b.*\bask",
    r"需要(?:用户)?输入",
    r"等待输入",
)
_ERROR_PATTERNS = (
    r"^\s*error\s*:",
    r"\bfatal\b",
    r"\btraceback\s+\(most\s+recent\s+call\s+last\)",
    r"build\s+failed",
    r"任务失败",
    r"执行异常",
    r"构建失败",
)
_CANCEL_PATTERNS = (
    r"\bsession\s+interrupted\b",
    r"\bprocess\s+(?:was\s+)?cancel+ed\b",
    r"\buser\s+cancel+ed\b",
    r"会话(?:已)?中断",
    r"用户(?:已)?取消",
    r"任务(?:已)?中止",
)
_CHECKPOINT_PATTERNS = (
    r"\bgit\s+commit\b",
    r"\bcheckpoint\b",
    r"\bcommit\s+[0-9a-f]{7,40}\b",
    r"提交完成",
    r"已提交\s+`?[0-9a-f]{7,40}",
)


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


@dataclass(frozen=True)
class Classification:
    kind: str
    message: str
    session_id: str | None = None
    data: dict[str, Any] = field(default_factory=dict)

    @property
    def actionable(self) -> bool:
        return self.kind in ACTIONABLE_KINDS


@dataclass(frozen=True)
class ControlCommand:
    action: str
    text: str | None = None
    message: str = ""


@dataclass(frozen=True)
class SupervisorConfig:
    provider: str
    cwd: Path
    session_id: str
    event_log: Path
    status_file: Path
    raw_log: Path
    heartbeat_seconds: float
    heartbeat_timeout_seconds: float
    emit_progress: bool
    emit_heartbeat: bool
    control_stdin: bool
    command: list[str]

    def __post_init__(self) -> None:
        if self.provider not in {"opencode", "codebuddy", "generic"}:
            raise ValueError(f"unsupported provider: {self.provider}")
        if self.heartbeat_seconds <= 0:
            raise ValueError("heartbeat_seconds must be positive")
        if self.heartbeat_timeout_seconds <= 0:
            raise ValueError("heartbeat_timeout_seconds must be positive")
        if not self.command:
            raise ValueError("command must not be empty")


def _contains_flag(args: Iterable[str], flag: str) -> bool:
    return any(arg == flag or arg.startswith(flag + "=") for arg in args)


def prepare_command(provider: str, args: list[str]) -> list[str]:
    """构造 provider 的 headless 命令，保留调用者其余参数顺序。"""
    raw = list(args)
    if provider == "generic":
        if not raw:
            raise ValueError("generic provider requires an executable in command arguments")
        return raw

    if provider == "opencode":
        if not raw:
            raise ValueError("opencode arguments must begin with `run`")
        if raw[0] != "run":
            raw.insert(0, "run")
        if not _contains_flag(raw, "--format"):
            raw[1:1] = ["--format", "json"]
        return ["opencode", *raw]

    if provider == "codebuddy":
        command = ["codebuddy"]
        if not _contains_flag(raw, "--print") and "-p" not in raw:
            command.append("--print")
        if not _contains_flag(raw, "--output-format"):
            command.extend(["--output-format", "stream-json"])
        if not _contains_flag(raw, "--input-format"):
            command.extend(["--input-format", "text"])
        return [*command, *raw]

    raise ValueError(f"unsupported provider: {provider}")


def resolve_provider_command(provider: str, command: list[str]) -> list[str]:
    """解析 npm 包真实入口，避免 Windows 下误用 `.ps1` shim。"""
    if provider == "generic":
        return list(command)
    env_name = "ECU_OPENCODE_BIN" if provider == "opencode" else "ECU_CODEBUDDY_BIN"
    override = os.environ.get(env_name)
    if override:
        return [override, *command[1:]]

    if provider == "opencode":
        appdata = Path(os.environ.get("APPDATA", ""))
        bundled = appdata / "npm" / "node_modules" / "opencode-ai" / "bin" / "opencode.exe"
        if bundled.is_file():
            return [str(bundled), *command[1:]]
        found = shutil.which("opencode.exe") or shutil.which("opencode")
        if not found:
            raise FileNotFoundError("opencode executable not found; set ECU_OPENCODE_BIN")
        return [found, *command[1:]]

    if provider == "codebuddy":
        appdata = Path(os.environ.get("APPDATA", ""))
        script = (
            appdata
            / "npm"
            / "node_modules"
            / "@tencent-ai"
            / "codebuddy-code"
            / "dist"
            / "codebuddy.js"
        )
        if script.is_file():
            node = shutil.which("node.exe") or shutil.which("node")
            if not node:
                raise FileNotFoundError("node executable not found for CodeBuddy")
            return [node, str(script), *command[1:]]
        found = shutil.which("codebuddy.cmd") or shutil.which("codebuddy")
        if not found:
            raise FileNotFoundError("codebuddy executable not found; set ECU_CODEBUDDY_BIN")
        return [found, *command[1:]]

    raise ValueError(f"unsupported provider: {provider}")


def _walk_strings(value: Any) -> Iterable[str]:
    if isinstance(value, str):
        yield value
    elif isinstance(value, dict):
        for nested in value.values():
            yield from _walk_strings(nested)
    elif isinstance(value, (list, tuple)):
        for nested in value:
            yield from _walk_strings(nested)


def _extract_message(value: Any) -> str:
    if not isinstance(value, dict):
        return str(value)
    for key in ("message", "text", "content", "summary", "detail", "description"):
        found = value.get(key)
        if isinstance(found, str):
            return found
        if isinstance(found, list):
            parts = [part for part in _walk_strings(found) if part]
            if parts:
                return " ".join(parts)
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))[:1000]


def _extract_session_id(value: Any) -> str | None:
    if not isinstance(value, dict):
        return None
    for key in ("sessionId", "session_id", "sessionID", "nativeHandle"):
        found = value.get(key)
        if isinstance(found, str) and found:
            return found
    for key in ("session", "data", "metadata", "providerData"):
        found = _extract_session_id(value.get(key))
        if found:
            return found
    return None


def _structured_kind(types: list[str]) -> str | None:
    normalized = " ".join(types).lower()
    if any(token in normalized for token in ("permission", "approval", "approve")):
        return "approval_required"
    if any(token in normalized for token in ("question", "input_required", "waiting_input")):
        return "waiting_input"
    if any(token in normalized for token in ("checkpoint", "commit.completed", "git.commit")):
        return "checkpoint"
    if any(token in normalized for token in ("canceled", "cancelled", "interrupted", "aborted")):
        return "canceled"
    if any(token in normalized for token in ("error", "failed")):
        return "error"
    return None


def _matches(patterns: tuple[str, ...], text: str) -> bool:
    lowered = text.lower()
    return any(re.search(pattern, lowered, flags=re.IGNORECASE | re.MULTILINE) for pattern in patterns)


def classify_line(line: str) -> Classification:
    """把一行 provider 输出归一化为稳定事件。"""
    stripped = line.strip()
    if not stripped:
        return Classification("progress", "")

    parsed: dict[str, Any] | None = None
    try:
        candidate = json.loads(stripped)
        if isinstance(candidate, dict):
            parsed = candidate
    except json.JSONDecodeError:
        parsed = None

    if parsed is not None:
        types: list[str] = []
        for key in ("type", "event", "kind", "status"):
            value = parsed.get(key)
            if isinstance(value, str):
                types.append(value)
        for nested_key in ("part", "payload", "data", "message"):
            nested = parsed.get(nested_key)
            if isinstance(nested, dict):
                for key in ("type", "event", "kind", "status"):
                    value = nested.get(key)
                    if isinstance(value, str):
                        types.append(value)
        message = _extract_message(parsed)
        session_id = _extract_session_id(parsed)
        kind = _structured_kind(types)
        top_type = parsed.get("type")
        is_error = parsed.get("is_error") is True or str(parsed.get("subtype", "")).lower() in {
            "error",
            "failed",
        }
        if kind is None and is_error:
            kind = "error"
        elif kind is None and top_type in {"user", "assistant", "system", "result"}:
            # stream-json 的 message/tool_result 只是数据载体；其中引用的提示词、
            # TDD 文案或文档内容不能触发 Orchestrator 的“等待输入”事件。
            kind = "progress"
        elif kind is None:
            if _matches(_APPROVAL_PATTERNS, message):
                kind = "approval_required"
            elif _matches(_WAITING_INPUT_PATTERNS, message):
                kind = "waiting_input"
            elif _matches(_CANCEL_PATTERNS, message):
                kind = "canceled"
            elif _matches(_CHECKPOINT_PATTERNS, message):
                kind = "checkpoint"
            else:
                kind = "progress"
        data = {"raw_type": types, "structured": parsed}
        return Classification(kind, message, session_id, data)

    if stripped.startswith(("Usage:", "Options:", "Commands:")) or re.match(r"^\s*(?:-[A-Za-z],\s*)?--[A-Za-z]", stripped):
        return Classification("progress", stripped)

    if _matches(_APPROVAL_PATTERNS, stripped):
        kind = "approval_required"
    elif _matches(_WAITING_INPUT_PATTERNS, stripped):
        kind = "waiting_input"
    elif _matches(_CANCEL_PATTERNS, stripped):
        kind = "canceled"
    elif _matches(_CHECKPOINT_PATTERNS, stripped):
        kind = "checkpoint"
    elif _matches(_ERROR_PATTERNS, stripped):
        kind = "error"
    else:
        kind = "progress"
    return Classification(kind, stripped)


def parse_control_command(line: str) -> ControlCommand:
    """解析 stdin 控制 JSON。send/input/approve/deny 会转发给 CLI 子进程。"""
    try:
        payload = json.loads(line)
    except json.JSONDecodeError as exc:
        raise ValueError("control command must be JSON") from exc
    if not isinstance(payload, dict):
        raise ValueError("control command must be a JSON object")
    action = str(payload.get("action", "")).strip().lower()
    if action == "approve":
        return ControlCommand("send", "y\n", "approve")
    if action == "deny":
        return ControlCommand("send", "n\n", "deny")
    if action in {"input", "send"}:
        text = payload.get("text")
        if not isinstance(text, str):
            raise ValueError("input/send requires string field `text`")
        if not text.endswith("\n"):
            text += "\n"
        return ControlCommand("send", text, action)
    if action in {"pause", "stop", "checkpoint"}:
        return ControlCommand(action, None, str(payload.get("message", action)))
    raise ValueError(f"unsupported control action: {action}")


class EventSink:
    def __init__(self, config: SupervisorConfig) -> None:
        self.config = config
        self.sequence = 0
        self.state = "starting"
        self.exit_code: int | None = None
        self.last_message = ""
        self.last_kind = "started"
        self._lock = threading.Lock()
        for path in (config.event_log, config.status_file, config.raw_log):
            path.parent.mkdir(parents=True, exist_ok=True)
        self.config.event_log.write_text("", encoding="utf-8")
        self.config.raw_log.write_text("", encoding="utf-8")

    def _status(self) -> dict[str, Any]:
        return {
            "schema": STATUS_SCHEMA,
            "version": EVENT_VERSION,
            "provider": self.config.provider,
            "session_id": self.config.session_id,
            "cwd": str(self.config.cwd),
            "state": self.state,
            "sequence": self.sequence,
            "last_event": self.last_kind,
            "last_message": self.last_message,
            "exit_code": self.exit_code,
            "updated_at": utc_now(),
            "pid": self.pid,
        }

    def _write_status(self) -> None:
        payload = json.dumps(self._status(), ensure_ascii=False, indent=2) + "\n"
        temporary = self.config.status_file.with_name(self.config.status_file.name + ".tmp")
        temporary.write_text(payload, encoding="utf-8")
        # Windows Defender、编辑器或状态读取方可能短暂持有目标文件句柄，
        # 使单次 os.replace 返回 WinError 5。重试让瞬时占用自行释放。
        for attempt, delay in enumerate((0.0, 0.01, 0.02, 0.05, 0.10, 0.20)):
            if delay:
                time.sleep(delay)
            try:
                os.replace(temporary, self.config.status_file)
                return
            except PermissionError:
                if attempt == 5:
                    break
        # 原子替换持续被占用时降级为直接覆盖，优先保证 Supervisor 不崩溃；
        # 极端情况下再写独立 fallback 文件，事件日志和原始日志仍是权威证据。
        try:
            self.config.status_file.write_text(payload, encoding="utf-8")
        except OSError:
            fallback = self.config.status_file.with_name(
                self.config.status_file.stem + ".fallback.json"
            )
            try:
                fallback.write_text(payload, encoding="utf-8")
            except OSError:
                pass
        finally:
            try:
                temporary.unlink(missing_ok=True)
            except OSError:
                pass
    pid: int | None = None

    def write_raw(self, line: str) -> None:
        with self._lock:
            with self.config.raw_log.open("a", encoding="utf-8", newline="\n") as handle:
                handle.write(line)
                if not line.endswith("\n"):
                    handle.write("\n")

    def emit(
        self,
        kind: str,
        message: str = "",
        *,
        data: dict[str, Any] | None = None,
        state: str | None = None,
        actionable: bool | None = None,
        exit_code: int | None = None,
    ) -> dict[str, Any]:
        with self._lock:
            self.sequence += 1
            self.last_kind = kind
            self.last_message = message
            if state is not None:
                self.state = state
            if exit_code is not None:
                self.exit_code = exit_code
            event = {
                "schema": EVENT_SCHEMA,
                "version": EVENT_VERSION,
                "sequence": self.sequence,
                "timestamp": utc_now(),
                "kind": kind,
                "provider": self.config.provider,
                "session_id": self.config.session_id,
                "pid": self.pid,
                "message": message,
                "data": data or {},
            }
            with self.config.event_log.open("a", encoding="utf-8", newline="\n") as handle:
                handle.write(json.dumps(event, ensure_ascii=False, separators=(",", ":")) + "\n")
            self._write_status()
        should_print = (
            kind in ACTIONABLE_KINDS if actionable is None else actionable
        ) or (kind == "progress" and self.config.emit_progress) or (
            kind == "heartbeat" and self.config.emit_heartbeat
        )
        if should_print:
            print(json.dumps(event, ensure_ascii=True, separators=(",", ":")), flush=True)
        return event


def _reader_thread(stream: Any, output: queue.Queue[str | None]) -> None:
    try:
        for line in iter(stream.readline, ""):
            output.put(line.rstrip("\r\n"))
    finally:
        output.put(None)


def _control_thread(commands: queue.Queue[ControlCommand | str]) -> None:
    for line in sys.stdin:
        text = line.strip()
        if not text:
            continue
        try:
            commands.put(parse_control_command(text))
        except ValueError as exc:
            commands.put(f"control_error:{exc}")

def _control_lines_thread(
    lines: Iterable[str], commands: queue.Queue[ControlCommand | str]
) -> None:
    for line in lines:
        text = line.strip()
        if not text:
            continue
        try:
            commands.put(parse_control_command(text))
        except ValueError as exc:
            commands.put(f"control_error:{exc}")


def _request_child_stop(process: subprocess.Popen[str]) -> None:
    if process.poll() is not None:
        return
    try:
        if os.name == "nt":
            process.send_signal(signal.CTRL_BREAK_EVENT)
        else:
            process.send_signal(signal.SIGINT)
    except (OSError, RuntimeError):
        process.terminate()


def _send_child_input(process: subprocess.Popen[str], text: str) -> None:
    if process.stdin is None or process.poll() is not None:
        return
    process.stdin.write(text)
    process.stdin.flush()


def _terminal_event(
    sink: EventSink,
    exit_code: int,
    *,
    paused: bool,
    process_exit_code: int | None = None,
) -> None:
    session_hint = {"resumable": bool(sink.config.session_id), "session_id": sink.config.session_id}
    if paused:
        sink.emit(
            "paused",
            "Implementer 已暂停；可通过原 session ID 恢复",
            data=session_hint,
            state="paused",
            exit_code=exit_code,
        )
    elif exit_code == 0:
        sink.emit(
            "completed",
            "Implementer 正常完成；进入 diff、测试和构建验收",
            state="completed",
            exit_code=0,
        )
    elif exit_code in CANCEL_EXIT_CODES:
        sink.emit(
            "canceled",
            "Implementer 被取消或中断",
            data=session_hint,
            state="canceled",
            exit_code=exit_code,
        )
    else:
        failure_data = {"exit_code": exit_code, "resumable": bool(sink.config.session_id)}
        if process_exit_code is not None:
            failure_data["process_exit_code"] = process_exit_code
        sink.emit(
            "failed",
            "Implementer 异常退出",
            data=failure_data,
            state="failed",
            exit_code=exit_code,
        )


def run_supervisor(
    config: SupervisorConfig,
    *,
    control_lines: Iterable[str] | None = None,
) -> int:
    """运行一个 CLI 子进程，直到完成、失败、取消或由控制命令暂停。"""
    resolved_cwd = config.cwd.resolve()
    if not resolved_cwd.is_dir():
        raise FileNotFoundError(f"cwd does not exist: {resolved_cwd}")
    sink = EventSink(config)
    try:
        effective_command = resolve_provider_command(config.provider, config.command)
    except OSError as exc:
        started = sink.emit(
            "started",
            "Implementer 进程启动",
            data={"command": config.command},
            state="starting",
        )
        sink.emit(
            "failed",
            f"CLI 可执行文件解析失败：{exc}",
            data={"command": config.command, "started_event": started["sequence"]},
            state="failed",
            exit_code=127,
        )
        return 127
    started = sink.emit(
        "started",
        "Implementer 进程启动",
        data={
            "command": effective_command,
            "heartbeat_seconds": config.heartbeat_seconds,
            "heartbeat_timeout_seconds": config.heartbeat_timeout_seconds,
            "control_stdin": config.control_stdin,
        },
        state="running",
    )

    creationflags = 0
    if os.name == "nt":
        creationflags = getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
    child_env = os.environ.copy()
    child_env["PYTHONUTF8"] = "1"
    child_env["PYTHONIOENCODING"] = "utf-8"
    try:
        process = subprocess.Popen(
            effective_command,
            cwd=resolved_cwd,
            stdin=subprocess.PIPE if config.control_stdin else subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="replace",
            bufsize=1,
            env=child_env,
            creationflags=creationflags,
        )
    except OSError as exc:
        sink.emit(
            "failed",
            f"CLI 进程启动失败：{exc}",
            data={"command": config.command, "started_event": started["sequence"]},
            state="failed",
            exit_code=127,
        )
        return 127

    sink.pid = process.pid
    sink.emit("progress", "CLI 子进程已创建", data={"child_pid": process.pid}, state="running", actionable=False)

    output_queue: queue.Queue[str | None] = queue.Queue()
    reader = threading.Thread(target=_reader_thread, args=(process.stdout, output_queue), daemon=True)
    reader.start()

    control_queue: queue.Queue[ControlCommand | str] = queue.Queue()
    if control_lines is not None:
        threading.Thread(
            target=_control_lines_thread,
            args=(control_lines, control_queue),
            daemon=True,
        ).start()
    elif config.control_stdin:
        threading.Thread(target=_control_thread, args=(control_queue,), daemon=True).start()

    last_output = time.monotonic()
    last_heartbeat = last_output
    timeout_emitted = False
    pause_requested = False
    cancel_seen = False
    actionable_error_seen = False
    stop_deadline: float | None = None
    stream_done = False

    while True:
        now = time.monotonic()
        if stream_done and process.poll() is not None:
            break

        wait_for = min(config.heartbeat_seconds, 0.25)
        try:
            item = output_queue.get(timeout=wait_for)
        except queue.Empty:
            item = ""

        if item is None:
            stream_done = True
        elif item:
            sink.write_raw(item)
            classified = classify_line(item)
            last_output = time.monotonic()
            timeout_emitted = False
            if classified.session_id and not config.session_id:
                config = SupervisorConfig(
                    provider=config.provider,
                    cwd=resolved_cwd,
                    session_id=classified.session_id,
                    event_log=config.event_log,
                    status_file=config.status_file,
                    raw_log=config.raw_log,
                    heartbeat_seconds=config.heartbeat_seconds,
                    heartbeat_timeout_seconds=config.heartbeat_timeout_seconds,
                    emit_progress=config.emit_progress,
                    emit_heartbeat=config.emit_heartbeat,
                    control_stdin=config.control_stdin,
                    command=config.command,
                )
                sink.config = config
            if classified.kind == "approval_required":
                sink.emit(classified.kind, classified.message, data=classified.data, state="waiting_approval")
            elif classified.kind == "waiting_input":
                sink.emit(classified.kind, classified.message, data=classified.data, state="waiting_input")
            elif classified.kind == "canceled":
                cancel_seen = True
                sink.emit(classified.kind, classified.message, data=classified.data, state="running")
            elif classified.kind == "progress":
                sink.emit(classified.kind, classified.message, data=classified.data, state="running", actionable=False)
            else:
                sink.emit(classified.kind, classified.message, data=classified.data, state="running")
                if classified.kind == "error":
                    actionable_error_seen = True

        while True:
            try:
                command = control_queue.get_nowait()
            except queue.Empty:
                break
            if isinstance(command, str) and command.startswith("control_error:"):
                sink.emit("error", command, data={"source": "control_stdin"}, state="running")
                continue
            assert isinstance(command, ControlCommand)
            if command.action == "send":
                assert command.text is not None
                _send_child_input(process, command.text)
                sink.emit(
                    "progress",
                    "控制输入已转发给 CLI",
                    data={"control": command.message},
                    state="running",
                    actionable=False,
                )
            elif command.action == "checkpoint":
                sink.emit("checkpoint", command.message, data={"source": "control_stdin"})
            elif command.action in {"pause", "stop"}:
                pause_requested = True
                stop_deadline = time.monotonic() + 3.0
                _request_child_stop(process)
                sink.emit(
                    "progress",
                    "已请求 CLI 安全中断",
                    data={"control": command.action},
                    state="canceling",
                    actionable=False,
                )

        if pause_requested and process.poll() is None and stop_deadline is not None and now >= stop_deadline:
            process.kill()
            stop_deadline = None

        now = time.monotonic()
        if process.poll() is None:
            if now - last_heartbeat >= config.heartbeat_seconds:
                sink.emit(
                    "heartbeat",
                    "Implementer 进程仍在运行",
                    data={"silent_seconds": round(now - last_output, 3)},
                    state=sink.state,
                    actionable=False,
                )
                last_heartbeat = now
            if not timeout_emitted and now - last_output >= config.heartbeat_timeout_seconds:
                sink.emit(
                    "heartbeat_timeout",
                    "Implementer 超过阈值无输出；进程仍存活，等待或人工检查",
                    data={
                        "silent_seconds": round(now - last_output, 3),
                        "threshold_seconds": config.heartbeat_timeout_seconds,
                        "child_pid": process.pid,
                    },
                    state="heartbeat_timeout",
                    actionable=True,
                )
                timeout_emitted = True

    process_exit_code = process.wait()
    exit_code = process_exit_code
    if process.stdout is not None:
        process.stdout.close()
    if process.stdin is not None:
        process.stdin.close()
    if pause_requested:
        terminal_kind = "paused"
    elif exit_code in CANCEL_EXIT_CODES or cancel_seen:
        terminal_kind = "canceled"
    elif actionable_error_seen and process_exit_code == 0:
        # provider 已明确输出 error 时，CLI 以 0 退出也不得覆盖成 completed。
        exit_code = 1
        terminal_kind = "failed"
    elif exit_code == 0:
        terminal_kind = "completed"
    else:
        terminal_kind = "failed"
    _terminal_event(
        sink,
        exit_code,
        paused=terminal_kind == "paused",
        process_exit_code=process_exit_code if process_exit_code != exit_code else None,
    )
    return exit_code


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="统一 CLI Implementer 事件桥")
    subparsers = parser.add_subparsers(dest="subcommand", required=True)
    run = subparsers.add_parser("run", help="运行并监督一个 CLI Implementer")
    run.add_argument("--provider", required=True, choices=("opencode", "codebuddy", "generic"))
    run.add_argument("--cwd", type=Path, default=Path.cwd())
    run.add_argument("--session-id", default="")
    run.add_argument("--event-log", type=Path, required=True)
    run.add_argument("--status-file", type=Path, required=True)
    run.add_argument("--raw-log", type=Path, required=True)
    run.add_argument("--heartbeat-seconds", type=float, default=30.0)
    run.add_argument("--heartbeat-timeout-seconds", type=float, default=1800.0)
    run.add_argument("--emit-progress", action="store_true")
    run.add_argument("--emit-heartbeat", action="store_true")
    run.add_argument("--control-stdin", action="store_true")
    run.add_argument("agent_args", nargs=argparse.REMAINDER)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    agent_args = list(args.agent_args)
    if agent_args and agent_args[0] == "--":
        agent_args = agent_args[1:]
    try:
        command = prepare_command(args.provider, agent_args)
        config = SupervisorConfig(
            provider=args.provider,
            cwd=args.cwd,
            session_id=args.session_id,
            event_log=args.event_log,
            status_file=args.status_file,
            raw_log=args.raw_log,
            heartbeat_seconds=args.heartbeat_seconds,
            heartbeat_timeout_seconds=args.heartbeat_timeout_seconds,
            emit_progress=args.emit_progress,
            emit_heartbeat=args.emit_heartbeat,
            control_stdin=args.control_stdin,
            command=command,
        )
        return run_supervisor(config)
    except (OSError, ValueError) as exc:
        print(json.dumps({"kind": "failed", "message": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
