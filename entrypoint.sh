#!/bin/bash
set -Eeuo pipefail

MODE="${TRI_MODE:-full}"
NODE_NAME="${TRI_NODE_NAME:-tridock}"
DATA_DIR="${TRI_DATA_DIR:-/tri/data}"
BOOTSTRAP_DIR="${TRI_BOOTSTRAP_DIR:-/tri/bootstrap}"
BIN_DIR="${TRI_BIN_DIR:-/tri/bin}"
LIB_DIR="${TRI_LIB_DIR:-/tri/lib}"
CACHE_DIR="${TRI_CACHE_DIR:-/tri/cache}"
BACKUPS_DIR="${TRI_BACKUPS_DIR:-/tri/backups}"
CONFIG_DIR="${TRI_CONFIG_DIR:-/tri/config}"
UI_DATA_DIR="${TRI_UI_DATA_DIR:-/tri/ui-data}"
LOGS_DIR="${TRI_LOGS_DIR:-/tri/logs}"
TRI_INSTANCE_ID="${TRI_INSTANCE_ID:-$NODE_NAME}"
TRI_WALLET_ID="${TRI_WALLET_ID:-default}"
TRI_ROLE="${TRI_ROLE:-wallet}"
TRI_ENABLE_WRITE_OPS="${TRI_ENABLE_WRITE_OPS:-0}"
TRI_ALLOW_SEND_BROADCAST="${TRI_ALLOW_SEND_BROADCAST:-0}"
TRI_ALLOW_WALLET_UNLOCK="${TRI_ALLOW_WALLET_UNLOCK:-0}"
TRI_ALLOW_RESEED="${TRI_ALLOW_RESEED:-0}"
TRI_ALLOW_BACKUP_EXPORT="${TRI_ALLOW_BACKUP_EXPORT:-1}"
TRI_WALLET_EXPORT_PATH="${TRI_WALLET_EXPORT_PATH:-$DATA_DIR/wallet.dat}"
TRI_ADMIN_ACTION="${TRI_ADMIN_ACTION:-}"
TRI_BIN="${TRI_BIN:-$BIN_DIR/trianglesd}"
TRI_VERSION="${TRI_VERSION:-5.7.6}"
TRI_RELEASE_BASE_URL="${TRI_RELEASE_BASE_URL:-https://github.com/SamiAhmed7777/triangles_v5/releases/download}"
TRI_RELEASE_FILENAME="${TRI_RELEASE_FILENAME:-}"
TRI_RELEASE_URL="${TRI_RELEASE_URL:-}"
TRI_BIN_DOWNLOAD_URL="${TRI_BIN_DOWNLOAD_URL:-$TRI_RELEASE_URL}"
TRI_BIN_FALLBACK_URLS="${TRI_BIN_FALLBACK_URLS:-}"
TRI_BIN_SHA256="${TRI_BIN_SHA256:-}"
TRI_PORT="${TRI_PORT:-24112}"
MAX_CONNECTIONS="${TRI_MAX_CONNECTIONS:-64}"
DBCACHE="${TRI_DBCACHE:-512}"
BOOTSTRAP_TIMEOUT="${TRI_BOOTSTRAP_TIMEOUT:-30}"
BOOTSTRAP_MIN_BLOCK_BYTES="${TRI_BOOTSTRAP_MIN_BLOCK_BYTES:-100000000}"
BOOTSTRAP_MIN_LDB_COUNT="${TRI_BOOTSTRAP_MIN_LDB_COUNT:-300}"
TOR_ENABLED="${TRI_TOR_ENABLED:-1}"
BOOTSTRAP_ENABLED="${TRI_BOOTSTRAP_ENABLED:-1}"
PREFER_BOOTSTRAP="${TRI_PREFER_BOOTSTRAP:-1}"
STAKE_ENABLED="${TRI_STAKE_ENABLED:-0}"
RPC_USER="${TRI_RPCUSER:-tri}"
RPC_PASSWORD="${TRI_RPCPASSWORD:-tri}"
RPC_PORT="${TRI_RPCPORT:-19112}"
ADDNODE="${TRI_ADDNODE:-}"
SEED_MODE="${TRI_SEED_MODE:-0}"
TRI_SEED_ISOLATION="${TRI_SEED_ISOLATION:-0}"
TRI_SEED_TRUSTED_PEERS="${TRI_SEED_TRUSTED_PEERS:-}"
TRI_SEED_DISABLE_DISCOVERY="${TRI_SEED_DISABLE_DISCOVERY:-0}"
EXTERNAL_IP="${TRI_EXTERNAL_IP:-}"
EXTRA_ARGS="${TRI_EXTRA_ARGS:-}"
CANONICAL_RPC_URL="${TRI_CANONICAL_RPC_URL:-}"
CANONICAL_RPC_USER="${TRI_CANONICAL_RPC_USER:-}"
CANONICAL_RPC_PASSWORD="${TRI_CANONICAL_RPC_PASSWORD:-}"
CANONICAL_VERIFY_ATTEMPTS="${TRI_CANONICAL_VERIFY_ATTEMPTS:-20}"
CANONICAL_VERIFY_INTERVAL="${TRI_CANONICAL_VERIFY_INTERVAL:-30}"
CANONICAL_REQUIRED_MATCHES="${TRI_CANONICAL_REQUIRED_MATCHES:-2}"
CONF_FILE="$DATA_DIR/triangles.conf"
BOOTSTRAP_FILE="$BOOTSTRAP_DIR/bootstrap.tar.gz"
TOR_LOG="/tmp/tor.log"
STATE_DIR="${TRI_STATE_DIR:-/tri/state}"
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
BOOTSTRAP_ACTIVE=0
RECOVERY_PERFORMED=0

