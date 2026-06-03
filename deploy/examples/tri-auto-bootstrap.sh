#!/usr/bin/env bash
# tri-auto-bootstrap.sh
# =============================================================================
# Generates a fresh TRI bootstrap from a running node's chain data.
# Publishes to local bootstrap server directory + optional Dropbox.
# Designed to run via cron every 3 days.
#
# HOW TO USE:
#   1. Copy to /usr/local/bin/tri-auto-bootstrap.sh
#   2. «CHANGEME» edit the config section below
#   3. Make executable: chmod +x /usr/local/bin/tri-auto-bootstrap.sh
#   4. Test: /usr/local/bin/tri-auto-bootstrap.sh
#   5. Add cron: crontab -e
#      0 4 */3 * * /usr/local/bin/tri-auto-bootstrap.sh >> /var/log/tri-auto-bootstrap.log 2>&1
#
# WHAT IT DOES:
#   1. Checks daemon is running and has connections
#   2. Creates tarball from LIVE chain data (hot copy, no daemon stop)
#   3. Generates a UTXO snapshot sidecar + snapshot.manifest for future fast-import paths
#   4. Updates symlinks so URLs stay stable
#   5. Uploads to Dropbox as backup
#   6. Cleans old local tarballs (keeps last 3)
#
# IMPORTANT:
#   - Hot copy means the tarball may have minor inconsistency
#   - For seed nodes this is fine — they verify on import
#   - If you need perfect snapshots, stop the daemon first
# =============================================================================

set -euo pipefail

# ── Config ── «CHANGEME» these values ──
BOOTSTRAP_DIR="/var/www/triangles-bootstrap"    # where tarballs are served from
TRI_DATA="/root/.triangles"                      # TRI data directory
TRI_DAEMON="/usr/local/bin/trianglesd"           # path to trianglesd RPC binary
TRI_CLI="/usr/local/bin/triangles-cli"          # path to triangles-cli for dumputxoset
DROPBOX_PATH="/TRI bootstrap/triangles-bootstrap.tar.gz"  # Dropbox destination
UTXO_DROPBOX_PATH="/TRI bootstrap/utxo-snapshot.bin"      # Dropbox destination for raw UTXO snapshot
KEEP_LOCAL=3                                     # number of old tarballs to keep
# ── End config ──

DATE=$(date +%Y-%m-%d)
LOG_PREFIX="[$(date '+%Y-%m-%d %H:%M:%S')]"

echo "$LOG_PREFIX Starting TRI auto-bootstrap"

# Check daemon is running and get current state
if ! $TRI_DAEMON getblockchaininfo >/dev/null 2>&1; then
    echo "$LOG_PREFIX ERROR: trianglesd not responding, aborting"
    exit 1
fi

BLOCKS=$($TRI_DAEMON getblockchaininfo 2>/dev/null | jq -r '.blocks')
CONNS=$($TRI_DAEMON getblockchaininfo 2>/dev/null | jq -r '.connections')
HASH=$($TRI_DAEMON getblockchaininfo 2>/dev/null | jq -r '.bestblockhash')

echo "$LOG_PREFIX Current state: blocks=$BLOCKS connections=$CONNS hash=$HASH"

if [ "$CONNS" -lt 1 ]; then
    echo "$LOG_PREFIX WARNING: No connections, bootstrap may be from isolated chain"
fi

# Create UTXO snapshot sidecar if supported
UTXO_SNAPSHOT="$BOOTSTRAP_DIR/utxo-snapshot.bin"
SNAPSHOT_META=$(mktemp)
SNAPSHOT_HEIGHT=""
SNAPSHOT_HASH=""
SNAPSHOT_SIZE=""
DB_VERSION="70509"

