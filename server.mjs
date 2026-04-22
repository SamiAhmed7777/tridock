import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs/promises'
import crypto from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

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
const triMode = process.env.TRI_MODE || 'full'
const isLightMode = triMode === 'light'
const allowSmsg = process.env.TRI_ALLOW_SMSG !== '0'

// Multi-node support
const nodesFile = path.join(dataDir, 'nodes.json')

// Build default node from env
const defaultNode = {
  id: 'local',
  name: process.env.TRI_NODE_NAME || 'Local',
  url: rpcUrl,
  user: rpcUser,
  password: rpcPassword,
}

let savedNodes = [defaultNode]
let activeNodeId = defaultNode.id

async function loadNodes() {
  try {
    const data = await fs.readFile(nodesFile, 'utf8')
    const parsed = JSON.parse(data)
    if (Array.isArray(parsed.nodes) && parsed.nodes.length > 0) {
      savedNodes = parsed.nodes
    }
    if (parsed.activeNodeId && savedNodes.find((n) => n.id === parsed.activeNodeId)) {
      activeNodeId = parsed.activeNodeId
    }
  } catch { /* use defaults */ }
}

async function saveNodes() {
  await ensureDataDirs()
  await fs.writeFile(nodesFile, JSON.stringify({ nodes: savedNodes, activeNodeId }, null, 2))
}

function getActiveNode() {
  return savedNodes.find((n) => n.id === activeNodeId) || defaultNode
}

