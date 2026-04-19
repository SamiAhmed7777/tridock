#!/bin/bash
# TRIdock — Containerized Triangles node/wallet appliance
# Lessons learned: https://github.com/SamiAhmed7777/tridock/blob/master/LESSONS_LEARNED.md
set -Eeuo pipefail

# ═══════════════════════════════════════════════════════════════════════════════
# Configuration
# ═══════════════════════════════════════════════════════════════════════════════

MODE="${TRI_MODE:-full}"
NODE_TYPE="${TRI_NODE_TYPE:-full}"
NODE_NAME="${TRI_NODE_NAME:-tridock}"
DATA_DIR="${TRI_DATA_DIR:-/tri/data}"
BOOTSTRAP_DIR="${TRI_BOOTSTRAP_DIR:-/tri/bootstrap}"
BIN_DIR="${TRI_BIN_DIR:-/tri/data/bin}"
LIB_DIR="${TRI_LIB_DIR:-/tri/lib}"
CACHE_DIR="${TRI_CACHE_DIR:-/tri/cache}"
BACKUPS_DIR="${TRI_BACKUPS_DIR:-/tri/backups}"
CONFIG_DIR="${TRI_CONFIG_DIR:-/tri/config}"
UI_DATA_DIR="${TRI_UI_DATA_DIR:-/tri/ui-data}"
LOGS_DIR="${TRI_LOGS_DIR:-/tri/logs}"
STATE_DIR="${TRI_STATE_DIR:-/tri/state}"

# Instance identity
TRI_INSTANCE_ID="${TRI_INSTANCE_ID:-$NODE_NAME}"
TRI_WALLET_ID="${TRI_WALLET_ID:-default}"
TRI_ROLE="${TRI_ROLE:-wallet}"

# Feature flags
TRI_ENABLE_WRITE_OPS="${TRI_ENABLE_WRITE_OPS:-0}"
TRI_ALLOW_SEND_BROADCAST="${TRI_ALLOW_SEND_BROADCAST:-0}"
TRI_ALLOW_WALLET_UNLOCK="${TRI_ALLOW_WALLET_UNLOCK:-0}"
TRI_ALLOW_RESEED="${TRI_ALLOW_RESEED:-0}"
TRI_ALLOW_BACKUP_EXPORT="${TRI_ALLOW_BACKUP_EXPORT:-1}"
TRI_WALLET_EXPORT_PATH="${TRI_WALLET_EXPORT_PATH:-$DATA_DIR/wallet.dat}"
TRI_ADMIN_ACTION="${TRI_ADMIN_ACTION:-}"

# Binary management
TRI_BIN="${TRI_BIN:-$BIN_DIR/trianglesd}"
TRI_VERSION="${TRI_VERSION:-5.7.7}"
TRI_RELEASE_BASE_URL="${TRI_RELEASE_BASE_URL:-https://github.com/SamiAhmed7777/triangles_v5/releases/download}"
TRI_RELEASE_FILENAME="${TRI_RELEASE_FILENAME:-}"
TRI_RELEASE_URL="${TRI_RELEASE_URL:-}"
TRI_BIN_DOWNLOAD_URL="${TRI_BIN_DOWNLOAD_URL:-$TRI_RELEASE_URL}"
TRI_BIN_FALLBACK_URLS="${TRI_BIN_FALLBACK_URLS:-}"
TRI_BIN_SHA256="${TRI_BIN_SHA256:-}"

# Network
TRI_PORT="${TRI_PORT:-24112}"
MAX_CONNECTIONS="${TRI_MAX_CONNECTIONS:-64}"
DBCACHE="${TRI_DBCACHE:-512}"
RPC_USER="${TRI_RPCUSER:-tri}"
RPC_PASSWORD="${TRI_RPCPASSWORD:-tri}"
RPC_PORT="${TRI_RPCPORT:-19112}"
ADDNODE="${TRI_ADDNODE:-}"
EXTERNAL_IP="${TRI_EXTERNAL_IP:-}"
EXTRA_ARGS="${TRI_EXTRA_ARGS:-}"

# Bootstrap
BOOTSTRAP_ENABLED="${TRI_BOOTSTRAP_ENABLED:-1}"
PREFER_BOOTSTRAP="${TRI_PREFER_BOOTSTRAP:-1}"
BOOTSTRAP_TIMEOUT="${TRI_BOOTSTRAP_TIMEOUT:-30}"
BOOTSTRAP_MIN_BLOCK_BYTES="${TRI_BOOTSTRAP_MIN_BLOCK_BYTES:-100000000}"
BOOTSTRAP_MIN_LDB_COUNT="${TRI_BOOTSTRAP_MIN_LDB_COUNT:-300}"
BOOTSTRAP_ACTIVE=0

# Tor
TOR_ENABLED="${TRI_TOR_ENABLED:-1}"
TOR_SOCKS_PORT="${TRI_TOR_SOCKS_PORT:-9050}"

# Staking/SMSG
STAKE_ENABLED="${TRI_STAKE_ENABLED:-0}"
SMSG_ENABLED="${TRI_SMSG_ENABLED:-1}"
SMSG_SCAN_CHAIN="${TRI_SMSG_SCAN_CHAIN:-0}"

# Seed mode
SEED_MODE="${TRI_SEED_MODE:-0}"
TRI_SEED_ISOLATION="${TRI_SEED_ISOLATION:-0}"
TRI_SEED_TRUSTED_PEERS="${TRI_SEED_TRUSTED_PEERS:-}"
TRI_SEED_DISABLE_DISCOVERY="${TRI_SEED_DISABLE_DISCOVERY:-0}"
SEED_STARTUP_DELAY="${TRI_SEED_STARTUP_DELAY:-0}"

