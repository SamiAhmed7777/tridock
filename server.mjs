import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs/promises'
import crypto from 'node:crypto'

const app = express()
const PORT = process.env.PORT || 4177
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const distDir = path.join(__dirname, 'dist')
const dataDir = process.env.TRI_WALLET_WEB_DATA_DIR || path.join(__dirname, 'data')
const labelsFile = path.join(dataDir, 'labels.json')
const exportsDir = path.join(dataDir, 'exports')

const rpcUrl = process.env.TRI_RPC_URL || 'http://127.0.0.1:19119'
const rpcUser = process.env.TRI_RPC_USER || ''
const rpcPassword = process.env.TRI_RPC_PASSWORD || ''
const canonicalUrl = process.env.TRI_CANONICAL_RPC_URL || ''
const canonicalUser = process.env.TRI_CANONICAL_RPC_USER || rpcUser
const canonicalPassword = process.env.TRI_CANONICAL_RPC_PASSWORD || rpcPassword
const enableWriteOps = process.env.TRI_ENABLE_WRITE_OPS === '1'
const walletExportPath = process.env.TRI_WALLET_EXPORT_PATH || ''
const walletExportAllowlist = (process.env.TRI_WALLET_EXPORT_ALLOWLIST || '')
  .split(':')
  .map((s) => s.trim())
  .filter(Boolean)

const readAllowedMethods = new Set([
  'getblockcount',
  'getbestblockhash',
  'getconnectioncount',
  'getstakinginfo',
  'getinfo',
  'listtransactions',
  'listreceivedbyaddress',
  'getpeerinfo',
  'getwalletinfo',
  'getwalletstatus',
])

async function ensureDataDirs() {
  await fs.mkdir(dataDir, { recursive: true })
  await fs.mkdir(exportsDir, { recursive: true })
}

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

  if (!res.ok) throw new Error(`RPC HTTP ${res.status}`)
  const payload = await res.json()
  if (payload.error) throw new Error(payload.error.message || 'RPC error')
  return payload.result
}

async function rpcOptional(method, params = []) {
  try {
    return await rpcCall(rpcUrl, rpcUser, rpcPassword, method, params)
  } catch {
    return null
  }
}

async function readLabels() {
  await ensureDataDirs()
  try {
    return JSON.parse(await fs.readFile(labelsFile, 'utf8'))
  } catch {
    return {}
  }
}

async function writeLabels(labels) {
  await ensureDataDirs()
  await fs.writeFile(labelsFile, JSON.stringify(labels, null, 2))
}

function sanitizeFilenamePart(value) {
  return String(value || 'wallet')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'wallet'
}

function isAllowedExportSource(sourcePath) {
  if (!sourcePath) return false
  const resolved = path.resolve(sourcePath)
  if (walletExportAllowlist.length === 0) return resolved === path.resolve(sourcePath)
  return walletExportAllowlist.some((base) => resolved.startsWith(path.resolve(base)))
}

app.use(express.json())

app.get('/api/health', async (_req, res) => {
  const nodeState = await readNodeState()
  res.json({ ok: true, rpcUrl, canonicalEnabled: Boolean(canonicalUrl), nodeState, writeOpsEnabled: enableWriteOps })
})

app.get('/api/node/state', async (_req, res) => {
  res.json(await readNodeState())
})

app.get('/api/wallet/labels', async (_req, res) => {
  res.json({ ok: true, labels: await readLabels() })
})

app.get('/api/wallet/contracts', async (_req, res) => {
  const nodeState = await readNodeState()
  res.json({
    ok: true,
    nodeState,
    send: {
      available: enableWriteOps,
      reason: enableWriteOps ? 'Guarded send preview is enabled' : 'Guarded wallet writes not enabled',
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
      available: Boolean(walletExportPath),
      reason: walletExportPath ? 'Backup export path configured' : 'Backup/export path not configured',
      requiredChecks: ['safe-target-path', 'wallet-safe-export-strategy', 'restore-verification'],
      actions: ['create-backup', 'export-wallet-package', 'verify-restore-package'],
    },
    labels: {
      available: true,
      reason: 'Labels and notes are stored in wallet-web data storage',
      fields: ['address', 'label', 'note'],
    },
    addressGeneration: {
      available: enableWriteOps,
      reason: enableWriteOps ? 'Guarded address generation enabled' : 'Write ops disabled',
      requiredChecks: ['explicit-user-approval', 'wallet-write-enabled'],
    },
  })
})

