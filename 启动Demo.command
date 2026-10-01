#!/bin/zsh
set -eu
ROOT="${0:A:h}"
cd -- "$ROOT"
if [[ -f .env ]]; then set -a; source .env; set +a; fi
if [[ -n "${PG_BIN:-}" ]]; then
  export PATH="$PG_BIN:$PATH"
elif ! command -v psql >/dev/null && [[ -x "$HOME/pg17/bin/psql" ]]; then
  export PATH="$HOME/pg17/bin:$PATH"
fi
export POSTGRES_DB="${POSTGRES_DB:-business_management}"
export POSTGRES_SCHEMA="${POSTGRES_SCHEMA:-tplus_demo_20260922_a2}"
export POSTGRES_HOST="${POSTGRES_HOST:-127.0.0.1}"
export POSTGRES_PORT="${POSTGRES_PORT:-5432}"
export POSTGRES_USER="${POSTGRES_USER:-$USER}"
export PSQL_BIN="${PSQL_BIN:-$(command -v psql || true)}"
[[ -n "$PSQL_BIN" ]] || { print '未找到 PostgreSQL 客户端，请按 README 配置 PG_BIN。'; exit 1; }
[[ -f node_modules/tsx/package.json ]] || { print '首次启动请在本目录执行 npm ci。'; exit 1; }
for port in 8877 8878; do
  if lsof -nP -iTCP:$port -sTCP:LISTEN >/dev/null 2>&1; then
    print "端口 $port 已有服务；请先停止该 Demo 后重试。"
    exit 1
  fi
done
mkdir -p .runtime
"$PSQL_BIN" -X -qAt -v ON_ERROR_STOP=1 -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c 'SELECT 1' >/dev/null
typeset API_PID='' FRONT_PID=''
cleanup() {
  trap - EXIT INT TERM
  [[ -z "$FRONT_PID" ]] || kill "$FRONT_PID" 2>/dev/null || true
  [[ -z "$API_PID" ]] || kill "$API_PID" 2>/dev/null || true
  rm -f .runtime/demo.pid
}
trap cleanup EXIT INT TERM
print $$ > .runtime/demo.pid
node --import tsx server/api.mjs > .runtime/server.log 2>&1 &
API_PID=$!
for attempt in {1..40}; do
  if curl --fail --silent http://127.0.0.1:8878/health >/dev/null; then break; fi
  kill -0 "$API_PID" 2>/dev/null || { print '数据服务启动失败，见 .runtime/server.log。'; exit 1; }
  sleep 0.25
done
curl --fail --silent http://127.0.0.1:8878/health >/dev/null || { print '数据服务未就绪。'; exit 1; }
python3 -m http.server 8877 --bind 127.0.0.1 --directory "$ROOT/frontend" > .runtime/frontend.log 2>&1 &
FRONT_PID=$!
for attempt in {1..40}; do
  if curl --fail --silent http://127.0.0.1:8877/ >/dev/null; then break; fi
  kill -0 "$FRONT_PID" 2>/dev/null || { print '页面服务启动失败，见 .runtime/frontend.log。'; exit 1; }
  sleep 0.25
done
print '奈爵服饰 Demo：http://127.0.0.1:8877/'
print '保持窗口打开；按 Control+C 同时停止页面和数据服务。'
[[ "${1:-}" == '--no-open' ]] || open http://127.0.0.1:8877/
wait "$FRONT_PID"
