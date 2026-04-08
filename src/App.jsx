import React, { Component, useEffect, useState } from 'react'
import triLogo from './assets/header_logo.png'

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

function InfoRow({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '10px 12px', border: '1px solid #343942', borderRadius: 8, background: '#181b20' }}>
      <span style={{ color: '#aeb7c4' }}>{label}</span>
      <strong style={{ color: '#eef2f7', textAlign: 'right', wordBreak: 'break-word' }}>{value || '—'}</strong>
    </div>
  )
}

function AppInner() {
  const [health, setHealth] = useState(null)
  const [nodeState, setNodeState] = useState(null)
  const [summary, setSummary] = useState(null)
  const [summaryError, setSummaryError] = useState('')

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

        if (summaryRes.ok) {
          setSummary(summaryData)
          setSummaryError('')
        } else {
          setSummary(null)
          setSummaryError(summaryData?.error || 'Wallet RPC not ready yet')
          if (summaryData?.nodeState) setNodeState(summaryData.nodeState)
        }
      } catch (err) {
        if (!cancelled) {
          setSummary(null)
          setSummaryError(err?.message || String(err))
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

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg, #121318 0%, #0d0e12 100%)', color: '#edf2f7', padding: 20, fontFamily: 'Segoe UI, sans-serif' }}>
      <div style={{ maxWidth: 1180, margin: '0 auto', border: '1px solid #404652', borderRadius: 14, overflow: 'hidden', background: '#16191f', boxShadow: '0 20px 60px rgba(0,0,0,.45)' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #343942', background: 'linear-gradient(180deg, #2a2e36, #20242b)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}><img src={triLogo} alt="Triangles logo" style={{ height: 42, width: 'auto', display: 'block', filter: 'drop-shadow(0 8px 18px rgba(0,0,0,.35))' }} /><div style={{ fontSize: 22, fontWeight: 700 }}>TRIdock Web Wallet</div></div>
          <div style={{ color: '#aeb7c4', marginTop: 4 }}>Read-only wallet view with live node status</div>
        </div>

        <div style={{ padding: 18, display: 'grid', gap: 16 }}>
          <div style={{ padding: 14, borderRadius: 10, border: '1px solid #4e5563', background: 'linear-gradient(180deg, rgba(193,23,47,.18), rgba(193,23,47,.06))' }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Current node state</div>
            <div style={{ display: 'grid', gap: 8 }}>
              <InfoRow label="Status" value={nodeState?.status || 'unknown'} />
              <InfoRow label="Reason" value={nodeState?.reason || summaryError || 'Waiting for node status...'} />
              <InfoRow label="Bootstrap source" value={nodeState?.bootstrapSource || '—'} />
              <InfoRow label="Bootstrap progress" value={nodeState?.bootstrapProgress || '—'} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
            <div style={{ padding: 16, border: '1px solid #343942', borderRadius: 10, background: '#1a1d23' }}>
              <div style={{ fontWeight: 700, marginBottom: 12 }}>Service health</div>
              <div style={{ display: 'grid', gap: 8 }}>
                <InfoRow label="API health" value={health?.ok ? 'ok' : 'unknown'} />
                <InfoRow label="RPC URL" value={health?.rpcUrl || '—'} />
                <InfoRow label="Canonical verify" value={health?.canonicalEnabled ? 'enabled' : 'disabled'} />
              </div>
            </div>

            <div style={{ padding: 16, border: '1px solid #343942', borderRadius: 10, background: '#1a1d23' }}>
              <div style={{ fontWeight: 700, marginBottom: 12 }}>Wallet RPC</div>
              <div style={{ display: 'grid', gap: 8 }}>
                <InfoRow label="State" value={summary ? 'connected' : 'warming up'} />
                <InfoRow label="Balance" value={summary ? `${Number(summary.balance ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TRI` : '—'} />
                <InfoRow label="Blocks" value={summary?.blocks ?? '—'} />
                <InfoRow label="Connections" value={summary?.connections ?? '—'} />
              </div>
            </div>
          </div>

          <div style={{ padding: 16, border: '1px solid #343942', borderRadius: 10, background: '#171a20' }}>
            <div style={{ fontWeight: 700, marginBottom: 10 }}>What this means</div>
            <div style={{ color: '#c6cfda', lineHeight: 1.55 }}>
              The frontend is up. If wallet RPC is still warming up, this page will keep showing live TRIdock bootstrap/sync status instead of going blank.
            </div>
            {summaryError ? (
              <div style={{ marginTop: 12, padding: 12, borderRadius: 8, background: '#23161a', border: '1px solid #6a3943', color: '#ffd7de' }}>
                <strong>RPC note:</strong> {summaryError}
              </div>
            ) : null}
          </div>
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
