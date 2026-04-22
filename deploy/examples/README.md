# TRIdock Deployment Examples
# =============================================================================
# This folder contains ready-to-use config templates for deploying TRIdock.
#
# Files:
#   docker-compose.seed.yml      — 2-seed example with full annotations
#   caddy-bootstrap.example      — Caddy config for HTTPS bootstrap server
#   tri-auto-bootstrap.sh        — Cron script to auto-publish fresh bootstraps
#
# Quick Start (4 seed nodes on one VPS):
#   1. Copy compose:  cp docker-compose.seed.yml docker-compose.yml
#   2. Edit all «CHANGEME» markers with your values
#   3. Create dirs:   mkdir -p data/seed-{1,2,3,4}
#   4. Start:         docker compose up -d
#   5. Verify:        docker logs tri-seed-1
#
# Quick Start (bootstrap server on DNS2):
#   1. Copy Caddy:    cp caddy-bootstrap.example /etc/caddy/sites/bootstrap.YOURDOMAIN
#   2. Edit domain and onion address
#   3. Reload:        systemctl reload caddy
#   4. Copy cron:     cp tri-auto-bootstrap.sh /usr/local/bin/
#   5. Add cron:      echo "0 4 */3 * * /usr/local/bin/tri-auto-bootstrap.sh >> /var/log/tri-auto-bootstrap.log 2>&1" | crontab -
#
# Environment Variable Reference:
# ─────────────────────────────────
#   TRI_MODE                seed | wallet | full        — node mode
#   TRI_NODE_NAME           unique name per instance
#   TRI_INSTANCE_ID         must match NODE_NAME
#   TRI_VERSION             pinned TRI version (e.g. "5.8.5")
#   TRI_TOR_ENABLED         1 = Tor, 0 = clearnet
#   TRI_BOOTSTRAP_ENABLED   1 = auto-download chain on fresh start
#   TRI_BOOTSTRAP_URLS      comma-separated bootstrap URLs (tried in order)
#   TRI_BOOTSTRAP_TIMEOUT   download timeout in seconds (300 for 1.2GB)
#   TRI_RPCUSER             RPC username
#   TRI_RPCPASSWORD         RPC password
#   TRI_RPCPORT             RPC port inside container (default 19112)
#   TRI_PORT                P2P port inside container (default 24112)
#   TRI_SEED_MODE           1 = seed behavior enabled
#   TRI_SEED_ISOLATION      1 = remove stale peers, trusted-only
#   TRI_SEED_TRUSTED_PEERS  comma-separated onion:port addresses
#   TRI_STAKE_ENABLED       1 = enable staking
#   TRI_ENABLE_WRITE_OPS    1 = allow address generation
#   TRI_ALLOW_SEND_BROADCAST 1 = allow sending transactions
#
# Ports (host:container):
#   24112  — P2P (increment per seed: 24112, 24113, 24114, 24115)
#   4177   — Web wallet UI (only needed on one seed)
#   19112  — RPC (container-internal, no host mapping needed)