# Canonical verification
CANONICAL_RPC_URL="${TRI_CANONICAL_RPC_URL:-}"
CANONICAL_RPC_USER="${TRI_CANONICAL_RPC_USER:-}"
CANONICAL_RPC_PASSWORD="${TRI_CANONICAL_RPC_PASSWORD:-}"
CANONICAL_VERIFY_ATTEMPTS="${TRI_CANONICAL_VERIFY_ATTEMPTS:-20}"
CANONICAL_VERIFY_INTERVAL="${TRI_CANONICAL_VERIFY_INTERVAL:-30}"
CANONICAL_REQUIRED_MATCHES="${TRI_CANONICAL_REQUIRED_MATCHES:-2}"
AUTO_RESEED_ON_FORK="${TRI_AUTO_RESEED_ON_FORK:-0}"

# Recovery
RECOVERY_PERFORMED=0
MAX_RESTART_RETRIES=10
RESTART_DELAY=5

# Derived paths
CONF_FILE="$DATA_DIR/triangles.conf"
BOOTSTRAP_FILE="$BOOTSTRAP_DIR/bootstrap.tar.gz"
TOR_LOG="/tmp/tor.log"
STATUS_FILE="$STATE_DIR/status"
STATUS_REASON_FILE="$STATE_DIR/reason"
BOOTSTRAP_PROGRESS_FILE="$STATE_DIR/bootstrap-progress"
BOOTSTRAP_SOURCE_FILE="$STATE_DIR/bootstrap-source"
CANONICAL_STATUS_FILE="$STATE_DIR/canonical-status"
CANONICAL_HEIGHT_FILE="$STATE_DIR/canonical-height"
CANONICAL_HASH_FILE="$STATE_DIR/canonical-bestblock"
LOCAL_HEIGHT_FILE="$STATE_DIR/local-height"
LOCAL_HASH_FILE="$STATE_DIR/local-bestblock"
TRI_READY_FILE="$STATE_DIR/node-ready"
INSTANCE_ID_FILE="$STATE_DIR/instance-id"
WALLET_ID_FILE="$STATE_DIR/wallet-id"
ROLE_FILE="$STATE_DIR/role"
CAPABILITIES_FILE="$STATE_DIR/capabilities.json"
PATHS_FILE="$STATE_DIR/paths.json"
WALLET_EXPORT_FILE="$STATE_DIR/wallet-export-path"

SOCKS_PORT="${TOR_SOCKS_PORT:-9050}"
TRI_PID=""
UI_PID=""

DEFAULT_BOOTSTRAP_SOURCES=(
  "https://bootstrap.cryptographic-triangles.org/triangles-bootstrap.tar.gz"
  "https://bootstrap.cryptographic-triangles.org/tri-bootstrap.tar.gz"
  "http://bootstrap.cryptographic-triangles.org/triangles-bootstrap.tar.gz"
  "http://bootstrap.cryptographic-triangles.org/tri-bootstrap.tar.gz"
)

# ═══════════════════════════════════════════════════════════════════════════════
# Logging and state
# ═══════════════════════════════════════════════════════════════════════════════

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] [$NODE_NAME] $*"; }
warn() { log "WARN: $*"; }

fail() {
  local msg="$*"
  set_status "error" "$msg"
  log "ERROR: $msg"
  exit 1
}

set_status() {
  local state="$1" reason="${2:-}"
  mkdir -p "$STATE_DIR"
  printf '%s\n' "$state" > "$STATUS_FILE"
  printf '%s\n' "$reason" > "$STATUS_REASON_FILE"
}

set_bootstrap_source() {
  printf '%s\n' "${1:-}" > "$BOOTSTRAP_SOURCE_FILE"
}

write_bootstrap_progress() {
  printf '%s\n' "${1:-unknown}" > "$BOOTSTRAP_PROGRESS_FILE"
}

clear_bootstrap_progress() { rm -f "$BOOTSTRAP_PROGRESS_FILE"; }
mark_ready() { mkdir -p "$STATE_DIR"; touch "$TRI_READY_FILE"; }
clear_ready() { rm -f "$TRI_READY_FILE"; }

write_state_value() {
  mkdir -p "$STATE_DIR"
  printf '%s\n' "${2:-}" > "$1"
}

write_json_file() {
  mkdir -p "$(dirname "$1")"
  printf '%s\n' "$2" > "$1"
}

# ═══════════════════════════════════════════════════════════════════════════════
# State initialization and metadata publishing
# ═══════════════════════════════════════════════════════════════════════════════

publish_static_metadata() {
  write_state_value "$INSTANCE_ID_FILE" "$TRI_INSTANCE_ID"
  write_state_value "$WALLET_ID_FILE" "$TRI_WALLET_ID"
  write_state_value "$ROLE_FILE" "$TRI_ROLE"
  write_state_value "$WALLET_EXPORT_FILE" "$TRI_WALLET_EXPORT_PATH"

  local onion_addr=""
  if [ -f "$STATE_DIR/onion-address" ]; then
    onion_addr=$(cat "$STATE_DIR/onion-address" 2>/dev/null | tr -d ' \n')
  elif [ -f "/tri/tor/node/hostname" ]; then
    onion_addr=$(cat /tri/tor/node/hostname 2>/dev/null | tr -d ' \n')
  fi

  write_json_file "$CAPABILITIES_FILE" "$(jq -cn \
    --arg instanceId "$TRI_INSTANCE_ID" \
    --arg walletId "$TRI_WALLET_ID" \
    --arg role "$TRI_ROLE" \
    --arg mode "$MODE" \
    --argjson writeOps "$([ "$TRI_ENABLE_WRITE_OPS" = "1" ] && echo true || echo false)" \
    --argjson sendEnabled "$([ "$TRI_ALLOW_SEND_BROADCAST" = "1" ] && echo true || echo false)" \
    --argjson unlockEnabled "$([ "$TRI_ALLOW_WALLET_UNLOCK" = "1" ] && echo true || echo false)" \
    --argjson reseedAllowed "$([ "$TRI_ALLOW_RESEED" = "1" ] && echo true || echo false)" \
    --argjson backupEnabled "$([ "$TRI_ALLOW_BACKUP_EXPORT" = "1" ] && echo true || echo false)" \
    --argjson canonicalCheck "$([ -n "$CANONICAL_RPC_URL" ] && echo true || echo false)" \
    --argjson seedMode "$([ "$SEED_MODE" = "1" ] && echo true || echo false)" \
    --argjson seedIsolation "$([ "$TRI_SEED_ISOLATION" = "1" ] && echo true || echo false)" \
    --argjson seedDisableDiscovery "$([ "$TRI_SEED_DISABLE_DISCOVERY" = "1" ] && echo true || echo false)" \
    --arg onionAddress "$onion_addr" \
    --argjson smsgEnabled "$([ "$SMSG_ENABLED" = "1" ] && echo true || echo false)" \
    '{instanceId:$instanceId,walletId:$walletId,role:$role,mode:$mode,writeOps:$writeOps,sendEnabled:$sendEnabled,unlockEnabled:$unlockEnabled,reseedAllowed:$reseedAllowed,backupEnabled:$backupEnabled,canonicalCheck:$canonicalCheck,seedMode:$seedMode,seedIsolation:$seedIsolation,seedDisableDiscovery:$seedDisableDiscovery,onionAddress:$onionAddress,smsgEnabled:$smsgEnabled}')"

  write_json_file "$PATHS_FILE" "$(jq -cn \
    --arg data "$DATA_DIR" \
    --arg bootstrap "$BOOTSTRAP_DIR" \
    --arg cache "$CACHE_DIR" \
    --arg state "$STATE_DIR" \
    --arg backups "$BACKUPS_DIR" \
    --arg config "$CONFIG_DIR" \
    --arg uiData "$UI_DATA_DIR" \
    --arg logs "$LOGS_DIR" \
    --arg exportPath "$TRI_WALLET_EXPORT_PATH" \
    '{data:$data,bootstrap:$bootstrap,cache:$cache,state:$state,backups:$backups,config:$config,uiData:$uiData,logs:$logs,exportPath:$exportPath}')"
}

