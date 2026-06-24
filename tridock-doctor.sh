#!/usr/bin/env bash
# tridock-doctor.sh — diagnostic inspection for containerized TRIdock nodes.
#
# Mirrors the role of `tri-pi-doctor.sh` for native ARM64 installs, but
# inspects container state instead of systemd state. Read-only — never
# attempts to modify the container. Fixes happen via the entrypoint's
# preflight_restart() and check_tor_state() functions.
#
# Exit codes:
#   0 = clean (or only informational findings)
#   1 = warning (something needs attention but daemon is functional)
#   2 = fail-recoverable (daemon not running but container can recover)
#   3 = fail-fatal (corrupt state that requires manual intervention)
#
# Usage:
#   tridock-doctor.sh           # human-readable report
#   tridock-doctor.sh --json    # JSON for monitoring integration
#   tridock-doctor.sh --quiet   # only print summary line

set -u

# ─── Defaults ────────────────────────────────────────────────────────────────
DATA_DIR="${TRI_DATA_DIR:-/tri/data}"
STATE_DIR="${TRI_STATE_DIR:-/tri/state}"
STATUS_FILE="$STATE_DIR/status"
READY_FILE="$STATE_DIR/node-ready"
RESTART_CLEANUP_LOG="$STATE_DIR/restart-cleanups.log"
BIN_DIR="${TRI_BIN_DIR:-/tri/data/bin}"
TOR_STATE_FILE="$DATA_DIR/tor_data/state"

JSON_MODE=0
QUIET=0
FINDINGS=()
EXIT_CODE=0

# ─── Helpers ────────────────────────────────────────────────────────────────
record() {
  local severity="$1" check="$2" detail="$3"
  FINDINGS+=("{\"severity\":\"$severity\",\"check\":\"$check\",\"detail\":\"$detail\"}")
  case "$severity" in
    info) ;;
    warn) [ "$EXIT_CODE" -lt 1 ] && EXIT_CODE=1 ;;
    fail-recoverable) [ "$EXIT_CODE" -lt 2 ] && EXIT_CODE=2 ;;
    fail-fatal) EXIT_CODE=3 ;;
  esac
}

print_human() {
  local severity="$1" check="$2" detail="$3"
  case "$severity" in
    info)    printf "  \033[36mℹ\033[0m  %-32s %s\n" "$check" "$detail" ;;
    warn)    printf "  \033[33m⚠\033[0m  %-32s %s\n" "$check" "$detail" ;;
    fail-recoverable) printf "  \033[31m✗\033[0m  %-32s %s\n" "$check" "$detail" ;;
    fail-fatal)       printf "  \033[1;31m✗✗\033[0m %-32s %s\n" "$check" "$detail" ;;
  esac
}

# ─── Checks ─────────────────────────────────────────────────────────────────

check_status_file() {
  if [ ! -d "$STATE_DIR" ]; then
    record "fail-fatal" "state-dir" "state dir $STATE_DIR does not exist"
    return
  fi
  if [ ! -f "$STATUS_FILE" ]; then
    record "warn" "status-file" "no status file at $STATUS_FILE — entrypoint may not have run"
    return
  fi
  local status
  status=$(tr -d '\r\n' < "$STATUS_FILE" 2>/dev/null || echo "unknown")
  case "$status" in
    running|syncing|bootstrapping|starting|initializing|configuring|verifying)
      record "info" "lifecycle-status" "$status" ;;
    error|stopping|fail*)
      record "fail-recoverable" "lifecycle-status" "$status" ;;
    *)
      record "warn" "lifecycle-status" "unknown status: $status" ;;
  esac
}

check_binary() {
  local bin="$BIN_DIR/trianglesd"
  if [ ! -e "$bin" ]; then
    record "fail-fatal" "binary-missing" "$bin does not exist"
    return
  fi
  if [ ! -x "$bin" ]; then
    record "fail-fatal" "binary-not-executable" "$bin exists but is not executable"
    return
  fi
  # Try to extract version
  local version="unknown"
  if version=$("$bin" --version 2>&1 | head -1 | grep -oE 'v[0-9]+\.[0-9]+\.[0-9]+' | head -1); then
    :
  fi
  record "info" "binary" "$bin ($version)"
}

