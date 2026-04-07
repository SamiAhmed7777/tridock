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
