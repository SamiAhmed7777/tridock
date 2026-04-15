# TRIdock Feature Plan: Secure Messaging + Light Mode

## Discovery Summary

### Secure Messaging — smessage is already built into trianglesd
The Triangles daemon inherits ShadowCoin's full P2P encrypted messaging system. It ships with **14 RPC commands** and is **enabled by default** when the daemon starts. Messages are:
- Encrypted with ECDH using the recipient's public key
- Routed through the P2P network (not stored on-chain, no transaction fee)
- Max 4096 bytes per message, retained for 48 hours across the network
- Supports anonymous sending (`smsgsendanon`)
- Requires wallet unlock to read inbox/outbox (decryption)

**Available RPC commands:** `smsgenable`, `smsgdisable`, `smsgoptions`, `smsglocalkeys`, `smsgscanchain`, `smsgscanbuckets`, `smsgaddkey`, `smsggetpubkey`, `smsgsend`, `smsgsendanon`, `smsginbox`, `smsgoutbox`, `smsgbuckets`, `smsgbroadcast`

### Light Mode — no SPV infrastructure exists
There is no ElectrumX/Electrs server for Triangles, so true header-based SPV is not feasible. However, TRIdock already has multi-node support. A practical "light mode" means: **don't run trianglesd locally, connect to a remote full node's RPC instead**. The wallet UI + Express server run standalone, proxying all RPC calls to a trusted remote TRIdock instance.

---

## Implementation Plan

### Phase 1: Secure Messaging (smessage UI + API)

#### 1a. Server — new messaging endpoints in `server.mjs`

Add smessage RPC methods to the allowed methods set and create dedicated endpoints:

**New env var:**
- `TRI_ALLOW_SMSG` (default: `"1"`) — feature flag to enable/disable messaging UI

**New endpoints:**

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `GET /api/messages/inbox` | GET | Fetch inbox messages (calls `smsginbox all`) |
| `GET /api/messages/outbox` | GET | Fetch sent messages (calls `smsgoutbox all`) |
| `POST /api/messages/send` | POST | Send encrypted message (calls `smsgsend`) |
| `POST /api/messages/send-anon` | POST | Send anonymous message (calls `smsgsendanon`) |
| `GET /api/messages/keys` | GET | List local messaging keys (calls `smsglocalkeys all`) |
| `POST /api/messages/keys/receive` | POST | Enable/disable receive on an address (calls `smsglocalkeys recv +/- addr`) |
| `POST /api/messages/pubkey` | POST | Look up pubkey for an address (calls `smsggetpubkey`) |
| `POST /api/messages/scan-chain` | POST | Scan chain for public keys (calls `smsgscanchain`) |

**Capability additions to `buildCapabilities()`:**
```javascript
messaging: {
  available: Boolean(allowSmsg),
  ready: Boolean(allowSmsg) && nodeReady && !canonicalMismatch,
  requiresUnlock: true,  // inbox/outbox need wallet unlocked
  blockedReasons: [...]
}
```

#### 1b. Frontend — new "Messages" tab in `App.jsx`

Add `['messages', 'Messages']` to the NavTabs array (between Send and Transactions).

**Messages panel layout (2-column):**

Left column — Conversation list:
- Toggle between Inbox / Outbox / Compose
- Message cards showing: from address (or "Anonymous"), timestamp, preview text
- Unread indicator for new messages
- Click to select and view full message