if command -v "$TRI_CLI" >/dev/null 2>&1; then
    echo "$LOG_PREFIX Generating UTXO snapshot sidecar..."
    if "$TRI_CLI" dumputxoset "$UTXO_SNAPSHOT" > "$SNAPSHOT_META" 2>/dev/null; then
        SNAPSHOT_HEIGHT=$(jq -r '.height // empty' "$SNAPSHOT_META")
        SNAPSHOT_HASH=$(jq -r '.blockhash // empty' "$SNAPSHOT_META")
        SNAPSHOT_SIZE=$(jq -r '.file_size // empty' "$SNAPSHOT_META")
        echo "$LOG_PREFIX UTXO snapshot created: height=$SNAPSHOT_HEIGHT hash=$SNAPSHOT_HASH size=$SNAPSHOT_SIZE"
    else
        echo "$LOG_PREFIX WARNING: dumputxoset failed; continuing without snapshot sidecar"
        rm -f "$UTXO_SNAPSHOT"
    fi
else
    echo "$LOG_PREFIX WARNING: triangles-cli not found; skipping UTXO snapshot"
fi

# Create bootstrap tarball (hot copy - doesn't stop daemon)
TARBALL="$BOOTSTRAP_DIR/tri-bootstrap-${DATE}.tar.gz"
STAGE_DIR=$(mktemp -d)
echo "$LOG_PREFIX Creating bootstrap tarball: $TARBALL"

cp -a "$TRI_DATA/blk0001.dat" "$STAGE_DIR/"
cp -a "$TRI_DATA/txleveldb" "$STAGE_DIR/"

if [ -n "$SNAPSHOT_HEIGHT" ] && [ -n "$SNAPSHOT_HASH" ]; then
    cat > "$STAGE_DIR/snapshot.manifest" <<EOF
format=1
network=main
height=$SNAPSHOT_HEIGHT
hash=$SNAPSHOT_HASH
dbversion=$DB_VERSION
EOF
fi

tar czf "$TARBALL" -C "$STAGE_DIR" blk0001.dat txleveldb $( [ -f "$STAGE_DIR/snapshot.manifest" ] && printf '%s' 'snapshot.manifest' )
rm -rf "$STAGE_DIR"

SIZE=$(ls -lh "$TARBALL" | awk '{print $5}')
echo "$LOG_PREFIX Tarball created: $SIZE"

# Update symlinks (these are what the seeds download)
ln -sf "tri-bootstrap-${DATE}.tar.gz" "$BOOTSTRAP_DIR/triangles-bootstrap.tar.gz"
ln -sf "tri-bootstrap-${DATE}.tar.gz" "$BOOTSTRAP_DIR/tri-bootstrap.tar.gz"
echo "$LOG_PREFIX Symlinks updated"

# Upload to Dropbox (optional — skip if dbxcli not installed)
if command -v dbxcli &>/dev/null; then
    echo "$LOG_PREFIX Uploading to Dropbox..."
    dbxcli put "$TARBALL" "$DROPBOX_PATH" 2>&1 || {
        echo "$LOG_PREFIX WARNING: Dropbox upload failed"
    }
    if [ -f "$UTXO_SNAPSHOT" ]; then
        dbxcli put "$UTXO_SNAPSHOT" "$UTXO_DROPBOX_PATH" 2>&1 || {
            echo "$LOG_PREFIX WARNING: UTXO snapshot Dropbox upload failed"
        }
    fi
else
    echo "$LOG_PREFIX Skipping Dropbox (dbxcli not installed)"
fi

# Clean up old local bootstraps
cd "$BOOTSTRAP_DIR"
ls -t tri-bootstrap-*.tar.gz | tail -n +$((KEEP_LOCAL + 1)) | xargs -r rm -f
echo "$LOG_PREFIX Cleaned old bootstraps (keeping last $KEEP_LOCAL)"

rm -f "$SNAPSHOT_META"

# Log final state
echo "$LOG_PREFIX Done. Bootstrap published: blocks=$BLOCKS hash=$HASH size=$SIZE snapshot_height=${SNAPSHOT_HEIGHT:-none}"
echo "$LOG_PREFIX Public URL: https://bootstrap.cryptographic-triangles.org/triangles-bootstrap.tar.gz"
echo "$LOG_PREFIX UTXO URL: https://bootstrap.cryptographic-triangles.org/utxo-snapshot.bin"