DEFAULT_BOOTSTRAP_SOURCES=(
  "https://bootstrap.cryptographic-triangles.org/triangles-bootstrap.tar.gz"
  "https://bootstrap.cryptographic-triangles.org/tri-bootstrap.tar.gz"
  "http://bootstrap.cryptographic-triangles.org/triangles-bootstrap.tar.gz"
  "http://bootstrap.cryptographic-triangles.org/tri-bootstrap.tar.gz"
)

TRI_PID=""

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] [$NODE_NAME] $*"; }
warn() { log "WARN: $*"; }
fail() { set_status "error" "$*"; log "ERROR: $*"; exit 1; }

resolve_tri_release_inputs() {
  if [ -z "$TRI_RELEASE_URL" ]; then
    if [ -z "$TRI_RELEASE_FILENAME" ]; then
      TRI_RELEASE_FILENAME="cryptographic-triangles-daemon_${TRI_VERSION}_amd64.deb"
    fi
    TRI_RELEASE_URL="${TRI_RELEASE_BASE_URL}/v${TRI_VERSION}/${TRI_RELEASE_FILENAME}"
    TRI_BIN_DOWNLOAD_URL="${TRI_BIN_DOWNLOAD_URL:-$TRI_RELEASE_URL}"
  fi

  if [ -z "$TRI_RELEASE_FILENAME" ]; then
    TRI_RELEASE_FILENAME="$(basename "$TRI_RELEASE_URL")"
  fi

  if [ -z "$TRI_BIN_DOWNLOAD_URL" ]; then
    TRI_BIN_DOWNLOAD_URL="$TRI_RELEASE_URL"
  fi
}

resolve_tri_release_inputs

write_json_file() {
  local file="$1"
  local content="$2"
  mkdir -p "$(dirname "$file")"
  printf '%s\n' "$content" > "$file"
}

