import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ErrorNote, Loading, ShortId } from '../../components/ui';
import { PageHeader } from '../../layout/PageHeader';
import { deleteSale, getSale, getSaleProfit, listChannels, listItemCosts } from '../../lib/api';
import { date, hours, money } from '../../lib/format';
import { errorMessage, useAsync } from '../../lib/useAsync';

export function SaleDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { data, error, loading } = useAsync(() => Promise.all([getSale(id), getSaleProfit(id), listItemCosts(), listChannels()]), [id]);
  const [actionError, setActionError] = useState<string | null>(null);

  if (error) return <ErrorNote error={error} />;
  if (loading && !data) return <Loading />;
  const [sale, profit, costs, channels] = data!;
  if (!sale || !profit) return <p>Sale not found.</p>;

  const items = sale.sale_items.map((si) => costs.find((c) => c.item_id === si.item_id)).filter(Boolean);
  const channel = channels.find((c) => c.id === sale.channel_id);

  return (
    <div className="page" style={{ maxWidth: 760 }}>
      <Link to="/sales" className="back-link">
        ← Sales
      </Link>
      <PageHeader title={items.length > 1 ? `Lot of ${items.length}` : (items[0]?.name ?? 'Sale')} />
      <span className="muted" style={{ marginTop: -10, fontSize: 14 }}>
        {date(sale.sold_on)} · {channel?.name ?? 'Direct'}
        {profit.days_to_sell !== null ? ` · sold ${profit.days_to_sell} days after purchase` : ''}
      </span>

      <section className="card">
        <h2 className="section-title" style={{ marginBottom: 4 }}>
          Profit
        </h2>
        <div className="kv">
          <span>Sale price</span>
          <span>{money(profit.sale_price)}</span>
        </div>
        <div className="kv">
          <span>Fees</span>
          <span>−{money(profit.fees)}</span>
        </div>
        <div className="kv">
          <span>Postage out</span>
          <span>−{money(profit.postage_out)}</span>
        </div>
        <div className="kv">
          <span>Cost of item{items.length === 1 ? '' : 's'}</span>
          <span>−{money(profit.items_cost)}</span>
        </div>
        <div className="kv kv-total">
          <span>Profit</span>
          <span className={profit.profit < 0 ? 'negative' : undefined}>{money(profit.profit)}</span>
        </div>
        <div className="kv">
          <span>Margin</span>
          <span>{profit.margin_percent !== null ? `${profit.margin_percent}%` : '—'}</span>
        </div>
        {profit.labour_minutes > 0 && (
          <div className="kv">
            <span>Labour ~{hours(profit.labour_minutes)}</span>
            <span>{profit.labour_cost !== null ? `${money(profit.profit_after_labour)} after ${money(profit.labour_cost)} labour` : 'Not costed'}</span>
          </div>
        )}
      </section>

      <section className="card">
        <h2 className="section-title" style={{ marginBottom: 8 }}>
          Item{items.length === 1 ? '' : 's'}
        </h2>
        <div className="list">
          {items.map((c) => (
            <Link key={c!.item_id} to={`/items/${c!.item_id}`} className="list-row" style={{ padding: 10 }}>
              <ShortId id={c!.short_id} />
              <span className="list-row-main">
                <span className="list-row-title">{c!.name}</span>
              </span>
              <span style={{ fontWeight: 600, fontSize: 14 }}>{money(c!.total_cost)}</span>
            </Link>
          ))}
        </div>
      </section>

      {sale.notes && <p className="card" style={{ margin: 0, fontSize: 14 }}>{sale.notes}</p>}

      <ErrorNote error={actionError} />
      <div>
        <button
          type="button"
          className="link-button danger"
          onClick={async () => {
            if (!window.confirm('Delete this sale? Use this only for a sale entered by mistake: the items go back to Listed or Ready.')) return;
            try {
              await deleteSale(sale.id);
              navigate('/sales', { replace: true });
            } catch (err) {
              setActionError(errorMessage(err));
            }
          }}
        >
          Delete sale (entered by mistake)
        </button>
      </div>
    </div>
  );
}
