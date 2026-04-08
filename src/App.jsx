import { useEffect, useMemo, useState } from 'react'

const navItems = ['Overview', 'Send', 'Receive', 'Transactions', 'Address Book', 'Debug Window']

function formatTri(value) {
  const num = Number(value ?? 0)
  return `${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TRI`
}

function formatExpectedTime(seconds) {
  if (!seconds || seconds <= 0) return '—'
  const hours = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  if (hours > 0) return `${hours}h ${mins}m`
  return `${mins}m`
}

function Sidebar({ active, onSelect, summary }) {
  return (
    <aside className="sidebar qt-panel">
      <div className="window-badge">TRIdock Web Wallet</div>
      <div className="brand-lockup">
        <div className="tri-logo">△</div>
        <div>
          <div className="brand-title">Triangles</div>
          <div className="brand-subtitle">Desktop-style wallet in your browser</div>
        </div>
      </div>

      <div className="nav-group-title">Wallet</div>
      <nav className="nav-list">
        {navItems.map((item) => (
          <button
            key={item}
            className={`nav-item ${active === item ? 'active' : ''}`}
            onClick={() => onSelect(item)}
          >
            <span className="nav-dot" />
            {item}
          </button>
        ))}
      </nav>

      <div className="sidebar-footer qt-inset">
        <div className="mini-stat"><span>Encryption</span><strong>Locked</strong></div>
        <div className="mini-stat"><span>Canonical</span><strong>{summary?.canonical?.enabled ? (summary.canonical.matched ? 'Verified' : 'Mismatch') : 'Not set'}</strong></div>
        <div className="mini-stat"><span>Mode</span><strong>Read-only</strong></div>
      </div>
    </aside>
  )
}

function Toolbar({ active, healthy }) {
  const actions = ['Overview', 'Send', 'Receive', 'Transactions', 'Backup', 'Settings']
  return (
    <div className="toolbar qt-panel">
      <div className="toolbar-left">
        {actions.map((action) => (
          <button key={action} className={`tool-button ${active === action ? 'active' : ''}`}>{action}</button>
        ))}
      </div>
      <div className="toolbar-right">
        <span className={`status-lamp ${healthy ? 'live' : 'warn'}`} />
        <span>{healthy ? 'Wallet connected' : 'RPC unavailable'}</span>
      </div>
    </div>
  )
}

function OverviewTab({ summary }) {
  const txs = summary?.transactions || []
  return (
    <div className="tab-layout two-col">
      <section className="qt-panel padded">
        <div className="section-title">Balances</div>
        <div className="balance-grid">
          <div className="qt-inset balance-box"><span>Available</span><strong>{formatTri(summary?.balance)}</strong></div>
          <div className="qt-inset balance-box"><span>Stake</span><strong>{formatTri(summary?.stake)}</strong></div>
          <div className="qt-inset balance-box"><span>New Mint</span><strong>{formatTri(summary?.newmint)}</strong></div>
          <div className="qt-inset balance-box"><span>Expected stake time</span><strong>{formatExpectedTime(summary?.staking?.expectedtime)}</strong></div>
        </div>

        <div className="section-title top-gap">Recent transactions</div>
        <table className="qt-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Type</th>
              <th>Address</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {txs.length ? txs.slice(0, 8).map((row, i) => (
              <tr key={`${row.txid || row.time || i}`}>
                <td>{row.time ? new Date(row.time * 1000).toLocaleString() : '—'}</td>
                <td>{row.category || row.account || 'transaction'}</td>
                <td>{row.address || '—'}</td>
                <td className={Number(row.amount) >= 0 ? 'plus' : 'minus'}>{formatTri(row.amount)}</td>
              </tr>
            )) : <tr><td colSpan="4">No transactions returned.</td></tr>}
          </tbody>
        </table>
      </section>

      <section className="qt-panel padded side-column">
        <div className="section-title">Status</div>
        <div className="status-stack">
          <div className="qt-inset status-card"><span>Network</span><strong>{summary?.network || '—'}</strong></div>
          <div className="qt-inset status-card"><span>Best block</span><strong>{summary?.blocks ?? '—'}</strong></div>
          <div className="qt-inset status-card"><span>Connections</span><strong>{summary?.connections ?? '—'}</strong></div>
          <div className="qt-inset status-card"><span>Canonical</span><strong>{summary?.canonical?.enabled ? (summary.canonical.matched ? 'Matched' : 'Mismatch') : 'Not configured'}</strong></div>
        </div>

        <div className="section-title top-gap">Warnings</div>
        <div className="qt-inset warning-box">
          Send controls stay disabled until wallet-safe write paths are explicitly implemented and verified.
        </div>
      </section>
    </div>
  )
}