init_state_dir() {
  mkdir -p "$STATE_DIR"
  : > "$STATUS_FILE"
  : > "$STATUS_REASON_FILE"
  rm -f "$BOOTSTRAP_PROGRESS_FILE" "$BOOTSTRAP_SOURCE_FILE" \
        "$CANONICAL_STATUS_FILE" "$CANONICAL_HEIGHT_FILE" "$CANONICAL_HASH_FILE" \
        "$LOCAL_HEIGHT_FILE" "$LOCAL_HASH_FILE" "$TRI_READY_FILE"
  publish_static_metadata
}

# ═══════════════════════════════════════════════════════════════════════════════
# Cleanup trap
# ═══════════════════════════════════════════════════════════════════════════════

cleanup() {
  if [ -n "$TRI_PID" ] && kill -0 "$TRI_PID" >/dev/null 2>&1; then
    set_status "stopping" "Stopping trianglesd"
    log "Stopping trianglesd..."
    kill -TERM "$TRI_PID" >/dev/null 2>&1 || true
    wait "$TRI_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

# ═══════════════════════════════════════════════════════════════════════════════
# Tor management — FIXED: proper port detection, no infinite loops
# ═══════════════════════════════════════════════════════════════════════════════

find_available_port() {
  # Find an available port starting from the given port number
  local port="${1:-9050}"
  local max_port=$((port + 100))
  while [ "$port" -lt "$max_port" ]; do
    if ! ss -tlnp 2>/dev/null | grep -q ":${port}\b"; then
      echo "$port"
      return 0
    fi
    port=$((port + 1))
  done
  return 1
}

resolve_tor_port() {
  if ! command -v ss >/dev/null 2>&1; then
    warn "ss not available — using default Tor SOCKS port $TOR_SOCKS_PORT"
    SOCKS_PORT="$TOR_SOCKS_PORT"
    return 0
  fi
  local resolved_port
  if resolved_port=$(find_available_port "$TOR_SOCKS_PORT"); then
    SOCKS_PORT="$resolved_port"
    log "Tor SOCKS port resolved to $SOCKS_PORT"
    return 0
  fi
  warn "Could not find available port near $TOR_SOCKS_PORT"
  return 1
}

start_tor() {
  [ "$TOR_ENABLED" = "1" ] || return 0

  if pgrep -x tor >/dev/null 2>&1; then
    log "Tor already running"
    return 0
  fi

  log "Starting Tor with hidden service (SOCKS port ${SOCKS_PORT})..."
  mkdir -p /tri/tor
  chmod 700 /tri/tor 2>/dev/null || true

  cat > /tri/tor/torrc <<TORRC
SocksPort ${SOCKS_PORT}
HiddenServiceDir /tri/tor/node
HiddenServicePort 24112 127.0.0.1:24112
HiddenServiceVersion 3
TORRC

  tor --RunAsDaemon 1 -f /tri/tor/torrc --DataDirectory /tri/tor >"$TOR_LOG" 2>&1
  sleep 5

  if ! pgrep -x tor >/dev/null 2>&1; then
    warn "Tor failed to start. Continuing without Tor — node may have reduced connectivity."
    return 1
  fi

  log "Tor running. Waiting for onion address..."
  local onion_file="/tri/tor/node/hostname"
  local attempts=0
  while [ "$attempts" -lt 40 ]; do
    if [ -f "$onion_file" ] && [ -s "$onion_file" ]; then
      local onion_addr
      onion_addr=$(cat "$onion_file" 2>/dev/null | tr -d ' \n')
      if [ -n "$onion_addr" ]; then
        log "Tor onion address: $onion_addr"
        echo "$onion_addr" > "$STATE_DIR/onion-address"
        return 0
      fi
    fi
    sleep 1
    attempts=$((attempts + 1))
  done

  warn "Onion address not published after 40s. Tor is running but hidden service may still be initializing."
  return 0
}

# ═══════════════════════════════════════════════════════════════════════════════
# Binary management — FIXED: return 0 on success, proper flow control
# ═══════════════════════════════════════════════════════════════════════════════

resolve_tri_release_inputs() {
  if [ -z "$TRI_RELEASE_URL" ]; then
    if [ -z "$TRI_RELEASE_FILENAME" ]; then
      TRI_RELEASE_FILENAME="cryptographic-triangles-daemon_${TRI_VERSION}_amd64.deb"
    fi
    TRI_RELEASE_URL="${TRI_RELEASE_BASE_URL}/v${TRI_VERSION}/${TRI_RELEASE_FILENAME}"
    TRI_BIN_DOWNLOAD_URL="${TRI_BIN_DOWNLOAD_URL:-$TRI_RELEASE_URL}"
  fi
  [ -z "$TRI_RELEASE_FILENAME" ] && TRI_RELEASE_FILENAME="$(basename "$TRI_RELEASE_URL")"
  [ -z "$TRI_BIN_DOWNLOAD_URL" ] && TRI_BIN_DOWNLOAD_URL="$TRI_RELEASE_URL"
}
resolve_tri_release_inputs

verify_sha256() {
  local file="$1" expected="$2"
  [ -z "$expected" ] && return 0
  local actual
  actual=$(sha256sum "$file" | awk '{print $1}')
  [ "$actual" = "$expected" ]
}

find_extracted_binary() {
  find "$1" -type f -path '*/usr/lib/cryptographic-triangles/trianglesd' 2>/dev/null | head -n 1
}

install_from_archive() {
  local archive="$1"
  local tmpdir extract_root data_tar
  tmpdir=$(mktemp -d "$CACHE_DIR/tri-extract.XXXXXX")
  extract_root="$tmpdir/root"
  mkdir -p "$extract_root"

  case "$archive" in
    *.deb)
      bsdtar -xf "$archive" -C "$tmpdir" 2>/dev/null || { rm -rf "$tmpdir"; return 1; }
      data_tar=$(find "$tmpdir" -maxdepth 1 -type f \( -name 'data.tar.*' -o -name 'data.tar' \) | head -n 1)
      [ -n "$data_tar" ] || { rm -rf "$tmpdir"; return 1; }
      case "$data_tar" in
        *.xz)  tar -xJf "$data_tar" -C "$extract_root" ;;
        *.gz)  tar -xzf "$data_tar" -C "$extract_root" ;;
        *.zst) tar --zstd -xf "$data_tar" -C "$extract_root" ;;
        *)     tar -xf "$data_tar" -C "$extract_root" ;;
      esac
      ;;
    *.tar.gz|*.tgz)
      tar xzf "$archive" -C "$extract_root" || { rm -rf "$tmpdir"; return 1; }
      ;;
    *.tar.xz)
      tar xJf "$archive" -C "$extract_root" || { rm -rf "$tmpdir"; return 1; }
      ;;
    *)
      rm -rf "$tmpdir"
      return 1
      ;;
  esac

  local extracted_bin
  extracted_bin=$(find_extracted_binary "$extract_root")

  if [ -z "$extracted_bin" ]; then
    # Try finding any trianglesd binary
    extracted_bin=$(find "$extract_root" -type f -name trianglesd 2>/dev/null | head -n 1)
  fi

  if [ -z "$extracted_bin" ]; then
    rm -rf "$tmpdir"
    return 1
  fi

  mkdir -p "$BIN_DIR" "$LIB_DIR"

  # Copy runtime tree if it exists (for wrapper-style installs)
  local runtime_root="$extract_root/usr/lib/cryptographic-triangles"
  if [ -d "$runtime_root" ]; then
    mkdir -p "$BIN_DIR/runtime"
    cp -a "$runtime_root/." "$BIN_DIR/runtime/"
  fi

  # Copy shared libraries
  find "$extract_root" -type f \( -name '*.so' -o -name '*.so.*' \) -exec cp -f {} "$LIB_DIR/" \; 2>/dev/null || true

  cp -f "$extracted_bin" "$TRI_BIN"
  chmod +x "$TRI_BIN"

  # If binary is a wrapper script pointing at runtime tree, rewrite it
  if grep -q '/usr/lib/cryptographic-triangles/trianglesd' "$TRI_BIN" 2>/dev/null && [ -x "$BIN_DIR/runtime/trianglesd" ]; then
    cat > "$TRI_BIN" <<EOF
