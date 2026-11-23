import { Link } from 'react-router';
import { Empty, ErrorNote, Loading, PlusIcon } from '../../components/ui';
import { PageHeader } from '../../layout/PageHeader';
import { listChannels, listItems, listSaleItemLinks, listSaleProfits } from '../../lib/api';
import { date, money } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';

export function SalesList() {
  const { data, error, loading } = useAsync(
    () => Promise.all([listSaleProfits(), listSaleItemLinks(), listItems(), listChannels()]),
    [],
  );

  if (error) return <ErrorNote error={error} />;
  if (loading && !data) return <Loading />;
  const [sales, links, items, channels] = data!;
  const itemById = new Map(items.map((i) => [i.id, i]));
  const channelName = new Map(channels.map((c) => [c.id, c.name]));
  const totalProfit = sales.reduce((s, x) => s + x.profit, 0);

  return (
    <div className="page">
      <PageHeader
        title="Sales"
        actions={
          <Link to="/sales/new" className="btn btn-primary desktop-only">
            + Record sale
          </Link>
        }
      />
      {sales.length > 0 && (
        <span className="muted" style={{ marginTop: -10, fontSize: 14 }}>
          {sales.length} sale{sales.length === 1 ? '' : 's'} · {money(totalProfit)} profit before overheads
        </span>
      )}
      {sales.length === 0 && (
        <Empty>
          No sales yet. Record one from an item's page with <strong>Mark sold</strong>, or <Link to="/sales/new">record a sale</Link> here.
        </Empty>
      )}
      <div className="list">
        {sales.map((s) => {
          const saleItems = links.filter((l) => l.sale_id === s.sale_id).map((l) => itemById.get(l.item_id)).filter(Boolean);
          const title =
            saleItems.length === 1 ? saleItems[0]!.name : saleItems.length > 1 ? `Lot of ${saleItems.length}: ${saleItems.map((i) => i!.short_id).join(', ')}` : 'Sale';
          return (
            <Link key={s.sale_id} to={`/sales/${s.sale_id}`} className="list-row">
              <div className="list-row-main">
                <span className="list-row-title">{title}</span>
                <span className="list-row-meta">
                  {date(s.sold_on)} · {s.channel_id ? channelName.get(s.channel_id) : 'Direct'} · {money(s.sale_price)}
                  {s.days_to_sell !== null ? ` · ${s.days_to_sell} days` : ''}
                </span>
              </div>
              <div className="list-row-side">
                <span className={s.profit < 0 ? 'negative' : undefined}>
                  {s.profit >= 0 ? '+' : '−'}
                  {money(Math.abs(s.profit))}
                </span>
                {s.profit < 0 && <span className="badge badge-written_off">Loss</span>}
              </div>
            </Link>
          );
        })}
      </div>
      <Link to="/sales/new" className="fab" aria-label="Record sale">
        <PlusIcon />
      </Link>
    </div>
  );
}
