import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ErrorNote, Loading, SearchIcon, ShortId, StatusBadge } from '../components/ui';
import { PageHeader } from '../layout/PageHeader';
import { getDashboard } from '../lib/api';
import { moneyWhole } from '../lib/format';
import { useAsync } from '../lib/useAsync';
import styles from './Dashboard.module.css';

const monthLong = new Intl.DateTimeFormat('en-GB', { month: 'long' });
const monthShort = new Intl.DateTimeFormat('en-GB', { month: 'short' });

function parseMonth(iso: string): Date {
  const [y, m] = iso.split('-').map(Number);
  return new Date(y!, m! - 1, 1);
}

export function Dashboard() {
  const navigate = useNavigate();
  const { data, error, loading } = useAsync(getDashboard, []);
  const [q, setQ] = useState('');

  const search = (
    <form
      className="search"
      style={{ width: 260, maxWidth: '100%' }}
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        navigate(`/items?q=${encodeURIComponent(q.trim())}`);
      }}
    >
      <SearchIcon />
      <span className="sr-only">Search items by ID or name</span>
      <input type="search" placeholder="Search ID or name" autoCapitalize="characters" value={q} onChange={(e) => setQ(e.target.value)} />
    </form>
  );

  return (
    <div className="page">
      <PageHeader
        title="Dashboard"
        showDate
        actions={
          <>
            {search}
            <Link to="/purchases/new" className="btn btn-primary desktop-only">
              + Log purchase
            </Link>
          </>
        }
      />
      <ErrorNote error={error} />
      {loading && !data && <Loading />}
      {data && <DashboardBody data={data} />}
    </div>
  );
}

