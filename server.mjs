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
const walletPassphrase = process.env.TRI_WALLET_PASSPHRASE || ''
const requireUnlockForSend = process.env.TRI_REQUIRE_UNLOCK_FOR_SEND !== '0'
const allowSendBroadcast = process.env.TRI_ALLOW_SEND_BROADCAST === '1'
const allowWalletUnlock = process.env.TRI_ALLOW_WALLET_UNLOCK === '1'
const unlockTimeoutSeconds = Number(process.env.TRI_WALLET_UNLOCK_TIMEOUT || '180')

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
  'validateaddress',
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

function toPositiveInteger(value, fallback) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback
}

async function readWalletStatusInfo() {
  const [walletInfo, walletStatus] = await Promise.all([
    rpcOptional('getwalletinfo'),
    rpcOptional('getwalletstatus'),
  ])

  const unlockedUntil = walletInfo?.unlocked_until ?? walletStatus?.unlocked_until ?? null
  const encrypted = Boolean(
    walletInfo?.unlocked_until !== undefined ||
    walletStatus?.encrypted ||
    walletStatus?.locked !== undefined
  )
  const locked = encrypted ? Number(unlockedUntil || 0) <= 0 : false

  return {
    walletInfo,
    walletStatus,
    encrypted,
    locked,
    unlockedUntil,
  }
}

async function buildCapabilities(nodeState) {
  const walletMeta = await readWalletStatusInfo()
  const exportReady = Boolean(walletExportPath) && isAllowedExportSource(walletExportPath)
  const nodeReady = !['bootstrapping', 'bootstrap', 'reseed'].includes(String(nodeState?.status || '').toLowerCase())
  const canonicalMismatch = String(nodeState?.canonicalStatus || '').toLowerCase().includes('mismatch')
  const sendBlockedReasons = []

  if (!enableWriteOps) sendBlockedReasons.push('write-ops-disabled')
  if (!allowSendBroadcast) sendBlockedReasons.push('send-broadcast-disabled')
  if (!nodeReady) sendBlockedReasons.push('node-not-ready')
  if (canonicalMismatch) sendBlockedReasons.push('canonical-mismatch')
  if (requireUnlockForSend && walletMeta.encrypted && walletMeta.locked) sendBlockedReasons.push('wallet-locked')

  return {
    wallet: {
      encrypted: walletMeta.encrypted,
      locked: walletMeta.locked,
      unlockedUntil: walletMeta.unlockedUntil,
    },
    send: {
      available: enableWriteOps && allowSendBroadcast,
      ready: sendBlockedReasons.length === 0,
      blockedReasons: sendBlockedReasons,
      requiresUnlock: requireUnlockForSend && walletMeta.encrypted,
      requiresConfirmation: true,
    },
    backup: {
      available: Boolean(walletExportPath),
      ready: exportReady,
      blockedReasons: exportReady ? [] : ['backup-export-not-configured-or-not-allowlisted'],
    },
    addressGeneration: {
      available: enableWriteOps,
      ready: enableWriteOps && nodeReady,
      blockedReasons: enableWriteOps && nodeReady ? [] : ['write-ops-disabled-or-node-not-ready'],
    },
    unlock: {
      available: allowWalletUnlock,
      ready: allowWalletUnlock && Boolean(walletPassphrase),
      blockedReasons: allowWalletUnlock ? (walletPassphrase ? [] : ['wallet-passphrase-not-configured']) : ['wallet-unlock-disabled'],
      timeoutSeconds: toPositiveInteger(unlockTimeoutSeconds, 180),
    },
  }
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
  const capabilities = await buildCapabilities(nodeState)
  res.json({
    ok: true,
    nodeState,
    wallet: capabilities.wallet,
    send: {
      available: capabilities.send.available,
      ready: capabilities.send.ready,
      blockedReasons: capabilities.send.blockedReasons,
      reason: capabilities.send.available ? 'Live send pipeline is enabled when readiness checks pass' : 'Send broadcast is not enabled for this instance',
      requiredChecks: [
        'node-ready',
        'canonical-not-mismatched',
        'wallet-unlock-policy',
        'transaction-preview',
        'broadcast-confirmation',
      ],
      fields: ['address', 'amount', 'memo'],
    },
    backup: {
      available: capabilities.backup.available,
      ready: capabilities.backup.ready,
      blockedReasons: capabilities.backup.blockedReasons,
      reason: capabilities.backup.available ? 'Backup export path configured' : 'Backup/export path not configured',
      requiredChecks: ['safe-target-path', 'wallet-safe-export-strategy', 'restore-verification'],
      actions: ['create-backup', 'export-wallet-package', 'verify-restore-package'],
    },
    labels: {
      available: true,
      reason: 'Labels and notes are stored in wallet-web data storage',
      fields: ['address', 'label', 'note'],
    },
    addressGeneration: {
      available: capabilities.addressGeneration.available,
      ready: capabilities.addressGeneration.ready,
      blockedReasons: capabilities.addressGeneration.blockedReasons,
      reason: capabilities.addressGeneration.available ? 'Address generation is enabled when the node is ready' : 'Write ops disabled',
      requiredChecks: ['wallet-write-enabled', 'node-ready'],
    },
    unlock: {
      available: capabilities.unlock.available,
      ready: capabilities.unlock.ready,
      blockedReasons: capabilities.unlock.blockedReasons,
      timeoutSeconds: capabilities.unlock.timeoutSeconds,
    },
  })
})

