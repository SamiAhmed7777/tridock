#!/bin/bash
# tridock — operator CLI for TRIdock wallet appliance
# Usage: tridock <command>
set -Eeuo pipefail

STATE_DIR="${TRI_STATE_DIR:-/tri/state}"
DATA_DIR="${TRI_DATA_DIR:-/tri/data}"
BACKUPS_DIR="${TRI_BACKUPS_DIR:-/tri/backups}"
CONFIG_DIR="${TRI_CONFIG_DIR:-/tri/config}"
LOGS_DIR="${TRI_LOGS_DIR:-/tri/logs}"
RPC_USER="${TRI_RPCUSER:-tri}"
RPC_PASSWORD="${TRI_RPCPASSWORD:-tri}"
RPC_PORT="${TRI_RPCPORT:-19112}"
TRI_BIN="${TRI_BIN:-/tri/bin/trianglesd}"
CONF_FILE="${TRI_CONF:-/tri/data/triangles.conf}"

# ── helpers ──────────────────────────────────────────────────────────

state() { cat "$STATE_DIR/$1" 2>/dev/null || echo ""; }
json()  { jq -r '.result // empty' 2>/dev/null; }

rpc() {
  curl -fsS -u "$RPC_USER:$RPC_PASSWORD" -H 'content-type: application/json' \
    --data "{\"jsonrpc\":\"1.0\",\"id\":\"tridock\",\"method\":\"$1\",\"params\":$2}" \
    "http://127.0.0.1:$RPC_PORT" 2>/dev/null
}

cmd_status() {
  local status reason instanceId walletId role
  status=$(state status)
  reason=$(state reason)
  instanceId=$(state instance-id)
  walletId=$(state wallet-id)
  role=$(state role)

  echo "=== TRIdock Status ==="
  echo "Instance : ${instanceId:-—}"
  echo "Wallet ID: ${walletId:-—}"
  echo "Role     : ${role:-—}"
  echo "Status   : ${status:-—}"
  echo "Reason   : ${reason:-—}"

  if [ -f "$STATE_DIR/capabilities.json" ]; then
    echo ""
    echo "=== Capabilities ==="
    jq '.' "$STATE_DIR/capabilities.json" 2>/dev/null || cat "$STATE_DIR/capabilities.json"
  fi

  if [ -f "$STATE_DIR/paths.json" ]; then
    echo ""
    echo "=== Paths ==="
    jq '.' "$STATE_DIR/paths.json" 2>/dev/null || cat "$STATE_DIR/paths.json"
  fi

  echo ""
  echo "=== Node State ==="
  echo "Canonical : $(state canonical-status)"
  echo "Canonical H: $(state canonical-height) / $(state canonical-bestblock)"
  echo "Local     H: $(state local-height) / $(state local-bestblock)"
  echo "Bootstrap  : $(state bootstrap-source) [$(state bootstrap-progress)]"

  local height hash conns
  height=$(rpc getblockcount 2>/dev/null | json) || height="unreachable"
  hash=$(rpc getbestblockhash 2>/dev/null | json) || hash="unreachable"
  conns=$(rpc getconnectioncount 2>/dev/null | json) || conns="unreachable"

  echo ""
  echo "=== Live RPC ==="
  echo "Height    : ${height}"
  echo "Best hash : ${hash}"
  echo "Connections: ${conns}"
}

cmd_capabilities() {
  if [ ! -f "$STATE_DIR/capabilities.json" ]; then
    echo "Capabilities file not found — node may not be initialised."
    return 1
  fi
  jq '.' "$STATE_DIR/capabilities.json"
}

cmd_paths() {
  if [ ! -f "$STATE_DIR/paths.json" ]; then
    echo "Paths file not found — node may not be initialised."
    return 1
  fi
  jq '.' "$STATE_DIR/paths.json"
}

cmd_backup_run() {
  local src="${TRI_WALLET_EXPORT_PATH:-$DATA_DIR/wallet.dat}"
  local ts dest
  ts=$(date +%Y%m%d-%H%M%S)
  dest="$BACKUPS_DIR/wallet-${ts}.dat"

  if [ ! -f "$src" ]; then
    echo "ERROR: source wallet not found at $src"
    return 1
  fi

  mkdir -p "$BACKUPS_DIR"
  cp -f "$src" "$dest"
  chmod 600 "$dest"

  local sz hash
  sz=$(stat -c%s "$dest" 2>/dev/null || echo 0)
  hash=$(sha256sum "$dest" 2>/dev/null | awk '{print $1}' || echo "")

  echo "=== Backup Created ==="
  echo "Source : $src"
  echo "Written: $dest"
  echo "Size   : $sz bytes"
  echo "SHA256 : ${hash:-n/a}"
}

cmd_logs() {
  if [ -d "$LOGS_DIR" ]; then
    find "$LOGS_DIR" -type f -name '*.log' | sort | while read -r f; do
      echo "=== $f ==="
      tail -50 "$f"
    done
  else
    echo "No logs directory found."
  fi
}

cmd_help() {
  echo "tridock — TRIdock wallet appliance operator CLI"
  echo ""
  echo "Usage: tridock <command>"
  echo ""
  echo "Commands:"
  echo "  status        — show full appliance status and health"
  echo "  capabilities  — show appliance capability flags"
  echo "  paths         — show appliance volume paths"
  echo "  backup run    — run a wallet backup now"
  echo "  logs          — show recent log entries"
  echo "  help          — show this message"
}

# ── dispatch ─────────────────────────────────────────────────────────

case "${1:-}" in
  status|capabilities|paths|backup|logs|help) ;;
  *)
    echo "Unknown command: ${1:-}"
    echo ""
    cmd_help
    exit 1
    ;;
esac

case "${1:-}" in
  status)       cmd_status ;;
  capabilities) cmd_capabilities ;;
  paths)        cmd_paths ;;
  backup)
    case "${2:-}" in
      run) cmd_backup_run ;;
      *)   echo "Usage: tridock backup run"; exit 1 ;;
    esac
    ;;
  logs) cmd_logs ;;
  help) cmd_help ;;
esac
