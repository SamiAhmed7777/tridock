# Environment Reference

## Naming convention

- Project name: **TRIdock**
- GitHub/Docker slug: `tridock`
- Always capitalize **TRI** in prose and documentation

| Variable | Default | Description |
|---|---:|---|
| `TRI_MODE` | `full` | Node mode: `full`, `seed`, `staking` |
| `TRI_NODE_NAME` | `tridock` | Friendly log label |
| `TRI_DATA_DIR` | `/tri/data` | Runtime data directory |
| `TRI_BOOTSTRAP_DIR` | `/tri/bootstrap` | Bootstrap temp storage |
| `TRI_BIN_DIR` | `/tri/bin` | Mounted binary directory |
| `TRI_LIB_DIR` | `/tri/lib` | Mounted shared library directory |
| `TRI_BIN` | `/tri/bin/trianglesd` | trianglesd binary path |
| `TRI_BIN_DOWNLOAD_URL` | empty | Primary URL to fetch `trianglesd` if not mounted |
| `TRI_BIN_FALLBACK_URLS` | empty | Comma-separated fallback binary URLs |
| `TRI_BIN_SHA256` | empty | Expected SHA256 for downloaded binary |
| `TRI_VERSION` | `unknown` | TRI version label for logs/releases |
| `TRI_PORT` | `24112` | P2P port |
| `TRI_MAX_CONNECTIONS` | `64` | Max peer count |
| `TRI_DBCACHE` | `512` | DB cache |
| `TRI_BOOTSTRAP_TIMEOUT` | `60` | Per-source bootstrap timeout in seconds |
| `TRI_TOR_ENABLED` | `1` | Start Tor |
| `TRI_BOOTSTRAP_ENABLED` | `1` | Auto-bootstrap if needed |
| `TRI_PREFER_BOOTSTRAP` | `1` | Prefer configured bootstrap path |
| `TRI_STAKE_ENABLED` | `0` | Enable staking config |
| `TRI_RPCUSER` | `tri` | RPC user |
| `TRI_RPCPASSWORD` | `tri` | RPC password |
| `TRI_RPCPORT` | `19112` | RPC port |
| `TRI_ADDNODE` | empty | Comma-separated `addnode` values |
| `TRI_EXTERNAL_IP` | empty | External IP hint |
| `TRI_EXTRA_ARGS` | empty | Extra raw daemon args |
| `TRI_BOOTSTRAP_URLS` | built-in | Comma-separated bootstrap archive URLs |
| `TRI_BACKUPS_DIR` | `/tri/backups` | Backup/export staging directory |
| `TRI_CONFIG_DIR` | `/tri/config` | Generated config copy directory |
| `TRI_UI_DATA_DIR` | `/tri/ui-data` | UI metadata directory for wallet-web |
| `TRI_LOGS_DIR` | `/tri/logs` | Durable logs directory |
| `TRI_INSTANCE_ID` | node name | Appliance instance identifier |
| `TRI_WALLET_ID` | `default` | Wallet identity label |
| `TRI_ROLE` | `wallet` | Appliance role (`wallet`, `seed`, `canonical`, `replica`, etc.) |
| `TRI_ENABLE_WRITE_OPS` | `0` | Publish that write-capable wallet ops are enabled |
| `TRI_ALLOW_SEND_BROADCAST` | `0` | Publish/send that live wallet broadcast is enabled |
| `TRI_ALLOW_WALLET_UNLOCK` | `0` | Publish that wallet lock/unlock controls are enabled |
| `TRI_ALLOW_RESEED` | `0` | Publish that reseed/admin destructive flow is allowed |
| `TRI_ALLOW_BACKUP_EXPORT` | `1` | Publish that backup export should be available |
| `TRI_WALLET_EXPORT_PATH` | `/tri/data/wallet.dat` | Export source path exposed to wallet-web/operator tooling |
| `TRI_STATE_DIR` | `/tri/state` | Runtime state files directory (status, canonical, bootstrap telemetry) |
| `TRI_ADMIN_ACTION` | empty | One-shot admin action on startup: `backup-run`, `reseed` |
| `TRI_CANONICAL_RPC_URL` | empty | Canonical node RPC URL for chain verification |
| `TRI_CANONICAL_RPC_USER` | empty | Canonical RPC user |
| `TRI_CANONICAL_RPC_PASSWORD` | empty | Canonical RPC password |
| `TRI_CANONICAL_VERIFY_ATTEMPTS` | `20` | How many attempts before canonical verification times out |
| `TRI_CANONICAL_VERIFY_INTERVAL` | `30` | Seconds between canonical verification polls |
| `TRI_CANONICAL_REQUIRED_MATCHES` | `2` | Consecutive height+hash matches required to consider chain aligned |
| `TRI_BOOTSTRAP_MIN_BLOCK_BYTES` | `100000000` | Minimum blk0001.dat size to accept bootstrap as valid |
| `TRI_BOOTSTRAP_MIN_LDB_COUNT` | `300` | Minimum txleveldb .ldb file count to accept bootstrap as valid |
| `TRI_RELEASE_BASE_URL` | GitHub releases | Base URL for TRI release downloads |
| `TRI_RELEASE_FILENAME` | auto | Explicit release archive filename |
| `TRI_RELEASE_URL` | auto | Full URL to specific release artifact |
| `TRI_CACHE_DIR` | `/tri/cache` | Temporary artifact cache directory |
