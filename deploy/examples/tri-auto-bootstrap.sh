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
#   3. Updates symlinks so URLs stay stable
#   4. Uploads to Dropbox as backup
#   5. Cleans old local tarballs (keeps last 3)
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
DROPBOX_PATH="/TRI bootstrap/triangles-bootstrap.tar.gz"  # Dropbox destination
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

# Create bootstrap tarball (hot copy - doesn't stop daemon)
TARBALL="$BOOTSTRAP_DIR/tri-bootstrap-${DATE}.tar.gz"
echo "$LOG_PREFIX Creating bootstrap tarball: $TARBALL"

cd "$TRI_DATA"
tar czf "$TARBALL" blk0001.dat txleveldb/

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
else
    echo "$LOG_PREFIX Skipping Dropbox (dbxcli not installed)"
fi

# Clean up old local bootstraps
cd "$BOOTSTRAP_DIR"
ls -t tri-bootstrap-*.tar.gz | tail -n +$((KEEP_LOCAL + 1)) | xargs -r rm -f
echo "$LOG_PREFIX Cleaned old bootstraps (keeping last $KEEP_LOCAL)"

# Log final state
echo "$LOG_PREFIX Done. Bootstrap published: blocks=$BLOCKS hash=$HASH size=$SIZE"
echo "$LOG_PREFIX Public URL: https://bootstrap.cryptographic-triangles.org/triangles-bootstrap.tar.gz"