#!/bin/bash
export LD_LIBRARY_PATH="$BIN_DIR/runtime/lib:$LIB_DIR:\${LD_LIBRARY_PATH:-}"
exec "$BIN_DIR/runtime/trianglesd" "\$@"
EOF
    chmod +x "$TRI_BIN"
  fi

  log "Installed trianglesd from archive"
  rm -rf "$tmpdir"
  return 0
}

ensure_binary_present() {
  mkdir -p "$BIN_DIR" "$LIB_DIR" "$CACHE_DIR"

  if [ -x "$TRI_BIN" ]; then
    log "Using existing TRI binary at $TRI_BIN"
    return 0
  fi

  # Build URL list
  local urls=()
  [ -n "$TRI_BIN_DOWNLOAD_URL" ] && urls+=("$TRI_BIN_DOWNLOAD_URL")
  if [ -n "$TRI_BIN_FALLBACK_URLS" ]; then
    local IFS=','
    for url in $TRI_BIN_FALLBACK_URLS; do
      [ -n "$url" ] && urls+=("$url")
    done
  fi

  [ ${#urls[@]} -gt 0 ] || fail "trianglesd not found at $TRI_BIN and no download URLs configured"

  for url in "${urls[@]}"; do
    [ -n "$url" ] || continue
    local basename tmpfile
    basename=$(basename "${url%%\?*}")
    [ -n "$basename" ] || basename="triangles-download"
    tmpfile="$CACHE_DIR/$basename"
    rm -f "$tmpfile"

    log "Trying TRI artifact: $url"
    if wget --tries=1 --timeout="$BOOTSTRAP_TIMEOUT" -O "$tmpfile" "$url" 2>/dev/null; then
      if verify_sha256 "$tmpfile" "$TRI_BIN_SHA256"; then
        case "$tmpfile" in
          *.tar.gz|*.tgz|*.tar.xz|*.deb)
            if install_from_archive "$tmpfile"; then
              if [ -x "$TRI_BIN" ]; then
                log "Successfully installed TRI binary from $url"
                return 0
              fi
            fi
            ;;
          *)
            cp -f "$tmpfile" "$TRI_BIN"
            chmod +x "$TRI_BIN"
            if [ -x "$TRI_BIN" ]; then
              log "Successfully installed TRI binary from $url"
              return 0
            fi
            ;;
        esac
        warn "TRI artifact from $url installed but no runnable binary"
      else
        warn "TRI artifact from $url failed SHA256 verification"
      fi
    else
      warn "Failed to fetch TRI artifact from $url"
    fi
  done

  fail "Unable to obtain trianglesd binary"
}

