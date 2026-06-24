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

---

# TRIdock Lessons Learned — 2026-06-23 Incident

## Summary

After the 2026-04 incident, all four production tridock nodes had been running cleanly for ~2 months. On 2026-06-23, a coordinated upgrade of the Triangles daemon to v5.9.24 across all four nodes revealed three new failure modes that the original fixes did not cover. The most acute was on `tridock-dev`, which spent 14 hours in a silent restart-loop because:

1. The new daemon died shortly after starting
2. The orphaned `tor` process from the previous iteration was still holding the SOCKS port
3. The Tor state file at `/tri/data/tor_data/state` was a non-empty directory, not a file
4. The restart loop counted up to MAX_RESTART_RETRIES (10) and gave up — but only after the user manually intervened by SSHing in and running `pkill tor; rm -rf /tri/data/tor_data/state; trianglesd`

## Bugs Found and Fixed

### 11. Orphaned Tor squatting SOCKS port during restart loop

**Symptom:** `trianglesd` exits within 3 seconds of starting. Container's `run_node` restart loop kicks in, but the next iteration starts a new `trianglesd` that again fails to bind. After MAX_RESTART_RETRIES, container dies.

**Root cause:** When `trianglesd` dies, the `tor` process it spawned (via `start_tor`) is **not** killed. The restart loop calls `build_args` and starts a new `trianglesd`, but the orphaned `tor` still holds the SOCKS port. The new `trianglesd` exits silently because it can't connect to Tor. The original 2026-04 fix only handled initial Tor startup, not Tor spawned during a restart iteration.

**Fix:** Added `preflight_restart()` function called at the top of every `run_node` loop iteration. It:

- Detects orphaned Tor via `pgrep -f "DataDirectory $DATA_DIR/tor"` (matches on data dir, never bare `pgrep tor`)
- Sends SIGINT, waits 5s, then SIGKILL if needed
- Removes stale `$DATA_DIR/tor/lock`
- Validates Tor state file integrity
- Waits up to 10s for SOCKS port to actually free up

**Lesson:** Any child process spawned by the daemon must be reaped and re-validated between restart iterations. PID-file-based lifecycle tracking is more reliable than `pkill <name>`, which can match unrelated system processes.

### 12. Non-empty `tor_data/state` directory breaks daemon startup

**Symptom:** `trianglesd` exits with `Triangles requires Tor to operate` and the log shows no further detail. Restart loop counts up. Container dies after MAX_RESTART_RETRIES.

**Root cause:** `/tri/data/tor_data/state` had become a non-empty directory instead of a regular file. Most likely from an aborted `mv` during a previous recovery attempt, or from filesystem corruption. The daemon's Tor library opens `state` as a file and fails to parse it as a directory. The original 2026-04 LESSONS_LEARNED mentioned wallet corruption but did not cover Tor state corruption.

**Fix:** Added `check_tor_state()` function called in `main()` before `start_tor()` (and re-validated by `preflight_restart()` on every iteration):

- If `state` is a directory → archive to `state.corrupt-<ts>` and remove
- If `state` is a symlink → remove and let Tor recreate
- If `state` is a 0-byte file → log warning, let Tor regenerate
- If `state` is unreadable → return failure, surface as fail-recoverable in `tridock-doctor.sh`
- Auto-repair behavior can be disabled with `AUTO_REPAIR_TOR_STATE=0`

**Lesson:** Containers share state with the host via Docker volumes. A botched recovery on the host can leave a directory where the daemon expects a file. Validate file types, not just file existence.

### 13. Restart loop fires many times silently — no observability into why

**Symptom:** After bug #11 hit, `tridock-dev` spent 14 hours restarting 10 times per iteration cycle. There was no way to see from outside the container what was failing. The `/tri/state/status` file just said `error`.

**Fix:** Added `RESTART_CLEANUP_LOG="$STATE_DIR/restart-cleanups.log"` — appended on every `preflight_restart()` call with timestamped events:

```
2026-06-23T14:32:11Z [restart-cleanup] Killing orphaned tor (PID 265) from previous iteration
2026-06-23T14:32:11Z [restart-cleanup] Removing stale Tor lock file /tri/data/tor/lock
2026-06-23T14:32:11Z [restart-cleanup] Preflight complete for attempt 1
```

The `tridock-doctor.sh` reads this log and warns if cleanup events are firing too often (default threshold: 50 events in the most recent 100 lines).

**Lesson:** When the main restart loop fails, every preflight cleanup should leave a breadcrumb. Container restart counts without context are noise.

### 14. No diagnostic tool for live container state

**Symptom:** When the user reported "tridock-dev is not responding", the only diagnostic option was to docker exec into the container and run a manual chain of `pgrep`, `cat /tri/state/*`, `ls -la /tri/data/tor_data/`. Slow and error-prone.

**Fix:** Added `tridock-doctor.sh` — a read-only inspection tool analogous to `tri-pi-doctor.sh` for native installs:

- 11 checks covering lifecycle status, binary, daemon process, Tor state file, Tor process, SOCKS port, wallet, chain blocks, disk space, restart cleanups, ready marker
- Outputs human-readable report by default, JSON via `--json` for monitoring integration
- Exit codes: 0=clean, 1=warning, 2=fail-recoverable, 3=fail-fatal
- Matches processes by datadir string to avoid false positives from system Tor or other trianglesd instances

**Lesson:** For containerized services, the doctor must run inside the container but expose the same status to monitoring tools as if it were a host-level check. `--json` mode is essential for any Prometheus/Alertmanager wiring.

## Process Lessons (additions)

10. **Always match on data-dir string for process kills** — `pkill trianglesd` and `pkill tor` are dangerous; they can match unrelated system processes. Always use `pgrep -f "datadir=/path"` or `pgrep -f "DataDirectory /path"`.
11. **Validate file types, not just file existence** — `test -e /foo/state` passes for directories too. Daemon libraries expect files and silently exit on directory-shaped inputs.
12. **Leave breadcrumbs in restart loops** — every cleanup action should append to a log file. Container restart counts without context are useless for debugging.

## Timeline of the 2026-06-23 Incident

| Time (UTC) | Event |
|------------|-------|
| 14:18 | Upgraded `tridock-dev` to v5.9.24, daemon started normally |
| 14:21 | First peer connection, 6 connections, height 2,207,680 |
| 14:24 | User noticed container restart count climbing |
| 14:26 | `docker exec` revealed Tor holding SOCKS port, daemon not running |
| 14:32 | User manually killed Tor, removed tor_data/state, daemon started |
| 14:33 | `trianglesd` running cleanly, 6+ connections, syncing |
| ~24h | All four nodes stable on v5.9.24 |
| Day +1 | Hermes traced the bug to `run_node` lacking a preflight cleanup step |
