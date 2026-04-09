# TRIdock Web Wallet

Qt-inspired web wallet UI for TRI, designed to sit safely in front of a TRIdock node.

## Current state
- Multi-tab wallet shell with Overview / Receive / Send / Transactions / Address Book / Backup / Debug views
- Node-backed wallet UI with canonical-chain status support when a canonical RPC endpoint is configured
- Live node/bootstrap/runtime state rendering even while RPC is warming up
- Persisted address labels and notes stored by the wallet web app
- Receive-side copy flow, selected-address panel, QR rendering, and QR download
- Transaction detail panel with selection state
- Real send preview endpoint with address validation + fee/total estimation
- Guarded address-generation endpoint (enabled only when `TRI_ENABLE_WRITE_OPS=1`)
- Backup/export endpoint that can create file-copy exports when `TRI_WALLET_EXPORT_PATH` is configured
- Final send/broadcast still intentionally gated

## Environment

Backend server env:

- `PORT` — web API port (default `4177`)
- `TRI_RPC_URL` — TRI node RPC URL, for example `http://tridock:19112/`
- `TRI_RPC_USER` — RPC username
- `TRI_RPC_PASSWORD` — RPC password
- `TRI_CANONICAL_RPC_URL` — optional canonical node RPC URL
- `TRI_CANONICAL_RPC_USER` — optional canonical RPC username
- `TRI_CANONICAL_RPC_PASSWORD` — optional canonical RPC password

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
    depends_on:
      - tridock
```

## Safety note

This app should never touch raw wallet files directly. It should only talk to a constrained backend API, and write-capable wallet operations should remain gated until they are explicitly implemented and verified.
