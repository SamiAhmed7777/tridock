import { useMemo, useState } from 'react'

const navItems = ['Overview', 'Send', 'Receive', 'Transactions', 'Address Book', 'Debug Window']

const transactionRows = [
  { date: '2026-04-07 23:11', type: 'Generated', address: 'TBxrQx34J2mRvkmixnrdUynwzEC3wPdgb3', amount: '+14.28 TRI', status: 'Confirmed' },
  { date: '2026-04-07 21:44', type: 'Received with', address: 'TZ4ZrftdfK9MLCvo63uR3ZcPibFEG54WT7', amount: '+250.00 TRI', status: 'Confirmed' },
  { date: '2026-04-07 19:03', type: 'Sent to', address: 'TAaa8oW7g2K3fMVsJPn3k7AwtkP2r9Vz19', amount: '-40.00 TRI', status: 'Confirmed' },
  { date: '2026-04-07 17:20', type: 'Generated', address: 'TBxrQx34J2mRvkmixnrdUynwzEC3wPdgb3', amount: '+9.51 TRI', status: 'Confirmed' },
  { date: '2026-04-07 14:58', type: 'Received with', address: 'TPocketWalletExampleAddrzzzzzzzzzz', amount: '+88.40 TRI', status: 'Confirmed' },
]

const receiveRows = [
  { label: 'Main staking', address: 'TBxrQx34J2mRvkmixnrdUynwzEC3wPdgb3', amount: '145.97 TRI' },
  { label: 'Savings', address: 'TZ4ZrftdfK9MLCvo63uR3ZcPibFEG54WT7', amount: '40.72 TRI' },
  { label: 'Cold receive', address: 'TWebWalletExampleAddress00000000001', amount: '0.00 TRI' },
]

const debugRows = [
  ['Client version', 'v5.7.5 target / daemon probe seen v5.5.6'],
  ['Blocks', '2,200,941'],
  ['Canonical state', 'matched'],
  ['Connections', '8'],
  ['Proxy', 'Tor enabled'],
  ['Wallet mode', 'read-only mock shell'],
]

function Sidebar({ active, onSelect }) {
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
        <div className="mini-stat"><span>Canonical</span><strong>Verified</strong></div>
        <div className="mini-stat"><span>Mode</span><strong>Wallet UI</strong></div>
      </div>
    </aside>
  )
}

function Toolbar({ active }) {
  const actions = ['Overview', 'Send', 'Receive', 'Transactions', 'Backup', 'Settings']
  return (
    <div className="toolbar qt-panel">
      <div className="toolbar-left">
        {actions.map((action) => (
          <button key={action} className={`tool-button ${active === action ? 'active' : ''}`}>{action}</button>
        ))}
      </div>
      <div className="toolbar-right">
        <span className="status-lamp live" />
        <span>Wallet synchronized</span>
      </div>
    </div>
  )
}

