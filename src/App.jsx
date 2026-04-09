import React, { Component, useEffect, useMemo, useState } from 'react'
import triLogo from './assets/triangles-wordmark.png'

class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, message: '' }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, message: error?.message || String(error) }
  }

  componentDidCatch(error) {
    console.error('TRIdock Web Wallet render error:', error)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: '100vh', background: '#111216', color: '#f3d7d9', padding: 24, fontFamily: 'Segoe UI, sans-serif' }}>
          <h1 style={{ marginTop: 0 }}>TRIdock Web Wallet</h1>
          <p>The frontend crashed during render.</p>
          <pre style={{ whiteSpace: 'pre-wrap' }}>{this.state.message}</pre>
        </div>
      )
    }
    return this.props.children
  }
}

function Card({ title, subtitle, children, tone = 'default' }) {
  const toneStyles = {
    default: { border: '1px solid #343942', background: '#171a20' },
    accent: { border: '1px solid #4e5563', background: 'linear-gradient(180deg, rgba(193,23,47,.18), rgba(193,23,47,.06))' },
    warning: { border: '1px solid #6a3943', background: '#23161a' },
  }
  return (
    <div style={{ padding: 16, borderRadius: 12, ...toneStyles[tone] }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline', marginBottom: 12 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{title}</div>
          {subtitle ? <div style={{ color: '#aeb7c4', marginTop: 4, fontSize: 13 }}>{subtitle}</div> : null}
        </div>
      </div>
      {children}
    </div>
  )
}

function InfoRow({ label, value, mono = false }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '10px 12px', border: '1px solid #343942', borderRadius: 8, background: '#181b20' }}>
      <span style={{ color: '#aeb7c4' }}>{label}</span>
      <strong style={{ color: '#eef2f7', textAlign: 'right', wordBreak: 'break-word', fontFamily: mono ? 'ui-monospace, SFMono-Regular, monospace' : 'inherit' }}>{value || '—'}</strong>
    </div>
  )
}

function StatusPill({ children, color = '#8aa2c8', background = 'rgba(138,162,200,.15)' }) {
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 999, background, color, fontWeight: 700, fontSize: 12 }}>{children}</span>
}

function formatAmount(value) {
  if (value === null || value === undefined || value === '') return '—'
  const num = Number(value)
  if (Number.isNaN(num)) return String(value)
  return `${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 8 })} TRI`
}

function formatHash(value) {
  if (!value) return '—'
  if (value.length <= 20) return value
  return `${value.slice(0, 12)}…${value.slice(-12)}`
}

function formatTime(value) {
  if (!value) return '—'
  const date = new Date(value * 1000)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString()
}

function addressCount(received = []) {
  return Array.isArray(received) ? received.length : 0
}

