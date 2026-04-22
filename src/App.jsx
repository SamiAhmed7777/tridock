import React, { Component, useEffect, useMemo, useRef, useState } from 'react'
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

function NavTabs({ active, onChange, badges = {} }) {
  const tabs = [
    ['overview', 'Overview'],
    ['receive', 'Receive'],
    ['send', 'Send'],
    ['transactions', 'Transactions'],
    ['staking', 'Staking'],
    ['contacts', 'Contacts'],
    ['messages', 'Messages'],
    ['addresses', 'Address Book'],
    ['settings', 'Settings'],
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
            position: 'relative',
          }}
        >
          {label}
          {badges[key] > 0 ? (
            <span style={{
              position: 'absolute', top: -4, right: -4,
              background: '#c1172f', color: '#fff', fontSize: 10, fontWeight: 700,
              borderRadius: 999, minWidth: 18, height: 18, display: 'inline-flex',
              alignItems: 'center', justifyContent: 'center', padding: '0 5px',
            }}>{badges[key]}</span>
          ) : null}
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
  const [walletCountdown, setWalletCountdown] = useState(null)
  const [nodes, setNodes] = useState([])
  const [system, setSystem] = useState(null)
  const [showAddNode, setShowAddNode] = useState(false)
  const [addNodeForm, setAddNodeForm] = useState({ name: '', url: '', user: '', password: '' })
  const [addNodeStatus, setAddNodeStatus] = useState('')
  const [backups, setBackups] = useState([])
  const [msgInbox, setMsgInbox] = useState([])
  const [msgOutbox, setMsgOutbox] = useState([])
  const [msgTab, setMsgTab] = useState('inbox')
  const [selectedMessage, setSelectedMessage] = useState(null)
  const [composeForm, setComposeForm] = useState({ from: '', to: '', text: '' })
  const [msgStatus, setMsgStatus] = useState('')
  const [msgKeys, setMsgKeys] = useState([])
  const [msgUnreadCount, setMsgUnreadCount] = useState(0)

  // ── Contacts ───────────────────────────────────────
  const [contacts, setContacts] = useState([])
  const [contactsLoading, setContactsLoading] = useState(false)
  const [contactsStatus, setContactsStatus] = useState('')
  const [editingContact, setEditingContact] = useState(null) // null = add new, object = edit
  const [contactForm, setContactForm] = useState({ name: '', address: '', label: '', note: '' })

  // ── Settings ─────────────────────────────────────
  const [settings, setSettings] = useState({
    currency: 'TRI',
    locale: 'en-US',
    autoLockMinutes: 30,
    showBalances: true,
    torEnabled: false,
    onionRpc: '',
  })
  const [settingsSaved, setSettingsSaved] = useState('')

  // ── Staking ──────────────────────────────────────
  const [stakingHistory, setStakingHistory] = useState([])
  const [stakingPanelTab, setStakingPanelTab] = useState('status')

  // ── Onboarding ─────────────────────────────────
  const [showOnboarding, setShowOnboarding] = useState(false)

  // ── Send confirmation ─────────────────────────────
  const [sendConfirm, setSendConfirm] = useState(null) // holds previewed send before broadcast

  // Tick wallet unlock countdown every second; when it hits 0, refresh capabilities
  const countdownRef = useRef(null)
  useEffect(() => {
    const update = async () => {
      const until = capabilities?.wallet?.unlockedUntil
      if (until && until > 0) {
        const remaining = until - Math.floor(Date.now() / 1000)
        setWalletCountdown(remaining > 0 ? remaining : 0)
        // When countdown crosses zero, refresh capabilities to reflect locked state
        if (countdownRef.current > 0 && remaining <= 0) {
          countdownRef.current = null
          try {
            const r = await fetch('/api/wallet/contracts')
            const data = await r.json().catch(() => null)
            if (data) setContracts(data)
          } catch { /* ignore */ }
        }
        countdownRef.current = remaining > 0 ? remaining : null
      } else {
        setWalletCountdown(null)
        countdownRef.current = null
      }
    }
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [capabilities?.wallet?.unlockedUntil])

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
        const [healthRes, stateRes, summaryRes, contractsRes, labelsRes, nodesRes, systemRes] = await Promise.all([
          fetch('/api/health'),
          fetch('/api/node/state'),
          fetch('/api/wallet/summary'),
          fetch('/api/wallet/contracts'),
          fetch('/api/wallet/labels'),
          fetch('/api/nodes'),
          fetch('/api/system'),
        ])

        const healthData = await healthRes.json().catch(() => null)
        const stateData = await stateRes.json().catch(() => null)
        const summaryData = await summaryRes.json().catch(() => null)
        const contractsData = await contractsRes.json().catch(() => null)
        const labelsData = await labelsRes.json().catch(() => null)
        const nodesData = await nodesRes.json().catch(() => null)
        const systemData = await systemRes.json().catch(() => null)

        // Load backups and messages separately so failures don't block main UI
        loadBackups()
        loadMessages()
        // Load contacts
        ;(async () => {
          try {
            const res = await fetch('/api/contacts')
            const data = await res.json()
            if (!cancelled) setContacts(Array.isArray(data.contacts) ? data.contacts : [])
          } catch {}
        })()

        if (cancelled) return

        setHealth(healthData)
        setNodeState(stateData)
        setContracts(contractsData)
        setLabels(labelsData?.labels || {})
        setNodes(nodesData?.nodes || [])
        setSystem(systemData || null)
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

  const isLightMode = health?.mode === 'light' || system?.mode === 'light' || nodeState?.mode === 'light'
  const walletMode = isLightMode ? 'light wallet' : (summary?.rpcReady ? 'full wallet mode' : 'warmup mode')
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

  async function handleSwitchNode(nodeId) {
    try {
      const res = await fetch('/api/nodes/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodeId }),
      })
      const data = await res.json()
      if (data?.ok) {
        // Refresh nodes list and force a full data reload
        const nodesRes = await fetch('/api/nodes')
        const nodesData = await nodesRes.json()
        if (nodesData?.nodes) setNodes(nodesData.nodes)
        // Trigger a full refresh by clearing current data briefly
        setSummary(null)
        setSummaryError('')
        // The 10s poll will pick up the new node data automatically
      }
    } catch { /* ignore switch errors */ }
  }

  async function handleAddNode() {
    if (!addNodeForm.name || !addNodeForm.url) {
      setAddNodeStatus('Name and RPC URL are required')
      return
    }
    try {
      const res = await fetch('/api/nodes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(addNodeForm),
      })
      const data = await res.json()
      if (data?.ok) {
        setAddNodeStatus(`Node "${data.node.name}" added — switching to it now`)
        // Refresh nodes list and switch to the new node
        const nodesRes = await fetch('/api/nodes')
        const nodesData = await nodesRes.json()
        if (nodesData?.nodes) setNodes(nodesData.nodes)
        await handleSwitchNode(data.node.id)
        setShowAddNode(false)
        setAddNodeForm({ name: '', url: '', user: '', password: '' })
        setAddNodeStatus('')
      } else {
        setAddNodeStatus(data?.error || 'Failed to add node')
      }
    } catch (err) {
      setAddNodeStatus(err?.message || 'Failed to add node')
    }
  }

  async function loadBackups() {
    try {
      const res = await fetch('/api/wallet/backups')
      const data = await res.json()
      if (data?.files) setBackups(data.files)
    } catch { /* ignore backup list errors */ }
  }

  async function loadMessages() {
    try {
      const [inboxRes, outboxRes, keysRes] = await Promise.all([
        fetch('/api/messages/inbox'),
        fetch('/api/messages/outbox'),
        fetch('/api/messages/keys'),
      ])
      const inboxData = await inboxRes.json().catch(() => null)
      const outboxData = await outboxRes.json().catch(() => null)
      const keysData = await keysRes.json().catch(() => null)
      if (inboxData?.messages) setMsgInbox(inboxData.messages)
      if (outboxData?.messages) setMsgOutbox(outboxData.messages)
      if (keysData?.keys) setMsgKeys(keysData.keys)
      // Count unread (messages with no "read" timestamp or flagged unread)
      if (Array.isArray(inboxData?.messages)) {
        const unread = inboxData.messages.filter((m) => !m.read).length
        setMsgUnreadCount(unread)
      }
    } catch { /* ignore messaging errors — feature may not be available */ }
  }

  async function handleSendMessage() {
    if (!composeForm.to || !composeForm.text) {
      setMsgStatus('Recipient address and message are required')
      return
    }
    if (composeForm.text.length > 4096) {
      setMsgStatus('Message exceeds 4096 byte limit')
      return
    }
    try {
      const endpoint = composeForm.from ? '/api/messages/send' : '/api/messages/send-anon'
      const body = composeForm.from
        ? { from: composeForm.from, to: composeForm.to, message: composeForm.text }
        : { to: composeForm.to, message: composeForm.text }
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => null)
      if (data?.ok) {
        setMsgStatus(data.result || 'Message sent successfully')
        setComposeForm({ from: composeForm.from, to: '', text: '' })
        loadMessages()
      } else {
        setMsgStatus(data?.error || data?.result || 'Send failed')
      }
    } catch (error) {
      setMsgStatus(error?.message || 'Send failed')
    }
  }

  async function handleToggleReceive(address, currentlyOn) {
    try {
      const res = await fetch('/api/messages/keys/receive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, enable: !currentlyOn }),
      })
      const data = await res.json().catch(() => null)
      setMsgStatus(data?.result || (data?.ok ? 'Updated' : 'Failed'))
      loadMessages()
    } catch (error) {
      setMsgStatus(error?.message || 'Failed to update key')
    }
  }

  async function handleScanChain() {
    setMsgStatus('Scanning chain for public keys...')
    try {
      const res = await fetch('/api/messages/scan-chain', { method: 'POST' })
      const data = await res.json().catch(() => null)
      setMsgStatus(data?.result || (data?.ok ? 'Chain scan complete' : 'Scan failed'))
      loadMessages()
    } catch (error) {
      setMsgStatus(error?.message || 'Chain scan failed')
    }
  }

  async function handleLookupPubkey(address) {
    try {
      const res = await fetch('/api/messages/pubkey', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address }),
      })
      const data = await res.json().catch(() => null)
      if (data?.found) {
        setMsgStatus(`Public key found (${data.source || 'unknown source'})`)
      } else {
        setMsgStatus('Public key not found — recipient must have transacted on-chain, or use "Scan chain"')
      }
    } catch (error) {
      setMsgStatus(error?.message || 'Pubkey lookup failed')
    }
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
        <Card title="Wallet security" tone={capabilities?.wallet?.locked !== false ? 'warning' : 'ok'}>
          <div style={{ fontSize: 28, fontWeight: 800 }}>{capabilities?.wallet?.locked === false ? 'Unlocked' : 'Locked'}</div>
          {walletCountdown > 0 ? (
            <div style={{ color: '#8df0b1', marginTop: 8 }}>
              Auto-lock in {walletCountdown}s
            </div>
          ) : capabilities?.wallet?.locked === false ? (
            <div style={{ color: '#8df0b1', marginTop: 8 }}>No auto-lock timeout set</div>
          ) : (
            <div style={{ color: '#aeb7c4', marginTop: 8 }}>Wallet is locked</div>
          )}
          {capabilities?.wallet?.encrypted ? (
            <div style={{ color: '#aeb7c4', marginTop: 4, fontSize: 12 }}>Encryption: enabled</div>
          ) : (
            <div style={{ color: '#aeb7c4', marginTop: 4, fontSize: 12 }}>Encryption: not enabled</div>
          )}
          {capabilities?.wallet?.unlockedUntil ? (
            <div style={{ color: '#aeb7c4', marginTop: 4, fontSize: 12 }}>
              Expires: {new Date(capabilities.wallet.unlockedUntil * 1000).toLocaleTimeString()}
            </div>
          ) : null}
          {capabilities?.unlock?.available ? (
            capabilities?.wallet?.locked === false ? (
              <ActionButton tone="warning" style={{ marginTop: 10 }} onClick={handleLockWallet}>Lock wallet</ActionButton>
            ) : (
              <ActionButton tone="ok" style={{ marginTop: 10 }} onClick={handleUnlockWallet}>Unlock wallet</ActionButton>
            )
          ) : null}
          {walletActionStatus ? <div style={{ marginTop: 8, fontSize: 12, color: '#aeb7c4' }}>{walletActionStatus}</div> : null}
        </Card>
        <Card title="Staking" tone={summary?.staking?.staking ? 'ok' : summary?.staking?.enabled ? 'warning' : 'muted'}>
          <div style={{ fontSize: 28, fontWeight: 800 }}>
            {summary?.staking?.staking ? 'Active' : summary?.staking?.enabled ? 'Idle' : 'Off'}
          </div>
          {summary?.staking?.staking ? (
            <div style={{ color: '#8df0b1', marginTop: 8 }}>
              Earning on {formatAmount(summary?.staking?.weight)} of {formatAmount(summary?.staking?.netstakeweight)} weight
            </div>
          ) : null}
          {summary?.staking?.errors ? (
            <div style={{ color: '#ff7d7d', marginTop: 4, fontSize: 12 }}>Errors: {summary.staking.errors}</div>
          ) : null}
          <div style={{ color: '#aeb7c4', marginTop: 8 }}>
            {summary?.staking?.expectedtime && Number(summary.staking.expectedtime) > 0
              ? `Next stake in ~${Math.round(Number(summary.staking.expectedtime) / 60)}min`
              : summary?.staking?.staking ? 'Staking now'
              : '—'}
          </div>
        </Card>
      </div>

      <Card title={isLightMode ? 'Remote node' : 'Current node state'} subtitle={isLightMode ? 'Connected to a remote TRIdock full node — no local blockchain' : 'The wallet stays useful even while the node is bootstrapping or warming up'} tone="accent">
        <div style={{ display: 'grid', gap: 8 }}>
          <InfoRow label="Mode" value={isLightMode ? 'Light wallet' : 'Full node'} />
          <InfoRow label="Status" value={nodeState?.status || 'unknown'} />
          <InfoRow label="Reason" value={nodeState?.reason || summaryError || 'Waiting for node status...'} />
          {!isLightMode && <InfoRow label="Bootstrap source" value={nodeState?.bootstrapSource || '—'} />}
          {!isLightMode && <InfoRow label="Bootstrap progress" value={nodeState?.bootstrapProgress || '—'} />}
          <InfoRow label={isLightMode ? 'Remote height' : 'Local height'} value={summary?.blocks || nodeState?.localHeight || '—'} />
          {!isLightMode && <InfoRow label="Canonical status" value={nodeState?.canonicalStatus || 'disabled'} />}
          {isLightMode && <InfoRow label="Active node" value={nodes.find((n) => n.active)?.name || '—'} />}
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
            <ActionButton tone="ok" onClick={() => {
              if (!sendPreviewData?.canBroadcast) return
              setSendConfirm({ address: sendForm.address, amount: sendForm.amount, memo: sendForm.memo, fee: sendPreviewData?.estimatedFee, total: sendPreviewData?.estimatedTotal })
            }} disabled={!sendPreviewData?.canBroadcast}>Broadcast send</ActionButton>
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
          </div>
          {backupStatus ? <div style={{ padding: 10, borderRadius: 10, background: '#181b20', border: '1px solid #343942', color: '#cdd6e2' }}>{backupStatus}</div> : null}
          {backupData ? (
            <div style={{ display: 'grid', gap: 8 }}>
              <InfoRow label="Filename" value={backupData.filename} mono />
              <InfoRow label="Bytes" value={String(backupData.bytes)} />
              <InfoRow label="SHA256" value={formatHash(backupData.sha256)} mono />
              <InfoRow label="Created" value={backupData.createdAt} />
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <ActionButton tone="ok" onClick={() => window.open(`/api/wallet/backups/${encodeURIComponent(backupData.filename)}`, '_blank')}>
                  Download
                </ActionButton>
              </div>
            </div>
          ) : null}
        </div>
      </Card>

      <Card title="Available backups" subtitle="Download any backup to keep a local copy">
        {backups.length === 0 ? (
          <div style={{ color: '#aeb7c4', fontSize: 13 }}>No backups yet. Create one to get started.</div>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {backups.map((b) => (
              <div key={b.name} style={{ padding: '8px 10px', borderRadius: 8, background: '#1e222b', border: '1px solid #343942', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontFamily: 'monospace', color: '#cdd6e2', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.name}</div>
                  <div style={{ fontSize: 11, color: '#aeb7c4', marginTop: 2 }}>
                    {b.type === 'wallet-dat' ? 'wallet-dat · ' : 'export · '}{Math.round(b.size / 1024)}KB · {new Date(b.modified).toLocaleString()}
                  </div>
                </div>
                <button
                  onClick={() => window.open(`/api/wallet/backups/${encodeURIComponent(b.name)}`, '_blank')}
                  style={{ background: '#2a3040', color: '#8df0b1', border: '1px solid #404652', borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer', flexShrink: 0 }}
                >
                  ↓
                </button>
              </div>
            ))}
          </div>
        )}
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


  // ═══════════════════════════════════════════════════════════════
  // STAKING PANEL
  // ═══════════════════════════════════════════════════════════════
  const stakingPanel = (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
        {['status', 'history', 'info'].map((tab) => (
          <button key={tab} onClick={() => setStakingPanelTab(tab)}
            style={{ border: '1px solid #414955', background: stakingPanelTab === tab ? '#2a3140' : '#171a20', color: '#eef2f7', borderRadius: 999, padding: '8px 14px', cursor: 'pointer', fontWeight: 600 }}>
            {tab === 'status' ? 'Status' : tab === 'history' ? 'History' : 'Info'}
          </button>
        ))}
      </div>

      {stakingPanelTab === 'status' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          <Card title="Staking engine" tone={summary?.staking?.staking ? 'ok' : summary?.staking?.enabled ? 'warning' : 'muted'}>
            <div style={{ fontSize: 28, fontWeight: 800 }}>
              {summary?.staking?.staking ? '🟢 Active' : summary?.staking?.enabled ? '🟡 Idle' : '⚪ Off'}
            </div>
            <div style={{ marginTop: 12, display: 'grid', gap: 6 }}>
              <InfoRow label="Your weight" value={formatAmount(summary?.staking?.weight)} />
              <InfoRow label="Network weight" value={formatAmount(summary?.staking?.netstakeweight)} />
              <InfoRow label="Next stake" value={
                summary?.staking?.expectedtime && Number(summary.staking.expectedtime) > 0
                  ? `~${Math.round(Number(summary.staking.expectedtime) / 60)} min`
                  : summary?.staking?.staking ? 'Staking now ✓' : '—'
              } />
              <InfoRow label="Errors" value={summary?.staking?.errors ? String(summary.staking.errors).slice(0, 60) : 'none'} />
            </div>
            {capabilities?.wallet?.locked !== false && (
              <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 8, background: 'rgba(255,193,7,.1)', border: '1px solid rgba(255,193,7,.3)', color: '#ffd76e', fontSize: 13 }}>
                Unlock your wallet to stake
              </div>
            )}
          </Card>
          <Card title="Stake balance">
            <div style={{ fontSize: 28, fontWeight: 800 }}>{formatAmount(summary?.stake)}</div>
            <div style={{ color: '#aeb7c4', marginTop: 8, fontSize: 13 }}>Locked in stake</div>
            <div style={{ marginTop: 12, display: 'grid', gap: 6 }}>
              <InfoRow label="Total" value={formatAmount(summary?.balance)} />
              <InfoRow label="New mint" value={formatAmount(summary?.newmint)} />
              <InfoRow label="Unconfirmed" value={formatAmount(summary?.unconfirmed_balance)} />
              <InfoRow label="Spendable" value={formatAmount((Number(summary?.balance||0) - Number(summary?.stake||0) - Number(summary?.unconfirmed_balance||0)).toFixed(8))} />
            </div>
          </Card>
          <Card title="Network share" subtitle="Your proportion of staking power">
            {summary?.staking?.weight && summary?.staking?.netstakeweight ? (
              <div style={{ display: 'grid', gap: 10 }}>
                <div style={{ fontSize: 28, fontWeight: 800 }}>
                  {((Number(summary.staking.weight) / Number(summary.staking.netstakeweight) * 100)).toFixed(2)}%
                </div>
                <div style={{ color: '#aeb7c4', fontSize: 13 }}>
                  You earn rewards proportionally to your share of total staked TRI.
                </div>
              </div>
            ) : <div style={{ color: '#aeb7c4' }}>Stake coins to see your network share.</div>}
          </Card>
        </div>
      ) : stakingPanelTab === 'history' ? (
        <Card title="Stake transaction history">
          <div style={{ display: 'grid', gap: 8 }}>
            {(() => {
              const stakeTxs = (summary?.transactions || []).filter(
                (tx) => tx.category === 'generate' || tx.category === 'stake'
              )
              if (!stakeTxs.length) return <div style={{ color: '#aeb7c4' }}>No stake transactions yet.</div>
              return stakeTxs.slice(0, 50).map((tx, i) => (
                <div key={i} style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #343942', background: '#181b20', display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>{tx.category || 'reward'}</div>
                    <div style={{ color: '#aeb7c4', fontSize: 12, marginTop: 4 }}>{formatTime(tx.time)}</div>
                    {tx.txid ? <div style={{ color: '#8aa2c8', fontSize: 11, fontFamily: 'monospace', marginTop: 2 }}>{formatHash(tx.txid)}</div> : null}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 700, color: '#8df0b1' }}>+{formatAmount(tx.amount)}</div>
                    <div style={{ color: '#aeb7c4', fontSize: 12, marginTop: 4 }}>{tx.confirmations ?? 0} conf</div>
                  </div>
                </div>
              ))
            })()}
          </div>
        </Card>
      ) : (
        <Card title="How staking works">
          <div style={{ display: 'grid', gap: 12 }}>
            <InfoRow label="Type" value="Proof of Stake (PoS)" />
            <InfoRow label="Yield" value="~2-5% annually" />
            <InfoRow label="Frequency" value="Every PoS block (~1-5 min)" />
            <InfoRow label="Minimum" value="No minimum" />
            <InfoRow label="Lock-up" value="While staking" />
            <div style={{ padding: '10px 12px', borderRadius: 8, background: '#181b20', border: '1px solid #343942', color: '#aeb7c4', fontSize: 13, lineHeight: 1.6 }}>
              Keep your wallet unlocked and node online to earn rewards. Older UTXOs earn priority.
            </div>
          </div>
        </Card>
      )}
    </div>
  )

  // ═══════════════════════════════════════════════════════════════
  // CONTACTS PANEL — Full CRUD address book
  // ═══════════════════════════════════════════════════════════════
  function ContactRow({ contact, onEdit, onDelete, onSend }) {
    return (
      <div style={{ padding: 14, borderRadius: 12, border: '1px solid #343942', background: '#181b20' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{contact.name}</div>
            {contact.label ? <div style={{ color: '#8aa2c8', fontSize: 12, marginTop: 2 }}>{contact.label}</div> : null}
          </div>
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            <button onClick={() => onSend(contact)} style={{ background: '#1a2330', color: '#8df0b1', border: '1px solid #3b7a56', borderRadius: 8, padding: '4px 10px', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Send</button>
            <button onClick={() => onEdit(contact)} style={{ background: '#202a38', color: '#ecf2ff', border: '1px solid #53698a', borderRadius: 8, padding: '4px 10px', cursor: 'pointer', fontSize: 12 }}>Edit</button>
            <button onClick={() => onDelete(contact.address)} style={{ background: '#1a1416', color: '#ff7d7d', border: '1px solid #8b4b57', borderRadius: 8, padding: '4px 10px', cursor: 'pointer', fontSize: 12 }}>Delete</button>
          </div>
        </div>
        <div style={{ fontFamily: 'monospace', wordBreak: 'break-all', color: '#8aa2c8', fontSize: 12 }}>{contact.address}</div>
        {contact.note ? <div style={{ marginTop: 8, color: '#aeb7c4', fontSize: 13, fontStyle: 'italic' }}>{contact.note}</div> : null}
      </div>
    )
  }

  const contactsPanel = (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr .9fr', gap: 16 }}>
      <Card title="Contacts" subtitle="Your saved Triangles addresses">
        <div style={{ display: 'grid', gap: 10 }}>
          {contactsLoading ? (
            <div style={{ color: '#aeb7c4' }}>Loading…</div>
          ) : contacts.length === 0 ? (
            <div style={{ color: '#aeb7c4', textAlign: 'center', padding: '24px 0' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>📇</div>
              No contacts yet. Add your first one!
            </div>
          ) : contacts.map((c) => (
            <ContactRow
              key={c.address}
              contact={c}
              onEdit={(contact) => {
                setEditingContact(contact)
                setContactForm({ name: contact.name, address: contact.address, label: contact.label || '', note: contact.note || '' })
              }}
              onDelete={async (address) => {
                if (!confirm(`Delete this contact?`)) return
                setContactsLoading(true)
                try {
                  const res = await fetch(`/api/contacts/${encodeURIComponent(address)}`, { method: 'DELETE' })
                  const data = await res.json()
                  if (data.ok) {
                    setContacts((prev) => prev.filter((c2) => c2.address !== address))
                    setContactsStatus('Deleted.')
                  } else {
                    setContactsStatus(`Error: ${data.message}`)
                  }
                } catch (e) {
                  setContactsStatus(`Error: ${e.message}`)
                } finally {
                  setContactsLoading(false)
                }
              }}
              onSend={(contact) => {
                setSendForm((f) => ({ ...f, address: contact.address }))
                setActiveTab('send')
              }}
            />
          ))}
        </div>
        {contactsStatus ? <div style={{ marginTop: 10, padding: 10, borderRadius: 8, background: '#181b20', border: '1px solid #343942', color: '#cdd6e2', fontSize: 13 }}>{contactsStatus}</div> : null}
      </Card>

      <Card title={editingContact ? 'Edit contact' : 'Add contact'} subtitle="Save frequently used addresses">
        <div style={{ display: 'grid', gap: 12 }}>
          <Field label="Friendly name" value={contactForm.name} onChange={(e) => setContactForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Sami's savings" />
          <Field label="TRI address" value={contactForm.address} onChange={(e) => setContactForm((f) => ({ ...f, address: e.target.value }))} placeholder="Tj… or onion address" />
          <Field label="Category" value={contactForm.label} onChange={(e) => setContactForm((f) => ({ ...f, label: e.target.value }))} placeholder="e.g. savings, exchange, family" />
          <div>
            <div style={{ color: '#aeb7c4', marginBottom: 6 }}>Private note (never sent)</div>
            <textarea value={contactForm.note} onChange={(e) => setContactForm((f) => ({ ...f, note: e.target.value }))}
              placeholder="Private reminder about this contact…"
              rows={3}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #343942', background: '#111419', color: '#eef2f7', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }} />
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <ActionButton
              tone="ok"
              disabled={!contactForm.name || !contactForm.address}
              onClick={async () => {
                setContactsLoading(true)
                setContactsStatus('')
                try {
                  const method = editingContact ? 'PUT' : 'POST'
                  const url = editingContact
                    ? `/api/contacts/${encodeURIComponent(editingContact.address)}`
                    : '/api/contacts'
                  const res = await fetch(url, {
                    method,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(contactForm),
                  })
                  const data = await res.json()
                  if (data.ok) {
                    if (editingContact) {
                      setContacts((prev) => prev.map((c) => c.address === editingContact.address ? { ...c, ...contactForm } : c))
                    } else {
                      setContacts((prev) => [...prev.filter((c) => c.address !== contactForm.address), contactForm])
                    }
                    setContactForm({ name: '', address: '', label: '', note: '' })
                    setEditingContact(null)
                    setContactsStatus(editingContact ? 'Contact updated.' : 'Contact added.')
                  } else {
                    setContactsStatus(`Error: ${data.message}`)
                  }
                } catch (e) {
                  setContactsStatus(`Error: ${e.message}`)
                } finally {
                  setContactsLoading(false)
                }
              }}>
              {editingContact ? 'Save changes' : 'Add contact'}
            </ActionButton>
            {editingContact && (
              <ActionButton onClick={() => { setEditingContact(null); setContactForm({ name: '', address: '', label: '', note: '' }) }}>Cancel</ActionButton>
            )}
          </div>
        </div>
      </Card>
    </div>
  )

  // ═══════════════════════════════════════════════════════════════
  // SETTINGS PANEL
  // ═══════════════════════════════════════════════════════════════
  const settingsPanel = (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
      <Card title="Display">
        <div style={{ display: 'grid', gap: 12 }}>
          <div>
            <div style={{ color: '#aeb7c4', marginBottom: 6 }}>Currency display</div>
            <select value={settings.currency} onChange={(e) => setSettings((s) => ({ ...s, currency: e.target.value }))}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #343942', background: '#111419', color: '#eef2f7' }}>
              <option value="TRI">TRI</option>
              <option value="mTRI">mTRI (milli-TRI)</option>
              <option value="sat">satoshis</option>
            </select>
          </div>
          <div>
            <div style={{ color: '#aeb7c4', marginBottom: 6 }}>Auto-lock wallet</div>
            <select value={settings.autoLockMinutes} onChange={(e) => setSettings((s) => ({ ...s, autoLockMinutes: Number(e.target.value) }))}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #343942', background: '#111419', color: '#eef2f7' }}>
              {[5, 15, 30, 60, 120, 0].map((m) => <option key={m} value={m}>{m === 0 ? 'Never' : `${m} minutes`}</option>)}
            </select>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <input type="checkbox" checked={settings.showBalances} onChange={(e) => setSettings((s) => ({ ...s, showBalances: e.target.checked }))} />
            <span style={{ color: '#eef2f7' }}>Show balance amounts</span>
          </label>
        </div>
      </Card>

      <Card title="Node">
        <div style={{ display: 'grid', gap: 12 }}>
          <InfoRow label="Active node" value={nodes.find((n) => n.active)?.name || '—'} />
          <InfoRow label="Block height" value={summary?.blocks || nodeState?.localHeight || '—'} />
          <InfoRow label="Connections" value={summary?.connections || '—'} />
          <div>
            <div style={{ color: '#aeb7c4', marginBottom: 6 }}>Onion RPC (Tor)</div>
            <input value={settings.onionRpc} onChange={(e) => setSettings((s) => ({ ...s, onionRpc: e.target.value }))}
              placeholder="http://your-onion:19112"
              style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #343942', background: '#111419', color: '#eef2f7', boxSizing: 'border-box' }} />
          </div>
          <ActionButton tone="ok" disabled={!settings.onionRpc}
            onClick={async () => {
              try {
                const res = await fetch('/api/nodes', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ name: `Onion RPC`, url: settings.onionRpc, user: '', password: '' }) })
                const data = await res.json()
                setSettingsSaved(data.ok ? 'Onion node added.' : `Error: ${data.message}`)
              } catch (e) { setSettingsSaved(`Error: ${e.message}`) }
            }}>
            Add onion RPC node
          </ActionButton>
        </div>
      </Card>

      <Card title="Security">
        <div style={{ display: 'grid', gap: 12 }}>
          <InfoRow label="Encrypted" value={capabilities?.wallet?.encrypted ? 'yes' : 'no / unknown'} />
          <InfoRow label="Locked" value={capabilities?.wallet?.locked ? 'yes' : 'no'} />
          <InfoRow label="Auto-lock" value={settings.autoLockMinutes === 0 ? 'Never' : `${settings.autoLockMinutes} min`} />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {capabilities?.wallet?.locked !== false ? (
              <ActionButton tone="ok" onClick={() => handleUnlockWallet()}>Unlock wallet</ActionButton>
            ) : (
              <ActionButton onClick={() => handleLockWallet()}>Lock wallet</ActionButton>
            )}
          </div>
          {walletActionStatus ? <div style={{ color: '#aeb7c4', fontSize: 13 }}>{walletActionStatus}</div> : null}
        </div>
      </Card>

      <Card title="About">
        <div style={{ display: 'grid', gap: 8 }}>
          <InfoRow label="TRIdock" value="v1.0" />
          <InfoRow label="TRI daemon" value={summary?.version || '—'} />
          <InfoRow label="Protocol" value="TRI v5.8.x" />
          <div style={{ padding: '10px 12px', borderRadius: 8, background: '#181b20', border: '1px solid #343942', color: '#aeb7c4', fontSize: 12, lineHeight: 1.6 }}>
            Triangles — hybrid PoW/PoS blockchain with secure messaging, staking, and onion routing. Keys stay on your node.
          </div>
        </div>
      </Card>

      {settingsSaved ? <div style={{ gridColumn: '1 / -1', padding: 10, borderRadius: 8, background: '#181b20', border: '1px solid #343942', color: '#8df0b1' }}>{settingsSaved}</div> : null}
    </div>
  )

  // ═══════════════════════════════════════════════════════════════
  // SEND CONFIRMATION OVERLAY
  // ═══════════════════════════════════════════════════════════════
  const sendConfirmOverlay = sendConfirm ? (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.85)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: '#171a20', border: '1px solid #c1172f', borderRadius: 16, padding: 28, maxWidth: 520, width: '100%', boxShadow: '0 0 60px rgba(193,23,47,.4)' }}>
        <h2 style={{ marginTop: 0, color: '#ffd7de', fontFamily: 'Segoe UI, sans-serif', fontSize: 20 }}>⚠️ Confirm send</h2>
        <div style={{ display: 'grid', gap: 10, marginTop: 16 }}>
          <div style={{ padding: '12px 14px', borderRadius: 10, background: '#111419', border: '1px solid #343942' }}>
            <div style={{ color: '#aeb7c4', fontSize: 12, marginBottom: 4 }}>To address</div>
            <div style={{ fontFamily: 'monospace', wordBreak: 'break-all', color: '#eef2f7', fontSize: 13 }}>{sendConfirm.address}</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div style={{ padding: '12px 14px', borderRadius: 10, background: '#111419', border: '1px solid #343942' }}>
              <div style={{ color: '#aeb7c4', fontSize: 12 }}>Amount</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#eef2f7' }}>{sendConfirm.amount} TRI</div>
            </div>
            <div style={{ padding: '12px 14px', borderRadius: 10, background: '#111419', border: '1px solid #343942' }}>
              <div style={{ color: '#aeb7c4', fontSize: 12 }}>Fee</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: '#cdd6e2' }}>{formatAmount(sendConfirm.fee)}</div>
            </div>
          </div>
          <div style={{ padding: '12px 14px', borderRadius: 10, background: '#111419', border: '1px solid #343942' }}>
            <div style={{ color: '#aeb7c4', fontSize: 12 }}>Total (amount + fee)</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#ffd7de' }}>{formatAmount(sendConfirm.total)} TRI</div>
          </div>
          {sendConfirm.memo ? (
            <div style={{ padding: '10px 12px', borderRadius: 8, background: '#181b20', border: '1px solid #343942', color: '#aeb7c4', fontSize: 13 }}>
              Memo: {sendConfirm.memo}
            </div>
          ) : null}
          <div style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(193,23,47,.1)', border: '1px solid rgba(193,23,47,.3)', color: '#ffb3b3', fontSize: 13 }}>
            ⚠️ This transaction is irreversible. Verify the address carefully.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
          <ActionButton tone="ok"
            onClick={async () => {
              setSendConfirm(null)
              await handleBroadcastSend()
            }}>
            ✅ Yes, broadcast send
          </ActionButton>
          <ActionButton onClick={() => setSendConfirm(null)}>Cancel</ActionButton>
        </div>
      </div>
    </div>
  ) : null


  const debugPanel = (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
      <Card title={isLightMode ? 'Remote node view' : 'Canonical chain view'} subtitle={isLightMode ? 'Light wallet — all data from remote node' : 'Wallet and node truth should stay aligned with the chain you actually trust'}>
        <div style={{ display: 'grid', gap: 8 }}>
          <InfoRow label="Mode" value={isLightMode ? 'Light wallet' : 'Full node'} />
          {!isLightMode && <InfoRow label="Canonical verification" value={canonical.enabled ? (canonical.matched ? 'matched' : 'enabled but not matched') : 'disabled'} />}
          {!isLightMode && <InfoRow label="Canonical height" value={canonical.canonicalHeight ?? nodeState?.canonicalHeight ?? '—'} />}
          {!isLightMode && <InfoRow label="Canonical best block" value={formatHash(canonical.canonicalBestblock || nodeState?.canonicalBestblock)} mono />}
          <InfoRow label={isLightMode ? 'Remote best block' : 'Local best block'} value={formatHash(summary?.bestblock || nodeState?.localBestblock)} mono />
          <InfoRow label="RPC endpoint" value={health?.rpcUrl || '—'} />
          {isLightMode && <InfoRow label="Active node" value={nodes.find((n) => n.active)?.name || '—'} />}
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
      <Card title="Container / system" subtitle="Runtime environment and Docker metadata">
        <div style={{ display: 'grid', gap: 8 }}>
          <InfoRow label="Mode" value={system?.mode || 'full'} />
          <InfoRow label="Container" value={system?.inContainer ? `yes (${system.containerId || 'running'})` : 'not detected'} />
          <InfoRow label="Uptime" value={system?.uptimeHuman || '—'} />
          {system?.memUsage && system?.memLimit ? (
            <InfoRow label="Memory" value={`${system.memUsage}MB / ${system.memLimit}MB`} />
          ) : <InfoRow label="Memory" value="—" />}
          <InfoRow label="Node.js" value={system?.nodeVersion || '—'} />
          {!isLightMode && <InfoRow label="TRI version" value={system?.triVersion || '—'} />}
          <InfoRow label="Platform" value={system?.platform || '—'} />
        </div>
      </Card>
    </div>
  )

  const currentMessages = msgTab === 'inbox' ? msgInbox : msgOutbox
  const msgFromAddresses = useMemo(() => {
    const addrs = Array.isArray(summary?.received) ? summary.received.map((r) => r.address) : []
    // Also include keys that have receive enabled
    for (const k of msgKeys) {
      if (!addrs.includes(k.address)) addrs.push(k.address)
    }
    return addrs
  }, [summary?.received, msgKeys])

  const messagesPanel = (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
      <div style={{ display: 'grid', gap: 16 }}>
        <Card title="Messages" subtitle="Encrypted P2P messaging via the Triangles smessage protocol">
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            {['inbox', 'outbox', 'compose'].map((tab) => (
              <button key={tab} onClick={() => { setMsgTab(tab); setSelectedMessage(null); setMsgStatus('') }}
                style={{ border: '1px solid #414955', background: msgTab === tab ? '#2a3140' : '#171a20', color: '#eef2f7', borderRadius: 999, padding: '6px 12px', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
                {tab === 'inbox' ? `Inbox (${msgInbox.length})` : tab === 'outbox' ? `Outbox (${msgOutbox.length})` : 'Compose'}
              </button>
            ))}
          </div>

          {msgTab === 'compose' ? (
            <div style={{ display: 'grid', gap: 10 }}>
              <div>
                <div style={{ fontSize: 12, color: '#aeb7c4', marginBottom: 4 }}>From address (leave empty for anonymous)</div>
                <select value={composeForm.from} onChange={(e) => setComposeForm((f) => ({ ...f, from: e.target.value }))}
                  style={{ width: '100%', background: '#232730', color: '#cdd6e2', border: '1px solid #404652', borderRadius: 6, padding: '6px 8px', fontSize: 13, boxSizing: 'border-box' }}>
                  <option value="">Anonymous (no sender identity)</option>
                  {msgFromAddresses.map((addr) => (
                    <option key={addr} value={addr}>{shortAddress(addr)}</option>
                  ))}
                </select>
              </div>
              <Field label="To address" value={composeForm.to} onChange={(e) => setComposeForm((f) => ({ ...f, to: e.target.value }))} placeholder="Recipient TRI address" />
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <div style={{ fontSize: 12, color: '#aeb7c4' }}>Message</div>
                  <div style={{ fontSize: 11, color: composeForm.text.length > 4096 ? '#ff7d7d' : '#aeb7c4' }}>{composeForm.text.length} / 4096</div>
                </div>
                <textarea value={composeForm.text} onChange={(e) => setComposeForm((f) => ({ ...f, text: e.target.value }))}
                  placeholder="Type your encrypted message..."
                  rows={6}
                  style={{ width: '100%', background: '#232730', color: '#cdd6e2', border: '1px solid #404652', borderRadius: 6, padding: '8px', fontSize: 13, boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }}
                />
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <ActionButton tone="ok" onClick={handleSendMessage} disabled={!composeForm.to || !composeForm.text || composeForm.text.length > 4096}>
                  {composeForm.from ? 'Send encrypted' : 'Send anonymous'}
                </ActionButton>
                {composeForm.to && (
                  <ActionButton onClick={() => handleLookupPubkey(composeForm.to)}>Check pubkey</ActionButton>
                )}
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {currentMessages.length === 0 ? (
                <div style={{ color: '#aeb7c4', padding: 12 }}>
                  {msgTab === 'inbox' ? 'No messages in inbox. Messages are retained for 48 hours on the network.' : 'No sent messages.'}
                </div>
              ) : currentMessages.map((msg, i) => (
                <div key={i} onClick={() => setSelectedMessage(msg)}
                  style={{
                    padding: 12, borderRadius: 10, cursor: 'pointer',
                    border: selectedMessage === msg ? '1px solid #5a7ab6' : '1px solid #343942',
                    background: selectedMessage === msg ? '#1a2330' : '#181b20',
                  }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>
                      {msgTab === 'inbox'
                        ? (msg.from === 'anon' ? <span style={{ color: '#b4a7ff' }}>Anonymous</span> : shortAddress(msg.from))
                        : shortAddress(msg.to)}
                    </div>
                    <span style={{ color: '#aeb7c4', fontSize: 12 }}>{formatTime(msg.sent || msg.received)}</span>
                  </div>
                  <div style={{ marginTop: 6, color: '#c7d0dc', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {msg.text || '(empty message)'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="Messaging keys" subtitle="Addresses enabled for receiving encrypted messages">
          <div style={{ display: 'grid', gap: 8 }}>
            {msgKeys.length === 0 ? (
              <div style={{ color: '#aeb7c4' }}>No messaging keys loaded. Wallet may need to be unlocked.</div>
            ) : msgKeys.map((key) => (
              <div key={key.address} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: 8, borderRadius: 8, background: '#181b20', border: '1px solid #343942' }}>
                <div>
                  <div style={{ fontFamily: 'ui-monospace, SFMono-Regular, monospace', fontSize: 12, color: '#cdd6e2', wordBreak: 'break-all' }}>{key.address}</div>
                  <div style={{ fontSize: 11, color: '#aeb7c4', marginTop: 2 }}>
                    Receive: {key.receiveOn ? <span style={{ color: '#8df0b1' }}>on</span> : <span style={{ color: '#ff8b9b' }}>off</span>}
                    {' · '}Anon: {key.anonOn ? <span style={{ color: '#8df0b1' }}>on</span> : <span style={{ color: '#aeb7c4' }}>off</span>}
                    {key.label ? ` · ${key.label}` : ''}
                  </div>
                </div>
                <button onClick={() => handleToggleReceive(key.address, key.receiveOn)}
                  style={{ background: key.receiveOn ? '#3a2020' : '#1a3020', color: key.receiveOn ? '#ff8b9b' : '#8df0b1', border: '1px solid #404652', borderRadius: 6, padding: '4px 10px', fontSize: 11, cursor: 'pointer', flexShrink: 0 }}>
                  {key.receiveOn ? 'Disable' : 'Enable'}
                </button>
              </div>
            ))}
            <ActionButton onClick={handleScanChain}>Scan chain for public keys</ActionButton>
          </div>
        </Card>
      </div>

      <div style={{ display: 'grid', gap: 16 }}>
        <Card title="Message detail" subtitle={selectedMessage ? (msgTab === 'inbox' ? 'Received message' : 'Sent message') : 'Select a message to view'} tone={selectedMessage ? 'ok' : undefined}>
          {selectedMessage ? (
            <div style={{ display: 'grid', gap: 8 }}>
              <InfoRow label="From" value={selectedMessage.from === 'anon' ? 'Anonymous' : (selectedMessage.from || '—')} mono />
              <InfoRow label="To" value={selectedMessage.to || '—'} mono />
              {selectedMessage.sent && <InfoRow label="Sent" value={formatTime(selectedMessage.sent)} />}
              {selectedMessage.received && <InfoRow label="Received" value={formatTime(selectedMessage.received)} />}
              <div style={{ marginTop: 8, padding: 12, borderRadius: 10, background: '#111419', border: '1px solid #2d323c', whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: '#edf2f7', fontSize: 13, lineHeight: 1.6, minHeight: 80 }}>
                {selectedMessage.text || '(empty message)'}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <ActionButton onClick={() => { setMsgTab('compose'); setComposeForm((f) => ({ ...f, to: selectedMessage.from === 'anon' ? '' : (selectedMessage.from || ''), text: '' })) }}
                  disabled={selectedMessage.from === 'anon'}>
                  Reply
                </ActionButton>
                <ActionButton onClick={() => {
                  try { navigator.clipboard.writeText(selectedMessage.text || '') } catch {}
                }}>Copy message</ActionButton>
              </div>
            </div>
          ) : (
            <div style={{ color: '#aeb7c4', padding: 16, textAlign: 'center' }}>
              Select a message from the inbox or outbox to view its contents here.
            </div>
          )}
        </Card>

        <Card title="Messaging info" subtitle="How secure messaging works" tone="accent">
          <div style={{ display: 'grid', gap: 8 }}>
            <InfoRow label="Protocol" value="smessage (ShadowCoin)" />
            <InfoRow label="Encryption" value="ECDH + AES" />
            <InfoRow label="Max message" value="4,096 bytes" />
            <InfoRow label="Retention" value="48 hours on network" />
            <InfoRow label="Status" value={capabilities?.messaging?.ready ? 'Ready' : (capabilities?.messaging?.available ? 'Available (unlock wallet to read)' : 'Disabled')} />
            {capabilities?.messaging?.blockedReasons?.length > 0 && (
              <InfoRow label="Blocked" value={capabilities.messaging.blockedReasons.join(', ')} />
            )}
          </div>
        </Card>
      </div>
      {msgStatus ? <div style={{ gridColumn: '1 / -1', marginTop: 4, padding: 10, borderRadius: 8, background: '#1a1e26', border: '1px solid #343942', color: '#cdd6e2', fontSize: 13 }}>{msgStatus}</div> : null}
    </div>
  )

  const panelByTab = {
    overview: overviewPanel,
    receive: receivePanel,
    send: sendPanel,
    transactions: transactionsPanel,
    staking: stakingPanel,
    contacts: contactsPanel,
    messages: messagesPanel,
    addresses: addressesPanel,
    settings: settingsPanel,
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
                  <div style={{ color: '#aeb7c4', marginTop: 4 }}>{isLightMode ? 'Light wallet connected to a remote Triangles node' : 'A full Docker-based Triangles wallet with live controls, clear readiness, and real node visibility'}</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <select
                  value={nodes.find((n) => n.active)?.id || ''}
                  onChange={(e) => handleSwitchNode(e.target.value)}
                  style={{
                    background: '#232730',
                    color: '#cdd6e2',
                    border: '1px solid #404652',
                    borderRadius: 8,
                    padding: '6px 10px',
                    fontSize: 13,
                    cursor: 'pointer',
                    maxWidth: 200,
                  }}
                >
                  {nodes.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.name}{n.active ? ' ★' : ''}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => setShowAddNode((v) => !v)}
                  title="Add a new node"
                  style={{ background: '#2a3040', color: '#8df0b1', border: '1px solid #404652', borderRadius: 8, padding: '5px 10px', fontSize: 13, cursor: 'pointer', fontWeight: 700 }}
                >
                  +
                </button>
                <StatusPill color={isLightMode ? '#b4a7ff' : undefined} background={isLightMode ? 'rgba(180,167,255,.12)' : undefined}>{walletMode}</StatusPill>
                <StatusPill color="#ffd38a" background="rgba(255,211,138,.12)">{isLightMode ? 'remote node' : (nodeState?.status || 'unknown node state')}</StatusPill>
                {health?.writeOpsEnabled ? <StatusPill color="#8df0b1" background="rgba(97,214,128,.12)">guarded writes enabled</StatusPill> : null}
                {canonical?.enabled ? (
                  <StatusPill color={canonical.matched ? '#8df0b1' : '#ffb3b3'} background={canonical.matched ? 'rgba(97,214,128,.12)' : 'rgba(255,125,125,.14)'}>
                    {canonical.matched ? 'canonical match' : 'canonical mismatch'}
                  </StatusPill>
                ) : null}
              </div>
            </div>
          </div>

          {showAddNode ? (
            <div style={{ padding: '12px 18px', borderBottom: '1px solid #343942', background: '#1a1e26' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#8df0b1', marginBottom: 10 }}>Add a new TRIdock node</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr auto', gap: 8, alignItems: 'end' }}>
                <div>
                  <div style={{ fontSize: 11, color: '#aeb7c4', marginBottom: 4 }}>Name</div>
                  <input
                    placeholder="DNS2, Contabo, etc."
                    value={addNodeForm.name}
                    onChange={(e) => setAddNodeForm((f) => ({ ...f, name: e.target.value }))}
                    style={{ width: '100%', background: '#232730', color: '#cdd6e2', border: '1px solid #404652', borderRadius: 6, padding: '6px 8px', fontSize: 13, boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#aeb7c4', marginBottom: 4 }}>RPC URL</div>
                  <input
                    placeholder="http://host:19119"
                    value={addNodeForm.url}
                    onChange={(e) => setAddNodeForm((f) => ({ ...f, url: e.target.value }))}
                    style={{ width: '100%', background: '#232730', color: '#cdd6e2', border: '1px solid #404652', borderRadius: 6, padding: '6px 8px', fontSize: 13, boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#aeb7c4', marginBottom: 4 }}>RPC User</div>
                  <input
                    placeholder="user"
                    value={addNodeForm.user}
                    onChange={(e) => setAddNodeForm((f) => ({ ...f, user: e.target.value }))}
                    style={{ width: '100%', background: '#232730', color: '#cdd6e2', border: '1px solid #404652', borderRadius: 6, padding: '6px 8px', fontSize: 13, boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#aeb7c4', marginBottom: 4 }}>RPC Password</div>
                  <input
                    type="password"
                    placeholder="password"
                    value={addNodeForm.password}
                    onChange={(e) => setAddNodeForm((f) => ({ ...f, password: e.target.value }))}
                    style={{ width: '100%', background: '#232730', color: '#cdd6e2', border: '1px solid #404652', borderRadius: 6, padding: '6px 8px', fontSize: 13, boxSizing: 'border-box' }}
                  />
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    onClick={handleAddNode}
                    style={{ background: '#2a7a4a', color: '#8df0b1', border: '1px solid #4a9a6a', borderRadius: 6, padding: '6px 14px', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}
                  >
                    Add
                  </button>
                  <button
                    onClick={() => { setShowAddNode(false); setAddNodeStatus('') }}
                    style={{ background: '#2a3040', color: '#aeb7c4', border: '1px solid #404652', borderRadius: 6, padding: '6px 10px', fontSize: 13, cursor: 'pointer' }}
                  >
                    ✕
                  </button>
                </div>
              </div>
              {addNodeStatus ? (
                <div style={{ marginTop: 8, fontSize: 12, color: addNodeStatus.startsWith('Node') ? '#8df0b1' : '#ff7d7d' }}>{addNodeStatus}</div>
              ) : null}
            </div>
          ) : null}

          <div style={{ padding: 18 }}>
            <NavTabs active={activeTab} onChange={setActiveTab} badges={{ messages: msgUnreadCount }} />
            {panelByTab[activeTab]}
            {summaryError ? <div style={{ marginTop: 16, padding: 12, borderRadius: 8, background: '#23161a', border: '1px solid #6a3943', color: '#ffd7de' }}><strong>RPC note:</strong> {summaryError}</div> : null}
          </div>
        </div>
        {sendConfirmOverlay}
      </div>
    </ErrorBoundary>
  )
}