Right column — Message detail + compose:
- **View mode:** Full message text, sender address, timestamps (sent/received), copy message button
- **Compose mode:**
  - From address dropdown (populated from `smsglocalkeys`)
  - To address field
  - Message textarea (with 4096 char limit counter)
  - "Send" and "Send Anonymous" buttons
  - Pubkey lookup status (shows if recipient's pubkey is available)
- **Key management section:**
  - List of local addresses with receive on/off toggles
  - "Scan chain for keys" button (for discovering recipient pubkeys)

**New state hooks:**
```javascript
const [messages, setMessages] = useState({ inbox: [], outbox: [] })
const [msgTab, setMsgTab] = useState('inbox')  // inbox | outbox | compose
const [selectedMessage, setSelectedMessage] = useState(null)
const [composeForm, setComposeForm] = useState({ from: '', to: '', text: '' })
const [msgStatus, setMsgStatus] = useState('')
const [msgKeys, setMsgKeys] = useState([])
```

**Polling:** Add messages fetch to the 10-second refresh cycle (fetch inbox count for unread badge).

#### 1c. Entrypoint — smsg config integration

In `write_config()` in `entrypoint.sh`:
- If `TRI_SMSG_ENABLED` is `"0"`, add `-nosmsg` to daemon args
- If `TRI_SMSG_SCAN_CHAIN` is `"1"`, add `-smsgscanchain` to daemon args
- Default: smsg enabled (no flag needed, it's on by default)

Add to `publish_static_metadata()`:
- `smsgEnabled` flag in capabilities.json

#### 1d. Styling

Add message-specific styles to `styles.css`:
- Message card styling (similar to TxRow pattern)
- Compose form layout
- Unread message indicator
- Anonymous sender badge styling

---

### Phase 2: Light Mode (`TRI_MODE=light`)

#### 2a. Entrypoint — light mode skip path

In `entrypoint.sh`, when `MODE=light`:
- Skip `require_binary` (no trianglesd needed)
- Skip `write_config` (no triangles.conf)
- Skip `start_tor` (no local daemon)
- Skip `bootstrap_chain` (no chain data)
- Skip `run_node` entirely
- Set status to `"running"` with reason `"Light mode — connected to remote node"`
- Only run `start_wallet_ui`
- The user MUST configure a remote node via `TRI_RPC_URL` / env vars or via the UI's multi-node system

**New main() flow for light mode:**
```bash
if [ "$MODE" = "light" ]; then
  init_state_dir
  set_status "running" "Light mode — using remote node"
  mark_ready
  start_wallet_ui
  wait $UI_PID
  exit 0
fi
```

#### 2b. Server — light mode awareness

In `server.mjs`:
- Read `TRI_MODE` env var
- In health endpoint, report `mode: "light"` vs `mode: "full"`
- In system endpoint, include mode info
- Light mode skips reading local state files (status is always "running")
- All RPC calls go to the configured remote node (this already works via the multi-node system)

Add to capabilities:
```javascript
mode: process.env.TRI_MODE || 'full'
```

#### 2c. Frontend — light mode UI adjustments

In `App.jsx`:
- Show mode in header status pills (`"light mode"` vs `"full node"`)
- In Overview tab, hide bootstrap/sync cards when in light mode
- In Debug tab, show connected remote node info instead of local daemon info
- Node state card shows "Connected to remote node" instead of bootstrap progress

#### 2d. Docker — lighter footprint

In `Dockerfile`, no changes needed — same image works for both modes. The trianglesd binary simply doesn't get downloaded/used in light mode. This keeps it simple: one image, runtime choice.

In `docker-compose.yml`, add commented example:
```yaml
# For light mode (no local blockchain):
# TRI_MODE: light
# TRI_RPC_URL: http://your-full-node:19112
```

Add `examples/docker-compose.light.yml` with light mode configuration.

---

### Phase 3: Documentation & Environment Reference

- Update `docs/env-reference.md` with new env vars
- Update `README.md` with messaging section and light mode section
- Add `docs/messaging.md` explaining the smessage system
- Add `docs/light-mode.md` explaining light mode setup

---

## File Change Summary

| File | Changes |
|------|---------|
| `server.mjs` | ~150 new lines: messaging endpoints, light mode awareness, capability additions |
| `src/App.jsx` | ~200 new lines: Messages tab panel, compose form, message state, light mode UI |
| `src/styles.css` | ~40 new lines: message card, compose form, unread badge styles |
| `entrypoint.sh` | ~20 new lines: light mode skip path, smsg config flags |
| `docker-compose.yml` | ~5 lines: new env vars with defaults |
| `docker-compose.hub.yml` | ~5 lines: matching env vars |
| `examples/docker-compose.light.yml` | New file: light mode example compose |

---

## Order of Implementation

1. **Phase 1a** — Server messaging endpoints (foundation)
2. **Phase 1c** — Entrypoint smsg config (daemon-side)
3. **Phase 1b** — Frontend Messages tab (UI)
4. **Phase 1d** — Styling
5. **Phase 2a** — Entrypoint light mode
6. **Phase 2b** — Server light mode
7. **Phase 2c** — Frontend light mode
8. **Phase 2d** — Docker examples
9. **Phase 3** — Documentation

Default remains `TRI_MODE=full` (full node). Light mode is opt-in.
