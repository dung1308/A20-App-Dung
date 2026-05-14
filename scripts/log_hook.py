#!/usr/bin/env python3
"""
Shared AI hook logger — works with Claude Code, Gemini CLI, Codex, Cursor, Copilot.
Reads JSON from stdin, normalizes to common format, appends to .ai-log/session.jsonl
"""
import json
import os
import sys
import subprocess
from datetime import datetime, timezone, timedelta
from pathlib import Path

VN_TZ = timezone(timedelta(hours=7))
MAX_LOG_SIZE_MB = 10


def git(cmd):
    try:
        return subprocess.check_output(cmd, shell=True, text=True, stderr=subprocess.DEVNULL).strip()
    except Exception:
        return ""


def detect_tool(data: dict) -> str:
    """Detect which AI tool sent this hook event."""
    tool_env = os.environ.get("AI_TOOL_NAME", "").lower()
    if tool_env:
        return tool_env
    # Heuristics
    if "transcript_path" in data:
        return "codex"
    # Heuristic for 'co_pilot': assuming it has a unique identifier like 'co_pilot_id'
    if "co_pilot_id" in data:
        return "co_pilot"
    if data.get("hook_event_name", "").lower().startswith("co_pilot"):
        return "co_pilot"
    
    event_name = data.get("hook_event_name", "").lower()
    if event_name.startswith(("before", "after", "session", "pre", "notification")):
        return "gemini"
    if "workspace_roots" in data:
        return "cursor"
    if "toolName" in data:
        return "copilot"
    if "hook_event_name" in data:
        return "claude"
    return "unknown"


def normalize(data: dict, tool: str) -> dict | None:
    """Normalize tool-specific payload to common log entry."""
    event = data.get("hook_event_name") or data.get("event", "")
    ts = datetime.now(VN_TZ).isoformat()

    base = {
        "ts": ts,
        "tool": tool,
        "event": event,
        "session_id": (
            data.get("session_id") or
            data.get("conversation_id") or
            data.get("generation_id") or ""
        ),
        "model": data.get("model", ""),
        "repo": git("git remote get-url origin").split("/")[-1].replace(".git", ""),
        "branch": git("git rev-parse --abbrev-ref HEAD"),
        "commit": git("git rev-parse --short HEAD"),
        "student": git("git config user.email"),
    }

    if tool == "claude":
        prompt = ""
        # UserPromptSubmit: prompt is at top level
        if event == "UserPromptSubmit":
            prompt = data.get("prompt", "")[:1000]
        # PostToolUse: extract from tool_input
        elif isinstance(data.get("tool_input"), dict):
            prompt = data["tool_input"].get("prompt") or data["tool_input"].get("content") or ""
        base.update({
            "prompt": prompt,
            "tool_name": data.get("tool_name", ""),
            "tool_input": data.get("tool_input") if event != "UserPromptSubmit" else None,
            "tool_response": str(data.get("tool_response", ""))[:500],
        })

    elif tool == "gemini":
        if event == "beforeagent":
            prompt = data.get("prompt", "")[:1000]
            base.update({"prompt": prompt})
        else:
            req = data.get("request", {})
            contents = req.get("contents", [])
            prompt = ""
            for c in reversed(contents):
                for part in c.get("parts", []):
                    if part.get("text"):
                        prompt = part["text"][:1000]
                        break
                if prompt:
                    break
            resp = data.get("response", {})
            answer = ""
            try:
                answer = resp["candidates"][0]["content"]["parts"][0]["text"][:500]
            except Exception:
                pass
            base.update({"prompt": prompt, "response_summary": answer})

    elif tool == "codex":
        # Codex thường trả về prompt trực tiếp hoặc trong object request
        prompt_content = data.get("prompt") or data.get("request", {}).get("prompt", "")
        base.update({
            "prompt": prompt_content[:1000],
            "turn_id": data.get("turn_id", "n/a"),
            "transcript_path": data.get("transcript_path", "n/a")
        })

    elif tool == "cursor":
        base.update({
            "prompt": data.get("prompt", "")[:1000],
            "files_context": data.get("attachments", []),
        })

    elif tool == "copilot":
        base.update({
            "prompt": data.get("prompt", "")[:1000],
            "tool_name": data.get("toolName", ""),
            "tool_args": data.get("toolArgs"),
        })

    elif tool == "co_pilot":
        # Check for multiple possible prompt fields common in AI hooks
        prompt = data.get("prompt") or data.get("input") or data.get("text") or ""
        base.update({
            "prompt": str(prompt)[:1000],
            "co_pilot_id": data.get("co_pilot_id", ""),
            # Add other relevant 'co_pilot' specific fields here if known
        })

    # Skip empty/noise events
    if not base.get("prompt") and event not in ("Stop", "stop", "SessionEnd", "sessionEnd", "AfterModel"):
        return None

    return base


def main():
    raw = sys.stdin.read().strip()
    if not raw:
        sys.exit(0)

    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        sys.exit(0)

    tool = detect_tool(data)
    entry = normalize(data, tool)
    if not entry:
        sys.exit(0)

    # Ensure we log to the repository root regardless of where the script is called
    git_root = git("git rev-parse --show-toplevel")
    # This script is at scripts/log_hook.py, so the project root is the parent directory
    project_fallback = Path(__file__).parent.parent.absolute()

    base_path = Path(git_root) if git_root else project_fallback
    log_dir = base_path / os.environ.get("AI_LOG_DIR", ".ai-log")

    log_dir.mkdir(exist_ok=True)
    log_file = log_dir / "session.jsonl"

    # Log Rotation: Prevent disk space exhaustion
    if log_file.exists() and log_file.stat().st_size > MAX_LOG_SIZE_MB * 1024 * 1024:
        backup_file = log_file.with_suffix(".jsonl.bak")
        try:
            log_file.replace(backup_file)
        except Exception:
            pass # Avoid crashing if file is locked

    with open(log_file, "a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")

    # Output valid JSON (required by some tools like Gemini)
    print(json.dumps({"status": "logged"}))


if __name__ == "__main__":
    main()