function DashboardBody({ data }: { data: Awaited<ReturnType<typeof getDashboard>> }) {
  const { summary: s, months, channels, categories, aged, toFind, lowStock, agedDays } = data;
  const now = new Date();
  const monthAfter = s.month_profit - s.month_overheads;
  const recentMonths = months.slice(-6);
  const maxBar = Math.max(1, ...recentMonths.map((m) => Math.abs(m.profit_after_overheads)));
  const agedTotal = aged.reduce((t, a) => t + a.total_cost, 0);
  const activeChannels = channels.filter((c) => c.posted > 0 || c.sold > 0 || c.live_listings > 0);
  const empty = s.stock_count === 0 && s.ytd_sales === 0;

  return (
    <>
      {empty && (
        <section className="card empty">
          <p>
            Nothing to show yet. <Link to="/purchases/new">Log a purchase</Link> to add stock; profit figures appear once you record sales.
          </p>
        </section>
      )}

      <section className={styles.tiles}>
        <div className={`tile tile-accent ${styles.wide}`}>
          <span className="tile-label">Profit · {monthLong.format(now)}</span>
          <span className="tile-value">{moneyWhole(s.month_profit)}</span>
          <span className="tile-sub">
            {moneyWhole(monthAfter)} after overheads · {s.month_sales} sale{s.month_sales === 1 ? '' : 's'}
          </span>
        </div>
        <div className="tile desktop-only">
          <span className="tile-label">Year to date</span>
          <span className={`tile-value${s.ytd_profit < 0 ? ' negative' : ''}`}>{moneyWhole(s.ytd_profit)}</span>
          <span className="tile-sub">
            {s.ytd_sales} sales · {s.ytd_losses} at a loss
          </span>
        </div>
        <Link to="/items" className="tile" style={{ textDecoration: 'none', color: 'inherit' }}>
          <span className="tile-label">Stock value</span>
          <span className="tile-value">{moneyWhole(s.stock_value)}</span>
          <span className="tile-sub">{s.stock_count} items at cost</span>
        </Link>
        <div className="tile">
          <span className="tile-label">Avg days to sell</span>
          <span className="tile-value">{s.avg_days_to_sell ?? '—'}</span>
          <span className="tile-sub">
            {categories.length > 0 ? categories.slice(0, 2).map((c) => `${c.name} ${c.avg_days_to_sell}`).join(' · ') : 'Last 90 days'}
          </span>
        </div>
      </section>

      <div className={styles.grid}>
        <section className="card">
          <div className="section-head">
            <h2 className="section-title">To find</h2>
            {toFind.length > 0 && <span className="badge badge-warn">{toFind.length} open</span>}
          </div>
          {toFind.length === 0 ? (
            <p className="muted" style={{ margin: 0, fontSize: 14 }}>
              Nothing to find.
            </p>
          ) : (
            toFind.map((n) => (
              <Link key={n.note_id} to={`/items/${n.item_id}`} className={styles.row}>
                <ShortId id={n.short_id} />
                <span className={styles.rowMain}>
                  <strong>{n.description}</strong> <span className="muted">· {n.item_name}</span>
                </span>
                {n.flagged && <StatusBadge status={n.item_status} />}
              </Link>
            ))
          )}
        </section>

        <section className="card">
          <div className="section-head">
            <h2 className="section-title">Aged stock · over {agedDays} days</h2>
            {aged.length > 0 && <span className="muted" style={{ fontSize: 13 }}>{moneyWhole(agedTotal)} tied up</span>}
          </div>
          {aged.length === 0 ? (
            <p className="muted" style={{ margin: 0, fontSize: 14 }}>
              No stock older than {agedDays} days.
            </p>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Item</th>
                    <th className="num">Days</th>
                    <th className="num">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {aged.map((a) => (
                    <tr key={a.item_id}>
                      <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{a.short_id}</td>
                      <td>
                        <Link to={`/items/${a.item_id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                          {a.name}
                        </Link>
                      </td>
                      <td className="num" style={{ fontWeight: 600 }}>
                        {a.days_in_stock}
                      </td>
                      <td className="num">{moneyWhole(a.total_cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="card">
          <h2 className="section-title" style={{ marginBottom: 10 }}>
            Channels · last 90 days
          </h2>
          {activeChannels.length === 0 ? (
            <p className="muted" style={{ margin: 0, fontSize: 14 }}>
              No listings yet.
            </p>
          ) : (
            <div className="stack" style={{ gap: 12 }}>
              {activeChannels.map((c) => (
                <div key={c.channel_id} className="stack" style={{ gap: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, gap: 8 }}>
                    <span style={{ fontWeight: 600 }}>{c.name}</span>
                    <span className="muted">
                      {c.sold} of {c.posted} sold{c.sell_through_percent !== null ? ` · ${c.sell_through_percent}%` : ''}
                      {c.avg_days_to_sell !== null ? ` · ${c.avg_days_to_sell} d avg` : ''}
                    </span>
                  </div>
                  <div className={styles.bar} role="img" aria-label={`${c.name}: ${c.sell_through_percent ?? 0}% sell-through`}>
                    <div style={{ width: `${Math.min(100, c.sell_through_percent ?? 0)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="card">
          <div className="section-head">
            <h2 className="section-title">Profit by month</h2>
            <span className="muted" style={{ fontSize: 12 }}>
              After overheads
            </span>
          </div>
          <div
            className={styles.chart}
            role="img"
            aria-label={`Monthly profit after overheads: ${recentMonths.map((m) => `${monthShort.format(parseMonth(m.month))} ${moneyWhole(m.profit_after_overheads)}`).join(', ')}`}
          >
            {recentMonths.map((m, i) => {
              const v = m.profit_after_overheads;
              const h = Math.round((Math.abs(v) / maxBar) * 110);
              const current = i === recentMonths.length - 1;
              return (
                <div key={m.month} className={styles.col}>
                  <span className={styles.colValue} style={current ? { fontWeight: 700, color: 'var(--ink)' } : undefined}>
                    {moneyWhole(v)}
                  </span>
                  <div
                    className={styles.colBar}
                    style={{
                      height: Math.max(h, v === 0 ? 0 : 3),
                      background: v < 0 ? 'var(--danger)' : current ? 'var(--accent)' : 'var(--accent-soft)',
                    }}
                  />
                  <span className={styles.colLabel} style={current ? { fontWeight: 700, color: 'var(--ink)' } : undefined}>
                    {monthShort.format(parseMonth(m.month))}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="field-hint" style={{ margin: '8px 0 0' }}>
            Losses show in red. Year to date: {moneyWhole(s.ytd_profit - s.ytd_overheads)} after {moneyWhole(s.ytd_overheads)} overheads.
          </p>
        </section>
      </div>

      <section className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 14 }}>
          <strong>Low stock:</strong>{' '}
          {lowStock.length === 0
            ? 'none'
            : lowStock
                .slice(0, 3)
                .map((p) => `${p.name} · ${p.qty_on_hand} left (reorder at ${p.reorder_level})`)
                .join('; ')}
          {lowStock.length > 3 ? ` and ${lowStock.length - 3} more` : ''}
        </span>
        {lowStock.length > 0 && (
          <Link to="/parts?low=1" style={{ fontSize: 14, fontWeight: 600, minHeight: 44, display: 'flex', alignItems: 'center' }}>
            Restock parts
          </Link>
        )}
      </section>
    </>
  );
}