function OverviewTab() {
  return (
    <div className="tab-layout two-col">
      <section className="qt-panel padded">
        <div className="section-title">Balances</div>
        <div className="balance-grid">
          <div className="qt-inset balance-box"><span>Available</span><strong>3,146.74 TRI</strong></div>
          <div className="qt-inset balance-box"><span>Stake</span><strong>129.88 TRI</strong></div>
          <div className="qt-inset balance-box"><span>Immature</span><strong>14.28 TRI</strong></div>
          <div className="qt-inset balance-box"><span>Pending</span><strong>0.00 TRI</strong></div>
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
            {transactionRows.slice(0, 4).map((row) => (
              <tr key={`${row.date}-${row.address}`}>
                <td>{row.date}</td>
                <td>{row.type}</td>
                <td>{row.address}</td>
                <td className={row.amount.startsWith('+') ? 'plus' : 'minus'}>{row.amount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="qt-panel padded side-column">
        <div className="section-title">Status</div>
        <div className="status-stack">
          <div className="qt-inset status-card"><span>Sync progress</span><strong>100%</strong></div>
          <div className="qt-inset status-card"><span>Best block</span><strong>2200941</strong></div>
          <div className="qt-inset status-card"><span>Canonical</span><strong>Matched</strong></div>
          <div className="qt-inset status-card"><span>Peers</span><strong>8 active</strong></div>
        </div>

        <div className="section-title top-gap">Warnings</div>
        <div className="qt-inset warning-box">
          Send controls stay disabled until a wallet-safe backend is wired and verified.
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
        <label>
          Pay To
          <input placeholder="TRI address" readOnly />
        </label>
        <label>
          Label
          <input placeholder="Optional label" readOnly />
        </label>
        <label>
          Amount
          <input placeholder="0.00 TRI" readOnly />
        </label>
        <label>
          Fee
          <input placeholder="Auto-estimated" readOnly />
        </label>
        <label className="wide">
          Memo
          <textarea placeholder="Optional note" readOnly />
        </label>
      </div>
      <div className="button-row">
        <button className="qt-button primary" disabled>Send</button>
        <button className="qt-button">Clear</button>
      </div>
      <div className="helper-text">This screen is scaffolded first. Real sending comes after wallet-safe RPC and explicit protections.</div>
    </section>
  )
}

function ReceiveTab() {
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
            <th>Balance</th>
          </tr>
        </thead>
        <tbody>
          {receiveRows.map((row) => (
            <tr key={row.address}>
              <td>{row.label}</td>
              <td>{row.address}</td>
              <td>{row.amount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

function TransactionsTab() {
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
            <th>Status</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          {transactionRows.map((row) => (
            <tr key={`${row.date}-${row.amount}`}>
              <td>{row.date}</td>
              <td>{row.type}</td>
              <td>{row.address}</td>
              <td>{row.status}</td>
              <td className={row.amount.startsWith('+') ? 'plus' : 'minus'}>{row.amount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

function AddressBookTab() {
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
          <tr><td>Main staking</td><td>TBxrQx34J2mRvkmixnrdUynwzEC3wPdgb3</td><td>Receiving</td></tr>
          <tr><td>Savings</td><td>TZ4ZrftdfK9MLCvo63uR3ZcPibFEG54WT7</td><td>Receiving</td></tr>
          <tr><td>Merchant payout</td><td>TAaa8oW7g2K3fMVsJPn3k7AwtkP2r9Vz19</td><td>Sending</td></tr>
        </tbody>
      </table>
    </section>
  )
}

function DebugTab() {
  return (
    <section className="qt-panel padded debug-grid">
      <div>
        <div className="section-title">Information</div>
        <div className="debug-list">
          {debugRows.map(([key, value]) => (
            <div key={key} className="debug-row qt-inset">
              <span>{key}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
      </div>
      <div>
        <div className="section-title">RPC / Canonical Notes</div>
        <div className="qt-inset console-box">
          <pre>{`wallet.status = read-only-demo\nnode.status = synced\ncanonical.status = matched\ncanonical.bestblock = 000000000000demo\nnext_step = wire live RPC proxy`}</pre>
        </div>
      </div>
    </section>
  )
}

function TabBody({ active }) {
  const component = useMemo(() => {
    switch (active) {
      case 'Send': return <SendTab />
      case 'Receive': return <ReceiveTab />
      case 'Transactions': return <TransactionsTab />
      case 'Address Book': return <AddressBookTab />
      case 'Debug Window': return <DebugTab />
      case 'Overview':
      default:
        return <OverviewTab />
    }
  }, [active])

  return component
}

export default function App() {
  const [active, setActive] = useState('Overview')

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
          <div className="titlebar-right">Black/Red TRI Theme · Qt-Inspired</div>
        </div>

        <div className="workspace">
          <Sidebar active={active} onSelect={setActive} />
          <section className="main-area">
            <Toolbar active={active} />
            <TabBody active={active} />
            <footer className="footer-bar qt-panel">
              <div className="footer-item"><span className="status-lamp live" /> Synced</div>
              <div className="footer-item"><span className="status-lamp ok" /> Staking</div>
              <div className="footer-item"><span className="status-lamp ok" /> Canonical Match</div>
              <div className="footer-item right">Wallet send controls intentionally locked for now</div>
            </footer>
          </section>
        </div>
      </div>
    </div>
  )
}
