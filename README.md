# TRIdock

TRIdock is a Docker-first Triangles node image with Tor support, auto-bootstrap, and sensible defaults for bringing up a fresh node quickly on any machine.

## Goals

- Run a full TRI node in Docker with minimal setup
- Prefer Sami's bootstrap source so fresh nodes land on the intended chain quickly
- Support full node, seed node, and staking-oriented setups from the same image
- Keep runtime data in volumes and fetch TRI releases automatically by default
- Make recovery and redeploy simple

## What it does

- Starts `trianglesd` inside Docker
- Optionally starts Tor inside the container
- Checks for existing chain data before startup
- If chain data is missing or obviously bad, downloads bootstrap data automatically
- Verifies extracted bootstrap data passes minimum sanity checks before trusting it
- Fetches the TRI daemon package from GitHub Releases by default
- Still supports local binary/lib overrides when you explicitly want them
- Uses environment variables for mode, bootstrap URLs, binary sources, ports, staking, and extra args
- Includes a bootstrap-aware container healthcheck and state files so fresh nodes can be distinguished from broken ones
- Publishes wallet-appliance metadata under `/tri/state` so a web UI or operator can see instance identity, role, paths, and capability flags
- Separates persistent storage by purpose: node data, state, backups, config, UI metadata, and logs

## Quick start

### Build from source

```bash
git clone https://git.sami/sami7777/tridock.git
cd tridock
docker compose up -d --build
```

Then open `http://your-host:4177` for the wallet web UI. The node RPC lives on port 19112, P2P on 24112.

### Pull pre-built image

```bash
curl -O https://git.sami/sami7777/tridock/raw/master/docker-compose.hub.yml
docker compose -f docker-compose.hub.yml up -d
```

The pre-built image includes the web wallet UI and starts on the same ports.

### 1. Start with the default release-driven path

By default TRIdock fetches the latest TRI daemon package from GitHub Releases automatically. You do not need to provide `trianglesd` or shared libraries for the normal path.

If you want to pin a specific upstream release, set for example:

```yaml
environment:
  TRI_VERSION: "5.7.6"
```

If you want to override the auto-download path entirely, you can still mount your own files explicitly:

- optional: `./tri-bin/trianglesd`
- optional: `./tri-lib/` containing required TRI shared libraries

### 2. Start it

```bash
docker compose up -d --build
```

### 3. Watch logs

```bash
docker logs -f tridock
```

## Modes

### Full node
Default:

```yaml
environment:
  TRI_MODE: full
```

### Seed node

```yaml
environment:
  TRI_MODE: seed
  TRI_MAX_CONNECTIONS: "128"
```

### Staking node

```yaml
environment:
  TRI_MODE: staking
  TRI_STAKE_ENABLED: "1"
```

## Bootstrap behavior

During startup TRIdock now writes simple state markers under `/tri/state` so operators can tell whether a node is initializing, bootstrapping, syncing, running, stopping, or errored.

Useful files:
- `/tri/state/status` — current runtime status (`initializing`, `bootstrapping`, `running`, `syncing`, `error`, etc.)
- `/tri/state/reason` — human-readable reason for current status
- `/tri/state/instance-id` — appliance instance identifier
- `/tri/state/wallet-id` — wallet identity label
- `/tri/state/role` — appliance role (`wallet`, `seed`, `canonical`, `replica`)
- `/tri/state/capabilities.json` — published capability flags (writeOps, sendEnabled, unlockEnabled, reseedAllowed, backupEnabled, canonicalCheck)
- `/tri/state/paths.json` — published volume mount paths
- `/tri/state/node-ready` — empty marker; present means node is ready
- `/tri/state/canonical-status` — canonical chain verification state
- `/tri/state/bootstrap-source` / `/tri/state/bootstrap-progress` — bootstrap telemetry
- `/tri/state/local-height` / `/tri/state/local-bestblock` — local chain tip
- `/tri/state/canonical-height` / `/tri/state/canonical-bestblock` — canonical chain tip
- `/tri/backups/` — wallet backup staging area (backup-run admin action)