require_binary() {
  ensure_binary_present
  [ -x "$TRI_BIN" ] || fail "trianglesd not found or not executable at $TRI_BIN"
  export LD_LIBRARY_PATH="$LIB_DIR:${LD_LIBRARY_PATH:-}"
}

# ═══════════════════════════════════════════════════════════════════════════════
# Config generation — FIXED: always generates from env, never from archive
# ═══════════════════════════════════════════════════════════════════════════════

write_config() {
  mkdir -p "$DATA_DIR" "$BOOTSTRAP_DIR" "$CACHE_DIR" "$STATE_DIR" "$BACKUPS_DIR" \
           "$CONFIG_DIR" "$UI_DATA_DIR" "$LOGS_DIR" /tri/tor

  # Validate RPC credentials — TRI rejects identical user/password when server=1
  if [ "$RPC_USER" = "$RPC_PASSWORD" ]; then
    fail "RPC user and password must differ (TRI rejects identical credentials with server=1)"
  fi

  cat > "$CONF_FILE" <<CFG
rpcuser=$RPC_USER
rpcpassword=$RPC_PASSWORD
rpcport=$RPC_PORT
server=1
listen=1
daemon=0
printtoconsole=1
maxconnections=$MAX_CONNECTIONS
dbcache=$DBCACHE
CFG

  # Tor configuration — FIXED: onlynet=tor (not onion), dnsseed=0 when Tor-only
  if [ "$TOR_ENABLED" = "1" ]; then
    cat >> "$CONF_FILE" <<CFG
proxy=127.0.0.1:${SOCKS_PORT}
listenonion=1
tor=127.0.0.1:${SOCKS_PORT}
onion=127.0.0.1:${SOCKS_PORT}
onlynet=tor
dnsseed=0
addnode=gxvrhv3qitnc6kobrhsrse46bmcfitnybapor3or3oczzuxn6hfzxyid.onion
addnode=jbpfhe7zw3qm67wy3j2ayysp3mnrjobopthnko3b3sgahqtecblwqmid.onion
addnode=dyamrxgdsq7vids5vpetlfvpga6u54ihgpava5saz5rz2l6fp4sltqyd.onion
addnode=eceyvvunnjx52axziol54mmiqv7nhzpxguzwkpygdh2ip6fpzc3yrjid.onion
addnode=vkwykhwsfxsy33ipnmcj4cnll3i5uhbphpec2dutm5tm6j6kczcubiyd.onion
addnode=uj3xgtr2knr3he2va6v2kj3ingdbghce44kw5pfopjhrto46n3h2yvqd.onion
CFG
  fi

  # Node type
  if [ "$NODE_TYPE" = "spv" ]; then
    cat >> "$CONF_FILE" <<CFG
prune=5000
txindex=0
addressindex=0
spentinfo=0
CFG
    log "Configuring as SPV (pruned) node"
  else
    cat >> "$CONF_FILE" <<CFG
txindex=1
addressindex=1
spentinfo=1
CFG
  fi

  # Staking
  if [ "$STAKE_ENABLED" = "1" ]; then
    echo "staking=1" >> "$CONF_FILE"
  else
    echo "staking=0" >> "$CONF_FILE"
  fi

  # Extra addnodes
  if [ -n "$ADDNODE" ]; then
    local OLDIFS="$IFS"; IFS=','
    for node in $ADDNODE; do
      echo "addnode=$node" >> "$CONF_FILE"
    done
    IFS="$OLDIFS"
  fi

  # External IP
  [ -n "$EXTERNAL_IP" ] && echo "externalip=$EXTERNAL_IP" >> "$CONF_FILE"

  # Seed isolation
  if [ "$SEED_MODE" = "1" ] && [ "$TRI_SEED_ISOLATION" = "1" ]; then
    rm -f "$DATA_DIR/peers.dat" 2>/dev/null || true
    log "Seed isolation: removed stale peers.dat"
  fi

  # Seed trusted peers
  if [ "$SEED_MODE" = "1" ] && [ -n "$TRI_SEED_TRUSTED_PEERS" ]; then
    local OLDIFS="$IFS"; IFS=','
    for tp in $TRI_SEED_TRUSTED_PEERS; do
      echo "addnode=$tp" >> "$CONF_FILE"
      echo "connect=$tp" >> "$CONF_FILE"
    done
    IFS="$OLDIFS"
    log "Seed mode: using trusted peers"
  fi

  # Mode-specific
  case "$MODE" in
    seed)
      echo "upnp=0" >> "$CONF_FILE"
      if [ "$TRI_SEED_DISABLE_DISCOVERY" = "1" ]; then
        echo "discover=0" >> "$CONF_FILE"
        echo "listen=0" >> "$CONF_FILE"
        log "Seed mode: discovery and listen disabled"
      fi
      ;;
    staking)
      echo "staking=1" >> "$CONF_FILE"
      ;;
  esac

  # Backup copy
  cp -f "$CONF_FILE" "$CONFIG_DIR/triangles.conf"
}

# ═══════════════════════════════════════════════════════════════════════════════
# Wallet integrity check — NEW: detects corruption before daemon start
# ═══════════════════════════════════════════════════════════════════════════════

check_wallet() {
  local wallet="$DATA_DIR/wallet.dat"
  [ -f "$wallet" ] || return 0

  # Basic size check — a real wallet is typically >1KB
  local size
  size=$(stat -c%s "$wallet" 2>/dev/null || echo 0)
  if [ "$size" -lt 1024 ]; then
    warn "wallet.dat is only $size bytes — likely truncated or corrupt"
    local ts="$(date +%Y%m%d-%H%M%S)"
    mv "$wallet" "$wallet.corrupt-$ts"
    warn "Renamed corrupt wallet to wallet.dat.corrupt-$ts. Fresh wallet will be created."
    return 0
  fi

  # BDB header check — valid BDB starts with specific magic bytes
  local header
  header=$(head -c 16 "$wallet" | xxd -p 2>/dev/null || echo "")
  case "$header" in
    00061361*|00053162*) 
      log "Wallet BDB header looks valid"
      ;;
    *)
      warn "Wallet BDB header unexpected: ${header:0:16}... — may be corrupt"
      # Don't auto-rename for unexpected headers, just warn
      ;;
  esac
  return 0
}