app.post('/api/wallet/send/preview', async (req, res) => {
  const nodeState = await readNodeState()
  const capabilities = await buildCapabilities(nodeState)
  const { address = '', amount = '', memo = '' } = req.body || {}

  if (!address || !String(address).trim()) {
    return res.status(400).json({ ok: false, code: 'ADDRESS_REQUIRED', message: 'Destination address is required.', nodeState, capabilities })
  }

  const numericAmount = Number(amount)
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    return res.status(400).json({ ok: false, code: 'AMOUNT_INVALID', message: 'Amount must be a positive number.', nodeState, capabilities })
  }

  try {
    const [walletMeta, validation] = await Promise.all([
      readWalletStatusInfo(),
      rpcOptional('validateaddress', [String(address).trim()]),
    ])

    const balance = Number(walletMeta.walletInfo?.balance ?? 0)
    const feeEstimate = Number((numericAmount * 0.001).toFixed(8))
    const total = Number((numericAmount + feeEstimate).toFixed(8))
    const valid = validation?.isvalid !== false
    const blockedReasons = [...capabilities.send.blockedReasons]

    if (!valid) blockedReasons.push('invalid-address')
    if (total > balance) blockedReasons.push('insufficient-balance')

    res.json({
      ok: true,
      nodeState,
      capabilities,
      preview: {
        address: String(address).trim(),
        amount: numericAmount,
        memo: String(memo || ''),
        validAddress: valid,
        spendableBalance: balance,
        estimatedFee: feeEstimate,
        estimatedTotal: total,
        wouldExceedBalance: total > balance,
        walletEncrypted: capabilities.wallet.encrypted,
        walletLocked: capabilities.wallet.locked,
        canBroadcast: blockedReasons.length === 0,
        blockedReasons,
      },
      requiredChecks: [
        'node-ready',
        'canonical-not-mismatched',
        'wallet-unlock-policy',
        'broadcast-confirmation',
      ],
    })
  } catch (error) {
    res.status(500).json({ ok: false, code: 'SEND_PREVIEW_FAILED', message: error.message, nodeState, capabilities })
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

app.post('/api/wallet/unlock', async (req, res) => {
  const nodeState = await readNodeState()
  const capabilities = await buildCapabilities(nodeState)
  const timeout = toPositiveInteger(req.body?.timeoutSeconds, capabilities.unlock.timeoutSeconds)

  if (!capabilities.unlock.available) {
    return res.status(403).json({ ok: false, code: 'WALLET_UNLOCK_DISABLED', message: 'Wallet unlock is disabled for this instance.', nodeState, capabilities })
  }
  if (!walletPassphrase) {
    return res.status(500).json({ ok: false, code: 'WALLET_PASSPHRASE_NOT_CONFIGURED', message: 'Server-side wallet passphrase is not configured.', nodeState, capabilities })
  }

  try {
    await rpcCall(rpcUrl, rpcUser, rpcPassword, 'walletpassphrase', [walletPassphrase, timeout])
    const walletMeta = await readWalletStatusInfo()
    res.json({
      ok: true,
      nodeState,
      wallet: {
        encrypted: walletMeta.encrypted,
        locked: walletMeta.locked,
        unlockedUntil: walletMeta.unlockedUntil,
      },
      message: `Wallet unlocked for ${timeout} seconds.`,
    })
  } catch (error) {
    res.status(500).json({ ok: false, code: 'WALLET_UNLOCK_FAILED', message: error.message, nodeState, capabilities })
  }
})

app.post('/api/wallet/lock', async (_req, res) => {
  const nodeState = await readNodeState()
  try {
    await rpcCall(rpcUrl, rpcUser, rpcPassword, 'walletlock')
    const walletMeta = await readWalletStatusInfo()
    res.json({
      ok: true,
      nodeState,
      wallet: {
        encrypted: walletMeta.encrypted,
        locked: walletMeta.locked,
        unlockedUntil: walletMeta.unlockedUntil,
      },
      message: 'Wallet locked.',
    })
  } catch (error) {
    res.status(500).json({ ok: false, code: 'WALLET_LOCK_FAILED', message: error.message, nodeState })
  }
})

app.post('/api/wallet/send/broadcast', async (req, res) => {
  const nodeState = await readNodeState()
  const capabilities = await buildCapabilities(nodeState)
  const { address = '', amount = '', memo = '', confirm = false } = req.body || {}

  if (!confirm) {
    return res.status(400).json({ ok: false, code: 'CONFIRMATION_REQUIRED', message: 'Explicit confirmation is required before broadcasting.', nodeState, capabilities })
  }

  const numericAmount = Number(amount)
  if (!address || !String(address).trim()) {
    return res.status(400).json({ ok: false, code: 'ADDRESS_REQUIRED', message: 'Destination address is required.', nodeState, capabilities })
  }
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    return res.status(400).json({ ok: false, code: 'AMOUNT_INVALID', message: 'Amount must be a positive number.', nodeState, capabilities })
  }

  const previewValidation = await rpcOptional('validateaddress', [String(address).trim()])
  const walletMeta = await readWalletStatusInfo()
  const balance = Number(walletMeta.walletInfo?.balance ?? 0)
  const feeEstimate = Number((numericAmount * 0.001).toFixed(8))
  const total = Number((numericAmount + feeEstimate).toFixed(8))
  const blockedReasons = [...capabilities.send.blockedReasons]

  if (previewValidation?.isvalid === false) blockedReasons.push('invalid-address')
  if (total > balance) blockedReasons.push('insufficient-balance')

  if (blockedReasons.length > 0) {
    return res.status(409).json({
      ok: false,
      code: 'SEND_NOT_READY',
      message: 'This wallet instance is not ready to broadcast the transaction.',
      nodeState,
      capabilities,
      preview: {
        address: String(address).trim(),
        amount: numericAmount,
        memo: String(memo || ''),
        estimatedFee: feeEstimate,
        estimatedTotal: total,
        spendableBalance: balance,
        blockedReasons,
      },
    })
  }

  try {
    const txid = await rpcCall(rpcUrl, rpcUser, rpcPassword, 'sendtoaddress', [String(address).trim(), numericAmount, String(memo || '')])
    res.json({
      ok: true,
      nodeState,
      txid,
      sent: {
        address: String(address).trim(),
        amount: numericAmount,
        memo: String(memo || ''),
        estimatedFee: feeEstimate,
        estimatedTotal: total,
      },
      message: 'Transaction broadcast submitted.',
    })
  } catch (error) {
    res.status(500).json({ ok: false, code: 'SEND_BROADCAST_FAILED', message: error.message, nodeState, capabilities })
  }
})

app.get('/api/wallet/features', async (_req, res) => {
  const nodeState = await readNodeState()
  const capabilities = await buildCapabilities(nodeState)
  res.json({
    mode: enableWriteOps ? 'live-wallet' : 'inspection-only',
    nodeState,
    capabilities,
    features: [
      { key: 'overview', label: 'Overview', status: 'live' },
      { key: 'receive', label: 'Receive addresses', status: 'live-when-rpc-ready' },
      { key: 'transactions', label: 'Transactions', status: 'live-when-rpc-ready' },
      { key: 'staking', label: 'Staking status', status: 'live-when-rpc-ready' },
      { key: 'peers', label: 'Peer diagnostics', status: 'live-when-rpc-ready' },
      { key: 'sendPreview', label: 'Send preview', status: 'live' },
      { key: 'labels', label: 'Address labels', status: 'live' },
      { key: 'addressGeneration', label: 'Generate address', status: capabilities.addressGeneration.ready ? 'live' : 'guarded' },
      { key: 'backupExport', label: 'Backup/export', status: capabilities.backup.ready ? 'live' : 'guarded' },
      { key: 'send', label: 'Send TRI', status: capabilities.send.ready ? 'live' : 'guarded' },
      { key: 'lockUnlock', label: 'Wallet lock/unlock', status: capabilities.unlock.ready ? 'live' : 'guarded' },
    ],
  })
})

app.get('/api/wallet/summary', async (_req, res) => {
  const nodeState = await readNodeState()

  try {
    const [info, staking, txs, received, blockCount, bestBlock, connections, walletInfo, walletStatus, peerInfo, labels, capabilities] = await Promise.all([
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
      buildCapabilities(nodeState),
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
      capabilities,
      featureFlags: {
        overview: true,
        receive: true,
        transactions: true,
        staking: true,
        peers: true,
        canonical: Boolean(canonicalUrl),
        sendPreview: true,
        send: capabilities.send.available,
        addressBook: true,
        backupExport: capabilities.backup.available,
        addressGeneration: capabilities.addressGeneration.available,
        lockUnlock: capabilities.unlock.available,
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
      capabilities: await buildCapabilities(nodeState),
      featureFlags: {
        overview: true,
        receive: false,
        transactions: false,
        staking: true,
        peers: false,
        canonical: Boolean(canonicalUrl),
        sendPreview: false,
        send: allowSendBroadcast,
        addressBook: true,
        backupExport: Boolean(walletExportPath),
        addressGeneration: enableWriteOps,
        lockUnlock: allowWalletUnlock,
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