## Operator CLI

A `tridock` operator binary is bundled inside the container at `/usr/local/bin/tridock`. It provides live status, capability inspection, and wallet backup without touching the node process directly:

```bash
# Full appliance status
docker exec tridock-dev tridock status

# Capability flags
docker exec tridock-dev tridock capabilities

# Volume paths
docker exec tridock-dev tridock paths

# Run a wallet backup now
docker exec tridock-dev tridock backup run

# View recent logs
docker exec tridock-dev tridock logs
```

## Admin Actions (via environment)

Admin actions are triggered by setting `TRI_ADMIN_ACTION` and running a new container ephemeral:

```bash
# Trigger a wallet backup
docker run --rm \
  --env TRI_ADMIN_ACTION=backup-run \
  --env TRI_ALLOW_BACKUP_EXPORT=1 \
  --env TRI_WALLET_EXPORT_PATH=/tri/data/wallet.dat \
  -v tridock_tri_data:/tri/data \
  -v tridock_tri_backups:/tri/backups \
  samiahmed7777/tridock:latest

# Trigger a reseed (clear chain and re-bootstrap)
docker run --rm \
  --env TRI_ADMIN_ACTION=reseed \
  --env TRI_ALLOW_RESEED=1 \
  -v tridock_tri_data:/tri/data \
  -v tridock_tri_bootstrap:/tri/bootstrap \
  samiahmed7777/tridock:latest
```

## Capability Flags

The appliance publishes its allowed operations into `/tri/state/capabilities.json`. This lets the web UI or operator tooling make honest decisions about what can and cannot be done without guessing:

| Flag | Meaning |
|------|---------|
| `writeOps` | Wallet write-capable RPC operations are exposed |
| `sendEnabled` | Live send/broadcast is allowed |
| `unlockEnabled` | Wallet lock/unlock controls are enabled |
| `reseedAllowed` | Chain reseed is allowed on this instance |
| `backupEnabled` | Backup export is allowed |
| `canonicalCheck` | Canonical chain comparison is configured |

## Volumes
This means a fresh node can report meaningful bootstrap progress instead of looking identical to a broken container.

By default TRIdock uses the bootstrap server URL wallets should rely on:

- `https://bootstrap.cryptographic-triangles.org/tri-bootstrap.tar.gz`

When you publish a replacement snapshot over time, update the file served at that URL on the bootstrap server.

Override with:

```yaml
environment:
  TRI_BOOTSTRAP_URLS: "http://source1/file.tar.gz,http://source2/file.tar.gz"
```

### Canonical chain verification

If you want TRIdock to treat one node as canonical and wait for an exact match on both height and best block hash, set:

```yaml
environment:
  TRI_CANONICAL_RPC_URL: "http://100.104.4.5:19112/"
  TRI_CANONICAL_RPC_USER: "tri"
  TRI_CANONICAL_RPC_PASSWORD: "your-rpc-password"
```

When enabled, TRIdock records the canonical and local height/hash in `/tri/state` and only marks canonical status as matched after repeated exact agreement.

## Environment variables

