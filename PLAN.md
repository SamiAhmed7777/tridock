# TRI Wallet Web App Plan

## Goal
Build a web app that feels like the classic Triangles Qt wallet, but backed by a safer service boundary instead of exposing raw wallet files to the browser.

## Product split
- **TRIdock node mode**: seed/full/staking infrastructure
- **TRIdock wallet mode**: conservative single-user wallet/staking node with stricter protections
- **tri-wallet-web**: web UI that visually echoes the Qt wallet

## Non-negotiables
- Never mutate or replace `wallet.dat` without explicit human approval.
- Web app talks to a backend wallet service, never directly to raw files.
- Read-only dashboard can exist before send/stake controls.
- Backups/export/recovery must be deliberate and obvious.

## MVP screens
1. Overview
   - balance
   - staking balance
   - sync progress
   - connections
   - recent transactions
2. Transactions
   - table similar to Qt wallet
3. Receive
   - address list
   - labels
   - QR codes
4. Send
   - guarded form, fee display, confirmation step
5. Debug/Node
   - block height
   - best block hash
   - canonical match status
   - peers

## Architecture
- Frontend: Next.js or Vite React app styled to resemble Qt wallet chrome
- Backend: small API that proxies safe RPC methods
- Auth: single-user local auth first
- Data source: TRI RPC on wallet-mode TRIdock instance
- Optional later: websocket/event stream for live sync and tx updates

## Safety model
- Default read-only mode until wallet mode is explicitly enabled
- Send flow requires explicit unlock/confirmation
- Distinct wallet mode env and docs
- Separate persistent volumes for wallet data and UI state
- Automatic chain reset logic must never touch wallet material

## Immediate next tasks
1. Add wallet mode design/docs to TRIdock
2. Scaffold tri-wallet-web repo
3. Build Qt-like shell UI with fake/mock data first
4. Wire read-only RPC dashboard
5. Add receive/send only after read-only flow is proven
