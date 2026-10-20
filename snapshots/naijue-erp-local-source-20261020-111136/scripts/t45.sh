#!/bin/sh
set -eu
task_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
exec "$task_root/scripts/npm.sh" exec -- node "$task_root/scripts/t45/cli.mjs" "$@"
