# TRIdock Lessons Learned — 2026-04-18/19 Incident

## Summary

4 Contabo seed nodes experienced cascading failures over ~48 hours due to multiple entrypoint.sh bugs, a chain fork, wallet corruption, and bootstrap delivery issues. Each fix exposed the next bug. The seeds were ultimately recovered by manual intervention (direct bootstrap download to host, manual extraction, manual daemon start).

## Bugs Found and Fixed

### Critical (caused container crash/loop)

1. **`onlynet=onion` invalid config option** (line ~80)
   - TRI source uses `NET_TOR`, not `NET_ONION`. The correct option is `onlynet=tor`.
   - **Fix:** Changed to `onlynet=tor` in `write_config()`

2. **`continue` outside loop in 5+ functions** (lines 341, 487, 678, 693, 704, 717)
   - A blanket `sed 's/return 0/continue/'` replaced ALL `return 0` with `continue`, including ones in functions that aren't inside loops.
   - **Lesson:** NEVER use blanket sed on control flow keywords. Always use targeted line-specific edits.
   - **Fix:** Reverted each affected line to `return 0`

3. **Binary not persisted across restarts** (`/tri/bin` is ephemeral)
   - Docker volume only mounts `/tri/data`. Binary installed to `/tri/bin/trianglesd` disappears when container recreates.
   - **Fix:** Changed `BIN_DIR` to `/tri/data/bin` so binary persists with chain data

4. **`ensure_binary_present()` missing return after success** (line ~506)
   - After successfully installing binary from first URL, function continued looping through remaining URLs and failed.
   - **Fix:** Added explicit `return 0` after successful install

5. **`find_socks_port()` infinite loop** 
   - `attempt` counter only increments inside `if ss ... then` block. When `ss` fails (not installed) or port is free, counter stays at 0 forever.
   - `iproute2` (providing `ss`) was not in Dockerfile.
   - **Fix:** Added `iproute2` to Dockerfile, moved counter increment outside `if` block

6. **Wallet corruption not handled**
   - Corrupted `wallet.dat` causes daemon crash on startup. Entrypoint has no detection/recovery for this.
   - **Needed:** Wallet integrity check before daemon start, with auto-salvage or fresh wallet creation option

7. **Bootstrap download through Tor fails**
   - Daemon in tor-native mode can't reach `bootstrap.cryptographic-triangles.org` via Tor SOCKS proxy.
   - **Needed:** Bootstrap download should use clearnet (direct HTTPS) while daemon traffic uses Tor. Separate the two paths.

### Design Issues

8. **Bootstrap archive contains wrong RPC credentials**
   - Archive's `triangles.conf` had `rpcuser=tri` / `rpcpassword=tri` — TRI rejects identical user/password when `server=1`.
   - **Fix:** Added `--exclude=triangles.conf` to tar extraction in entrypoint

9. **No fork/canonical-chain detection on startup**
   - Seeds can bootstrap from a stale or minority-fork archive and never converge to the correct chain.
   - **Fix:** Added `verify_canonical_alignment()` with auto-reseed on mismatch (`AUTO_RESEED_ON_FORK=1`)

10. **No health/lifecycle state visibility**
    - Containers showed "healthy" while daemons were dead or stuck in infinite loops.
    - **Fix:** Added stateful `/tri/state/` files with status, reason, bootstrap progress, canonical verification results

## Recommended TRIdock Architectural Improvements

### 1. Defensive Entrypoint Structure

```bash
# NEVER use blanket sed on control flow
# ALWAYS use set -euo pipefail with proper error handling
# ALWAYS test entrypoint changes with shellcheck/bash -n before pushing

# Structure:
main() {
  init_state          # Write initial state files
  ensure_binary       # Download/install TRI binary (with proper returns)
  init_config         # Write triangles.conf (never from bootstrap)
  init_tor            # Start Tor with proper port detection
  bootstrap_chain     # Download/extract chain data (clearnet, not Tor)
  verify_canonical    # Check against trusted RPC source
  run_node            # Start daemon with restart loop
}
```