function SendTab() {
  return (
    <section className="qt-panel padded form-screen">
      <div className="section-title">Send Coins</div>
      <div className="qt-form-grid">
        <label>Pay To<input placeholder="TRI address" readOnly /></label>
        <label>Label<input placeholder="Optional label" readOnly /></label>
        <label>Amount<input placeholder="0.00 TRI" readOnly /></label>
        <label>Fee<input placeholder="Auto-estimated" readOnly /></label>
        <label className="wide">Memo<textarea placeholder="Optional note" readOnly /></label>
      </div>
      <div className="button-row">
        <button className="qt-button primary" disabled>Send</button>
        <button className="qt-button">Clear</button>
      </div>
      <div className="helper-text">Write actions are intentionally disabled in this first live slice.</div>
    </section>
  )
}

function ReceiveTab({ summary }) {
  const rows = summary?.received || []
  return (
    <section className="qt-panel padded">
      <div className="section-title">Receive Coins</div>
      <div className="button-row tight bottom-gap">
        <button className="qt-button">New Address</button>
        <button className="qt-button">Show QR</button>
        <button className="qt-button">Copy</button>
      </div>
      <table className="qt-table">
        <thead>
          <tr>
            <th>Label</th>
            <th>Address</th>
            <th>Amount</th>
            <th>Confirmations</th>
          </tr>
        </thead>
        <tbody>
          {rows.length ? rows.map((row, i) => (
            <tr key={`${row.address || i}`}>
              <td>{row.account || row.label || '—'}</td>
              <td>{row.address || '—'}</td>
              <td>{formatTri(row.amount)}</td>
              <td>{row.confirmations ?? '—'}</td>
            </tr>
          )) : <tr><td colSpan="4">No receive addresses returned.</td></tr>}
        </tbody>
      </table>
    </section>
  )
}

function TransactionsTab({ summary }) {
  const rows = summary?.transactions || []
  return (
    <section className="qt-panel padded">
      <div className="section-title">Transactions</div>
      <div className="filter-row bottom-gap">
        <div className="qt-inset filter-chip">All</div>
        <div className="qt-inset filter-chip">Sent</div>
        <div className="qt-inset filter-chip">Received</div>
        <div className="qt-inset filter-chip">Generated</div>
      </div>
      <table className="qt-table dense">
        <thead>
          <tr>
            <th>Date</th>
            <th>Type</th>
            <th>Address</th>
            <th>Confirmations</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          {rows.length ? rows.map((row, i) => (
            <tr key={`${row.txid || row.time || i}`}>
              <td>{row.time ? new Date(row.time * 1000).toLocaleString() : '—'}</td>
              <td>{row.category || row.account || 'transaction'}</td>
              <td>{row.address || '—'}</td>
              <td>{row.confirmations ?? '—'}</td>
              <td className={Number(row.amount) >= 0 ? 'plus' : 'minus'}>{formatTri(row.amount)}</td>
            </tr>
          )) : <tr><td colSpan="5">No transactions returned.</td></tr>}
        </tbody>
      </table>
    </section>
  )
}

function AddressBookTab({ summary }) {
  const rows = summary?.received || []
  return (
    <section className="qt-panel padded">
      <div className="section-title">Address Book</div>
      <table className="qt-table">
        <thead>
          <tr>
            <th>Label</th>
            <th>Address</th>
            <th>Type</th>
          </tr>
        </thead>
        <tbody>
          {rows.length ? rows.map((row, i) => (
            <tr key={`${row.address || i}`}>
              <td>{row.account || row.label || '—'}</td>
              <td>{row.address || '—'}</td>
              <td>Receiving</td>
            </tr>
          )) : <tr><td colSpan="3">No addresses returned.</td></tr>}
        </tbody>
      </table>
    </section>
  )
}

