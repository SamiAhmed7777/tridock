#!/bin/bash
# entrypoint-tri7.sh — TRI7-era TRIdock entrypoint (tri7d / follow_tip).
#
# Modes (TRI_MODE):
#   full    — follower with the full block store (default). Listener on.
#   seed    — follow + serve: same as full; reserved so seed operators get a
#             distinct config surface (TRI_SEED_* vars still honoured).
#   staking — full + stake=1 in triangles.conf. ⚠️ STAKING NEEDS A WALLET:
#             mount the wallet dir at /var/lib/tri7/wallet (wallet.dat).
#             Without a mounted wallet the container refuses to start staking.
#
# Tor: bundled by default (SOCKS 127.0.0.1:9050). tri7d dials .onion peers
# through SOCKS natively (--socks). Set TRI_TOR_ENABLED=0 for clearnet-only.
#
# Bootstrap: the legacy snapshot URL (bootstrap.cryptographic-triangles.org
# tarball) is dead and tri7d does not consume legacy leveldb tarballs. By
# default the node FRESH-SYNCS via P2P gap-fill (backfill from seed peers).
# If you host a tri7-era blk0001.dat archive (the canonical one lives on DNS2
# at /root/.triangles/blk0001.dat — serve it over HTTP and point
# TRI_BOOTSTRAP_URL at it), the entrypoint fetches + hash-checks it into the
# state dir before first start.
set -Eeuo pipefail

STATE_DIR="/var/lib/tri7"
CONF_DIR="$STATE_DIR/conf"
CONF_FILE="$CONF_DIR/triangles.conf"
MODE="${TRI_MODE:-full}"
RPC_USER="${TRI_RPCUSER:-tri}"
# TRI_RPCPASSWORD: unset -> generated random (printed once, stored in conf).
RPC_PASSWORD="${TRI_RPCPASSWORD:-$(head /dev/urandom | tr -dc A-Za-z0-9 | head -c 32)}"
RPC_PORT="${TRI_RPCPORT:-19112}"
P2P_PORT="${TRI_P2PPORT:-24113}"
TOR_ENABLED="${TRI_TOR_ENABLED:-1}"
TOR_SOCKS="${TRI_TOR_SOCKS:-127.0.0.1:9050}"
PEERS="${TRI_PEERS:-}"                # clearnet peers, comma-separated HOST:PORT
ONION_PEERS="${TRI_ONION_PEERS:-}"    # .onion peers, comma-separated ONION:PORT
BOOTSTRAP_URL="${TRI_BOOTSTRAP_URL:-}"
BOOTSTRAP_SHA256="${TRI_BOOTSTRAP_SHA256:-}"
# Weak/known default passwords are refused unless explicitly overridden.
RPC_ALLOW_WEAK_CREDS="${TRI_RPC_ALLOW_WEAK_CREDS:-0}"

log() { echo "[tridock-tri7] $(date -u +%FT%TZ) $*"; }
die() { log "FATAL: $*"; exit 1; }

# ── Mode normalisation ───────────────────────────────────────────────────────
case "$MODE" in
  full|seed|staking) ;;
  *) die "TRI_MODE must be full | seed | staking (got '$MODE')" ;;
esac

STAKE=0
# Credential hygiene: the RPC port IS published from this container (socat
# bridge), so a known-default password is a hard error.
case "$RPC_PASSWORD" in
  tri|change-me|changeThisNow123|password)
    if [ "$RPC_ALLOW_WEAK_CREDS" != "1" ]; then
      die "TRI_RPCPASSWORD is a known default ('${RPC_PASSWORD}'). Set a strong TRI_RPCPASSWORD (or TRI_RPC_ALLOW_WEAK_CREDS=1 if you really mean it)."
    fi ;;
esac
if [ "$MODE" = "staking" ]; then
  STAKE=1
  if [ ! -d "$STATE_DIR/wallet" ]; then
    cat <<'EOF'
[tridock-tri7] ══════════════════════════════════════════════════════════════
[tridock-tri7]  TRI_MODE=staking REQUIRES A MOUNTED WALLET.
[tridock-tri7]  Mount your wallet directory at /var/lib/tri7/wallet
[tridock-tri7]  (e.g. `-v ./wallet:/var/lib/tri7/wallet:ro`) and restart.
[tridock-tri7]  tri7d itself never touches keys; staking is driven from the
[tridock-tri7]  mounted wallet via the RPC surface. Refusing to start.
[tridock-tri7] ══════════════════════════════════════════════════════════════
EOF
    exit 1
  fi
  log "staking mode: wallet found at $STATE_DIR/wallet"
fi

# ── triangles.conf (key=value; rpcuser/rpcpassword REQUIRED by tri7d) ───────
install -d -m 0750 "$CONF_DIR"
if [ ! -f "$CONF_FILE" ]; then
  {
    echo "rpcuser=$RPC_USER"
    echo "rpcpassword=$RPC_PASSWORD"
    [ "$STAKE" = "1" ] && echo "stake=1"
  } > "$CONF_FILE"
  chmod 0640 "$CONF_FILE"
  log "wrote $CONF_FILE (mode=$MODE)"
