# TRIdock

TRIdock is a Docker-first Triangles node image with Tor support, auto-bootstrap, and sensible defaults for bringing up a fresh node quickly on any machine.

## Goals

- Run a full TRI node in Docker with minimal setup
- Prefer Sami's bootstrap source so fresh nodes land on the intended chain quickly
- Support full node, seed node, and staking-oriented setups from the same image
- Keep runtime data in volumes and binaries/libs mounted cleanly
- Make recovery and redeploy simple

## What it does

- Starts `trianglesd` inside Docker
- Optionally starts Tor inside the container
- Checks for existing chain data before startup
- If chain data is missing or obviously bad, downloads bootstrap data automatically
- Verifies extracted bootstrap data passes minimum sanity checks before trusting it
- Can fetch the TRI daemon binary from configured URLs if it is not already mounted
- Uses environment variables for mode, bootstrap URLs, binary sources, ports, staking, and extra args
- Includes a bootstrap-aware container healthcheck and state files so fresh nodes can be distinguished from broken ones

## Quick start

### 1. Put the binary and libs beside the compose file

By default TRIdock is now designed to fetch the real TRI v5.7.5 daemon package from GitHub Releases (`cryptographic-triangles-daemon_5.7.5_amd64.deb`). You can still provide your own files if needed:

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
- `/tri/state/status`
- `/tri/state/reason`
- `/tri/state/bootstrap-source`
- `/tri/state/bootstrap-progress`
- `/tri/state/canonical-status`
- `/tri/state/canonical-height`
- `/tri/state/canonical-bestblock`
- `/tri/state/local-height`
- `/tri/state/local-bestblock`
- `/tri/state/node-ready`

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
| `TRI_RELEASE_FILENAME` | `cryptographic-triangles-daemon_5.7.5_amd64.deb` | Release asset filename to fetch |
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
- `/tri/bin` — mounted `trianglesd` binary
- `/tri/lib` — mounted required TRI libs

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

## Release and Upstream Tracking Policy

TRIdock should track upstream **TRI** releases closely.

Rules for the project:

- Always style the project name as **TRIdock** and refer to the coin/daemon as **TRI** when writing docs.
- Keep the TRI daemon version explicit in build inputs and release notes.
- When `trianglesd` is updated upstream, TRIdock should be refreshed promptly so the container does not drift behind the network.
- Publish image tags for specific TRI versions, for example:
  - `samiahmed7777/tridock:5.7.5`
  - `samiahmed7777/tridock:latest`
- Document where the bundled or mounted TRI binary/libs came from for each release.
- Add automation later so new TRI releases trigger a TRIdock rebuild/review flow.

## Notes

TRIdock now prefers the real versioned TRI GitHub release package by default and runs on a Debian-compatible base so the packaged TRI daemon matches normal Linux machines more closely. It can install `trianglesd` from an archive or `.deb` when the binary is not already present. Local mounts are still supported as overrides or fallbacks.
