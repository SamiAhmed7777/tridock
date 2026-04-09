import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs/promises'

async function readStateFile(name) {
  const base = process.env.TRI_STATE_DIR || '/tri/state'
  try {
    return (await fs.readFile(path.join(base, name), 'utf8')).trim()
  } catch {
    return ''
  }
}

async function readNodeState() {
  const [status, reason, bootstrapSource, bootstrapProgress, canonicalStatus, localHeight, localBestblock, canonicalHeight, canonicalBestblock] = await Promise.all([
    readStateFile('status'),
    readStateFile('reason'),
    readStateFile('bootstrap-source'),
    readStateFile('bootstrap-progress'),
    readStateFile('canonical-status'),
    readStateFile('local-height'),
    readStateFile('local-bestblock'),
    readStateFile('canonical-height'),
    readStateFile('canonical-bestblock'),
  ])
  return {
    status: status || 'unknown',
    reason: reason || '',
    bootstrapSource: bootstrapSource || '',
    bootstrapProgress: bootstrapProgress || '',
    canonicalStatus: canonicalStatus || '',
    localHeight: localHeight || '',
    localBestblock: localBestblock || '',
    canonicalHeight: canonicalHeight || '',
    canonicalBestblock: canonicalBestblock || '',
  }
}

const app = express()
const PORT = process.env.PORT || 4177
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const distDir = path.join(__dirname, 'dist')

const rpcUrl = process.env.TRI_RPC_URL || 'http://127.0.0.1:19119'
const rpcUser = process.env.TRI_RPC_USER || ''
const rpcPassword = process.env.TRI_RPC_PASSWORD || ''
const canonicalUrl = process.env.TRI_CANONICAL_RPC_URL || ''
const canonicalUser = process.env.TRI_CANONICAL_RPC_USER || rpcUser
const canonicalPassword = process.env.TRI_CANONICAL_RPC_PASSWORD || rpcPassword

const allowedMethods = new Set([
  'getblockcount',
  'getbestblockhash',
  'getconnectioncount',
  'getstakinginfo',
  'getinfo',
  'listtransactions',
  'listreceivedbyaddress',
  'getpeerinfo',
  'getwalletinfo',
])

async function rpcCall(url, user, password, method, params = []) {
  const headers = { 'Content-Type': 'application/json' }
  if (user || password) {
    headers.Authorization = `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`
  }

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ jsonrpc: '1.0', id: method, method, params }),
  })

  if (!res.ok) {
    throw new Error(`RPC HTTP ${res.status}`)
  }

  const payload = await res.json()
  if (payload.error) {
    throw new Error(payload.error.message || 'RPC error')
  }
  return payload.result
}

async function rpcOptional(method, params = []) {
  try {
    return await rpcCall(rpcUrl, rpcUser, rpcPassword, method, params)
  } catch {
    return null
  }
}

app.use(express.json())

app.get('/api/health', async (_req, res) => {
  const nodeState = await readNodeState()
  res.json({ ok: true, rpcUrl, canonicalEnabled: Boolean(canonicalUrl), nodeState })
})

app.get('/api/node/state', async (_req, res) => {
  res.json(await readNodeState())
})

app.get('/api/wallet/contracts', async (_req, res) => {
  const nodeState = await readNodeState()
  res.json({
    ok: true,
    nodeState,
    send: {
      available: false,
      reason: 'Guarded wallet writes not implemented yet',
      requiredChecks: [
        'explicit-user-approval',
        'fresh-backup-verified',
        'wallet-unlock-policy',
        'transaction-preview',
        'broadcast-confirmation',
      ],
      fields: ['address', 'amount', 'memo'],
    },
    backup: {
      available: false,
      reason: 'Backup/export workflow is scaffolded but not implemented',
      requiredChecks: [
        'safe-target-path',
        'wallet-safe-export-strategy',
        'restore-verification',
      ],
      actions: ['create-backup', 'export-wallet-package', 'verify-restore-package'],
    },
    labels: {
      available: false,
      reason: 'Address labels/notes are UI-only scaffolding right now',
      fields: ['address', 'label', 'note'],
    },
  })
})

app.post('/api/wallet/send/preview', async (_req, res) => {
  const nodeState = await readNodeState()
  res.status(501).json({
    ok: false,
    code: 'SEND_PREVIEW_NOT_IMPLEMENTED',
    message: 'Guarded send preview is not implemented yet.',
    nodeState,
    requiredChecks: [
      'explicit-user-approval',
      'fresh-backup-verified',
      'wallet-unlock-policy',
      'transaction-preview',
    ],
  })
})

app.post('/api/wallet/backup/export', async (_req, res) => {
  const nodeState = await readNodeState()
  res.status(501).json({
    ok: false,
    code: 'BACKUP_EXPORT_NOT_IMPLEMENTED',
    message: 'Wallet backup/export is not implemented yet.',
    nodeState,
    requiredChecks: ['safe-target-path', 'wallet-safe-export-strategy', 'restore-verification'],
  })
})

app.post('/api/wallet/labels/save', async (_req, res) => {
  const nodeState = await readNodeState()
  res.status(501).json({
    ok: false,
    code: 'LABELS_NOT_IMPLEMENTED',
    message: 'Address label saving is not implemented yet.',
    nodeState,
  })
})

