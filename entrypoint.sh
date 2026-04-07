#!/bin/bash
set -Eeuo pipefail

MODE="${TRI_MODE:-full}"
NODE_NAME="${TRI_NODE_NAME:-tridock}"
DATA_DIR="${TRI_DATA_DIR:-/tri/data}"
BOOTSTRAP_DIR="${TRI_BOOTSTRAP_DIR:-/tri/bootstrap}"
BIN_DIR="${TRI_BIN_DIR:-/tri/bin}"
LIB_DIR="${TRI_LIB_DIR:-/tri/lib}"
TRI_BIN="${TRI_BIN:-$BIN_DIR/trianglesd}"
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

DEFAULT_BOOTSTRAP_SOURCES=(
  "http://100.104.4.5:8081/bootstrap-new.tar.gz"
  "http://bootstrap.cryptographic-triangles.org:8080/triangles-bootstrap.tar.gz"
)

TRI_PID=""

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] [$NODE_NAME] $*"; }
warn() { log "WARN: $*"; }
fail() { log "ERROR: $*"; exit 1; }

cleanup() {
  if [ -n "$TRI_PID" ] && kill -0 "$TRI_PID" >/dev/null 2>&1; then
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

require_binary() {
  [ -x "$TRI_BIN" ] || fail "trianglesd not found or not executable at $TRI_BIN"
  export LD_LIBRARY_PATH="$LIB_DIR:${LD_LIBRARY_PATH:-}"
}

write_config() {
  mkdir -p "$DATA_DIR" "$BOOTSTRAP_DIR" /var/lib/tor /var/log/tri
  cat > "$CONF_FILE" <<EOF
rpcuser=$RPC_USER
rpcpassword=$RPC_PASSWORD
rpcport=$RPC_PORT
server=1
listen=1
daemon=0
printtoconsole=1
maxconnections=$MAX_CONNECTIONS
dbcache=$DBCACHE
EOF

  if [ "$TOR_ENABLED" = "1" ]; then
    cat >> "$CONF_FILE" <<EOF
proxy=127.0.0.1:9050
listenonion=1
tor=127.0.0.1:9050
EOF
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
      cat >> "$CONF_FILE" <<EOF
upnp=0
discover=1
EOF
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
  reset_chain_dirs

  local source
  for source in "${BOOTSTRAP_SOURCES[@]}"; do
    [ -n "$source" ] || continue
    log "Trying bootstrap source: $source"
    rm -f "$BOOTSTRAP_FILE"
    if wget --tries=1 --timeout="$BOOTSTRAP_TIMEOUT" -O "$BOOTSTRAP_FILE" "$source"; then
      log "Download complete. Extracting bootstrap archive..."
      reset_chain_dirs
      if tar xzf "$BOOTSTRAP_FILE" -C "$DATA_DIR" --strip-components=1; then
        rm -f "$BOOTSTRAP_FILE"
        if chain_looks_sane; then
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
  log "Starting Triangles node in $MODE mode..."
  "$TRI_BIN" "${TRI_ARGS[@]}" &
  TRI_PID=$!
  wait "$TRI_PID"
}

main() {
  require_binary
  write_config
  start_tor

  if ! chain_looks_sane; then
    log "Chain data missing or suspicious."
    bootstrap_chain || true
  else
    log "Existing chain data looks sane. Reusing it."
  fi

  run_node
}

main "$@"