# ═══════════════════════════════════════════════════════════════════════════════
# Chain management — FIXED: bootstrap uses clearnet, excludes triangles.conf
# ═══════════════════════════════════════════════════════════════════════════════

chain_present() {
  [ -f "$DATA_DIR/blk0001.dat" ] && [ -s "$DATA_DIR/blk0001.dat" ]
}

chain_looks_sane() {
  chain_present || return 1
  local blk_size
  blk_size=$(stat -c%s "$DATA_DIR/blk0001.dat" 2>/dev/null || echo 0)

  if [ "$NODE_TYPE" = "spv" ]; then
    [ "$blk_size" -ge 1048576 ] || return 1
    return 0
  fi

  [ "$blk_size" -ge "$BOOTSTRAP_MIN_BLOCK_BYTES" ] || return 1
  if [ -d "$DATA_DIR/txleveldb" ]; then
    local ldb_count
    ldb_count=$(find "$DATA_DIR/txleveldb" -name '*.ldb' 2>/dev/null | wc -l)
    [ "$ldb_count" -ge "$BOOTSTRAP_MIN_LDB_COUNT" ] || return 1
  else
    return 1
  fi
  return 0
}

reset_chain_dirs() {
  rm -rf "$DATA_DIR/txleveldb" "$DATA_DIR/database" "$DATA_DIR/blk0001.dat" \
         "$DATA_DIR/peers.dat" "$DATA_DIR/banlist.dat" "$DATA_DIR"/*.log 2>/dev/null || true
}

bootstrap_chain() {
  [ "$BOOTSTRAP_ENABLED" = "1" ] || return 0

  local sources=()
  if [ -n "${TRI_BOOTSTRAP_URLS:-}" ]; then
    local IFS=','
    for s in $TRI_BOOTSTRAP_URLS; do
      [ -n "$s" ] && sources+=("$s")
    done
  else
    sources=("${DEFAULT_BOOTSTRAP_SOURCES[@]}")
  fi

  mkdir -p "$BOOTSTRAP_DIR"
  log "Bootstrapping chain data..."
  set_status "bootstrapping" "Preparing bootstrap"
  BOOTSTRAP_ACTIVE=1
  clear_ready
  clear_bootstrap_progress
  reset_chain_dirs

  for source in "${sources[@]}"; do
    [ -n "$source" ] || continue
    log "Trying bootstrap source: $source"
    set_bootstrap_source "$source"
    write_bootstrap_progress "starting"
    rm -f "$BOOTSTRAP_FILE"

    # FIXED: Bootstrap download always uses clearnet (direct HTTPS)
    # Only .onion sources go through Tor SOCKS proxy
    local wget_proxy_args=""
    if [[ "$source" == *.onion* ]] && [ "$TOR_ENABLED" = "1" ]; then
      wget_proxy_args="--proxy=on --proxy=socks5://127.0.0.1:${SOCKS_PORT}"
    fi

    if wget $wget_proxy_args --progress=dot:giga --show-progress \
         --tries=1 --timeout="$BOOTSTRAP_TIMEOUT" -O "$BOOTSTRAP_FILE" "$source" 2>&1 | while IFS= read -r line; do
      echo "$line"
      case "$line" in
        *%*)
          pct=$(printf '%s\n' "$line" | grep -Eo '[0-9]+%' | tail -n1 || true)
          [ -n "$pct" ] && write_bootstrap_progress "$pct"
          ;;
      esac
    done; then
      log "Download complete. Extracting bootstrap..."
      set_status "bootstrapping" "Extracting bootstrap archive"
      write_bootstrap_progress "extracting"
      reset_chain_dirs

      # FIXED: Always exclude triangles.conf from bootstrap archive
      if tar xzf "$BOOTSTRAP_FILE" -C "$DATA_DIR" --exclude=triangles.conf; then
        rm -f "$BOOTSTRAP_FILE"
        if chain_looks_sane; then
          BOOTSTRAP_ACTIVE=0
          clear_bootstrap_progress
          log "Bootstrap extracted and passed sanity check."
          return 0
        fi
        warn "Extracted bootstrap but chain sanity check failed"
      else
        warn "Extraction failed for bootstrap from $source"
      fi
    else
      warn "Bootstrap download failed: $source"
    fi
  done

  BOOTSTRAP_ACTIVE=0
  clear_bootstrap_progress
  warn "All bootstrap sources failed. Falling back to peer sync."
  return 1
}

# ═══════════════════════════════════════════════════════════════════════════════
# Runtime recovery — FIXED: proper return instead of continue
# ═══════════════════════════════════════════════════════════════════════════════

quarantine_runtime_files() {
  local ts backup_dir
  ts="$(date +%Y%m%d-%H%M%S)"
  backup_dir="$DATA_DIR/recovery-$ts"
  mkdir -p "$backup_dir"

  for path in \
    "$DATA_DIR/peers.dat" "$DATA_DIR/addr.dat" "$DATA_DIR/db.log" \
    "$DATA_DIR/.lock" "$DATA_DIR/__db.001" "$DATA_DIR/__db.002" "$DATA_DIR/__db.003"; do
    [ -e "$path" ] || continue
    mv "$path" "$backup_dir/$(basename "$path")" 2>/dev/null || rm -f "$path" 2>/dev/null || true
  done

  if [ -d "$DATA_DIR/database" ]; then
    mv "$DATA_DIR/database" "$backup_dir/database" 2>/dev/null || rm -rf "$DATA_DIR/database" 2>/dev/null || true
  fi

  log "Quarantined runtime metadata to $backup_dir"
}

attempt_runtime_recovery() {
  [ "$RECOVERY_PERFORMED" = "0" ] || return 1
  RECOVERY_PERFORMED=1
  warn "Attempting one-time runtime recovery after TRI startup failure"
  clear_ready
  set_status "recovering" "Quarantining peer/BDB runtime state"
  quarantine_runtime_files
  return 0
}

# ═══════════════════════════════════════════════════════════════════════════════
# Canonical verification — FIXED: proper return codes, no continue outside loop
# ═══════════════════════════════════════════════════════════════════════════════

rpc_call() {
  local method="$1" params="${2:-[]}"
  local auth_args=() curl_args=(-fsS)

  [ -n "$CANONICAL_RPC_USER" ] && auth_args+=(--user "$CANONICAL_RPC_USER")
  [ -n "$CANONICAL_RPC_PASSWORD" ] && auth_args+=(--password "$CANONICAL_RPC_PASSWORD")

  # Route .onion through Tor SOCKS proxy
  case "$CANONICAL_RPC_URL" in
    *://*.onion:*)
      curl_args+=(--socks5 "127.0.0.1:${SOCKS_PORT}")
      ;;
  esac

  curl "${curl_args[@]}" "${auth_args[@]}" -H 'content-type: application/json' \
    --data "{\"jsonrpc\":\"1.0\",\"id\":\"tridock\",\"method\":\"$method\",\"params\":$params}" \
    "$CANONICAL_RPC_URL" 2>/dev/null
}

json_result() { jq -r '.result // empty' 2>/dev/null; }

verify_canonical_alignment() {
  [ -n "$CANONICAL_RPC_URL" ] || return 0

  local matches=0 attempt=0
  set_status "verifying" "Checking canonical chain alignment"
  write_state_value "$CANONICAL_STATUS_FILE" "verifying"

  while [ "$attempt" -lt "$CANONICAL_VERIFY_ATTEMPTS" ]; do
    attempt=$((attempt + 1))

    local canonical_height canonical_hash local_height local_hash
    canonical_height=$(rpc_call getblockcount | json_result || true)
    canonical_hash=$(rpc_call getbestblockhash | json_result || true)
    local_height=$("$TRI_BIN" -datadir="$DATA_DIR" -conf="$CONF_FILE" \
      -rpcuser="$RPC_USER" -rpcpassword="$RPC_PASSWORD" -rpcport="$RPC_PORT" getblockcount 2>/dev/null || true)
    local_hash=$("$TRI_BIN" -datadir="$DATA_DIR" -conf="$CONF_FILE" \
      -rpcuser="$RPC_USER" -rpcpassword="$RPC_PASSWORD" -rpcport="$RPC_PORT" getbestblockhash 2>/dev/null || true)

    [ -n "$canonical_height" ] && write_state_value "$CANONICAL_HEIGHT_FILE" "$canonical_height"
    [ -n "$canonical_hash" ] && write_state_value "$CANONICAL_HASH_FILE" "$canonical_hash"
    [ -n "$local_height" ] && write_state_value "$LOCAL_HEIGHT_FILE" "$local_height"
    [ -n "$local_hash" ] && write_state_value "$LOCAL_HASH_FILE" "$local_hash"

    if [ -n "$canonical_height" ] && [ -n "$canonical_hash" ] && \
       [ -n "$local_height" ] && [ -n "$local_hash" ] && \
       [ "$canonical_height" = "$local_height" ] && [ "$canonical_hash" = "$local_hash" ]; then
      matches=$((matches + 1))
      log "Canonical check matched ($matches/$CANONICAL_REQUIRED_MATCHES): height=$local_height"
      if [ "$matches" -ge "$CANONICAL_REQUIRED_MATCHES" ]; then
        write_state_value "$CANONICAL_STATUS_FILE" "matched"
        set_status "running" "Canonical chain verified"
        mark_ready
        return 0
      fi
    else
      matches=0
      write_state_value "$CANONICAL_STATUS_FILE" "mismatch"
      set_status "syncing" "Waiting for exact canonical height/hash match"
      log "Canonical mismatch: local=${local_height:-?}/${local_hash:-?} canonical=${canonical_height:-?}/${canonical_hash:-?}"
    fi

    sleep "$CANONICAL_VERIFY_INTERVAL"
  done

  write_state_value "$CANONICAL_STATUS_FILE" "timeout"
  set_status "syncing" "Canonical verification timed out"
  return 2
}

# ═══════════════════════════════════════════════════════════════════════════════
# Node runner — FIXED: max retries, proper exit handling
# ═══════════════════════════════════════════════════════════════════════════════

build_args() {
  TRI_ARGS=(
    "-datadir=$DATA_DIR"
    "-conf=$CONF_FILE"
    "-dbcache=$DBCACHE"
    "-maxconnections=$MAX_CONNECTIONS"
    "-listen=1"
    "-bind=0.0.0.0:$TRI_PORT"
    "-port=$TRI_PORT"
    "-nobootstrap"
    "-printtoconsole"
  )

  if [ "$NODE_TYPE" = "spv" ]; then
    TRI_ARGS+=("-prune=5000" "-txindex=0")
  fi

  if [ "$TOR_ENABLED" != "1" ]; then
    TRI_ARGS+=("-listenonion=0")
  fi

  if [ "$SMSG_ENABLED" = "0" ]; then
    TRI_ARGS+=("-nosmsg")
  elif [ "$SMSG_SCAN_CHAIN" = "1" ]; then
    TRI_ARGS+=("-smsgscanchain")
  fi

  if [ -n "$EXTRA_ARGS" ]; then
    # shellcheck disable=SC2206
    local EXTRA_SPLIT=( $EXTRA_ARGS )
    TRI_ARGS+=("${EXTRA_SPLIT[@]}")
  fi
}

run_node() {
  local retries=0

  while [ "$retries" -lt "$MAX_RESTART_RETRIES" ]; do
    build_args

    # Seed startup delay to prevent simultaneous contamination
    if [ "$SEED_MODE" = "1" ] && [ -n "$SEED_STARTUP_DELAY" ] && [ "$SEED_STARTUP_DELAY" -gt 0 ]; then
      log "Seed mode: waiting ${SEED_STARTUP_DELAY}s before starting..."
      sleep "$SEED_STARTUP_DELAY"
    fi

    set_status "starting" "Launching trianglesd (attempt $((retries + 1))/$MAX_RESTART_RETRIES)"
    log "Starting Triangles node in $MODE mode..."
    "$TRI_BIN" "${TRI_ARGS[@]}" &
    TRI_PID=$!
    sleep 3

    if kill -0 "$TRI_PID" >/dev/null 2>&1; then
      if [ "$BOOTSTRAP_ACTIVE" = "1" ]; then
        set_status "bootstrapping" "Bootstrap complete, node starting"
      elif chain_present; then
        set_status "running" "Node process running"
        mark_ready
      else
        set_status "syncing" "Node running without local chain"
      fi
    fi

    # Canonical verification
    if [ -n "$CANONICAL_RPC_URL" ]; then
      if ! verify_canonical_alignment; then
        if [ "$AUTO_RESEED_ON_FORK" = "1" ] && [ "$TRI_ALLOW_RESEED" = "1" ]; then
          warn "Canonical mismatch — triggering auto-reseed..."
          set_status "resyncing" "Wiping chain for re-bootstrap"
          kill -TERM "$TRI_PID" 2>/dev/null || true
          wait "$TRI_PID" 2>/dev/null || true
          TRI_PID=""
          reset_chain_dirs
          rm -f "$BOOTSTRAP_DIR"/*.tar.gz 2>/dev/null || true
          write_state_value "$CANONICAL_STATUS_FILE" "resyncing"
          log "Reseed complete. Exiting to trigger container restart."
          exit 77
        else
          warn "Canonical verification failed but auto-reseed is disabled"
        fi
      fi
    fi

    # Wait for daemon to exit
    local exit_code=0
    wait "$TRI_PID" || exit_code=$?
    TRI_PID=""

    case "$exit_code" in
      0|143)
        # Clean exit — daemon stopped normally
        log "trianglesd exited cleanly (code $exit_code). Restarting..."
        retries=$((retries + 1))
        sleep "$RESTART_DELAY"
        continue
        ;;
      11)
        # SIGSEGV — try runtime recovery
        warn "trianglesd crashed with SIGSEGV (code 11)"
        if attempt_runtime_recovery; then
          retries=$((retries + 1))
          sleep "$RESTART_DELAY"
          continue
        fi
        ;;
    esac

    warn "trianglesd exited unexpectedly with code $exit_code"
    retries=$((retries + 1))
    sleep "$RESTART_DELAY"
  done

  fail "Max restart retries ($MAX_RESTART_RETRIES) reached. Container stopping."
}

# ═══════════════════════════════════════════════════════════════════════════════
# Admin actions
# ═══════════════════════════════════════════════════════════════════════════════

run_admin_action() {
  local action="${1:-}"
  case "$action" in
    backup-run)
      [ "$TRI_ALLOW_BACKUP_EXPORT" = "1" ] || { echo "Backup not allowed."; return 1; }
      local src="${TRI_WALLET_EXPORT_PATH:-$DATA_DIR/wallet.dat}"
      local ts dest
      ts=$(date +%Y%m%d-%H%M%S)
      mkdir -p "$BACKUPS_DIR"
      cp -f "$src" "$BACKUPS_DIR/wallet-${ts}.dat"
      chmod 600 "$BACKUPS_DIR/wallet-${ts}.dat"
      echo "Backup written to $BACKUPS_DIR/wallet-${ts}.dat"
      ;;
    reseed)
      [ "$TRI_ALLOW_RESEED" = "1" ] || { echo "Reseed not allowed."; return 1; }
      echo "Clearing chain state for re-bootstrap..."
      reset_chain_dirs
      echo "Reseed complete. Container will restart."
      ;;
    *)
      echo "Unknown admin action: $action"
      return 1
      ;;
  esac
}

# ═══════════════════════════════════════════════════════════════════════════════
# Wallet UI
# ═══════════════════════════════════════════════════════════════════════════════

start_wallet_ui() {
  [ -f "$UI_DATA_DIR/server.mjs" ] || { log "No wallet UI found — skipping"; return; }
  log "Starting wallet web UI on port ${PORT:-4177}..."
  cd "$UI_DATA_DIR"
  node server.mjs &
  UI_PID=$!
  log "Wallet web UI started (PID $UI_PID)"
}

# ═══════════════════════════════════════════════════════════════════════════════
# Main entry point — FIXED: clean lifecycle, no continue outside loops
# ═══════════════════════════════════════════════════════════════════════════════

main() {
  init_state_dir
  set_status "initializing" "Preparing TRIdock environment"

  # Admin action shortcut
  if [ -n "$TRI_ADMIN_ACTION" ]; then
    run_admin_action "$TRI_ADMIN_ACTION"
    exit $?
  fi

  # Light mode: no daemon, just wallet UI connecting to remote node
  if [ "$MODE" = "light" ]; then
    log "Light mode — no local daemon, using remote node"
    resolve_tor_port || warn "Tor port resolution failed"
    start_tor
    set_status "running" "Light mode — using remote node"
    mark_ready
    start_wallet_ui
    if [ -n "${UI_PID:-}" ]; then
      wait "$UI_PID"
    fi
    log "Wallet UI exited — container staying alive"
    tail -f /dev/null &
    wait $!
    return 0
  fi

  # Normal mode: install binary, configure, bootstrap, run
  require_binary
  resolve_tor_port || warn "Could not resolve Tor SOCKS port"
  write_config

  # Wallet integrity check before daemon start
  check_wallet

  start_tor

  if ! chain_looks_sane; then
    log "Chain data missing or suspicious."
    bootstrap_chain || true
  else
    log "Existing chain data looks sane. Reusing it."
    set_status "starting" "Reusing existing chain data"
    mark_ready
  fi

  run_node &
  local node_pid=$!
  start_wallet_ui
  wait $node_pid
  log "trianglesd exited — container staying alive for appliance access"
  tail -f /dev/null &
  wait $!
}

main "$@"
