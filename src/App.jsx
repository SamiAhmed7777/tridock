const txs = [
  { date: '2026-04-07 23:11', type: 'Stake Mint', address: 'TBxr...Pdgb3', amount: '+14.28 TRI', confirm: '842' },
  { date: '2026-04-07 21:44', type: 'Receive', address: 'TZ4Z...WT7', amount: '+250.00 TRI', confirm: '1211' },
  { date: '2026-04-07 19:03', type: 'Send', address: 'TAaa...z19', amount: '-40.00 TRI', confirm: '1302' },
  { date: '2026-04-07 17:20', type: 'Stake Mint', address: 'TBxr...Pdgb3', amount: '+9.51 TRI', confirm: '1404' },
]

const peers = [
  ['Connections', '8 peers'],
  ['Best block', '2200941'],
  ['Canonical match', 'matched'],
  ['Status', 'staking + synced'],
]

function Sidebar() {
  const items = ['Overview', 'Send', 'Receive', 'Transactions', 'Address Book', 'Debug']
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">△</div>
        <div>
          <div className="brand-title">TRIdock</div>
          <div className="brand-sub">Web Wallet</div>
        </div>
      </div>
      <nav className="nav">
        {items.map((item, i) => (
          <button key={item} className={`nav-item ${i === 0 ? 'active' : ''}`}>{item}</button>
        ))}
      </nav>
    </aside>
  )
}

function OverviewCard({ label, value, accent }) {
  return (
    <div className="card stat-card">
      <div className="label">{label}</div>
      <div className={`value ${accent ? 'accent' : ''}`}>{value}</div>
    </div>
  )
}

function App() {
  return (
    <div className="shell">
      <Sidebar />
      <main className="content">
        <header className="topbar card">
          <div>
            <div className="eyebrow">Wallet Overview</div>
            <h1>TRIdock Web Wallet</h1>
            <p>Qt-style wallet interface for Triangles nodes and wallet mode.</p>
          </div>
          <div className="sync-pill">Synced · Canonical Verified</div>
        </header>

        <section className="stats-grid">
          <OverviewCard label="Available" value="3,146.74 TRI" accent />
          <OverviewCard label="Staking" value="129.88 TRI" />
          <OverviewCard label="Immature" value="14.28 TRI" />
          <OverviewCard label="Unconfirmed" value="0.00 TRI" />
        </section>

        <section className="main-grid">
          <div className="card panel">
            <div className="panel-header">
              <h2>Recent Transactions</h2>
              <button className="ghost">View All</button>
            </div>
            <table className="tx-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Address</th>
                  <th>Amount</th>
                  <th>Confirmations</th>
                </tr>
              </thead>
              <tbody>
                {txs.map((tx) => (
                  <tr key={`${tx.date}-${tx.amount}`}>
                    <td>{tx.date}</td>
                    <td>{tx.type}</td>
                    <td>{tx.address}</td>
                    <td className={tx.amount.startsWith('+') ? 'positive' : 'negative'}>{tx.amount}</td>
                    <td>{tx.confirm}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="side-stack">
            <div className="card panel">
              <div className="panel-header">
                <h2>Send TRI</h2>
              </div>
              <div className="form-grid">
                <label>
                  Address
                  <input value="" placeholder="Enter TRI address" readOnly />
                </label>
                <label>
                  Label
                  <input value="" placeholder="Optional label" readOnly />
                </label>
                <label>
                  Amount
                  <input value="" placeholder="0.00 TRI" readOnly />
                </label>
                <button className="primary" disabled>Send (guarded later)</button>
              </div>
            </div>

            <div className="card panel">
              <div className="panel-header">
                <h2>Node Status</h2>
              </div>
              <div className="kv-list">
                {peers.map(([k, v]) => (
                  <div key={k} className="kv-row">
                    <span>{k}</span>
                    <strong>{v}</strong>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}

export default App
