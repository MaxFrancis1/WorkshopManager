import { Link } from 'react-router';
import { Empty, ErrorNote, Loading, PlusIcon } from '../../components/ui';
import { PageHeader } from '../../layout/PageHeader';
import { listPurchaseAllocations } from '../../lib/api';
import { date, money } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';

export function PurchasesList() {
  const { data, error, loading } = useAsync(listPurchaseAllocations, []);

  return (
    <div className="page">
      <PageHeader
        title="Purchases"
        actions={
          <Link to="/purchases/new" className="btn btn-primary desktop-only">
            + Log purchase
          </Link>
        }
      />

      <ErrorNote error={error} />
      {loading && !data && <Loading />}
      {data && data.length === 0 && (
        <Empty>
          No purchases yet. <Link to="/purchases/new">Log your first purchase</Link>.
        </Empty>
      )}

      <div className="list">
        {data?.map((p) => (
          <Link key={p.purchase_id} to={`/purchases/${p.purchase_id}`} className="list-row">
            <div className="list-row-main">
              <span className="list-row-title">{p.source || 'No source'}</span>
              <span className="list-row-meta">
                {date(p.purchased_on)} · {p.item_count} item{p.item_count === 1 ? '' : 's'}
              </span>
            </div>
            <div className="list-row-side">
              <span>{money(p.total_cost)}</span>
              {p.over_allocated && <span className="badge badge-warn">Over-allocated</span>}
              {p.item_count === 0 && <span className="badge badge-warn">No items</span>}
            </div>
          </Link>
        ))}
      </div>

      <Link to="/purchases/new" className="fab" aria-label="Log purchase">
        <PlusIcon />
      </Link>
    </div>
  );
}