function AppInner() {
  const [health, setHealth] = useState(null)
  const [nodeState, setNodeState] = useState(null)
  const [summary, setSummary] = useState(null)
  const [summaryError, setSummaryError] = useState('')
  const [lastUpdated, setLastUpdated] = useState(null)
  const [selectedTx, setSelectedTx] = useState('all')

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const [healthRes, stateRes, summaryRes] = await Promise.all([
          fetch('/api/health'),
          fetch('/api/node/state'),
          fetch('/api/wallet/summary'),
        ])

        const healthData = await healthRes.json().catch(() => null)
        const stateData = await stateRes.json().catch(() => null)
        const summaryData = await summaryRes.json().catch(() => null)

        if (cancelled) return

        setHealth(healthData)
        setNodeState(stateData)
        setLastUpdated(new Date())

        if (summaryData) {
          setSummary(summaryData)
          setSummaryError(summaryData?.rpcError || '')
          if (summaryData?.nodeState) setNodeState(summaryData.nodeState)
        } else {
          setSummary(null)
          setSummaryError(summaryRes.ok ? '' : 'Wallet RPC not ready yet')
        }
      } catch (err) {
        if (!cancelled) {
          setSummary(null)
          setSummaryError(err?.message || String(err))
          setLastUpdated(new Date())
        }
      }
    }

    load()
    const timer = setInterval(load, 10000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [])

  const txs = useMemo(() => {
    const items = Array.isArray(summary?.transactions) ? summary.transactions : []
    if (selectedTx === 'all') return items
    return items.filter((tx) => tx.category === selectedTx)
  }, [summary?.transactions, selectedTx])

  const walletMode = summary?.rpcReady ? 'read-only live wallet' : 'read-only warmup mode'
  const canonical = summary?.canonical || { enabled: false }

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg, #121318 0%, #0d0e12 100%)', color: '#edf2f7', padding: 20, fontFamily: 'Segoe UI, sans-serif' }}>
      <div style={{ maxWidth: 1320, margin: '0 auto', border: '1px solid #404652', borderRadius: 14, overflow: 'hidden', background: '#16191f', boxShadow: '0 20px 60px rgba(0,0,0,.45)' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #343942', background: 'linear-gradient(180deg, #2a2e36, #20242b)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <img src={triLogo} alt="Triangles logo" style={{ height: 42, width: 'auto', display: 'block', filter: 'drop-shadow(0 8px 18px rgba(0,0,0,.35))' }} />
              <div>
                <div style={{ fontSize: 22, fontWeight: 700 }}>TRIdock Web Wallet</div>
                <div style={{ color: '#aeb7c4', marginTop: 4 }}>Full wallet surface, currently running in safe read-only mode</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <StatusPill>{walletMode}</StatusPill>
              <StatusPill color="#ffd38a" background="rgba(255,211,138,.12)">{nodeState?.status || 'unknown node state'}</StatusPill>
              {canonical?.enabled ? (
                <StatusPill color={canonical.matched ? '#8df0b1' : '#ffb3b3'} background={canonical.matched ? 'rgba(97,214,128,.12)' : 'rgba(255,125,125,.14)'}>
                  {canonical.matched ? 'canonical match' : 'canonical mismatch'}
                </StatusPill>
              ) : null}
            </div>
          </div>
        </div>

        <div style={{ padding: 18, display: 'grid', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            <Card title="Wallet balance">
              <div style={{ fontSize: 28, fontWeight: 800 }}>{formatAmount(summary?.balance)}</div>
              <div style={{ color: '#aeb7c4', marginTop: 8 }}>Stake: {formatAmount(summary?.stake)}</div>
              <div style={{ color: '#aeb7c4', marginTop: 4 }}>New mint: {formatAmount(summary?.newmint)}</div>
            </Card>
            <Card title="Sync height">
              <div style={{ fontSize: 28, fontWeight: 800 }}>{summary?.blocks ?? nodeState?.localHeight ?? '—'}</div>
              <div style={{ color: '#aeb7c4', marginTop: 8 }}>Connections: {summary?.connections ?? '—'}</div>
              <div style={{ color: '#aeb7c4', marginTop: 4 }}>Updated: {lastUpdated ? lastUpdated.toLocaleTimeString() : '—'}</div>
            </Card>
            <Card title="Receive addresses">
              <div style={{ fontSize: 28, fontWeight: 800 }}>{addressCount(summary?.received)}</div>
              <div style={{ color: '#aeb7c4', marginTop: 8 }}>Visible in read-only mode</div>
            </Card>
            <Card title="Transactions">
              <div style={{ fontSize: 28, fontWeight: 800 }}>{Array.isArray(summary?.transactions) ? summary.transactions.length : 0}</div>
              <div style={{ color: '#aeb7c4', marginTop: 8 }}>Latest wallet activity snapshot</div>
            </Card>
          </div>

          <Card title="Current node state" subtitle="The wallet stays useful even while the node is bootstrapping or warming up" tone="accent">
            <div style={{ display: 'grid', gap: 8 }}>
              <InfoRow label="Status" value={nodeState?.status || 'unknown'} />
              <InfoRow label="Reason" value={nodeState?.reason || summaryError || 'Waiting for node status...'} />
              <InfoRow label="Bootstrap source" value={nodeState?.bootstrapSource || '—'} />
              <InfoRow label="Bootstrap progress" value={nodeState?.bootstrapProgress || '—'} />
              <InfoRow label="Local height" value={nodeState?.localHeight || '—'} />
              <InfoRow label="Canonical status" value={nodeState?.canonicalStatus || 'disabled'} />
            </div>
          </Card>

          <div style={{ display: 'grid', gridTemplateColumns: '1.15fr .85fr', gap: 16 }}>
            <Card title="Wallet overview" subtitle="Real wallet fields exposed now; write actions stay blocked until safeguards are built">
              <div style={{ display: 'grid', gap: 8 }}>
                <InfoRow label="RPC state" value={summary?.rpcReady ? 'connected' : 'warming up'} />
                <InfoRow label="Network" value={summary?.network || '—'} />
                <InfoRow label="Version" value={summary?.version ?? '—'} />
                <InfoRow label="Protocol version" value={summary?.protocolversion ?? '—'} />
                <InfoRow label="Wallet version" value={summary?.walletversion ?? '—'} />
                <InfoRow label="Best block" value={formatHash(summary?.bestblock || nodeState?.localBestblock)} mono />
              </div>
            </Card>

            <Card title="Staking" subtitle="Expose the full staking posture, even if this node is configured non-staking">
              <div style={{ display: 'grid', gap: 8 }}>
                <InfoRow label="Enabled" value={summary?.staking?.enabled ? 'yes' : 'no'} />
                <InfoRow label="Currently staking" value={summary?.staking?.staking ? 'yes' : 'no'} />
                <InfoRow label="Weight" value={summary?.staking?.weight ?? '—'} />
                <InfoRow label="Net stake weight" value={summary?.staking?.netstakeweight ?? '—'} />
                <InfoRow label="Expected time" value={summary?.staking?.expectedtime ?? '—'} />
                <InfoRow label="Errors" value={summary?.staking?.errors || 'none'} />
              </div>
            </Card>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Card title="Receive / addresses" subtitle="The wallet can already surface receive-side data safely">
              <div style={{ display: 'grid', gap: 10 }}>
                {Array.isArray(summary?.received) && summary.received.length ? summary.received.slice(0, 8).map((item, index) => (
                  <div key={`${item.address}-${index}`} style={{ padding: 12, borderRadius: 10, border: '1px solid #343942', background: '#181b20' }}>
                    <div style={{ fontFamily: 'ui-monospace, SFMono-Regular, monospace', wordBreak: 'break-all', color: '#eef2f7' }}>{item.address || 'unknown address'}</div>
                    <div style={{ marginTop: 8, color: '#aeb7c4', display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                      <span>Amount: {formatAmount(item.amount)}</span>
                      <span>Tx count: {item.txids?.length ?? item.confirmations ?? '—'}</span>
                    </div>
                  </div>
                )) : <div style={{ color: '#aeb7c4' }}>No receive-address data yet. If RPC is warming up, this will fill in automatically.</div>}
              </div>
            </Card>

            <Card title="Send / export / wallet actions" subtitle="Building the full feature surface, but keeping dangerous actions blocked until wallet-grade safeguards exist" tone="warning">
              <div style={{ display: 'grid', gap: 8 }}>
                <InfoRow label="Generate receive address" value="planned" />
                <InfoRow label="Send TRI" value="blocked until guarded write path exists" />
                <InfoRow label="Backup / export wallet data" value="planned" />
                <InfoRow label="Unlock / lock" value="planned" />
                <InfoRow label="Address labels / management" value="planned" />
                <InfoRow label="Wallet.dat safety" value="never touch without explicit approval" />
              </div>
            </Card>
          </div>

          <Card title="Recent transactions" subtitle="Read-only live activity view">
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              {['all', 'receive', 'send', 'stake', 'generate'].map((kind) => (
                <button key={kind} onClick={() => setSelectedTx(kind)} style={{ border: '1px solid #414955', background: selectedTx === kind ? '#2a3140' : '#171a20', color: '#eef2f7', borderRadius: 999, padding: '8px 12px', cursor: 'pointer' }}>{kind}</button>
              ))}
            </div>
            <div style={{ display: 'grid', gap: 10 }}>
              {txs.length ? txs.map((tx, index) => (
                <div key={`${tx.txid || index}-${index}`} style={{ padding: 12, borderRadius: 10, border: '1px solid #343942', background: '#181b20' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <strong>{tx.category || 'unknown'}</strong>
                    <span style={{ color: '#aeb7c4' }}>{formatTime(tx.time)}</span>
                  </div>
                  <div style={{ marginTop: 8, color: '#eef2f7' }}>{formatAmount(tx.amount)}</div>
                  <div style={{ marginTop: 8, color: '#aeb7c4', fontFamily: 'ui-monospace, SFMono-Regular, monospace', wordBreak: 'break-all' }}>{tx.address || tx.txid || 'No address/txid reported'}</div>
                  {tx.confirmations !== undefined ? <div style={{ marginTop: 8, color: '#aeb7c4' }}>Confirmations: {tx.confirmations}</div> : null}
                </div>
              )) : <div style={{ color: '#aeb7c4' }}>No transactions to show for this filter yet.</div>}
            </div>
          </Card>

          <Card title="Canonical chain view" subtitle="Wallet and node truth should stay aligned with the chain you actually trust">
            <div style={{ display: 'grid', gap: 8 }}>
              <InfoRow label="Canonical verification" value={canonical.enabled ? (canonical.matched ? 'matched' : 'enabled but not matched') : 'disabled'} />
              <InfoRow label="Canonical height" value={canonical.canonicalHeight ?? nodeState?.canonicalHeight ?? '—'} />
              <InfoRow label="Canonical best block" value={formatHash(canonical.canonicalBestblock || nodeState?.canonicalBestblock)} mono />
              <InfoRow label="Local best block" value={formatHash(summary?.bestblock || nodeState?.localBestblock)} mono />
              <InfoRow label="RPC endpoint" value={health?.rpcUrl || '—'} />
            </div>
          </Card>

          {summaryError ? (
            <div style={{ padding: 12, borderRadius: 8, background: '#23161a', border: '1px solid #6a3943', color: '#ffd7de' }}>
              <strong>RPC note:</strong> {summaryError}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppInner />
    </ErrorBoundary>
  )
}