publish_static_metadata() {
  write_state_value "$INSTANCE_ID_FILE" "$TRI_INSTANCE_ID"
  write_state_value "$WALLET_ID_FILE" "$TRI_WALLET_ID"
  write_state_value "$ROLE_FILE" "$TRI_ROLE"
  write_state_value "$WALLET_EXPORT_FILE" "$TRI_WALLET_EXPORT_PATH"

  write_json_file "$CAPABILITIES_FILE" "$(jq -cn \
    --arg instanceId "$TRI_INSTANCE_ID" \
    --arg walletId "$TRI_WALLET_ID" \
    --arg role "$TRI_ROLE" \
    --argjson writeOps $( [ "$TRI_ENABLE_WRITE_OPS" = "1" ] && echo true || echo false ) \
    --argjson sendEnabled $( [ "$TRI_ALLOW_SEND_BROADCAST" = "1" ] && echo true || echo false ) \
    --argjson unlockEnabled $( [ "$TRI_ALLOW_WALLET_UNLOCK" = "1" ] && echo true || echo false ) \
    --argjson reseedAllowed $( [ "$TRI_ALLOW_RESEED" = "1" ] && echo true || echo false ) \
    --argjson backupEnabled $( [ "$TRI_ALLOW_BACKUP_EXPORT" = "1" ] && echo true || echo false ) \
    --argjson canonicalCheck $( [ -n "$CANONICAL_RPC_URL" ] && echo true || echo false ) \
    --argjson seedMode $( [ "$SEED_MODE" = "1" ] && echo true || echo false ) \
    --argjson seedIsolation $( [ "$TRI_SEED_ISOLATION" = "1" ] && echo true || echo false ) \
    --argjson seedDisableDiscovery $( [ "$TRI_SEED_DISABLE_DISCOVERY" = "1" ] && echo true || echo false ) \
    '{instanceId:$instanceId,walletId:$walletId,role:$role,writeOps:$writeOps,sendEnabled:$sendEnabled,unlockEnabled:$unlockEnabled,reseedAllowed:$reseedAllowed,backupEnabled:$backupEnabled,canonicalCheck:$canonicalCheck,seedMode:$seedMode,seedIsolation:$seedIsolation,seedDisableDiscovery:$seedDisableDiscovery}')"

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
  rm -f "$BOOTSTRAP_PROGRESS_FILE" "$BOOTSTRAP_SOURCE_FILE" "$CANONICAL_STATUS_FILE" "$CANONICAL_HEIGHT_FILE" "$CANONICAL_HASH_FILE" "$LOCAL_HEIGHT_FILE" "$LOCAL_HASH_FILE" "$TRI_READY_FILE"
  publish_static_metadata
}

set_status() {
  local state="$1"
  local reason="${2:-}"
  mkdir -p "$STATE_DIR"
  printf '%s\n' "$state" > "$STATUS_FILE"
  printf '%s\n' "$reason" > "$STATUS_REASON_FILE"
}

set_bootstrap_source() {
  local source="${1:-}"
  mkdir -p "$STATE_DIR"
  printf '%s\n' "$source" > "$BOOTSTRAP_SOURCE_FILE"
}

clear_bootstrap_progress() {
  rm -f "$BOOTSTRAP_PROGRESS_FILE"
}

write_bootstrap_progress() {
  local value="${1:-unknown}"
  mkdir -p "$STATE_DIR"
  printf '%s\n' "$value" > "$BOOTSTRAP_PROGRESS_FILE"
}

mark_ready() {
  mkdir -p "$STATE_DIR"
  touch "$TRI_READY_FILE"
}

clear_ready() {
  rm -f "$TRI_READY_FILE"
}

write_state_value() {
  local file="$1"
  local value="${2:-}"
  mkdir -p "$STATE_DIR"
  printf '%s\n' "$value" > "$file"
}

rpc_call() {
  local method="$1"
  local params="${2:-[]}"
  local auth_args=()
  [ -n "$CANONICAL_RPC_USER" ] && auth_args+=(--user "$CANONICAL_RPC_USER")
  [ -n "$CANONICAL_RPC_PASSWORD" ] && auth_args+=(--password "$CANONICAL_RPC_PASSWORD")
  curl -fsS "${auth_args[@]}" -H 'content-type: application/json' \
    --data "{\"jsonrpc\":\"1.0\",\"id\":\"tridock\",\"method\":\"$method\",\"params\":$params}" \
    "$CANONICAL_RPC_URL"
}

json_result() {
  jq -r '.result // empty'
}

