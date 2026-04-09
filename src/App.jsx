import React, { Component, useEffect, useMemo, useState } from 'react'
import QRCode from 'qrcode'
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
    ok: { border: '1px solid #2f5f43', background: 'linear-gradient(180deg, rgba(35,120,74,.18), rgba(35,120,74,.06))' },
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

function ActionButton({ children, disabled = false, onClick, tone = 'default' }) {
  const styles = {
    default: {
      border: disabled ? '1px solid #4a505c' : '1px solid #53698a',
      background: disabled ? '#16191f' : '#202a38',
      color: disabled ? '#7f8896' : '#ecf2ff',
    },
    warning: {
      border: disabled ? '1px solid #5a4146' : '1px solid #8b4b57',
      background: disabled ? '#1a1416' : '#2b181d',
      color: disabled ? '#987f84' : '#ffdbe1',
    },
    ok: {
      border: disabled ? '1px solid #44534a' : '1px solid #3b7a56',
      background: disabled ? '#171c19' : '#193123',
      color: disabled ? '#859189' : '#d7ffe7',
    },
  }
  const style = styles[tone] || styles.default
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '9px 12px',
        borderRadius: 10,
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontWeight: 700,
        ...style,
      }}
    >
      {children}
    </button>
  )
}

function Field({ label, placeholder, disabled = true, value = '', onChange, type = 'text' }) {
  return (
    <div>
      <div style={{ color: '#aeb7c4', marginBottom: 6 }}>{label}</div>
      <input type={type} disabled={disabled} value={value} onChange={onChange} placeholder={placeholder} style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid #343942', background: '#111419', color: disabled ? '#8c96a5' : '#eef2f7' }} />
    </div>
  )
}

