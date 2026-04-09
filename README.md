# TRIdock Web Wallet

Qt-inspired web wallet UI for TRI, designed to be the front-end of a fully functional TRIdock wallet appliance.

## Current state
- Multi-tab wallet UI with Overview / Receive / Send / Transactions / Address Book / Backup / Debug views
- Node-backed wallet UI with canonical-chain status support when a canonical RPC endpoint is configured
- Live node/bootstrap/runtime state rendering even while RPC is warming up
- Persisted address labels and notes stored by the wallet web app
- Receive-side copy flow, selected-address panel, QR rendering, and QR download
- Transaction detail panel with selection state
- Real send preview endpoint with address validation + fee/total estimation
- Real send broadcast endpoint when write ops and broadcast are enabled
- Real wallet lock/unlock endpoints when unlock is enabled and a passphrase is configured
- Real address-generation endpoint (enabled only when `TRI_ENABLE_WRITE_OPS=1`)
- Backup/export endpoint that can create file-copy exports when `TRI_WALLET_EXPORT_PATH` is configured
- Capability/readiness model so the UI can tell the truth about what this wallet instance can safely do

## Environment

Backend server env:

- `PORT` — web API port (default `4177`)
- `TRI_RPC_URL` — TRI node RPC URL, for example `http://tridock:19112/`
- `TRI_RPC_USER` — RPC username
- `TRI_RPC_PASSWORD` — RPC password
- `TRI_CANONICAL_RPC_URL` — optional canonical node RPC URL
- `TRI_CANONICAL_RPC_USER` — optional canonical RPC username
- `TRI_CANONICAL_RPC_PASSWORD` — optional canonical RPC password
- `TRI_ENABLE_WRITE_OPS` — set to `1` to allow wallet write-capable API routes
- `TRI_ALLOW_SEND_BROADCAST` — set to `1` to allow live `sendtoaddress` broadcasts
- `TRI_ALLOW_WALLET_UNLOCK` — set to `1` to allow server-side wallet unlock/lock routes
- `TRI_WALLET_PASSPHRASE` — wallet passphrase used by the unlock route
- `TRI_WALLET_UNLOCK_TIMEOUT` — unlock duration in seconds (default `180`)
- `TRI_REQUIRE_UNLOCK_FOR_SEND` — defaults to enabled; set to `0` only if the wallet model does not require unlock before send
- `TRI_WALLET_EXPORT_PATH` — source file path for backup/export copy
- `TRI_WALLET_EXPORT_ALLOWLIST` — colon-separated list of allowed source path prefixes for export
- `TRI_WALLET_WEB_DATA_DIR` — directory for labels, notes, and generated exports
- `TRI_STATE_DIR` — path to published TRIdock runtime state files (default `/tri/state`)

## Local run

```bash
npm install
npm run server
npm run dev
```

## Docker

```bash
docker build -t samiahmed7777/tridock-web-wallet:latest .
```

## Intended compose wiring with TRIdock

```yaml
services:
  tridock:
    image: samiahmed7777/tridock:latest
    environment:
      TRI_RPCUSER: tri
      TRI_RPCPASSWORD: change-me
      TRI_RPCPORT: "19112"

  tridock-web-wallet:
    build: ./tri-wallet-web
    ports:
      - "4177:4177"
    environment:
      PORT: "4177"
      TRI_RPC_URL: "http://tridock:19112/"
      TRI_RPC_USER: "tri"
      TRI_RPC_PASSWORD: "change-me"
      TRI_CANONICAL_RPC_URL: "http://100.104.4.5:19112/"
      TRI_CANONICAL_RPC_USER: "tri"
      TRI_CANONICAL_RPC_PASSWORD: "your-password"
      TRI_ENABLE_WRITE_OPS: "1"
      TRI_ALLOW_SEND_BROADCAST: "1"
      TRI_ALLOW_WALLET_UNLOCK: "1"
      TRI_WALLET_PASSPHRASE: "change-me"
      TRI_WALLET_EXPORT_PATH: "/tri/data/wallet.dat"
      TRI_WALLET_EXPORT_ALLOWLIST: "/tri/data"
      TRI_STATE_DIR: "/tri/state"
    volumes:
      - tridock-wallet-web-data:/app/data
    depends_on:
      - tridock

volumes:
  tridock-wallet-web-data:
```

## Design note

This app is not meant to fake wallet behavior. It should expose the real capability state of the containerized wallet instance:
- what is live now
- what is blocked and why
- whether the wallet is locked
- whether send is actually ready
- whether the node matches the chain you trust

It should still avoid raw wallet-file manipulation in normal UI flows. Routine wallet actions should go through the TRIdock control/API layer, while explicit backup/export remains a deliberate operator action.