verify_canonical_alignment() {
  [ -n "$CANONICAL_RPC_URL" ] || return 0
  local matches=0 attempt=0 canonical_height canonical_hash local_height local_hash
  set_status "verifying" "Checking canonical chain alignment"
  write_state_value "$CANONICAL_STATUS_FILE" "verifying"

  while [ "$attempt" -lt "$CANONICAL_VERIFY_ATTEMPTS" ]; do
    attempt=$((attempt + 1))

    canonical_height=$(rpc_call getblockcount | json_result 2>/dev/null || true)
    canonical_hash=$(rpc_call getbestblockhash | json_result 2>/dev/null || true)
    local_height=$("$TRI_BIN" -datadir="$DATA_DIR" -conf="$CONF_FILE" -rpcuser="$RPC_USER" -rpcpassword="$RPC_PASSWORD" -rpcport="$RPC_PORT" getblockcount 2>/dev/null || true)
    local_hash=$("$TRI_BIN" -datadir="$DATA_DIR" -conf="$CONF_FILE" -rpcuser="$RPC_USER" -rpcpassword="$RPC_PASSWORD" -rpcport="$RPC_PORT" getbestblockhash 2>/dev/null || true)

    [ -n "$canonical_height" ] && write_state_value "$CANONICAL_HEIGHT_FILE" "$canonical_height"
    [ -n "$canonical_hash" ] && write_state_value "$CANONICAL_HASH_FILE" "$canonical_hash"
    [ -n "$local_height" ] && write_state_value "$LOCAL_HEIGHT_FILE" "$local_height"
    [ -n "$local_hash" ] && write_state_value "$LOCAL_HASH_FILE" "$local_hash"

    if [ -n "$canonical_height" ] && [ -n "$canonical_hash" ] && [ -n "$local_height" ] && [ -n "$local_hash" ] \
      && [ "$canonical_height" = "$local_height" ] && [ "$canonical_hash" = "$local_hash" ]; then
      matches=$((matches + 1))
      log "Canonical check matched ($matches/$CANONICAL_REQUIRED_MATCHES): height=$local_height hash=$local_hash"
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
      log "Canonical check mismatch: local=${local_height:-?}/${local_hash:-?} canonical=${canonical_height:-?}/${canonical_hash:-?}"
    fi

    sleep "$CANONICAL_VERIFY_INTERVAL"
  done

  write_state_value "$CANONICAL_STATUS_FILE" "timeout"
  set_status "syncing" "Canonical verification timed out"
  return 1
}

cleanup() {
  if [ -n "$TRI_PID" ] && kill -0 "$TRI_PID" >/dev/null 2>&1; then
    set_status "stopping" "Stopping trianglesd"
    log "Stopping trianglesd..."
    kill -TERM "$TRI_PID" >/dev/null 2>&1 || true
    wait "$TRI_PID" || true
  fi
}
trap cleanup EXIT INT TERM

quarantine_runtime_files() {
  local ts backup_dir
  ts="$(date +%Y%m%d-%H%M%S)"
  backup_dir="$DATA_DIR/recovery-$ts"
  mkdir -p "$backup_dir"

  for path in \
    "$DATA_DIR/peers.dat" \
    "$DATA_DIR/addr.dat" \
    "$DATA_DIR/db.log" \
    "$DATA_DIR/.lock" \
    "$DATA_DIR/__db.001" \
    "$DATA_DIR/__db.002" \
    "$DATA_DIR/__db.003"; do
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
  set_status "recovering" "Quarantining peer/BDB runtime state after startup failure"
  quarantine_runtime_files
  return 0
}

split_sources() {
  local raw="${TRI_BOOTSTRAP_URLS:-}"
  if [ -n "$raw" ]; then
    IFS=',' read -r -a BOOTSTRAP_SOURCES <<< "$raw"
  else
    BOOTSTRAP_SOURCES=("${DEFAULT_BOOTSTRAP_SOURCES[@]}")
  fi
}

split_binary_sources() {
  local raw="$TRI_BIN_FALLBACK_URLS"
  BINARY_SOURCES=()
  if [ -n "$TRI_BIN_DOWNLOAD_URL" ]; then
    BINARY_SOURCES+=("$TRI_BIN_DOWNLOAD_URL")
  fi
  if [ -n "$raw" ]; then
    IFS=',' read -r -a EXTRA_BINARY_SOURCES <<< "$raw"
    BINARY_SOURCES+=("${EXTRA_BINARY_SOURCES[@]}")
  fi
}

