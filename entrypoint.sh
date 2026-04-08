#!/bin/bash
set -Eeuo pipefail

MODE="${TRI_MODE:-full}"
NODE_NAME="${TRI_NODE_NAME:-tridock}"
DATA_DIR="${TRI_DATA_DIR:-/tri/data}"
BOOTSTRAP_DIR="${TRI_BOOTSTRAP_DIR:-/tri/bootstrap}"
BIN_DIR="${TRI_BIN_DIR:-/tri/bin}"
LIB_DIR="${TRI_LIB_DIR:-/tri/lib}"
CACHE_DIR="${TRI_CACHE_DIR:-/tri/cache}"
TRI_BIN="${TRI_BIN:-$BIN_DIR/trianglesd}"
TRI_VERSION="${TRI_VERSION:-5.7.5}"
TRI_RELEASE_BASE_URL="${TRI_RELEASE_BASE_URL:-https://github.com/SamiAhmed7777/triangles_v5/releases/download}"
TRI_RELEASE_FILENAME="${TRI_RELEASE_FILENAME:-cryptographic-triangles-daemon_${TRI_VERSION}_amd64.deb}"
TRI_RELEASE_URL="${TRI_RELEASE_URL:-${TRI_RELEASE_BASE_URL}/v${TRI_VERSION}/${TRI_RELEASE_FILENAME}}"
TRI_BIN_DOWNLOAD_URL="${TRI_BIN_DOWNLOAD_URL:-$TRI_RELEASE_URL}"
TRI_BIN_FALLBACK_URLS="${TRI_BIN_FALLBACK_URLS:-}"
TRI_BIN_SHA256="${TRI_BIN_SHA256:-696f1ae93ef9306eb0227e04f6704d17e610207552eb6ce8c7fa091f196f7500}"
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
EXTERNAL_IP="${TRI_EXTERNAL_IP:-}"
EXTRA_ARGS="${TRI_EXTRA_ARGS:-}"
CONF_FILE="$DATA_DIR/triangles.conf"
BOOTSTRAP_FILE="$BOOTSTRAP_DIR/bootstrap.tar.gz"
TOR_LOG="/tmp/tor.log"
STATE_DIR="${TRI_STATE_DIR:-/tri/state}"
STATUS_FILE="$STATE_DIR/status"
STATUS_REASON_FILE="$STATE_DIR/reason"
BOOTSTRAP_PROGRESS_FILE="$STATE_DIR/bootstrap-progress"
BOOTSTRAP_SOURCE_FILE="$STATE_DIR/bootstrap-source"
TRI_READY_FILE="$STATE_DIR/node-ready"
BOOTSTRAP_ACTIVE=0

DEFAULT_BOOTSTRAP_SOURCES=(
  "http://bootstrap.cryptographic-triangles.org/tri-bootstrap.tar.gz"
  "http://bootstrap.cryptographic-triangles.org:8080/tri-bootstrap.tar.gz"
)

TRI_PID=""

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] [$NODE_NAME] $*"; }
warn() { log "WARN: $*"; }
fail() { set_status "error" "$*"; log "ERROR: $*"; exit 1; }

init_state_dir() {
  mkdir -p "$STATE_DIR"
  : > "$STATUS_FILE"
  : > "$STATUS_REASON_FILE"
  rm -f "$BOOTSTRAP_PROGRESS_FILE" "$BOOTSTRAP_SOURCE_FILE" "$TRI_READY_FILE"
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

cleanup() {
  if [ -n "$TRI_PID" ] && kill -0 "$TRI_PID" >/dev/null 2>&1; then
    set_status "stopping" "Stopping trianglesd"
    log "Stopping trianglesd..."
    kill -TERM "$TRI_PID" >/dev/null 2>&1 || true
    wait "$TRI_PID" || true
  fi
}
trap cleanup EXIT INT TERM

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
  find "$1" -type f -name trianglesd | head -n 1
}

copy_extracted_libs() {
  local src_root="$1"
  mkdir -p "$LIB_DIR"
  find "$src_root" -type f \( -name '*.so' -o -name '*.so.*' \) -print0 | while IFS= read -r -d '' lib; do
    cp -f "$lib" "$LIB_DIR/"
  done
}

install_from_archive() {
  local archive="$1"
  local tmpdir
  tmpdir=$(mktemp -d "$CACHE_DIR/tri-extract.XXXXXX")
  trap 'rm -rf "$tmpdir"' RETURN

  case "$archive" in
    *.tar.gz|*.tgz) tar xzf "$archive" -C "$tmpdir" ;;
    *.tar.xz) tar xJf "$archive" -C "$tmpdir" ;;
    *.deb) bsdtar -xf "$archive" -C "$tmpdir" ;;
    *.zip) fail "zip TRI release archives are not supported yet" ;;
    *) fail "Unknown TRI release archive format: $archive" ;;
  esac

  local extracted_bin
  extracted_bin=$(find_extracted_binary "$tmpdir")
  [ -n "$extracted_bin" ] || fail "No trianglesd binary found in extracted archive"

  mkdir -p "$BIN_DIR" "$LIB_DIR"
  cp -f "$extracted_bin" "$TRI_BIN"
  chmod +x "$TRI_BIN"
  copy_extracted_libs "$tmpdir"
  log "Installed trianglesd from release archive for TRI $TRI_VERSION"
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
          *.tar.gz|*.tgz|*.tar.xz|*.zip)
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
  mkdir -p "$DATA_DIR" "$BOOTSTRAP_DIR" /var/lib/tor /var/log/tri "$CACHE_DIR" "$STATE_DIR"
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
}

start_tor() {
  [ "$TOR_ENABLED" = "1" ] || return 0
  if pgrep -x tor >/dev/null 2>&1; then
    return 0
  fi
  log "Starting Tor..."
  tor --RunAsDaemon 1 --SocksPort 9050 --DataDirectory /var/lib/tor >"$TOR_LOG" 2>&1 || warn "Tor failed to start; continuing without confirmed Tor health"
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
  for source in "${BOOTSTRAP_SOURCES[@]}"; do
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
      if tar xzf "$BOOTSTRAP_FILE" -C "$DATA_DIR" --strip-components=1; then
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
  wait "$TRI_PID"
}

main() {
  init_state_dir
  set_status "initializing" "Preparing TRIdock environment"
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

  run_node
}

main "$@"
