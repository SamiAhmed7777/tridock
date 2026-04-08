import express from 'express'

const app = express()
const PORT = process.env.PORT || 4177

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

function pickBalance(info, staking) {
  const balance = typeof info?.balance === 'number' ? info.balance : 0
  const stake = typeof staking?.weight === 'number' ? staking.weight : null
  return { balance, stakeWeight: stake }
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, rpcUrl, canonicalEnabled: Boolean(canonicalUrl) })
})

app.get('/api/wallet/summary', async (_req, res) => {
  try {
    const [info, staking, txs, received, blockCount, bestBlock, connections] = await Promise.all([
      rpcCall(rpcUrl, rpcUser, rpcPassword, 'getinfo'),
      rpcCall(rpcUrl, rpcUser, rpcPassword, 'getstakinginfo'),
      rpcCall(rpcUrl, rpcUser, rpcPassword, 'listtransactions', ['*', 10]),
      rpcCall(rpcUrl, rpcUser, rpcPassword, 'listreceivedbyaddress', [0, true]),
      rpcCall(rpcUrl, rpcUser, rpcPassword, 'getblockcount'),
      rpcCall(rpcUrl, rpcUser, rpcPassword, 'getbestblockhash'),
      rpcCall(rpcUrl, rpcUser, rpcPassword, 'getconnectioncount'),
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

    const balances = pickBalance(info, staking)
    res.json({
      network: info?.testnet ? 'testnet' : 'mainnet',
      version: info?.version ?? null,
      protocolversion: info?.protocolversion ?? null,
      walletversion: info?.walletversion ?? null,
      balance: balances.balance,
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
      transactions: Array.isArray(txs) ? txs : [],
      received: Array.isArray(received) ? received : [],
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

app.post('/api/rpc', express.json(), async (req, res) => {
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

app.listen(PORT, () => {
  console.log(`TRIdock Web Wallet API listening on :${PORT}`)
})
