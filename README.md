# TRIdock

**Docker-first Triangles node with built-in web wallet, Tor support, auto-bootstrap, and multi-node management.**

[![GitHub](https://img.shields.io/badge/github-tridock-blue?logo=github)](https://github.com/SamiAhmed7777/tridock)
[![Docker](https://img.shields.io/badge/docker-samiahmed7777%2Ftridock-blue?logo=docker)](https://hub.docker.com/r/samiahmed7777/tridock)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

---

## What is TRIdock?

TRIdock runs a full **Triangles (TRI)** node inside Docker with a built-in web wallet UI. It handles binary management, bootstrap/recovery, Tor hidden services, staking, and encrypted messaging — all from a single container.

**Triangles** is a hybrid PoW/PoS blockchain with secure messaging (smessage), onion routing, and staking rewards. Keys never leave your node.

### Key features

- 🚀 **One-command deploy** — full node, web wallet, or seed node
- 🔐 **Built-in web wallet** — receive, send, contacts, staking, encrypted messaging
- 🧅 **Tor native** — hidden service auto-provisioning, SOCKS proxy, onion-only networking
- 📦 **Auto-bootstrap** — fresh nodes sync from verified chain snapshots
- 🔄 **Multi-node** — manage multiple TRI nodes from one wallet UI
- 🛡️ **Seed mode** — hardened seed nodes with trusted-peer isolation and canonical verification
- 💰 **Staking** — earn rewards by keeping your node online and wallet unlocked
- ✉️ **Encrypted messaging** — ECDH+AES P2P messaging via the smessage protocol
- 📱 **Mobile-friendly** — responsive UI works on phones and tablets

---

## Quick start

### Full node with web wallet

```bash
docker run -d \
  --name tridock \
  -p 24112:24112 \
  -p 4177:4177 \
  -e TRI_RPCUSER=tridock \
  -e TRI_RPCPASSWORD=changeThisNow123 \
  -v tri_data:/tri/data \
  samiahmed7777/tridock:latest
```

Then open **http://localhost:4177** in your browser.

> ⚠️ **Important:** `TRI_RPCUSER` and `TRI_RPCPASSWORD` must be different, or the node will refuse to start.

### Using Docker Compose

```yaml
services:
  tridock:
    image: samiahmed7777/tridock:latest
    container_name: tridock
    restart: unless-stopped
    ports:
      - "24112:24112"
      - "4177:4177"
    environment:
      TRI_MODE: full
      TRI_NODE_NAME: my-node
      TRI_RPCUSER: tridock
      TRI_RPCPASSWORD: changeThisNow123
      TRI_TOR_ENABLED: "1"
      TRI_STAKE_ENABLED: "1"
    volumes:
      - tri_data:/tri/data
volumes:
  tri_data:
```

### Light wallet (remote node only)

Connect to an existing TRI node without running a local blockchain:

```yaml
services:
  wallet:
    image: samiahmed7777/tridock:latest
    container_name: tri-wallet
    restart: unless-stopped
    ports:
      - "4177:4177"
    environment:
      TRI_MODE: light
      TRI_NODE_NAME: remote-wallet
volumes:
  tri_wallet_data:/tri/data
```

---

## Web Wallet

The built-in web wallet runs on port **4177** and provides:

| Tab | What it does |
|-----|-------------|
| **Overview** | Balance, sync height, staking status, wallet security, connections |
| **Receive** | Address list with QR codes, labels, notes, and new address generation |
| **Send** | Full send flow with preview, fee estimation, and confirmation overlay |
| **Staking** | Staking engine status, network share, reward history, how-it-works info |
| **Messages** | Encrypted smessage inbox/outbox/compose with key management |
| **Transactions** | Filterable transaction history with detail view |
| **Contacts** | Full CRUD address book — save addresses with names, categories, and notes |
| **Settings** | Currency display, auto-lock, onion RPC node management |
| **Backup** | Wallet export, backup listing, lock/unlock controls |
| **Debug** | Canonical chain view, action contracts, container/system info |

### Multi-node support

Add multiple TRI nodes and switch between them from the header dropdown. Each node's data stays independent.

---

## Configuration

### Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `TRI_MODE` | `full` | `full`, `seed`, `staking`, or `light` |
| `TRI_RPCUSER` | `tri` | RPC username (**must differ from password**) |
| `TRI_RPCPASSWORD` | `tri` | RPC password (**must differ from username**) |
| `TRI_RPCPORT` | `19112` | RPC listen port |
| `TRI_PORT` | `24112` | P2P listen port |
| `TRI_TOR_ENABLED` | `1` | Enable Tor hidden service |
| `TRI_VERSION` | `5.7.7` | TRI daemon version to download |
| `TRI_STAKE_ENABLED` | `0` | Enable staking |
| `TRI_BOOTSTRAP_ENABLED` | `1` | Auto-bootstrap on empty chain |
| `TRI_BOOTSTRAP_URLS` | *(built-in list)* | Comma-separated bootstrap URLs |
| `TRI_SEED_MODE` | `0` | Enable seed node mode |
| `TRI_SEED_ISOLATION` | `0` | Remove stale peers on startup |
| `TRI_SEED_TRUSTED_PEERS` | *(empty)* | Comma-separated `host:port` trusted peers |
| `TRI_CANONICAL_RPC_URL` | *(empty)* | RPC URL for canonical chain verification |
| `TRI_ENABLE_WRITE_OPS` | `0` | Enable address generation and guarded writes |
| `TRI_ALLOW_SEND_BROADCAST` | `0` | Enable send broadcast |
| `TRI_ALLOW_WALLET_UNLOCK` | `0` | Enable wallet unlock from UI |
| `TRI_ALLOW_BACKUP_EXPORT` | `1` | Enable wallet backup downloads |
| `TRI_MAX_CONNECTIONS` | `64` | Maximum P2P connections |
| `TRI_DBCACHE` | `512` | Database cache in MB |

Full reference: [docs/env-reference.md](docs/env-reference.md)

---

## Seed nodes

TRIdock supports hardened seed node deployment with peer isolation, trusted-peer pinning, and canonical chain verification.

```yaml
services:
  seed:
    image: samiahmed7777/tridock:latest
    environment:
      TRI_MODE: seed
      TRI_SEED_MODE: "1"
      TRI_SEED_ISOLATION: "1"
      TRI_SEED_TRUSTED_PEERS: "peer1.onion:24112,peer2.onion:24112"
      TRI_CANONICAL_RPC_URL: "http://trusted-node.onion:19112"
      TRI_CANONICAL_RPC_USER: rpcuser
      TRI_CANONICAL_RPC_PASSWORD: rpcpass
    volumes:
      - seed_data:/tri/data
```

See [docs/seed-node.md](docs/seed-node.md) for the full seed node guide.

---

## Staking

Earn TRI rewards by staking your coins:

1. Transfer coins to your TRIdock wallet
2. Set `TRI_STAKE_ENABLED=1` 
3. Unlock your wallet from the UI or config
4. Keep the node running — older UTXOs earn priority

Expected yield: ~2-5% annually. No minimum stake required.

See [docs/staking.md](docs/staking.md) for details.

---

## Recovery

If your node gets stuck on a fork or has corrupted chain data:

```bash
# Wipe chain state only (preserves wallet.dat and config)
docker exec tridock rm -rf /tri/data/txleveldb /tri/data/database /tri/data/blk0001.dat

# Restart — TRIdock will re-bootstrap automatically
docker restart tridock
```

See [docs/recovery.md](docs/recovery.md) for the full recovery guide.

---

## Architecture

```
┌──────────────────────────────────────┐
│           TRIdock Container          │
│                                      │
│  ┌────────────┐   ┌──────────────┐  │
│  │ Tor        │   │ Web Wallet   │  │
│  │ (SOCKS +   │   │ (Node.js     │  │
│  │  hidden    │   │  Express)    │  │
│  │  service)  │   │  :4177       │  │
│  └─────┬──────┘   └──────┬───────┘  │
│        │                 │          │
│  ┌─────▼─────────────────▼───────┐  │
│  │        trianglesd             │  │
│  │   (TRI daemon, :24112)        │  │
│  │   RPC: :19112                 │  │
│  └───────────────────────────────┘  │
│                                      │
│  /tri/data   → blockchain + wallet  │
│  /tri/state  → runtime metadata     │
│  /tri/bootstrap → chain snapshots   │
└──────────────────────────────────────┘
```

---

## Building from source

```bash
git clone https://github.com/SamiAhmed7777/tridock.git
cd tridock
docker build -t tridock .
```

Or for local development:

```bash
npm install
npm run dev     # Vite dev server
npm run server  # Backend only
npm run build   # Production build
```

---

## Contributing

PRs welcome. Please test with `npm run build` before submitting.

## License

MIT