async function probeNode(node) {
  try {
    const info = await rpcCall(node.url, node.user, node.password, 'getinfo')
    const blocks = await rpcCall(node.url, node.user, node.password, 'getblockcount').catch(() => null)
    const bestblock = await rpcCall(node.url, node.user, node.password, 'getbestblockhash').catch(() => null)
    return { ok: true, version: info.version, blocks, bestblock }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

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

const torSocksProxy = process.env.TRI_TOR_SOCKS || '127.0.0.1:9050'

function isOnionUrl(url) {
  try { return new URL(url).hostname.endsWith('.onion') } catch { return false }
}

async function rpcCallViaTor(url, user, password, method, params = []) {
  const body = JSON.stringify({ jsonrpc: '1.0', id: method, method, params })
  const args = ['--socks5-hostname', torSocksProxy, '-s', '--max-time', '30', '-H', 'Content-Type: application/json']
  if (user || password) args.push('-u', `${user}:${password}`)
  args.push('-d', body, url)

  const { stdout } = await execFileAsync('curl', args)
  const payload = JSON.parse(stdout)
  if (payload.error) throw new Error(payload.error.message || 'RPC error')
  return payload.result
}

async function rpcCall(url, user, password, method, params = []) {
  // Route .onion URLs through Tor SOCKS proxy via curl
  if (isOnionUrl(url)) return rpcCallViaTor(url, user, password, method, params)

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
    const node = getActiveNode()
    return await rpcCall(node.url, node.user, node.password, method, params)
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
  // In light mode the node is always "ready" — readiness is determined by remote RPC connectivity
  const nodeReady = isLightMode || !['bootstrapping', 'bootstrap', 'reseed'].includes(String(nodeState?.status || '').toLowerCase())
  const canonicalMismatch = !isLightMode && String(nodeState?.canonicalStatus || '').toLowerCase().includes('mismatch')
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
    messaging: {
      available: allowSmsg,
      ready: allowSmsg && nodeReady && !canonicalMismatch,
      requiresUnlock: true,
      blockedReasons: (() => {
        const reasons = []
        if (!allowSmsg) reasons.push('messaging-disabled')
        if (!nodeReady) reasons.push('node-not-ready')
        if (canonicalMismatch) reasons.push('canonical-mismatch')
        if (walletMeta.encrypted && walletMeta.locked) reasons.push('wallet-locked-for-reading')
        return reasons
      })(),
    },
  }
}

app.use(express.json())

app.get('/api/health', async (_req, res) => {
  const nodeState = isLightMode
    ? { status: 'running', reason: 'Light mode — using remote node' }
    : await readNodeState()
  res.json({ ok: true, rpcUrl, mode: triMode, canonicalEnabled: Boolean(canonicalUrl), nodeState, writeOpsEnabled: enableWriteOps })
})

app.get('/api/node/state', async (_req, res) => {
  if (isLightMode) {
    return res.json({ status: 'running', reason: 'Light mode — using remote node', mode: 'light' })
  }
  res.json(await readNodeState())
})

app.get('/api/system', async (_req, res) => {
  // Detect container environment and expose system metadata
  let inContainer = false
  let containerId = ''
  try {
    const cgroup = await fs.readFile('/proc/self/cgroup', 'utf8')
    const match = cgroup.match(/docker|lxc|containerd/)
    inContainer = Boolean(match)
    const idMatch = cgroup.match(/[a-f0-9]{64}/)
    if (idMatch) containerId = idMatch[0].slice(0, 12)
  } catch { /* not available */ }

  // Uptime
  let uptimeSeconds = 0
  try {
    const uptime = await fs.readFile('/proc/uptime', 'utf8')
    uptimeSeconds = Math.floor(Number(uptime.split(' ')[0]))
  } catch { /* ignore */ }

  // Memory (from cgroup v2 or v1)
  let memLimit = null
  let memUsage = null
  try {
    for (const path of ['/sys/fs/cgroup/memory.max', '/sys/fs/cgroup/memory/memory.limit_in_bytes']) {
      try {
        memLimit = parseInt(await fs.readFile(path, 'utf8'), 10)
        if (memLimit > 0 && memLimit < 999999999) break
        memLimit = null
      } catch { /* try next */ }
    }
    for (const path of ['/sys/fs/cgroup/memory.current', '/sys/fs/cgroup/memory/memory.usage_in_bytes']) {
      try {
        memUsage = parseInt(await fs.readFile(path, 'utf8'), 10)
        break
      } catch { /* try next */ }
    }
  } catch { /* ignore */ }

  res.json({
    inContainer,
    containerId,
    mode: triMode,
    uptimeSeconds,
    uptimeHuman: uptimeSeconds > 0 ? `${Math.floor(uptimeSeconds / 86400)}d ${Math.floor((uptimeSeconds % 86400) / 3600)}h ${Math.floor((uptimeSeconds % 3600) / 60)}m` : null,
    memLimit: memLimit ? Math.round(memLimit / 1024 / 1024) : null,
    memUsage: memUsage ? Math.round(memUsage / 1024 / 1024) : null,
    nodeVersion: process.version,
    platform: process.platform,
    triVersion: process.env.TRI_VERSION || null,
    imageVersion: process.env.TRIDOCK_VERSION || process.env.TRI_VERSION || null,
    activeNode: { id: getActiveNode().id, name: getActiveNode().name, url: getActiveNode().url },
  })
})

app.get('/api/wallet/labels', async (_req, res) => {
  res.json({ ok: true, labels: await readLabels() })
})

app.get('/api/wallet/contracts', async (_req, res) => {
  const nodeState = isLightMode
    ? { status: 'running', reason: 'Light mode — using remote node', mode: 'light' }
    : await readNodeState()
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
    messaging: {
      available: capabilities.messaging.available,
      ready: capabilities.messaging.ready,
      requiresUnlock: capabilities.messaging.requiresUnlock,
      blockedReasons: capabilities.messaging.blockedReasons,
      reason: capabilities.messaging.available ? 'Encrypted P2P messaging via smessage protocol' : 'Secure messaging is disabled',
      limits: { maxMessageBytes: 4096, retentionSeconds: 172800 },
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
    const node = getActiveNode()
    const address = await rpcCall(node.url, node.user, node.password, 'getnewaddress', [String(label || '').trim()])
    const labels = await readLabels()
    labels[address] = { ...(labels[address] || {}), label: String(label || '').trim(), note: labels[address]?.note || '', createdAt: new Date().toISOString() }
    await writeLabels(labels)
    res.json({ ok: true, nodeState, address, label: String(label || '').trim() })
  } catch (error) {
    res.status(500).json({ ok: false, code: 'ADDRESS_GENERATION_FAILED', message: error.message, nodeState })
  }
})

app.get('/api/wallet/backups', async (_req, res) => {
  // List available backup files from the exports directory
  try {
    await ensureDataDirs()
    let files = []
    try {
      const entries = await fs.readdir(exportsDir)
      files = await Promise.all(
        entries
          .filter((f) => f.endsWith('.dat') || f.endsWith('.zip') || f.endsWith('.tar.gz'))
          .map(async (f) => {
            const stat = await fs.stat(path.join(exportsDir, f))
            return {
              name: f,
              path: path.join(exportsDir, f),
              size: stat.size,
              modified: stat.mtime.toISOString(),
              type: 'export',
            }
          })
      )
    } catch { /* exports dir empty or missing */ }

    // Also scan the /tri/backups directory if it exists and is mounted
    const triBackupsDir = path.resolve('/tri/backups')
    if (triBackupsDir !== path.resolve('/')) {
      try {
        const entries = await fs.readdir(triBackupsDir)
        const triFiles = await Promise.all(
          entries
            .filter((f) => f.endsWith('.dat') || f.startsWith('wallet-'))
            .map(async (f) => {
              const fp = path.join(triBackupsDir, f)
              const stat = await fs.stat(fp)
              return {
                name: f,
                path: fp,
                size: stat.size,
                modified: stat.mtime.toISOString(),
                type: 'wallet-dat',
              }
            })
        )
        // Merge, avoid duplicates by name
        const existing = new Set(files.map((f) => f.name))
        for (const tf of triFiles) {
          if (!existing.has(tf.name)) files.push(tf)
        }
      } catch { /* tri/backups not mounted or empty */ }
    }

    files.sort((a, b) => new Date(b.modified) - new Date(a.modified))
    res.json({ ok: true, files })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/wallet/backups/:filename', async (req, res) => {
  const { filename } = req.params || {}
  if (!filename || filename.includes('..') || filename.includes('/')) {
    return res.status(400).json({ error: 'Invalid filename' })
  }
  const filePath = path.join(exportsDir, filename)
  // Security: ensure the resolved path is within exportsDir
  if (!path.resolve(filePath).startsWith(path.resolve(exportsDir))) {
    return res.status(403).json({ error: 'Path not allowed' })
  }
  try {
    await fs.access(filePath)
    res.download(filePath, filename)
  } catch {
    res.status(404).json({ error: 'File not found' })
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
    const node = getActiveNode()
    await rpcCall(node.url, node.user, node.password, 'walletpassphrase', [walletPassphrase, timeout])
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
    const node = getActiveNode()
    await rpcCall(node.url, node.user, node.password, 'walletlock')
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

  // Short-circuit on obviously invalid address before any RPC call
  if (previewValidation?.isvalid === false) {
    return res.status(400).json({
      ok: false,
      code: 'INVALID_ADDRESS',
      message: 'The destination address is not valid. Please double-check it.',
      nodeState,
      capabilities,
    })
  }

  // Wallet must be unlocked before sending
  if (walletMeta.encrypted && walletMeta.locked) {
    return res.status(409).json({
      ok: false,
      code: 'WALLET_LOCKED',
      message: 'The wallet is locked. Unlock it first before sending.',
      nodeState,
      capabilities,
    })
  }

  if (total > balance) {
    return res.status(409).json({
      ok: false,
      code: 'INSUFFICIENT_BALANCE',
      message: `Insufficient balance. Need ${total} TRI but only ${balance} TRI is spendable.`,
      nodeState,
      capabilities,
      preview: {
        address: String(address).trim(),
        amount: numericAmount,
        memo: String(memo || ''),
        estimatedFee: feeEstimate,
        estimatedTotal: total,
        spendableBalance: balance,
      },
    })
  }

  try {
    const node = getActiveNode()
    const txid = await rpcCall(node.url, node.user, node.password, 'sendtoaddress', [String(address).trim(), numericAmount, String(memo || '')])
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
    // Map common RPC errors to friendly codes
    let code = 'SEND_BROADCAST_FAILED'
    if (/empty passphrase/i.test(error.message)) code = 'PASSPHRASE_EMPTY'
    else if (/wallet is already unlocked/i.test(error.message)) code = 'ALREADY_UNLOCKED'
    else if (/couldn't decrypt passphrase/i.test(error.message)) code = 'BAD_PASSPHRASE'
    else if (/Amount exceeds available balance/i.test(error.message)) code = 'INSUFFICIENT_BALANCE'

    res.status(500).json({ ok: false, code, message: error.message, nodeState, capabilities })
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
      { key: 'messaging', label: 'Secure messaging', status: capabilities.messaging.ready ? 'live' : (capabilities.messaging.available ? 'guarded' : 'off') },
    ],
  })
})

app.get('/api/wallet/summary', async (_req, res) => {
  const nodeState = isLightMode
    ? { status: 'running', reason: 'Light mode — using remote node', mode: 'light' }
    : await readNodeState()
  const node = getActiveNode()

  try {
    const [info, staking, txs, received, blockCount, bestBlock, connections, walletInfo, walletStatus, peerInfo, labels, capabilities] = await Promise.all([
      rpcCall(node.url, node.user, node.password, 'getinfo'),
      rpcOptional('getstakinginfo'),
      rpcOptional('listtransactions', ['*', 50]),
      rpcOptional('listreceivedbyaddress', [0, true]),
      rpcCall(node.url, node.user, node.password, 'getblockcount'),
      rpcCall(node.url, node.user, node.password, 'getbestblockhash'),
      rpcCall(node.url, node.user, node.password, 'getconnectioncount'),
      rpcOptional('getwalletinfo'),
      rpcOptional('getwalletstatus'),
      rpcOptional('getpeerinfo'),
      readLabels(),
      buildCapabilities(nodeState),
    ])

    // Canonical comparison: use external RPC if configured, otherwise fall back to
    // TRIdock's own state-file chain tip (written by the node itself when it is
    // the reference/canonical instance).
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
    } else if (nodeState.canonicalHeight && nodeState.canonicalBestblock) {
      // TRIdock wrote its own chain tip to state files — use those as the
      // reference so the UI still shows a meaningful height/hash even without
      // an external canonical RPC.
      canonical = {
        enabled: true,
        matched: nodeState.canonicalHeight === blockCount && nodeState.canonicalBestblock === bestBlock,
        canonicalHeight: nodeState.canonicalHeight,
        canonicalBestblock: nodeState.canonicalBestblock,
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
        messaging: capabilities.messaging.available,
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
        messaging: allowSmsg,
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
    const result = await rpcCall(getActiveNode().url, getActiveNode().user, getActiveNode().password, method, params)
    res.json({ result })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// ─── Secure Messaging API (smessage) ─────────────────────────────────────────

function parseSmsgResult(raw) {
  // smessage RPCs return results as a flat object or string; normalize to usable shape
  if (typeof raw === 'string') return { result: raw, messages: [] }
  if (!raw) return { result: '', messages: [] }

  // smsginbox / smsgoutbox return messages embedded under repeated "message" keys
  // The RPC returns { message: {...}, message: {...}, result: "N messages shown." }
  // But JSON doesn't support duplicate keys — the RPC actually returns an array-like
  // structure that the JSON-RPC layer flattens. We handle both array and object forms.
  if (Array.isArray(raw)) {
    return { result: '', messages: raw }
  }

  // Single object with a "message" field (single message)
  if (raw.message && typeof raw.message === 'object' && !Array.isArray(raw.message)) {
    return { result: raw.result || '', messages: [raw.message] }
  }

  // Try to extract messages from the result string count
  return { result: raw.result || String(raw), messages: raw.messages || [] }
}

app.get('/api/messages/inbox', async (_req, res) => {
  if (!allowSmsg) return res.status(403).json({ error: 'Secure messaging is disabled' })
  const node = getActiveNode()
  try {
    const raw = await rpcCall(node.url, node.user, node.password, 'smsginbox', ['all'])
    const parsed = parseSmsgResult(raw)
    res.json({ ok: true, ...parsed })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

app.get('/api/messages/outbox', async (_req, res) => {
  if (!allowSmsg) return res.status(403).json({ error: 'Secure messaging is disabled' })
  const node = getActiveNode()
  try {
    const raw = await rpcCall(node.url, node.user, node.password, 'smsgoutbox', ['all'])
    const parsed = parseSmsgResult(raw)
    res.json({ ok: true, ...parsed })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

app.post('/api/messages/send', async (req, res) => {
  if (!allowSmsg) return res.status(403).json({ error: 'Secure messaging is disabled' })
  const { from, to, message } = req.body || {}
  if (!from || !to || !message) return res.status(400).json({ error: 'from, to, and message are required' })
  if (message.length > 4096) return res.status(400).json({ error: 'Message exceeds 4096 byte limit' })
  const node = getActiveNode()
  try {
    const result = await rpcCall(node.url, node.user, node.password, 'smsgsend', [from, to, message])
    const ok = typeof result === 'string' ? result.toLowerCase().includes('sent') : result?.result?.toLowerCase().includes('sent')
    res.json({ ok, result: typeof result === 'string' ? result : (result?.result || JSON.stringify(result)) })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

app.post('/api/messages/send-anon', async (req, res) => {
  if (!allowSmsg) return res.status(403).json({ error: 'Secure messaging is disabled' })
  const { to, message } = req.body || {}
  if (!to || !message) return res.status(400).json({ error: 'to and message are required' })
  if (message.length > 4096) return res.status(400).json({ error: 'Message exceeds 4096 byte limit' })
  const node = getActiveNode()
  try {
    const result = await rpcCall(node.url, node.user, node.password, 'smsgsendanon', [to, message])
    const ok = typeof result === 'string' ? result.toLowerCase().includes('sent') : result?.result?.toLowerCase().includes('sent')
    res.json({ ok, result: typeof result === 'string' ? result : (result?.result || JSON.stringify(result)) })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

app.get('/api/messages/keys', async (_req, res) => {
  if (!allowSmsg) return res.status(403).json({ error: 'Secure messaging is disabled' })
  const node = getActiveNode()
  try {
    const raw = await rpcCall(node.url, node.user, node.password, 'smsglocalkeys', ['all'])
    // Parse key listing — result is { key: "addr - pubkey Receive on/off, Anon on/off - label", result: "N keys listed." }
    const keys = []
    if (typeof raw === 'object' && raw !== null) {
      const entries = Array.isArray(raw) ? raw : (raw.key ? [raw.key] : [])
      for (const entry of [].concat(entries)) {
        if (typeof entry !== 'string') continue
        const match = entry.match(/^(\S+)\s+-\s+(\S+)\s+(.*)$/)
        if (match) {
          const [, address, pubkey, flags] = match
          keys.push({
            address,
            pubkey,
            receiveOn: /Receive on/i.test(flags),
            anonOn: /Anon on/i.test(flags),
            label: (flags.match(/-\s*(.+)$/) || [])[1]?.trim() || '',
          })
        }
      }
    }
    res.json({ ok: true, keys, result: raw?.result || '' })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

app.post('/api/messages/keys/receive', async (req, res) => {
  if (!allowSmsg) return res.status(403).json({ error: 'Secure messaging is disabled' })
  const { address, enable } = req.body || {}
  if (!address) return res.status(400).json({ error: 'address is required' })
  const flag = enable ? '+' : '-'
  const node = getActiveNode()
  try {
    const result = await rpcCall(node.url, node.user, node.password, 'smsglocalkeys', ['recv', flag, address])
    res.json({ ok: true, result: typeof result === 'string' ? result : (result?.result || JSON.stringify(result)) })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

app.post('/api/messages/pubkey', async (req, res) => {
  if (!allowSmsg) return res.status(403).json({ error: 'Secure messaging is disabled' })
  const { address } = req.body || {}
  if (!address) return res.status(400).json({ error: 'address is required' })
  const node = getActiveNode()
  try {
    const result = await rpcCall(node.url, node.user, node.password, 'smsggetpubkey', [address])
    const found = typeof result === 'object' && result?.result?.toLowerCase().includes('success')
    res.json({
      ok: true,
      found,
      pubkey: result?.['compressed public key'] || result?.['peer address in DB'] || null,
      source: result?.['address in wallet'] ? 'wallet' : (result?.['peer address in DB'] ? 'database' : null),
      result: result?.result || '',
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

app.post('/api/messages/scan-chain', async (_req, res) => {
  if (!allowSmsg) return res.status(403).json({ error: 'Secure messaging is disabled' })
  const node = getActiveNode()
  try {
    const result = await rpcCall(node.url, node.user, node.password, 'smsgscanchain', [])
    res.json({ ok: true, result: typeof result === 'string' ? result : (result?.result || JSON.stringify(result)) })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// ─── Multi-node API ───────────────────────────────────────────────────────────

app.get('/api/nodes', async (_req, res) => {
  // Probe all nodes in parallel
  const withStatus = await Promise.all(
    savedNodes.map(async (n) => {
      const probe = await probeNode(n)
      return {
        id: n.id,
        name: n.name,
        url: n.url,
        active: n.id === activeNodeId,
        status: probe.ok ? { version: probe.version, blocks: probe.blocks, bestblock: probe.bestblock } : { error: probe.error },
      }
    })
  )
  res.json({ nodes: withStatus })
})

app.post('/api/nodes/switch', async (req, res) => {
  const { nodeId } = req.body || {}
  if (!nodeId) return res.status(400).json({ error: 'nodeId is required' })
  const found = savedNodes.find((n) => n.id === nodeId)
  if (!found) return res.status(404).json({ error: 'Node not found' })
  activeNodeId = nodeId
  await saveNodes()
  res.json({ ok: true, activeNode: { id: found.id, name: found.name, url: found.url } })
})

app.post('/api/nodes', async (req, res) => {
  const { name, url, user, password } = req.body || {}
  if (!name || !url) return res.status(400).json({ error: 'name and url are required' })
  const id = `node-${Date.now()}`
  savedNodes.push({ id, name: String(name).trim(), url: String(url).trim(), user: String(user || '').trim(), password: String(password || '').trim() })
  await saveNodes()
  res.json({ ok: true, node: savedNodes.find((n) => n.id === id) })
})

app.delete('/api/nodes/:index', async (req, res) => {
  const idx = Number(req.params.index)
  if (isNaN(idx) || idx < 0 || idx >= savedNodes.length) return res.status(404).json({ error: 'Invalid index' })
  if (savedNodes.length <= 1) return res.status(400).json({ error: 'Cannot delete the last node' })
  const removed = savedNodes.splice(idx, 1)[0]
  if (removed.id === activeNodeId) {
    activeNodeId = savedNodes[0].id
  }
  await saveNodes()
  res.json({ ok: true })
})

// ─── Contacts ───────────────────────────────────────────────────────────
const contactsPath = path.join(dataDir, 'contacts.json')
function loadContacts() {
  try {
    if (!fs.existsSync(contactsPath)) return []
    return JSON.parse(fs.readFileSync(contactsPath, 'utf8'))
  } catch { return [] }
}
function saveContacts(contacts) {
  fs.writeFileSync(contactsPath, JSON.stringify(contacts, null, 2))
}

app.get('/api/contacts', async (req, res) => {
  const contacts = loadContacts()
  res.json({ ok: true, contacts })
})

app.post('/api/contacts', async (req, res) => {
  const { name, address, label, note } = req.body || {}
  if (!name || !address) return res.json({ ok: false, message: 'name and address required' })
  const contacts = loadContacts().filter((c) => c.address !== address)
  contacts.push({ name, address, label: label || '', note: note || '', createdAt: new Date().toISOString() })
  saveContacts(contacts)
  res.json({ ok: true, contacts })
})

app.put('/api/contacts/:address', async (req, res) => {
  const addr = decodeURIComponent(req.params.address)
  const { name, label, note } = req.body || {}
  const contacts = loadContacts()
  const idx = contacts.findIndex((c) => c.address === addr)
  if (idx === -1) return res.json({ ok: false, message: 'contact not found' })
  contacts[idx] = { ...contacts[idx], name, label: label || '', note: note || '' }
  saveContacts(contacts)
  res.json({ ok: true, contacts })
})

app.delete('/api/contacts/:address', async (req, res) => {
  const addr = decodeURIComponent(req.params.address)
  const contacts = loadContacts().filter((c) => c.address !== addr)
  saveContacts(contacts)
  res.json({ ok: true, contacts })
})


// ─── Static serving ──────────────────────────────────────────────────────────

app.use(express.static(distDir))
app.use((_req, res) => {
  res.sendFile(path.join(distDir, 'index.html'))
})

ensureDataDirs().then(() => loadNodes()).then(() => {
  app.listen(PORT, () => {
    const node = getActiveNode()
    console.log(`TRIdock Web Wallet listening on :${PORT} (mode: ${triMode}, active node: ${node.name})`)
  })
})
