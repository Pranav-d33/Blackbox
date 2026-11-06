#!/usr/bin/env bash
# Container entrypoint: robot + core (+ mock 0G only when ZG_MODE=mock). If any child dies the container exits so the platform restarts it.
set -u
cd "$(dirname "$0")/.."
ROOT=$PWD
export CORE_PORT="${PORT:-${CORE_PORT:-8787}}"
export CORE_HOST="${CORE_HOST:-0.0.0.0}"
export ROBOT_HOST=127.0.0.1 ROBOT_PORT="${ROBOT_PORT:-8801}"
export ROBOT_URL="http://127.0.0.1:$ROBOT_PORT" CORE_URL="http://127.0.0.1:$CORE_PORT"
mkdir -p "${CORE_DATA_DIR:-$ROOT/core/data}" "${ROBOT_DATA_DIR:-$ROOT/robot/data}"

pids=()
trap 'kill "${pids[@]}" 2>/dev/null' EXIT TERM INT

if [ "${ZG_MODE:-router}" = "mock" ]; then
  (cd core && exec node_modules/.bin/tsx src/mock0g/server.ts) & pids+=($!)
fi
(cd robot && exec ./.venv/bin/python -m blackbox_robot.adapter) & pids+=($!)
(cd core && exec node_modules/.bin/tsx src/server.ts) & pids+=($!)

wait -n
echo "[hosted] a process exited, stopping" >&2
exit 1