verify_sha256() {
  local file="$1" expected="$2"
  [ -z "$expected" ] && return 0
  local actual
  actual=$(sha256sum "$file" | awk '{print $1}')
  [ "$actual" = "$expected" ]
}

find_extracted_binary() {
  find "$1" -type f -path '*/usr/lib/cryptographic-triangles/trianglesd' | head -n 1
}

find_wrapper_binary() {
  find "$1" -type f -name trianglesd | head -n 1
}

copy_extracted_libs() {
  local src_root="$1"
  mkdir -p "$LIB_DIR"
  find "$src_root" -type f \( -name '*.so' -o -name '*.so.*' \) -print0 | while IFS= read -r -d '' lib; do
    cp -f "$lib" "$LIB_DIR/"
  done
}

install_extracted_runtime_tree() {
  local src_root="$1"
  local runtime_root="$src_root/usr/lib/cryptographic-triangles"
  if [ -d "$runtime_root" ]; then
    mkdir -p "$BIN_DIR/runtime"
    cp -a "$runtime_root/." "$BIN_DIR/runtime/"
  fi
}

install_from_archive() {
  local archive="$1"
  local tmpdir extract_root data_tar old_return_trap
  tmpdir=$(mktemp -d "$CACHE_DIR/tri-extract.XXXXXX")
  extract_root="$tmpdir/root"
  mkdir -p "$extract_root"
  old_return_trap=$(trap -p RETURN || true)
  trap 'rm -rf "$tmpdir"' RETURN

  case "$archive" in
    *.tar.gz|*.tgz)
      tar xzf "$archive" -C "$extract_root"
      ;;
    *.tar.xz)
      tar xJf "$archive" -C "$extract_root"
      ;;
    *.deb)
      bsdtar -xf "$archive" -C "$tmpdir"
      data_tar=$(find "$tmpdir" -maxdepth 1 -type f \( -name 'data.tar.*' -o -name 'data.tar' \) | head -n 1)
      [ -n "$data_tar" ] || fail "No data.tar payload found in deb archive"
      case "$data_tar" in
        *.xz) tar -xJf "$data_tar" -C "$extract_root" ;;
        *.gz) tar -xzf "$data_tar" -C "$extract_root" ;;
        *.zst) tar --zstd -xf "$data_tar" -C "$extract_root" ;;
        *) tar -xf "$data_tar" -C "$extract_root" ;;
      esac
      ;;
    *.zip)
      fail "zip TRI release archives are not supported yet"
      ;;
    *)
      fail "Unknown TRI release archive format: $archive"
      ;;
  esac

  local extracted_bin wrapper_bin
  extracted_bin=$(find_extracted_binary "$extract_root")
  wrapper_bin=$(find_wrapper_binary "$extract_root")

  mkdir -p "$BIN_DIR" "$LIB_DIR"
  install_extracted_runtime_tree "$extract_root"
  copy_extracted_libs "$extract_root"

  if [ -n "$extracted_bin" ]; then
    cp -f "$extracted_bin" "$TRI_BIN"
  elif [ -n "$wrapper_bin" ]; then
    cp -f "$wrapper_bin" "$TRI_BIN"
  else
    fail "No trianglesd binary found in extracted archive"
  fi

  chmod +x "$TRI_BIN"

  if grep -q '/usr/lib/cryptographic-triangles/trianglesd' "$TRI_BIN" 2>/dev/null && [ -x "$BIN_DIR/runtime/trianglesd" ]; then
    cat > "$TRI_BIN" <<EOF
#!/bin/bash
INSTALL_DIR="$BIN_DIR/runtime"
export LD_LIBRARY_PATH="$BIN_DIR/runtime/lib:$LIB_DIR:${LD_LIBRARY_PATH:-}"
exec "$BIN_DIR/runtime/trianglesd" "$@"
EOF
    chmod +x "$TRI_BIN"
  fi

  log "Installed trianglesd from release archive for TRI $TRI_VERSION"

  rm -rf "$tmpdir"
  if [ -n "$old_return_trap" ]; then
    eval "$old_return_trap"
  else
    trap - RETURN
  fi
}