check_daemon_running() {
  # Match on data dir to avoid false positives from system trianglesd
  if pgrep -f "datadir=$DATA_DIR" >/dev/null 2>&1; then
    local pid
    pid=$(pgrep -f "datadir=$DATA_DIR" | head -1)
    record "info" "daemon-running" "trianglesd PID $pid"
  else
    # Differentiate between "still starting" and "actually down"
    local status
    status=$(tr -d '\r\n' < "$STATUS_FILE" 2>/dev/null || echo "")
    case "$status" in
      bootstrapping|initializing|starting|configuring|verifying)
        record "info" "daemon-starting" "no daemon yet (status=$status)" ;;
      *)
        record "fail-recoverable" "daemon-not-running" "no trianglesd process for datadir=$DATA_DIR" ;;
    esac
  fi
}

check_tor_state() {
  if [ ! -e "$TOR_STATE_FILE" ]; then
    record "info" "tor-state" "no state file yet (will be created on first Tor start)"
    return
  fi
  if [ -d "$TOR_STATE_FILE" ]; then
    record "fail-recoverable" "tor-state-is-directory" \
      "$TOR_STATE_FILE is a directory, not a file — check_tor_state() will repair on next entrypoint restart"
    return
  fi
  if [ -L "$TOR_STATE_FILE" ]; then
    record "warn" "tor-state-is-symlink" "$TOR_STATE_FILE is a symlink"
    return
  fi
  local size
  size=$(stat -c%s "$TOR_STATE_FILE" 2>/dev/null || echo 0)
  if [ "$size" -eq 0 ]; then
    record "warn" "tor-state-empty" "$TOR_STATE_FILE is 0 bytes"
    return
  fi
  record "info" "tor-state" "$TOR_STATE_FILE ($size bytes)"
}

check_tor_running() {
  # Match on Tor data dir to avoid killing/counting system tor
  if pgrep -f "DataDirectory $DATA_DIR/tor" >/dev/null 2>&1; then
    record "info" "tor-running" "tor process active"
  else
    record "warn" "tor-not-running" "no tor process for DataDirectory $DATA_DIR/tor"
  fi
}

check_socks_port() {
  # Try ss first, fall back to netstat
  local port="${TRI_TOR_SOCKS_PORT:-9050}"
  local listening=0
  if command -v ss >/dev/null 2>&1; then
    if ss -ltn 2>/dev/null | grep -q ":$port "; then
      listening=1
    fi
  elif command -v netstat >/dev/null 2>&1; then
    if netstat -ltn 2>/dev/null | grep -q ":$port "; then
      listening=1
    fi
  fi
  if [ "$listening" -eq 1 ]; then
    record "info" "socks-port" "port $port listening"
  else
    record "warn" "socks-port" "port $port not listening"
  fi
}

check_wallet() {
  local wallet="$DATA_DIR/wallet.dat"
  if [ ! -e "$wallet" ]; then
    record "info" "wallet" "no wallet.dat (will be created on first use)"
    return
  fi
  if [ -d "$wallet" ]; then
    record "fail-fatal" "wallet-is-directory" "$wallet is a directory"
    return
  fi
  local size
  size=$(stat -c%s "$wallet" 2>/dev/null || echo 0)
  if [ "$size" -lt 1024 ]; then
    record "warn" "wallet-tiny" "$wallet is only $size bytes — likely truncated"
    return
  fi
  record "info" "wallet" "$wallet ($size bytes)"
}

check_chain() {
  local blk="$DATA_DIR/blk0001.dat"
  if [ ! -e "$blk" ]; then
    record "warn" "chain-blocks-missing" "$blk does not exist — bootstrap needed"
    return
  fi
  if [ -d "$blk" ]; then
    record "fail-fatal" "chain-blocks-is-directory" "$blk is a directory"
    return
  fi
  local size
  size=$(stat -c%s "$blk" 2>/dev/null || echo 0)
  if [ "$size" -lt 1024 ]; then
    record "warn" "chain-blocks-tiny" "$blk is only $size bytes"
    return
  fi
  record "info" "chain-blocks" "$blk ($size bytes)"
}

check_disk_space() {
  local mount="${DATA_DIR:-/tri}"
  if ! command -v df >/dev/null 2>&1; then
    record "warn" "disk-space" "df not available"
    return
  fi
  local avail_gb
  avail_gb=$(df -BG "$mount" 2>/dev/null | tail -1 | awk '{print $4}' | tr -d 'G')
  if [ -z "$avail_gb" ]; then
    record "warn" "disk-space" "could not determine free space on $mount"
    return
  fi
  if [ "$avail_gb" -lt 1 ]; then
    record "fail-fatal" "disk-space-critical" "less than 1G free on $mount"
  elif [ "$avail_gb" -lt 5 ]; then
    record "warn" "disk-space-low" "${avail_gb}G free on $mount"
  else
    record "info" "disk-space" "${avail_gb}G free on $mount"
  fi
}