| Variable | Default | Purpose |
|---|---:|---|
| `TRI_MODE` | `full` | `full`, `seed`, or `staking` |
| `TRI_TOR_ENABLED` | `1` | Start Tor SOCKS proxy |
| `TRI_BOOTSTRAP_ENABLED` | `1` | Download bootstrap if needed |
| `TRI_BOOTSTRAP_URLS` | built-in list | Comma-separated bootstrap URLs |
| `TRI_RELEASE_BASE_URL` | SamiAhmed7777/triangles_v5 releases | Base URL for TRI release artifacts |
| `TRI_RELEASE_FILENAME` | auto | Release asset filename to fetch (auto-derived from version/latest release unless overridden) |
| `TRI_BIN_DOWNLOAD_URL` | derived from release vars | Primary binary or release artifact URL |
| `TRI_BIN_FALLBACK_URLS` | empty | Comma-separated fallback binary/artifact URLs |
| `TRI_BIN_SHA256` | empty | Optional SHA256 verification for the fetched artifact |
| `TRI_PREFER_BOOTSTRAP` | `1` | Prefer the configured bootstrap path |
| `TRI_MAX_CONNECTIONS` | `64` | Max peer connections |
| `TRI_DBCACHE` | `512` | DB cache size |
| `TRI_RPCUSER` | `tri` | RPC username |
| `TRI_RPCPASSWORD` | `tri` | RPC password |
| `TRI_RPCPORT` | `19112` | RPC port |
| `TRI_PORT` | `24112` | P2P port |
| `TRI_STAKE_ENABLED` | `0` | Enable staking config |
| `TRI_ADDNODE` | empty | Comma-separated addnode list |
| `TRI_EXTERNAL_IP` | empty | External IP hint |
| `TRI_EXTRA_ARGS` | empty | Extra raw trianglesd args |
| `TRI_CANONICAL_RPC_URL` | empty | Canonical node RPC URL for exact chain verification |
| `TRI_CANONICAL_RPC_USER` | empty | Canonical RPC username |
| `TRI_CANONICAL_RPC_PASSWORD` | empty | Canonical RPC password |
| `TRI_CANONICAL_VERIFY_ATTEMPTS` | `20` | How many verification polls to try |
| `TRI_CANONICAL_VERIFY_INTERVAL` | `30` | Seconds between verification polls |
| `TRI_CANONICAL_REQUIRED_MATCHES` | `2` | Consecutive exact matches required before accepting canonical alignment |

## Volumes

- `/tri/data` — blockchain + wallet data
- `/tri/bootstrap` — temporary bootstrap archive staging
- `/tri/cache` — cached TRI release artifacts
- `/tri/state` — runtime state and readiness markers
- `/tri/backups` — backup/export staging
- `/tri/config` — generated runtime config copies
- `/tri/ui-data` — labels/notes/UI metadata for the web layer
- `/tri/logs` — durable logs and future maintenance artifacts

Optional override mounts:

- `/tri/bin` — custom mounted `trianglesd` binary
- `/tri/lib` — custom mounted TRI shared libraries

## Backups

For staking or wallet-bearing nodes, back up the data volume regularly. At minimum preserve:

- `wallet.dat`
- `triangles.conf`
- chain data if you want fast restoration

## Guides

See:

- `docs/full-node.md`
- `docs/seed-node.md`
- `docs/staking.md`
- `docs/recovery.md`
- `docs/env-reference.md`

## Publishing

Planned canonical image:

- `samiahmed7777/tridock:latest`

## Wallet appliance direction

TRIdock is no longer just a seed/container wrapper. The intended shape is a full Docker wallet appliance:

- `trianglesd` as the real daemon
- Tor, bootstrap, and chain-state lifecycle inside the container
- persistent wallet storage in `/tri/data`
- exported operator/state metadata in `/tri/state`
- backup/export staging in `/tri/backups`
- generated config copies in `/tri/config`
- UI metadata in `/tri/ui-data`
- a separate web layer on top that reads real capability state instead of faking actions

Guardrails should be explicit readiness and policy checks, not pretend read-only UX.

## Release and Upstream Tracking Policy

TRIdock should track upstream **TRI** releases closely.

Rules for the project:

- Always style the project name as **TRIdock** and refer to the coin/daemon as **TRI** when writing docs.
- Keep the TRI daemon version explicit in build inputs and release notes.
- When `trianglesd` is updated upstream, TRIdock should be refreshed promptly so the container does not drift behind the network.
- Publish image tags for specific TRI versions, for example:
  - `samiahmed7777/tridock:5.7.5`
  - `samiahmed7777/tridock:latest`
- Document where the downloaded or explicitly mounted TRI binary/libs came from for each release.
- Add automation later so new TRI releases trigger a TRIdock rebuild/review flow.

## Notes

TRIdock now prefers the real versioned TRI GitHub release package by default and runs on a Debian-compatible base so the packaged TRI daemon matches normal Linux machines more closely. It can install `trianglesd` from an archive or `.deb` automatically. Local mounts are still supported, but they are now an explicit override path rather than the default recommendation.
