#!/bin/zsh
set -eu
ROOT="${0:A:h}"
PID_FILE="$ROOT/.runtime/demo.pid"
[[ -f "$PID_FILE" ]] || { print '本项目没有运行中的启动入口。'; exit 0; }
DEMO_PID="$(cat "$PID_FILE")"
[[ "$DEMO_PID" == <-> ]] || { print '启动记录异常，请核对 .runtime/demo.pid。'; exit 1; }
DEMO_COMMAND="$(ps -p "$DEMO_PID" -o command= || true)"
[[ "$DEMO_COMMAND" == *启动Demo.command* ]] || { print '原启动进程已结束；未终止其他进程。'; exit 0; }
kill -TERM "$DEMO_PID"
print '已停止本项目的页面和数据服务。'
