#!/bin/bash
set -euo pipefail

STATE_DIR="${TRI_STATE_DIR:-/tri/state}"
STATUS_FILE="$STATE_DIR/status"
READY_FILE="$STATE_DIR/node-ready"

status=""
if [ -f "$STATUS_FILE" ]; then
  status=$(tr -d '\r\n' < "$STATUS_FILE")
fi

if ! pgrep -x trianglesd >/dev/null 2>&1; then
  case "$status" in
    bootstrapping|initializing|starting|syncing)
      exit 0
      ;;
  esac
  exit 1
fi

case "$status" in
  error|stopping)
    exit 1
    ;;
  bootstrapping|initializing|starting|syncing)
    exit 0
    ;;
  running)
    exit 0
    ;;
  *)
    if [ -f "$READY_FILE" ]; then
      exit 0
    fi
    exit 0
    ;;
esac