### 2. Separate Bootstrap and Daemon Network Paths

- **Bootstrap download:** Always use clearnet HTTPS. The bootstrap server is a public HTTPS endpoint.
- **Daemon P2P:** Use Tor via SOCKS proxy for onion peer connections.
- These are different network paths and should not be coupled.

```bash
# Bootstrap: direct HTTPS
wget -O "$BOOTSTRAP_FILE" "https://bootstrap.cryptographic-triangles.org/..."

# Daemon: Tor SOCKS for P2P
# In triangles.conf:
# proxy=127.0.0.1:9050
# addnode=onion-address.onion:24112
```

### 3. Config Template, Not Archive Config

- NEVER extract `triangles.conf` from bootstrap archives.
- ALWAYS generate config from environment variables in `write_config()`.
- Seed-specific settings (RPC credentials, staking, etc.) come from compose env vars.

### 4. Wallet Resilience

```bash
check_wallet() {
  if [ -f "$DATA_DIR/wallet.dat" ]; then
    # Try loading wallet header
    if ! trianglesd -datadir="$DATA_DIR" -walletinfo 2>/dev/null; then
      log "WARN: Wallet appears corrupt, attempting salvage..."
      trianglesd -salvagewallet -datadir="$DATA_DIR"
      if [ $? -ne 0 ]; then
        log "ERROR: Wallet salvage failed. Creating fresh wallet."
        mv "$DATA_DIR/wallet.dat" "$DATA_DIR/wallet.dat.corrupt"
        # Fresh wallet will be created on daemon start
      fi
    fi
  fi
}
```

### 5. Proper Restart Loop

```bash
run_node() {
  local retries=0
  local max_retries=5
  
  while [ $retries -lt $max_retries ]; do
    trianglesd -conf="$CONFIG_FILE" -datadir="$DATA_DIR" -printtoconsole
    exit_code=$?
    
    case $exit_code in
      0)   log "Daemon exited cleanly, restarting..." ;;
      11)  log "SEGV, running recovery..."
           recover_runtime
           ;;
      *)   log "Daemon exited with code $exit_code" ;;
    esac
    
    retries=$((retries + 1))
    sleep 5
  done
  
  log "FATAL: Max retries ($max_retries) reached"
  set_state "error" "Max restart retries reached"
}
```

### 6. State Machine for Lifecycle

States: `initializing` → `installing` → `configuring` → `bootstrapping` → `starting` → `syncing` → `running` → `error`

Each state transition writes to `/tri/state/status` with reason and progress.

### 7. Canonical Verification

```bash
# On startup and periodically:
verify_canonical() {
  local canonical_hash=$(curl -s "$CANONICAL_RPC" | getbestblockhash)
  local local_hash=$(trianglesd getbestblockhash)
  
  if [ "$canonical_hash" != "$local_hash" ]; then
    if [ "$AUTO_RESEED_ON_FORK" = "1" ]; then
      log "FORK: Local hash differs from canonical. Auto-resyncing..."
      wipe_chainstate
      bootstrap_chain
    fi
  fi
}
```

## Process Lessons

1. **Never use blanket sed on control flow keywords** — always target specific lines
2. **Test entrypoint changes locally** with `bash -n` and shellcheck before building image
3. **Keep bootstrap and daemon network paths separate** — bootstrap via clearnet, daemon via Tor
4. **Never trust archive configs** — always generate from env vars
5. **Add wallet integrity checks** before daemon start
6. **Make state visible** — `/tri/state/` files for monitoring
7. **Limit restart loops** — max retries with clear error state
8. **Sequential seed recovery** — don't restart all 4 simultaneously (causes peer contamination)
9. **Verify canonical chain** after bootstrap, not just block count
