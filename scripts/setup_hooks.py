#!/usr/bin/env python
"""
Cross-platform setup for AI log git hooks.
Creates .ai-log directory and installs git pre-push hook.

Usage:
    python scripts/setup_hooks.py
"""
import stat
import sys
from pathlib import Path


def main() -> None:
    """Set up AI logging infrastructure."""
    repo_root = Path(__file__).resolve().parent.parent

    # Create .ai-log directory
    ai_log_dir = repo_root / ".ai-log"
    ai_log_dir.mkdir(exist_ok=True)
    gitkeep = ai_log_dir / ".gitkeep"
    if not gitkeep.exists():
        gitkeep.touch()
    print("[ai-log] .ai-log directory ready.")

    # Install pre-push hook
    git_dir = repo_root / ".git"
    if not git_dir.exists():
        print("[ai-log] WARNING: .git directory not found. Skipping hook install.")
        print("[ai-log] Run 'git init' first, then re-run this script.")
        sys.exit(0)

    hook_dir = git_dir / "hooks"
    hook_dir.mkdir(parents=True, exist_ok=True)
    hook_file = hook_dir / "pre-push"

    python_exe = sys.executable.replace("\\", "/")
    # Git on Windows uses sh.exe (from Git Bash) to run hook scripts,
    # so we write a POSIX shell script but use 'python' (not 'python3')
    hook_content = f"""#!/bin/sh
# Submit AI logs to grading server before push
"{python_exe}" "{repo_root.as_posix()}/scripts/submit_log.py"
exit 0  # Never block push
"""

    hook_file.write_text(hook_content, encoding="utf-8", newline="\n")

    # Make executable (needed for Git's sh.exe on Windows too)
    try:
        hook_file.chmod(hook_file.stat().st_mode | stat.S_IEXEC)
    except OSError:
        pass  # chmod may not be fully supported on Windows NTFS

    print("[ai-log] Git pre-push hook installed.")
    print("[ai-log] Setup complete. Configure AI_LOG_SERVER in your .env file.")
    log_hook_path = (repo_root / "scripts" / "log_hook.py").as_posix()
    print(f"[ai-log] To enable logging, set your AI tool's hook to: python \"{log_hook_path}\"")


if __name__ == "__main__":
    main()