ensure_binary_present() {
  mkdir -p "$BIN_DIR" "$LIB_DIR" "$CACHE_DIR"
  if [ -x "$TRI_BIN" ]; then
    log "Using existing TRI binary at $TRI_BIN"
    return 0
  fi

  split_binary_sources
  [ ${#BINARY_SOURCES[@]} -gt 0 ] || fail "trianglesd not found at $TRI_BIN and no download URLs configured"

  local url tmpfile basename
  for url in "${BINARY_SOURCES[@]}"; do
    [ -n "$url" ] || continue
    basename=$(basename "${url%%\?*}")
    [ -n "$basename" ] || basename="triangles-download"
    tmpfile="$CACHE_DIR/$basename"
    rm -f "$tmpfile"
    log "Trying TRI artifact source: $url"
    if wget --tries=1 --timeout="$BOOTSTRAP_TIMEOUT" -O "$tmpfile" "$url"; then
      if verify_sha256 "$tmpfile" "$TRI_BIN_SHA256"; then
        case "$tmpfile" in
          *.tar.gz|*.tgz|*.tar.xz|*.zip|*.deb)
            install_from_archive "$tmpfile"
            ;;
          *)
            cp -f "$tmpfile" "$TRI_BIN"
            chmod +x "$TRI_BIN"
            ;;
        esac
        [ -x "$TRI_BIN" ] && return 0
        warn "TRI artifact downloaded from $url but no runnable binary was installed"
      else
        warn "Downloaded TRI artifact failed SHA256 verification from $url"
      fi
    else
      warn "Failed to fetch TRI artifact from $url"
    fi
  done

  fail "Unable to obtain trianglesd binary or release artifact"
}

require_binary() {
  ensure_binary_present
  [ -x "$TRI_BIN" ] || fail "trianglesd not found or not executable at $TRI_BIN"
  export LD_LIBRARY_PATH="$LIB_DIR:${LD_LIBRARY_PATH:-}"
}

write_config() {
  mkdir -p "$DATA_DIR" "$BOOTSTRAP_DIR" "$CACHE_DIR" "$STATE_DIR" "$BACKUPS_DIR" "$CONFIG_DIR" "$UI_DATA_DIR" "$LOGS_DIR" /tri/tor /var/log/tri
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

  if [ "$TOR_ENABLED" = "1" ]; then
    cat >> "$CONF_FILE" <<CFG
proxy=127.0.0.1:9050
listenonion=1
tor=127.0.0.1:9050
CFG
  fi

  if [ "$STAKE_ENABLED" = "1" ]; then
    echo "staking=1" >> "$CONF_FILE"
  else
    echo "staking=0" >> "$CONF_FILE"
  fi

  if [ -n "$ADDNODE" ]; then
    OLDIFS="$IFS"
    IFS=','
    for node in $ADDNODE; do
      echo "addnode=$node" >> "$CONF_FILE"
    done
    IFS="$OLDIFS"
  fi

  if [ -n "$EXTERNAL_IP" ]; then
    echo "externalip=$EXTERNAL_IP" >> "$CONF_FILE"
  fi

  case "$MODE" in
    seed)
      cat >> "$CONF_FILE" <<CFG
upnp=0
discover=1
CFG
      ;;
    staking)
      echo "staking=1" >> "$CONF_FILE"
      ;;
  esac

  cp -f "$CONF_FILE" "$CONFIG_DIR/triangles.conf"
}

start_tor() {
  [ "$TOR_ENABLED" = "1" ] || return 0
  if pgrep -x tor >/dev/null 2>&1; then
    return 0
  fi
  log "Starting Tor..."
  mkdir -p /tri/tor
  chmod 700 /tri/tor || true
  tor --RunAsDaemon 1 --SocksPort 9050 --DataDirectory /tri/tor >"$TOR_LOG" 2>&1 || warn "Tor failed to start; continuing without confirmed Tor health"
  sleep 2
  if ! pgrep -x tor >/dev/null 2>&1; then
    warn "Tor does not appear to be running after startup"
  fi
}