app.get('/api/wallet/features', async (_req, res) => {
  const nodeState = await readNodeState()
  res.json({
    mode: 'read-only',
    nodeState,
    features: [
      { key: 'overview', label: 'Overview', status: 'live' },
      { key: 'receive', label: 'Receive addresses', status: 'live-when-rpc-ready' },
      { key: 'transactions', label: 'Transactions', status: 'live-when-rpc-ready' },
      { key: 'staking', label: 'Staking status', status: 'live-when-rpc-ready' },
      { key: 'peers', label: 'Peer diagnostics', status: 'live-when-rpc-ready' },
      { key: 'send', label: 'Send TRI', status: 'blocked' },
      { key: 'addressBook', label: 'Address book actions', status: 'planned' },
      { key: 'backupExport', label: 'Backup/export', status: 'planned' },
      { key: 'lockUnlock', label: 'Wallet lock/unlock', status: 'planned' },
    ],
  })
})

app.get('/api/wallet/summary', async (_req, res) => {
  const nodeState = await readNodeState()

  try {
    const [
      info,
      staking,
      txs,
      received,
      blockCount,
      bestBlock,
      connections,
      walletInfo,
      walletStatus,
      peerInfo,
    ] = await Promise.all([
      rpcCall(rpcUrl, rpcUser, rpcPassword, 'getinfo'),
      rpcOptional('getstakinginfo'),
      rpcOptional('listtransactions', ['*', 25]),
      rpcOptional('listreceivedbyaddress', [0, true]),
      rpcCall(rpcUrl, rpcUser, rpcPassword, 'getblockcount'),
      rpcCall(rpcUrl, rpcUser, rpcPassword, 'getbestblockhash'),
      rpcCall(rpcUrl, rpcUser, rpcPassword, 'getconnectioncount'),
      rpcOptional('getwalletinfo'),
      rpcOptional('getwalletstatus'),
      rpcOptional('getpeerinfo'),
    ])

    let canonical = { enabled: false }
    if (canonicalUrl) {
      const [canonicalHeight, canonicalBestblock] = await Promise.all([
        rpcCall(canonicalUrl, canonicalUser, canonicalPassword, 'getblockcount'),
        rpcCall(canonicalUrl, canonicalUser, canonicalPassword, 'getbestblockhash'),
      ])
      canonical = {
        enabled: true,
        matched: canonicalHeight === blockCount && canonicalBestblock === bestBlock,
        canonicalHeight,
        canonicalBestblock,
      }
    }

    const balance = typeof info?.balance === 'number' ? info.balance : null
    res.json({
      ok: true,
      rpcReady: true,
      rpcError: '',
      nodeState,
      network: info?.testnet ? 'testnet' : 'mainnet',
      version: info?.version ?? null,
      protocolversion: info?.protocolversion ?? null,
      walletversion: info?.walletversion ?? walletInfo?.walletversion ?? null,
      balance,
      stake: info?.stake ?? null,
      newmint: info?.newmint ?? null,
      blocks: blockCount,
      bestblock: bestBlock,
      connections,
      staking: {
        enabled: Boolean(staking?.enabled),
        staking: Boolean(staking?.staking),
        errors: staking?.errors || '',
        weight: staking?.weight ?? null,
        netstakeweight: staking?.netstakeweight ?? null,
        expectedtime: staking?.expectedtime ?? null,
      },
      canonical,
      walletInfo: walletInfo || null,
      walletStatus: walletStatus || null,
      peerCount: Array.isArray(peerInfo) ? peerInfo.length : connections,
      peers: Array.isArray(peerInfo)
        ? peerInfo.slice(0, 12).map((peer) => ({
            addr: peer.addr,
            subver: peer.subver,
            startingheight: peer.startingheight,
            inbound: peer.inbound,
          }))
        : [],
      transactions: Array.isArray(txs) ? txs : [],
      received: Array.isArray(received) ? received : [],
      featureFlags: {
        overview: true,
        receive: true,
        transactions: true,
        staking: true,
        peers: true,
        canonical: Boolean(canonicalUrl),
        send: false,
        addressBook: false,
        backupExport: false,
        lockUnlock: false,
      },
    })
  } catch (error) {
    res.json({
      ok: false,
      rpcReady: false,
      rpcError: error.message,
      nodeState,
      network: null,
      version: null,
      protocolversion: null,
      walletversion: null,
      balance: null,
      stake: null,
      newmint: null,
      blocks: null,
      bestblock: null,
      connections: null,
      staking: {
        enabled: false,
        staking: false,
        errors: '',
        weight: null,
        netstakeweight: null,
        expectedtime: null,
      },
      canonical: { enabled: Boolean(canonicalUrl) },
      walletInfo: null,
      walletStatus: null,
      peerCount: 0,
      peers: [],
      transactions: [],
      received: [],
      featureFlags: {
        overview: true,
        receive: false,
        transactions: false,
        staking: true,
        peers: false,
        canonical: Boolean(canonicalUrl),
        send: false,
        addressBook: false,
        backupExport: false,
        lockUnlock: false,
      },
    })
  }
})

app.post('/api/rpc', async (req, res) => {
  try {
    const { method, params = [] } = req.body || {}
    if (!allowedMethods.has(method)) {
      return res.status(403).json({ error: 'Method not allowed' })
    }
    const result = await rpcCall(rpcUrl, rpcUser, rpcPassword, method, params)
    res.json({ result })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

app.use(express.static(distDir))
app.use((_req, res) => {
  res.sendFile(path.join(distDir, 'index.html'))
})

app.listen(PORT, () => {
  console.log(`TRIdock Web Wallet listening on :${PORT}`)
})