function DebugTab({ summary, error }) {
  const debugRows = [
    ['Version', summary?.version ?? '—'],
    ['Protocol', summary?.protocolversion ?? '—'],
    ['Wallet version', summary?.walletversion ?? '—'],
    ['Blocks', summary?.blocks ?? '—'],
    ['Best block', summary?.bestblock ?? '—'],
    ['Connections', summary?.connections ?? '—'],
    ['Staking enabled', summary?.staking?.enabled ? 'yes' : 'no'],
    ['Staking active', summary?.staking?.staking ? 'yes' : 'no'],
  ]

  return (
    <section className="qt-panel padded debug-grid">
      <div>
        <div className="section-title">Information</div>
        <div className="debug-list">
          {debugRows.map(([key, value]) => (
            <div key={key} className="debug-row qt-inset">
              <span>{key}</span>
              <strong>{String(value)}</strong>
            </div>
          ))}
        </div>
      </div>
      <div>
        <div className="section-title">RPC / Canonical Notes</div>
        <div className="qt-inset console-box">
          <pre>{error ? `error = ${error}` : JSON.stringify({
            canonical: summary?.canonical,
            staking: summary?.staking,
          }, null, 2)}</pre>
        </div>
      </div>
    </section>
  )
}

function TabBody({ active, summary, error }) {
  const component = useMemo(() => {
    switch (active) {
      case 'Send': return <SendTab />
      case 'Receive': return <ReceiveTab summary={summary} />
      case 'Transactions': return <TransactionsTab summary={summary} />
      case 'Address Book': return <AddressBookTab summary={summary} />
      case 'Debug Window': return <DebugTab summary={summary} error={error} />
      case 'Overview':
      default:
        return <OverviewTab summary={summary} />
    }
  }, [active, summary, error])

  return component
}

export default function App() {
  const [active, setActive] = useState('Overview')
  const [summary, setSummary] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const res = await fetch('/api/wallet/summary')
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Failed to load wallet summary')
        if (!cancelled) {
          setSummary(data)
          setError('')
        }
      } catch (err) {
        if (!cancelled) setError(err.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    const t = setInterval(load, 15000)
    return () => {
      cancelled = true
      clearInterval(t)
    }
  }, [])

  const healthy = Boolean(summary) && !error

  return (
    <div className="app-shell">
      <div className="window-frame">
        <div className="titlebar">
          <div className="titlebar-left">
            <span className="traffic red" />
            <span className="traffic amber" />
            <span className="traffic green" />
            <span className="app-title">TRIdock Web Wallet — {active}</span>
          </div>
          <div className="titlebar-right">{loading ? 'Loading live wallet data…' : healthy ? 'Live read-only RPC connected' : 'Read-only RPC not connected'}</div>
        </div>

        <div className="workspace">
          <Sidebar active={active} onSelect={setActive} summary={summary} />
          <section className="main-area">
            <Toolbar active={active} healthy={healthy} />
            <TabBody active={active} summary={summary} error={error} />
            <footer className="footer-bar qt-panel">
              <div className="footer-item"><span className={`status-lamp ${healthy ? 'live' : 'warn'}`} /> {healthy ? 'RPC live' : 'RPC unavailable'}</div>
              <div className="footer-item"><span className={`status-lamp ${summary?.staking?.staking ? 'ok' : 'warn'}`} /> {summary?.staking?.staking ? 'Staking' : 'Not staking'}</div>
              <div className="footer-item"><span className={`status-lamp ${summary?.canonical?.matched ? 'ok' : 'warn'}`} /> {summary?.canonical?.enabled ? (summary?.canonical?.matched ? 'Canonical Match' : 'Canonical Mismatch') : 'Canonical not configured'}</div>
              <div className="footer-item right">Send controls intentionally locked for now</div>
            </footer>
          </section>
        </div>
      </div>
    </div>
  )
}
