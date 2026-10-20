#!/bin/sh
set -eu
project_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
case "$(uname -s)" in Darwin) platform=darwin ;; Linux) platform=linux ;; *) echo 'Use Node 24.21.0 and npm 11.19.0 on this platform.' >&2; exit 1 ;; esac
case "$(uname -m)" in arm64|aarch64) arch=arm64 ;; x86_64) arch=x64 ;; *) echo 'Unsupported architecture' >&2; exit 1 ;; esac
runtime="$project_root/.runtime/node-v24.21.0-$platform-$arch/bin"
if [ -x "$runtime/node" ]; then PATH="$runtime:$PATH"; export PATH; fi
cd "$project_root"
node scripts/check-toolchain.mjs
exec npm "$@"