app.post('/api/wallet/send/preview', async (req, res) => {
  const nodeState = await readNodeState()
  const { address = '', amount = '', memo = '' } = req.body || {}

  if (!address || !String(address).trim()) {
    return res.status(400).json({ ok: false, code: 'ADDRESS_REQUIRED', message: 'Destination address is required.', nodeState })
  }

  const numericAmount = Number(amount)
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    return res.status(400).json({ ok: false, code: 'AMOUNT_INVALID', message: 'Amount must be a positive number.', nodeState })
  }

  try {
    const [walletInfo, validation] = await Promise.all([
      rpcOptional('getwalletinfo'),
      rpcOptional('validateaddress', [String(address).trim()]),
    ])

    const balance = Number(walletInfo?.balance ?? 0)
    const feeEstimate = Number((numericAmount * 0.001).toFixed(8))
    const total = Number((numericAmount + feeEstimate).toFixed(8))
    const valid = validation?.isvalid !== false

    res.json({
      ok: true,
      nodeState,
      preview: {
        address: String(address).trim(),
        amount: numericAmount,
        memo: String(memo || ''),
        validAddress: valid,
        spendableBalance: balance,
        estimatedFee: feeEstimate,
        estimatedTotal: total,
        wouldExceedBalance: total > balance,
        canBroadcast: enableWriteOps && valid && total <= balance,
      },
      requiredChecks: [
        'explicit-user-approval',
        'fresh-backup-verified',
        'wallet-unlock-policy',
        'broadcast-confirmation',
      ],
    })
  } catch (error) {
    res.status(500).json({ ok: false, code: 'SEND_PREVIEW_FAILED', message: error.message, nodeState })
  }
})

app.post('/api/wallet/address/new', async (req, res) => {
  const nodeState = await readNodeState()
  const { label = '' } = req.body || {}
  if (!enableWriteOps) {
    return res.status(403).json({ ok: false, code: 'WRITE_OPS_DISABLED', message: 'Address generation is disabled until write ops are explicitly enabled.', nodeState })
  }

  try {
    const address = await rpcCall(rpcUrl, rpcUser, rpcPassword, 'getnewaddress', [String(label || '').trim()])
    const labels = await readLabels()
    labels[address] = { ...(labels[address] || {}), label: String(label || '').trim(), note: labels[address]?.note || '', createdAt: new Date().toISOString() }
    await writeLabels(labels)
    res.json({ ok: true, nodeState, address, label: String(label || '').trim() })
  } catch (error) {
    res.status(500).json({ ok: false, code: 'ADDRESS_GENERATION_FAILED', message: error.message, nodeState })
  }
})

app.post('/api/wallet/backup/export', async (req, res) => {
  const nodeState = await readNodeState()
  const { requestedName = 'tri-wallet-backup' } = req.body || {}

  if (!walletExportPath) {
    return res.status(501).json({ ok: false, code: 'BACKUP_EXPORT_NOT_CONFIGURED', message: 'Wallet backup/export path is not configured.', nodeState })
  }

  if (!isAllowedExportSource(walletExportPath)) {
    return res.status(403).json({ ok: false, code: 'BACKUP_EXPORT_PATH_REJECTED', message: 'Configured export path is not inside the allowlist.', nodeState })
  }

  try {
    await ensureDataDirs()
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const name = sanitizeFilenamePart(requestedName)
    const source = path.resolve(walletExportPath)
    const extension = path.extname(source) || '.dat'
    const target = path.join(exportsDir, `${name}-${stamp}${extension}`)
    await fs.copyFile(source, target)
    const bytes = (await fs.stat(target)).size
    const sha256 = crypto.createHash('sha256').update(await fs.readFile(target)).digest('hex')
    res.json({
      ok: true,
      nodeState,
      export: {
        filename: path.basename(target),
        path: target,
        bytes,
        sha256,
        createdAt: new Date().toISOString(),
      },
      warning: 'This creates a file copy only. Recovery verification is still a separate required step.',
    })
  } catch (error) {
    res.status(500).json({ ok: false, code: 'BACKUP_EXPORT_FAILED', message: error.message, nodeState })
  }
})