check_restart_loop_cleanups() {
  if [ ! -f "$RESTART_CLEANUP_LOG" ]; then
    record "info" "restart-cleanups" "no cleanup events recorded"
    return
  fi
  local recent_count
  recent_count=$(tail -100 "$RESTART_CLEANUP_LOG" 2>/dev/null | wc -l)
  if [ "$recent_count" -gt 50 ]; then
    record "warn" "restart-cleanups-frequent" \
      "$recent_count cleanup events in recent log — restart loop is firing often"
  else
    record "info" "restart-cleanups" "$recent_count cleanup events recorded"
  fi
}

check_healthcheck_file() {
  if [ -f "$READY_FILE" ]; then
    record "info" "ready-marker" "node-ready exists — healthcheck will pass"
  else
    record "warn" "ready-marker-missing" \
      "node-ready file not present — Docker healthcheck will report unhealthy"
  fi
}

# ─── Main ───────────────────────────────────────────────────────────────────

for arg in "$@"; do
  case "$arg" in
    --json)  JSON_MODE=1 ;;
    --quiet) QUIET=1 ;;
    -h|--help)
      cat <<EOF
tridock-doctor.sh — diagnostic inspection for containerized TRIdock nodes

Usage:
  tridock-doctor.sh           human-readable report
  tridock-doctor.sh --json    JSON output for monitoring
  tridock-doctor.sh --quiet   suppress findings, print summary only

Exit codes:
  0  clean
  1  warning
  2  fail-recoverable
  3  fail-fatal

Environment overrides:
  TRI_DATA_DIR    (default /tri/data)
  TRI_STATE_DIR   (default /tri/state)
  TRI_BIN_DIR     (default /tri/data/bin)
  TRI_TOR_SOCKS_PORT  (default 9050)
EOF
      exit 0
      ;;
  esac
done

# Run all checks
check_status_file
check_binary
check_daemon_running
check_tor_state
check_tor_running
check_socks_port
check_wallet
check_chain
check_disk_space
check_restart_loop_cleanups
check_healthcheck_file

# ─── Output ─────────────────────────────────────────────────────────────────

print_json_output() {
  printf "{\n"
  printf "  \"exit_code\": %d,\n" "$EXIT_CODE"
  printf "  \"data_dir\": \"%s\",\n" "$DATA_DIR"
  printf "  \"state_dir\": \"%s\",\n" "$STATE_DIR"
  printf "  \"findings\": [\n"
  local first=1
  for f in "${FINDINGS[@]}"; do
    if [ "$first" -eq 1 ]; then
      printf "    %s\n" "$f"
      first=0
    else
      printf "    ,\n    %s\n" "$f"
    fi
  done
  printf "  ]\n"
  printf "}\n"
}

print_human_output() {
  echo "TRIdock Diagnostic Report"
  echo "========================="
  echo "Data dir:  $DATA_DIR"
  echo "State dir: $STATE_DIR"
  echo ""
  local severity check detail
  for f in "${FINDINGS[@]}"; do
    severity=$(echo "$f" | sed -n 's/.*"severity":"\([^"]*\)".*/\1/p')
    check=$(echo "$f"    | sed -n 's/.*"check":"\([^"]*\)".*/\1/p')
    detail=$(echo "$f"   | sed -n 's/.*"detail":"\([^"]*\)".*/\1/p')
    print_human "$severity" "$check" "$detail"
  done

  case "$EXIT_CODE" in
    0) echo ""; echo "Status: ✓ clean" ;;
    1) echo ""; echo "Status: ⚠ warnings present" ;;
    2) echo ""; echo "Status: ✗ fail-recoverable (entrypoint restart may fix)" ;;
    3) echo ""; echo "Status: ✗✗ fail-fatal (manual intervention required)" ;;
  esac
}

if [ "$JSON_MODE" -eq 1 ]; then
  print_json_output
else
  if [ "$QUIET" -eq 0 ]; then
    print_human_output
  else
    case "$EXIT_CODE" in
      0) echo "OK" ;;
      1) echo "WARN" ;;
      2) echo "FAIL-RECOVERABLE" ;;
      3) echo "FAIL-FATAL" ;;
    esac
  fi
fi

exit "$EXIT_CODE"