else
  log "preserving existing $CONF_FILE"
fi

# ── Bootstrap (optional blk0001.dat archive fetch) ───────────────────────────
if [ -n "$BOOTSTRAP_URL" ] && [ ! -f "$STATE_DIR/blk0001.dat" ]; then
  # Integrity: a remote (non-localhost) snapshot MUST be hash-checked — a
  # tampered blk0001.dat is a chain-split vector. Localhost/admin-provided
  # URLs may skip with TRI_BOOTSTRAP_ALLOW_UNVERIFIED=1.
  case "$BOOTSTRAP_URL" in
    http://localhost*|http://127.0.0.1*|file://*|/*) LOCAL_URL=1 ;;
    *) LOCAL_URL=0 ;;
  esac
  if [ -z "$BOOTSTRAP_SHA256" ] && [ "$LOCAL_URL" = "0" ] \
     && [ "${TRI_BOOTSTRAP_ALLOW_UNVERIFIED:-0}" != "1" ]; then
    die "TRI_BOOTSTRAP_SHA256 is required for a remote snapshot URL. Refusing to fetch an unverified blk0001.dat (set TRI_BOOTSTRAP_ALLOW_UNVERIFIED=1 to override)."
  fi
  log "fetching blk0001.dat snapshot from $BOOTSTRAP_URL"
  curl -fsSL --retry 3 -o "$STATE_DIR/blk0001.dat.part" "$BOOTSTRAP_URL" \
    || die "snapshot fetch failed"
  if [ -n "$BOOTSTRAP_SHA256" ]; then
    echo "$BOOTSTRAP_SHA256  $STATE_DIR/blk0001.dat.part" | sha256sum -c - \
      || die "snapshot sha256 mismatch"
  fi
  mv "$STATE_DIR/blk0001.dat.part" "$STATE_DIR/blk0001.dat"
  log "snapshot installed"
fi

# ── Tor (bundled sidecar in this container) ──────────────────────────────────
if [ "$TOR_ENABLED" = "1" ]; then
  log "starting bundled tor (SOCKS $TOR_SOCKS)"
  tor --SocksPort "$TOR_SOCKS" --DataDirectory /var/lib/tor \
      --Log 'notice file /var/log/tor/tor.log' --RunAsDaemon 1
  # wait for the SOCKS port to answer (bounded)
  for _ in $(seq 1 60); do
    if (echo > "/dev/tcp/${TOR_SOCKS%:*}/${TOR_SOCKS#*:}") 2>/dev/null; then
      log "tor SOCKS is up"; break
    fi
    sleep 2
  done
fi

# ── tri7d argument assembly ──────────────────────────────────────────────────
ARGS=(--forever
      --conf "$CONF_FILE"
      --state-dir "$STATE_DIR"
      --rpc-port "$RPC_PORT"
      --listen-port "$P2P_PORT"
      --listen-bind 0.0.0.0)

if [ "$TOR_ENABLED" = "1" ]; then
  ARGS+=(--socks "$TOR_SOCKS")
fi

# Outbound peers: first explicit target replaces tri7d's 127.0.0.1:24113
# built-in default (a primary must not attach to its own listener). .onion
# targets go through the tor SOCKS; clearnet targets go direct. With NO
# explicit targets we pass nothing and tri7d's own built-in default applies.
DAEMON_DIRECT=()
for p in ${PEERS//,/ }; do [ -n "$p" ] && DAEMON_DIRECT+=(--daemon "$p"); done
for p in ${ONION_PEERS//,/ }; do [ -n "$p" ] && ARGS+=(--onion "$p"); done
if [ "${#DAEMON_DIRECT[@]}" -gt 0 ]; then
  ARGS+=("${DAEMON_DIRECT[@]}")
fi

# Optional extra args (space-separated), kept last so they can override.
if [ -n "${TRI_EXTRA_ARGS:-}" ]; then
  # shellcheck disable=SC2086
  ARGS+=(${TRI_EXTRA_ARGS})
fi
log "mode=$MODE exec tri7d ${ARGS[*]}"
tri7d "${ARGS[@]}" "$@" &
TRI7D_PID=$!

# RPC bridge: tri7d enforces a loopback-only RPC bind (security policy, see
# src/rpc.rs bind_loopback). Publish 19112 inside the container via socat so
# `EXPOSE 19112` + port mapping actually reach it. Loopback access stays
# available for the healthcheck.
socat TCP-LISTEN:"$RPC_PORT",fork,reuseaddr,bind=0.0.0.0 \
      TCP:127.0.0.1:"$RPC_PORT" &
SOCAT_PID=$!

term() {
  # tor ran with --RunAsDaemon 1 — kill it explicitly or it orphans.
  pkill -f "tor --SocksPort $TOR_SOCKS" 2>/dev/null || true
  kill "$TRI7D_PID" "$SOCAT_PID" 2>/dev/null || true
  wait 2>/dev/null || true
}
trap term TERM INT

wait -n "$TRI7D_PID" "$SOCAT_PID"
RC=$?
log "a child exited (rc=$RC) — shutting down"
term
exit "$RC"