app.post('/api/wallet/labels/save', async (req, res) => {
  const nodeState = await readNodeState()
  const { address = '', label = '', note = '' } = req.body || {}
  if (!address || !String(address).trim()) {
    return res.status(400).json({ ok: false, code: 'ADDRESS_REQUIRED', message: 'Address is required.', nodeState })
  }

  const labels = await readLabels()
  labels[String(address).trim()] = {
    ...(labels[String(address).trim()] || {}),
    label: String(label || ''),
    note: String(note || ''),
    updatedAt: new Date().toISOString(),
  }
  await writeLabels(labels)

  res.json({ ok: true, nodeState, address: String(address).trim(), entry: labels[String(address).trim()] })
})

app.get('/api/wallet/features', async (_req, res) => {
  const nodeState = await readNodeState()
  res.json({
    mode: enableWriteOps ? 'guarded-write' : 'read-only',
    nodeState,
    features: [
      { key: 'overview', label: 'Overview', status: 'live' },
      { key: 'receive', label: 'Receive addresses', status: 'live-when-rpc-ready' },
      { key: 'transactions', label: 'Transactions', status: 'live-when-rpc-ready' },
      { key: 'staking', label: 'Staking status', status: 'live-when-rpc-ready' },
      { key: 'peers', label: 'Peer diagnostics', status: 'live-when-rpc-ready' },
      { key: 'sendPreview', label: 'Send preview', status: 'live' },
      { key: 'labels', label: 'Address labels', status: 'live' },
      { key: 'addressGeneration', label: 'Generate address', status: enableWriteOps ? 'guarded-live' : 'blocked' },
      { key: 'backupExport', label: 'Backup/export', status: walletExportPath ? 'guarded-live' : 'planned' },
      { key: 'send', label: 'Send TRI', status: enableWriteOps ? 'guarded-next' : 'blocked' },
      { key: 'lockUnlock', label: 'Wallet lock/unlock', status: 'planned' },
    ],
  })
})

app.get('/api/wallet/summary', async (_req, res) => {
  const nodeState = await readNodeState()

  try {
    const [info, staking, txs, received, blockCount, bestBlock, connections, walletInfo, walletStatus, peerInfo, labels] = await Promise.all([
      rpcCall(rpcUrl, rpcUser, rpcPassword, 'getinfo'),
      rpcOptional('getstakinginfo'),
      rpcOptional('listtransactions', ['*', 50]),
      rpcOptional('listreceivedbyaddress', [0, true]),
      rpcCall(rpcUrl, rpcUser, rpcPassword, 'getblockcount'),
      rpcCall(rpcUrl, rpcUser, rpcPassword, 'getbestblockhash'),
      rpcCall(rpcUrl, rpcUser, rpcPassword, 'getconnectioncount'),
      rpcOptional('getwalletinfo'),
      rpcOptional('getwalletstatus'),
      rpcOptional('getpeerinfo'),
      readLabels(),
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
    const receivedList = Array.isArray(received)
      ? received.map((item) => ({
          ...item,
          walletMeta: labels[item.address] || null,
        }))
      : []

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
      received: receivedList,
      labels,
      featureFlags: {
        overview: true,
        receive: true,
        transactions: true,
        staking: true,
        peers: true,
        canonical: Boolean(canonicalUrl),
        sendPreview: true,
        send: false,
        addressBook: true,
        backupExport: Boolean(walletExportPath),
        addressGeneration: enableWriteOps,
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
      labels: await readLabels(),
      featureFlags: {
        overview: true,
        receive: false,
        transactions: false,
        staking: true,
        peers: false,
        canonical: Boolean(canonicalUrl),
        sendPreview: false,
        send: false,
        addressBook: true,
        backupExport: Boolean(walletExportPath),
        addressGeneration: enableWriteOps,
        lockUnlock: false,
      },
    })
  }
})

app.post('/api/rpc', async (req, res) => {
  try {
    const { method, params = [] } = req.body || {}
    if (!readAllowedMethods.has(method)) {
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

ensureDataDirs().then(() => {
  app.listen(PORT, () => {
    console.log(`TRIdock Web Wallet listening on :${PORT}`)
  })
})