chain_present() {
  [ -f "$DATA_DIR/blk0001.dat" ] && [ -s "$DATA_DIR/blk0001.dat" ]
}

chain_looks_sane() {
  chain_present || return 1
  local blk_size ldb_count
  blk_size=$(stat -c%s "$DATA_DIR/blk0001.dat" 2>/dev/null || echo 0)
  [ "$blk_size" -ge "$BOOTSTRAP_MIN_BLOCK_BYTES" ] || return 1
  if [ -d "$DATA_DIR/txleveldb" ]; then
    ldb_count=$(find "$DATA_DIR/txleveldb" -name '*.ldb' 2>/dev/null | wc -l)
    [ "$ldb_count" -ge "$BOOTSTRAP_MIN_LDB_COUNT" ] || return 1
  else
    return 1
  fi
  return 0
}

reset_chain_dirs() {
  rm -rf "$DATA_DIR/txleveldb" "$DATA_DIR/database" "$DATA_DIR/blk0001.dat" "$DATA_DIR/peers.dat" "$DATA_DIR"/*.log 2>/dev/null || true
}

bootstrap_chain() {
  [ "$BOOTSTRAP_ENABLED" = "1" ] || return 0
  split_sources
  mkdir -p "$BOOTSTRAP_DIR"
  log "Bootstrapping chain data..."
  set_status "bootstrapping" "Preparing bootstrap"
  BOOTSTRAP_ACTIVE=1
  clear_ready
  clear_bootstrap_progress
  reset_chain_dirs

  local source
  local all_sources=()
  for source in "${BOOTSTRAP_SOURCES[@]}"; do
    [ -n "$source" ] || continue
    all_sources+=("$source")
    case "$source" in
      http://bootstrap.cryptographic-triangles.org:8080/*)
        all_sources+=("http://host.docker.internal:8080/tri-bootstrap.tar.gz" "http://172.17.0.1:8080/tri-bootstrap.tar.gz")
        ;;
    esac
  done

  for source in "${all_sources[@]}"; do
    [ -n "$source" ] || continue
    log "Trying bootstrap source: $source"
    set_bootstrap_source "$source"
    write_bootstrap_progress "starting"
    rm -f "$BOOTSTRAP_FILE"
    if wget --progress=dot:giga --show-progress --tries=1 --timeout="$BOOTSTRAP_TIMEOUT" -O "$BOOTSTRAP_FILE" "$source" 2>&1 | while IFS= read -r line; do
      echo "$line"
      case "$line" in
        *%*)
          pct=$(printf '%s\n' "$line" | grep -Eo '[0-9]+%' | tail -n1 || true)
          [ -n "$pct" ] && write_bootstrap_progress "$pct"
          ;;
      esac
    done; then
      log "Download complete. Extracting bootstrap archive..."
      set_status "bootstrapping" "Extracting bootstrap archive"
      write_bootstrap_progress "extracting"
      reset_chain_dirs
      if tar xzf "$BOOTSTRAP_FILE" -C "$DATA_DIR"; then
        rm -f "$BOOTSTRAP_FILE"
        if chain_looks_sane; then
          BOOTSTRAP_ACTIVE=0
          clear_bootstrap_progress
          log "Bootstrap extracted and passed sanity check."
          return 0
        fi
        warn "Extracted bootstrap from $source but chain sanity check failed"
      else
        warn "Extraction failed for bootstrap from $source"
      fi
    else
      warn "Bootstrap source failed: $source"
    fi
  done

  BOOTSTRAP_ACTIVE=0
  clear_bootstrap_progress
  warn "All bootstrap sources failed. Falling back to peer sync."
  return 1
}

build_args() {
  TRI_ARGS=(
    "-datadir=$DATA_DIR"
    "-conf=$CONF_FILE"
    "-dbcache=$DBCACHE"
    "-maxconnections=$MAX_CONNECTIONS"
    "-listen=1"
    "-bind=0.0.0.0:$TRI_PORT"
    "-port=$TRI_PORT"
    "-printtoconsole"
  )

  if [ "$PREFER_BOOTSTRAP" = "1" ]; then
    split_sources
    local first="${BOOTSTRAP_SOURCES[0]:-}"
    if [ -n "$first" ]; then
      log "Preferred bootstrap source: $first"
    fi
  fi

  if [ -n "$EXTRA_ARGS" ]; then
    # shellcheck disable=SC2206
    EXTRA_SPLIT=( $EXTRA_ARGS )
    TRI_ARGS+=("${EXTRA_SPLIT[@]}")
  fi
}

run_node() {
  local exit_code=0

  while true; do
    build_args
    set_status "starting" "Launching trianglesd"
    log "Starting Triangles node in $MODE mode..."
    "$TRI_BIN" "${TRI_ARGS[@]}" &
    TRI_PID=$!
    sleep 3
    if kill -0 "$TRI_PID" >/dev/null 2>&1; then
      if [ "$BOOTSTRAP_ACTIVE" = "1" ]; then
        set_status "bootstrapping" "Bootstrap complete, node now starting"
      elif chain_present; then
        set_status "running" "Node process running"
        mark_ready
      else
        set_status "syncing" "Node process running without local chain snapshot"
      fi
    fi

    if [ -n "$CANONICAL_RPC_URL" ]; then
      verify_canonical_alignment || true
    fi

    exit_code=0
    wait "$TRI_PID" || exit_code=$?
    TRI_PID=""

    case "$exit_code" in
      0|143)
        return 0
        ;;
    esac

    warn "trianglesd exited unexpectedly with code $exit_code"
    if attempt_runtime_recovery; then
      warn "Retrying trianglesd once after runtime recovery"
      continue
    fi

    set_status "error" "trianglesd exited unexpectedly with code $exit_code"
    return "$exit_code"
  done
}

run_admin_action() {
  local action="${1:-}"
  local ts dest
  case "$action" in
    backup-run)
      if [ "$TRI_ALLOW_BACKUP_EXPORT" != "1" ]; then
        echo "Backup export is not allowed on this instance."
        return 1
      fi
      local src="${TRI_WALLET_EXPORT_PATH:-$DATA_DIR/wallet.dat}"
      ts=$(date +%Y%m%d-%H%M%S)
      mkdir -p "$BACKUPS_DIR"
      cp -f "$src" "$BACKUPS_DIR/wallet-${ts}.dat"
      chmod 600 "$BACKUPS_DIR/wallet-${ts}.dat"
      echo "Backup written to $BACKUPS_DIR/wallet-${ts}.dat"
      ;;
    reseed)
      if [ "$TRI_ALLOW_RESEED" != "1" ]; then
        echo "Reseed is not allowed on this instance."
        return 1
      fi
      echo "Triggering reseed — clearing chain state and re-bootstrapping..."
      rm -rf "$DATA_DIR/txleveldb" "$DATA_DIR/database" "$DATA_DIR/blk0001.dat" \
             "$DATA_DIR/peers.dat" "$DATA_DIR/*.log" 2>/dev/null || true
      echo "Reseed complete. Container will restart."
      ;;
    *)
      echo "Unknown admin action: $action"
      return 1
      ;;
  esac
}

main() {
  init_state_dir
  set_status "initializing" "Preparing TRIdock environment"

  if [ -n "$TRI_ADMIN_ACTION" ]; then
    run_admin_action "$TRI_ADMIN_ACTION"
    exit $?
  fi

  require_binary
  write_config
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
  NODE_PID=$!
  start_wallet_ui
  wait $NODE_PID
  log "trianglesd exited — container staying alive for appliance access"
  tail -f /dev/null &
  wait $!
}

start_wallet_ui() {
  if [ ! -f "$UI_DATA_DIR/server.mjs" ]; then
    log "No wallet UI server found at $UI_DATA_DIR/server.mjs — skipping web UI start"
    return
  fi
  log "Starting wallet web UI on port ${PORT:-4177}..."
  cd "$UI_DATA_DIR"
  node server.mjs &
  UI_PID=$!
  log "Wallet web UI started (PID $UI_PID)"
}

main "$@"