function TextArea({ label, placeholder, disabled = false, value = '', onChange }) {
  return (
    <div>
      <div style={{ color: '#aeb7c4', marginBottom: 6 }}>{label}</div>
      <textarea disabled={disabled} value={value} onChange={onChange} placeholder={placeholder} rows={4} style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid #343942', background: '#111419', color: disabled ? '#8c96a5' : '#eef2f7', resize: 'vertical' }} />
    </div>
  )
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

function shortAddress(value) {
  if (!value) return '—'
  return value.length > 18 ? `${value.slice(0, 10)}…${value.slice(-8)}` : value
}

function downloadDataUrl(url, filename) {
  if (!url) return
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
}

function NavTabs({ active, onChange }) {
  const tabs = [
    ['overview', 'Overview'],
    ['receive', 'Receive'],
    ['send', 'Send'],
    ['transactions', 'Transactions'],
    ['addresses', 'Address Book'],
    ['backup', 'Backup'],
    ['debug', 'Debug'],
  ]
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
      {tabs.map(([key, label]) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          style={{
            border: '1px solid #414955',
            background: active === key ? '#2a3140' : '#171a20',
            color: '#eef2f7',
            borderRadius: 999,
            padding: '9px 14px',
            cursor: 'pointer',
            fontWeight: 600,
          }}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

function ReceiveCard({ item, selected, onSelect, copied, onCopy }) {
  const txCount = Array.isArray(item.txids) ? item.txids.length : (item.confirmations ?? '—')
  return (
    <div style={{ padding: 14, borderRadius: 12, border: selected ? '1px solid #5a7ab6' : '1px solid #343942', background: selected ? '#1a2330' : '#181b20' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>{item.walletMeta?.label || 'Receive address'}</div>
          <div style={{ color: '#aeb7c4', fontSize: 13 }}>{shortAddress(item.address)}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontWeight: 700 }}>{formatAmount(item.amount)}</div>
          <div style={{ color: '#aeb7c4', fontSize: 13 }}>Tx count: {txCount}</div>
        </div>
      </div>

      {item.walletMeta?.note ? <div style={{ marginTop: 10, color: '#c7d0dc', fontSize: 13 }}>{item.walletMeta.note}</div> : null}

      <div style={{ marginTop: 12, padding: 12, borderRadius: 10, background: '#111419', border: '1px solid #2d323c', fontFamily: 'ui-monospace, SFMono-Regular, monospace', wordBreak: 'break-all' }}>
        {item.address || 'unknown address'}
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        <ActionButton onClick={() => onSelect(item.address)}>{selected ? 'Selected' : 'View details'}</ActionButton>
        <ActionButton onClick={() => onCopy(item.address)}>{copied ? 'Copied' : 'Copy address'}</ActionButton>
      </div>
    </div>
  )
}

function TxRow({ tx, onSelect, selected }) {
  return (
    <div onClick={() => onSelect(tx)} style={{ padding: 12, borderRadius: 10, border: selected ? '1px solid #5a7ab6' : '1px solid #343942', background: selected ? '#1a2330' : '#181b20', cursor: 'pointer' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <strong>{tx.category || 'unknown'}</strong>
        <span style={{ color: '#aeb7c4' }}>{formatTime(tx.time)}</span>
      </div>
      <div style={{ marginTop: 8, color: '#eef2f7' }}>{formatAmount(tx.amount)}</div>
      <div style={{ marginTop: 8, color: '#aeb7c4', fontFamily: 'ui-monospace, SFMono-Regular, monospace', wordBreak: 'break-all' }}>{tx.address || tx.txid || 'No address/txid reported'}</div>
      {tx.confirmations !== undefined ? <div style={{ marginTop: 8, color: '#aeb7c4' }}>Confirmations: {tx.confirmations}</div> : null}
    </div>
  )
}

export default function App() {
  const [health, setHealth] = useState(null)
  const [nodeState, setNodeState] = useState(null)
  const [summary, setSummary] = useState(null)
  const [contracts, setContracts] = useState(null)
  const [labels, setLabels] = useState({})
  const [summaryError, setSummaryError] = useState('')
  const [lastUpdated, setLastUpdated] = useState(null)
  const [selectedTx, setSelectedTx] = useState('all')
  const [activeTab, setActiveTab] = useState('overview')
  const [selectedAddress, setSelectedAddress] = useState('')
  const [copiedAddress, setCopiedAddress] = useState('')
  const [selectedTransaction, setSelectedTransaction] = useState(null)
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [labelDrafts, setLabelDrafts] = useState({})
  const [noteDrafts, setNoteDrafts] = useState({})
  const [sendForm, setSendForm] = useState({ address: '', amount: '', memo: '' })
  const [sendPreviewStatus, setSendPreviewStatus] = useState('')
  const [sendPreviewData, setSendPreviewData] = useState(null)
  const [backupStatus, setBackupStatus] = useState('')
  const [backupData, setBackupData] = useState(null)
  const [newAddressLabel, setNewAddressLabel] = useState('')
  const [addressGenStatus, setAddressGenStatus] = useState('')
  const [walletActionStatus, setWalletActionStatus] = useState('')
  const [broadcastStatus, setBroadcastStatus] = useState('')
  const [broadcastResult, setBroadcastResult] = useState(null)

  // Clear broadcast result when user starts editing a new send
  useEffect(() => {
    if (broadcastResult) {
      setBroadcastResult(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sendForm.address, sendForm.amount, sendForm.memo])

  useEffect(() => {    let cancelled = false

    async function load() {
      try {
        const [healthRes, stateRes, summaryRes, contractsRes, labelsRes] = await Promise.all([
          fetch('/api/health'),
          fetch('/api/node/state'),
          fetch('/api/wallet/summary'),
          fetch('/api/wallet/contracts'),
          fetch('/api/wallet/labels'),
        ])

        const healthData = await healthRes.json().catch(() => null)
        const stateData = await stateRes.json().catch(() => null)
        const summaryData = await summaryRes.json().catch(() => null)
        const contractsData = await contractsRes.json().catch(() => null)
        const labelsData = await labelsRes.json().catch(() => null)

        if (cancelled) return

        setHealth(healthData)
        setNodeState(stateData)
        setContracts(contractsData)
        setLabels(labelsData?.labels || {})
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

  const received = Array.isArray(summary?.received) ? summary.received : []
  const selectedReceive = received.find((item) => item.address === selectedAddress) || received[0] || null

  useEffect(() => {
    if (!selectedAddress && received[0]?.address) setSelectedAddress(received[0].address)
  }, [selectedAddress, received])

  useEffect(() => {
    if (!selectedTransaction && txs[0]) setSelectedTransaction(txs[0])
  }, [selectedTransaction, txs])

  useEffect(() => {
    if (selectedReceive?.address) {
      setLabelDrafts((prev) => ({ ...prev, [selectedReceive.address]: prev[selectedReceive.address] ?? selectedReceive.walletMeta?.label ?? labels[selectedReceive.address]?.label ?? '' }))
      setNoteDrafts((prev) => ({ ...prev, [selectedReceive.address]: prev[selectedReceive.address] ?? selectedReceive.walletMeta?.note ?? labels[selectedReceive.address]?.note ?? '' }))
    }
  }, [selectedReceive, labels])

  useEffect(() => {
    let cancelled = false
    async function buildQr() {
      if (!selectedReceive?.address) {
        setQrDataUrl('')
        return
      }
      try {
        const url = await QRCode.toDataURL(selectedReceive.address, {
          margin: 1,
          width: 220,
          color: { dark: '#f1f5fb', light: '#111419' },
        })
        if (!cancelled) setQrDataUrl(url)
      } catch {
        if (!cancelled) setQrDataUrl('')
      }
    }
    buildQr()
    return () => { cancelled = true }
  }, [selectedReceive?.address])

  const walletMode = summary?.rpcReady ? 'full wallet mode' : 'warmup mode'
  const canonical = summary?.canonical || { enabled: false }
  const featureFlags = summary?.featureFlags || {}
  const capabilities = summary?.capabilities || {}

  async function handleCopyAddress(address) {
    if (!address) return
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(address)
        setCopiedAddress(address)
        setTimeout(() => setCopiedAddress(''), 2000)
      }
    } catch {
      setCopiedAddress(address)
      setTimeout(() => setCopiedAddress(''), 2000)
    }
  }

  async function refreshLabels() {
    const res = await fetch('/api/wallet/labels')
    const data = await res.json()
    setLabels(data.labels || {})
  }

  async function handleSaveLabel(address) {
    const res = await fetch('/api/wallet/labels/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        address,
        label: labelDrafts[address] || '',
        note: noteDrafts[address] || '',
      }),
    })
    const data = await res.json().catch(() => null)
    setBackupStatus(data?.message || (data?.ok ? 'Label saved.' : 'Label save failed.'))
    await refreshLabels()
  }

  async function handlePreviewSend() {
    try {
      const res = await fetch('/api/wallet/send/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sendForm),
      })
      const data = await res.json().catch(() => null)
      setSendPreviewStatus(data?.message || (data?.ok ? 'Preview ready.' : `Preview unavailable (${res.status})`))
      setSendPreviewData(data?.preview || null)
    } catch (error) {
      setSendPreviewStatus(error?.message || 'Preview unavailable')
      setSendPreviewData(null)
    }
  }

  async function handleBackupAction() {
    try {
      const res = await fetch('/api/wallet/backup/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestedName: 'tri-wallet-backup' }),
      })
      const data = await res.json().catch(() => null)
      setBackupStatus(data?.message || (data?.ok ? 'Backup export created.' : `Backup unavailable (${res.status})`))
      setBackupData(data?.export || null)
    } catch (error) {
      setBackupStatus(error?.message || 'Backup unavailable')
      setBackupData(null)
    }
  }

  async function handleGenerateAddress() {
    try {
      const res = await fetch('/api/wallet/address/new', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: newAddressLabel }),
      })
      const data = await res.json().catch(() => null)
      setAddressGenStatus(data?.message || (data?.ok ? `New address created: ${data.address}` : `Address generation unavailable (${res.status})`))
      if (data?.ok) {
        setNewAddressLabel('')
        await refreshLabels()
      }
    } catch (error) {
      setAddressGenStatus(error?.message || 'Address generation unavailable')
    }
  }

  async function handleUnlockWallet() {
    try {
      const res = await fetch('/api/wallet/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await res.json().catch(() => null)
      setWalletActionStatus(data?.message || (data?.ok ? 'Wallet unlocked.' : `Wallet unlock unavailable (${res.status})`))
    } catch (error) {
      setWalletActionStatus(error?.message || 'Wallet unlock unavailable')
    }
  }

  async function handleLockWallet() {
    try {
      const res = await fetch('/api/wallet/lock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const data = await res.json().catch(() => null)
      setWalletActionStatus(data?.message || (data?.ok ? 'Wallet locked.' : `Wallet lock unavailable (${res.status})`))
    } catch (error) {
      setWalletActionStatus(error?.message || 'Wallet lock unavailable')
    }
  }

  async function handleBroadcastSend() {
    try {
      const res = await fetch('/api/wallet/send/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...sendForm, confirm: true }),
      })
      const data = await res.json().catch(() => null)
      const sentAmount = data?.sent?.amount
      const sentAddr = data?.sent?.address
      if (data?.ok) {
        setBroadcastResult({ ok: true, txid: data.txid, sent: data.sent, message: data?.message })
        setBroadcastStatus(`Sent ${sentAmount} TRI → ${shortAddress(sentAddr)}`)
      } else {
        setBroadcastResult({ ok: false, code: data?.code || 'UNKNOWN', message: data?.message || `Broadcast failed (${res.status})` })
        setBroadcastStatus(data?.message || `Broadcast failed (${res.status})`)
      }
      if (data?.ok) {
        setSendPreviewData(null)
        setSendForm({ address: '', amount: '', memo: '' })
        setBroadcastResult(null) // keep showing result until user starts a new send
      }
    } catch (error) {
      setBroadcastStatus(error?.message || 'Broadcast failed')
      setBroadcastResult({ ok: false, code: 'NETWORK_ERROR', message: error?.message || 'Network error' })
    }
  }

  const overviewPanel = (
    <div style={{ display: 'grid', gap: 16 }}>
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
          <div style={{ fontSize: 28, fontWeight: 800 }}>{addressCount(received)}</div>
          <div style={{ color: '#aeb7c4', marginTop: 8 }}>Visible in wallet shell</div>
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
    </div>
  )

  const receivePanel = (
    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr .8fr', gap: 16 }}>
      <Card title="Receive TRI" subtitle="Copy-ready receive cards with labels and notes">
        <div style={{ display: 'grid', gap: 12 }}>
          {received.length ? received.map((item, index) => (
            <ReceiveCard
              key={`${item.address}-${index}`}
              item={item}
              selected={selectedReceive?.address === item.address}
              onSelect={setSelectedAddress}
              copied={copiedAddress === item.address}
              onCopy={handleCopyAddress}
            />
          )) : <div style={{ color: '#aeb7c4' }}>No receive-address data yet. If RPC is warming up, this will fill in automatically.</div>}
        </div>
      </Card>

      <div style={{ display: 'grid', gap: 16 }}>
        <Card title="Selected address" subtitle="Focused receive detail panel" tone="ok">
          {selectedReceive ? (
            <div style={{ display: 'grid', gap: 8 }}>
              <InfoRow label="Address" value={shortAddress(selectedReceive.address)} mono />
              <InfoRow label="Total received" value={formatAmount(selectedReceive.amount)} />
              <InfoRow label="Known txids" value={Array.isArray(selectedReceive.txids) ? selectedReceive.txids.length : '—'} />
              <Field label="Label" disabled={false} value={labelDrafts[selectedReceive.address] || ''} onChange={(e) => setLabelDrafts((prev) => ({ ...prev, [selectedReceive.address]: e.target.value }))} placeholder="Friendly label" />
              <TextArea label="Note" value={noteDrafts[selectedReceive.address] || ''} onChange={(e) => setNoteDrafts((prev) => ({ ...prev, [selectedReceive.address]: e.target.value }))} placeholder="What this address is for" />
              <div style={{ marginTop: 8, padding: 12, borderRadius: 10, background: '#111419', border: '1px solid #2d323c', minHeight: 160, display: 'grid', placeItems: 'center' }}>
                {qrDataUrl ? <img src={qrDataUrl} alt="Receive address QR code" style={{ width: 220, height: 220, objectFit: 'contain', imageRendering: 'pixelated' }} /> : <div style={{ color: '#aeb7c4' }}>Generating QR…</div>}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <ActionButton onClick={() => handleCopyAddress(selectedReceive.address)}>{copiedAddress === selectedReceive.address ? 'Copied' : 'Copy full address'}</ActionButton>
                <ActionButton disabled={!qrDataUrl} onClick={() => downloadDataUrl(qrDataUrl, `tri-${selectedReceive.address}.png`)}>Download QR</ActionButton>
                <ActionButton tone="ok" onClick={() => handleSaveLabel(selectedReceive.address)}>Save label + note</ActionButton>
              </div>
            </div>
          ) : <div style={{ color: '#aeb7c4' }}>Pick a receive address to inspect it here.</div>}
        </Card>

        <Card title="Generate address" subtitle="Guarded new-address creation">
          <div style={{ display: 'grid', gap: 10 }}>
            <Field label="New address label" disabled={false} value={newAddressLabel} onChange={(e) => setNewAddressLabel(e.target.value)} placeholder="Savings, exchange, cold, etc." />
            <ActionButton onClick={handleGenerateAddress} disabled={!contracts?.addressGeneration?.available}>Generate new address</ActionButton>
            {addressGenStatus ? <div style={{ color: '#cdd6e2' }}>{addressGenStatus}</div> : null}
          </div>
        </Card>
      </div>
    </div>
  )

  const sendPanel = (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr .9fr', gap: 16 }}>
      <Card title="Send TRI" subtitle="Full send flow with preview, readiness checks, and live broadcast when enabled" tone="warning">
        <div style={{ display: 'grid', gap: 12 }}>
          <Field label="Destination address" disabled={false} value={sendForm.address} onChange={(e) => setSendForm((prev) => ({ ...prev, address: e.target.value }))} placeholder="TRI destination address" />
          <Field label="Amount" type="number" disabled={false} value={sendForm.amount} onChange={(e) => setSendForm((prev) => ({ ...prev, amount: e.target.value }))} placeholder="0.00 TRI" />
          <Field label="Memo / label" disabled={false} value={sendForm.memo} onChange={(e) => setSendForm((prev) => ({ ...prev, memo: e.target.value }))} placeholder="Optional note" />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <ActionButton onClick={handlePreviewSend}>Preview send</ActionButton>
            <ActionButton tone="ok" onClick={handleBroadcastSend} disabled={!sendPreviewData?.canBroadcast}>Broadcast send</ActionButton>
          </div>
          {sendPreviewStatus ? <div style={{ padding: 10, borderRadius: 10, background: '#181b20', border: '1px solid #343942', color: '#cdd6e2' }}>{sendPreviewStatus}</div> : null}
          {broadcastStatus ? <div style={{ padding: 10, borderRadius: 10, background: '#181b20', border: '1px solid #343942', color: '#cdd6e2' }}>{broadcastStatus}</div> : null}
          {broadcastResult ? (
            <div style={{ padding: 12, borderRadius: 10, background: broadcastResult.ok ? 'rgba(97,214,128,.1)' : 'rgba(255,125,125,.1)', border: `1px solid ${broadcastResult.ok ? '#8df0b1' : '#ff7d7d'}`, color: broadcastResult.ok ? '#8df0b1' : '#ff7d7d' }}>
              {broadcastResult.ok ? (
                <>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>Transaction submitted ✓</div>
                  {broadcastResult.sent ? (
                    <div style={{ display: 'grid', gap: 4, fontSize: 13 }}>
                      <div>Amount: <span style={{ color: '#cdd6e2' }}>{broadcastResult.sent.amount} TRI</span></div>
                      <div>To: <span style={{ color: '#cdd6e2', fontFamily: 'monospace' }}>{broadcastResult.sent.address}</span></div>
                      <div>Fee: <span style={{ color: '#cdd6e2' }}>{broadcastResult.sent.estimatedFee} TRI</span></div>
                      <div>Total: <span style={{ color: '#cdd6e2' }}>{broadcastResult.sent.estimatedTotal} TRI</span></div>
                    </div>
                  ) : null}
                  <div style={{ marginTop: 6, fontSize: 12, color: '#aeb7c4' }}>TXID: <span style={{ fontFamily: 'monospace', color: '#cdd6e2' }}>{broadcastResult.txid}</span></div>
                </>
              ) : (
                <>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>Broadcast failed ✗</div>
                  <div style={{ fontSize: 13, color: '#cdd6e2' }}>{broadcastResult.message}</div>
                  {broadcastResult.code ? <div style={{ fontSize: 11, color: '#aeb7c4', marginTop: 4 }}>Code: {broadcastResult.code}</div> : null}
                </>
              )}
            </div>
          ) : null}
        </div>
      </Card>

      <Card title="Send preview" subtitle="Validation, wallet readiness, and fee estimate">
        <div style={{ display: 'grid', gap: 8 }}>
          <InfoRow label="Address valid" value={sendPreviewData ? (sendPreviewData.validAddress ? 'yes' : 'no') : '—'} />
          <InfoRow label="Spendable balance" value={sendPreviewData ? formatAmount(sendPreviewData.spendableBalance) : '—'} />
          <InfoRow label="Estimated fee" value={sendPreviewData ? formatAmount(sendPreviewData.estimatedFee) : '—'} />
          <InfoRow label="Estimated total" value={sendPreviewData ? formatAmount(sendPreviewData.estimatedTotal) : '—'} />
          <InfoRow label="Wallet locked" value={sendPreviewData ? (sendPreviewData.walletLocked ? 'yes' : 'no') : '—'} />
          <InfoRow label="Exceeds balance" value={sendPreviewData ? (sendPreviewData.wouldExceedBalance ? 'yes' : 'no') : '—'} />
          <InfoRow label="Can broadcast" value={sendPreviewData ? (sendPreviewData.canBroadcast ? 'yes' : 'not yet') : '—'} />
          <InfoRow label="Blocked reasons" value={sendPreviewData?.blockedReasons?.length ? sendPreviewData.blockedReasons.join(', ') : 'none'} />
        </div>
      </Card>
    </div>
  )

  const transactionsPanel = (
    <div style={{ display: 'grid', gridTemplateColumns: '1.15fr .85fr', gap: 16 }}>
      <Card title="Recent transactions" subtitle="Read-only live activity view">
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          {['all', 'receive', 'send', 'stake', 'generate'].map((kind) => (
            <button key={kind} onClick={() => setSelectedTx(kind)} style={{ border: '1px solid #414955', background: selectedTx === kind ? '#2a3140' : '#171a20', color: '#eef2f7', borderRadius: 999, padding: '8px 12px', cursor: 'pointer' }}>{kind}</button>
          ))}
        </div>
        <div style={{ display: 'grid', gap: 10 }}>
          {txs.length ? txs.map((tx, index) => (
            <TxRow key={`${tx.txid || index}-${index}`} tx={tx} onSelect={setSelectedTransaction} selected={selectedTransaction?.txid === tx.txid && selectedTransaction?.time === tx.time} />
          )) : <div style={{ color: '#aeb7c4' }}>No transactions to show for this filter yet.</div>}
        </div>
      </Card>

      <Card title="Transaction detail" subtitle="Select a transaction to inspect it" tone="ok">
        {selectedTransaction ? (
          <div style={{ display: 'grid', gap: 8 }}>
            <InfoRow label="Category" value={selectedTransaction.category || '—'} />
            <InfoRow label="Amount" value={formatAmount(selectedTransaction.amount)} />
            <InfoRow label="Time" value={formatTime(selectedTransaction.time)} />
            <InfoRow label="Confirmations" value={selectedTransaction.confirmations ?? '—'} />
            <InfoRow label="Address" value={shortAddress(selectedTransaction.address)} mono />
            <InfoRow label="TXID" value={formatHash(selectedTransaction.txid)} mono />
            <InfoRow label="Raw address" value={selectedTransaction.address || '—'} mono />
          </div>
        ) : <div style={{ color: '#aeb7c4' }}>Click a transaction on the left to open its detail view.</div>}
      </Card>
    </div>
  )

  const addressesPanel = (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr .9fr', gap: 16 }}>
      <Card title="Address book" subtitle="Persisted labels and notes">
        <div style={{ display: 'grid', gap: 10 }}>
          {received.length ? received.map((item, index) => (
            <div key={`${item.address}-book-${index}`} style={{ padding: 12, borderRadius: 10, border: '1px solid #343942', background: '#181b20' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <strong>{labels[item.address]?.label || item.walletMeta?.label || 'Wallet address'}</strong>
                <span style={{ color: '#aeb7c4' }}>{formatAmount(item.amount)}</span>
              </div>
              <div style={{ marginTop: 8, fontFamily: 'ui-monospace, SFMono-Regular, monospace', wordBreak: 'break-all' }}>{item.address}</div>
              {(labels[item.address]?.note || item.walletMeta?.note) ? <div style={{ marginTop: 8, color: '#c7d0dc' }}>{labels[item.address]?.note || item.walletMeta?.note}</div> : null}
              <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                <ActionButton onClick={() => handleCopyAddress(item.address)}>{copiedAddress === item.address ? 'Copied' : 'Copy'}</ActionButton>
                <ActionButton onClick={() => { setActiveTab('receive'); setSelectedAddress(item.address) }}>Edit</ActionButton>
              </div>
            </div>
          )) : <div style={{ color: '#aeb7c4' }}>Address book will populate from wallet receive data when RPC is ready.</div>}
        </div>
      </Card>

      <Card title="Address actions" subtitle="Safe progression toward wallet-grade behavior" tone="warning">
        <div style={{ display: 'grid', gap: 8 }}>
          <InfoRow label="Generate new address" value={contracts?.addressGeneration?.available ? 'guarded live' : 'blocked'} />
          <InfoRow label="Label address" value="live" />
          <InfoRow label="Copy / QR" value="live" />
          <InfoRow label="Import / export labels" value="planned" />
        </div>
      </Card>
    </div>
  )

  const backupPanel = (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr .9fr', gap: 16 }}>
      <Card title="Backup / export" subtitle="Real export hook if a wallet export path is configured">
        <div style={{ display: 'grid', gap: 12 }}>
          <InfoRow label="Export configured" value={contracts?.backup?.available ? 'yes' : 'no'} />
          <InfoRow label="Write ops enabled" value={health?.writeOpsEnabled ? 'yes' : 'no'} />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <ActionButton onClick={handleBackupAction}>Create backup export</ActionButton>
            <ActionButton disabled>Verify restore package</ActionButton>
          </div>
          {backupStatus ? <div style={{ padding: 10, borderRadius: 10, background: '#181b20', border: '1px solid #343942', color: '#cdd6e2' }}>{backupStatus}</div> : null}
          {backupData ? (
            <div style={{ display: 'grid', gap: 8 }}>
              <InfoRow label="Filename" value={backupData.filename} mono />
              <InfoRow label="Bytes" value={String(backupData.bytes)} />
              <InfoRow label="SHA256" value={formatHash(backupData.sha256)} mono />
              <InfoRow label="Created" value={backupData.createdAt} />
            </div>
          ) : null}
        </div>
      </Card>

      <Card title="Wallet control" subtitle="Lock/unlock and backup posture for the live container wallet" tone="accent">
        <div style={{ display: 'grid', gap: 10 }}>
          <InfoRow label="Encrypted" value={capabilities?.wallet?.encrypted ? 'yes' : 'no / unknown'} />
          <InfoRow label="Locked" value={capabilities?.wallet?.locked ? 'yes' : 'no'} />
          <InfoRow label="Unlock available" value={contracts?.unlock?.available ? 'yes' : 'no'} />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <ActionButton onClick={handleUnlockWallet} disabled={!contracts?.unlock?.ready}>Unlock wallet</ActionButton>
            <ActionButton tone="warning" onClick={handleLockWallet}>Lock wallet</ActionButton>
          </div>
          {walletActionStatus ? <div style={{ color: '#c6cfda', lineHeight: 1.6 }}>{walletActionStatus}</div> : null}
        </div>
      </Card>
    </div>
  )

  const debugPanel = (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
      <Card title="Canonical chain view" subtitle="Wallet and node truth should stay aligned with the chain you actually trust">
        <div style={{ display: 'grid', gap: 8 }}>
          <InfoRow label="Canonical verification" value={canonical.enabled ? (canonical.matched ? 'matched' : 'enabled but not matched') : 'disabled'} />
          <InfoRow label="Canonical height" value={canonical.canonicalHeight ?? nodeState?.canonicalHeight ?? '—'} />
          <InfoRow label="Canonical best block" value={formatHash(canonical.canonicalBestblock || nodeState?.canonicalBestblock)} mono />
          <InfoRow label="Local best block" value={formatHash(summary?.bestblock || nodeState?.localBestblock)} mono />
          <InfoRow label="RPC endpoint" value={health?.rpcUrl || '—'} />
        </div>
      </Card>

      <Card title="Action contracts" subtitle="Backend is now carrying real state and guarded capabilities">
        <div style={{ display: 'grid', gap: 8 }}>
          <InfoRow label="Send preview" value={featureFlags.sendPreview ? 'live' : 'off'} />
          <InfoRow label="Live send" value={contracts?.send?.available ? (contracts?.send?.ready ? 'live' : 'guarded') : 'off'} />
          <InfoRow label="Labels" value={contracts?.labels?.available ? 'live' : 'off'} />
          <InfoRow label="Address generation" value={contracts?.addressGeneration?.available ? (contracts?.addressGeneration?.ready ? 'live' : 'guarded') : 'blocked'} />
          <InfoRow label="Backup export" value={contracts?.backup?.available ? (contracts?.backup?.ready ? 'live' : 'guarded') : 'not configured'} />
          <InfoRow label="Wallet lock/unlock" value={contracts?.unlock?.available ? (contracts?.unlock?.ready ? 'live' : 'guarded') : 'off'} />
        </div>
      </Card>
    </div>
  )

  const panelByTab = {
    overview: overviewPanel,
    receive: receivePanel,
    send: sendPanel,
    transactions: transactionsPanel,
    addresses: addressesPanel,
    backup: backupPanel,
    debug: debugPanel,
  }

  return (
    <ErrorBoundary>
      <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg, #121318 0%, #0d0e12 100%)', color: '#edf2f7', padding: 20, fontFamily: 'Segoe UI, sans-serif' }}>
        <div style={{ maxWidth: 1320, margin: '0 auto', border: '1px solid #404652', borderRadius: 14, overflow: 'hidden', background: '#16191f', boxShadow: '0 20px 60px rgba(0,0,0,.45)' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid #343942', background: 'linear-gradient(180deg, #2a2e36, #20242b)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <img src={triLogo} alt="Triangles logo" style={{ height: 42, width: 'auto', display: 'block', filter: 'drop-shadow(0 8px 18px rgba(0,0,0,.35))' }} />
                <div>
                  <div style={{ fontSize: 22, fontWeight: 700 }}>TRIdock Web Wallet</div>
                  <div style={{ color: '#aeb7c4', marginTop: 4 }}>A full Docker-based Triangles wallet with live controls, clear readiness, and real node visibility</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <StatusPill>{walletMode}</StatusPill>
                <StatusPill color="#ffd38a" background="rgba(255,211,138,.12)">{nodeState?.status || 'unknown node state'}</StatusPill>
                {health?.writeOpsEnabled ? <StatusPill color="#8df0b1" background="rgba(97,214,128,.12)">guarded writes enabled</StatusPill> : null}
                {canonical?.enabled ? (
                  <StatusPill color={canonical.matched ? '#8df0b1' : '#ffb3b3'} background={canonical.matched ? 'rgba(97,214,128,.12)' : 'rgba(255,125,125,.14)'}>
                    {canonical.matched ? 'canonical match' : 'canonical mismatch'}
                  </StatusPill>
                ) : null}
              </div>
            </div>
          </div>

          <div style={{ padding: 18 }}>
            <NavTabs active={activeTab} onChange={setActiveTab} />
            {panelByTab[activeTab]}
            {summaryError ? <div style={{ marginTop: 16, padding: 12, borderRadius: 8, background: '#23161a', border: '1px solid #6a3943', color: '#ffd7de' }}><strong>RPC note:</strong> {summaryError}</div> : null}
          </div>
        </div>
      </div>
    </ErrorBoundary>
  )
}
