import { Link } from 'react-router';
import { Empty, ErrorNote, Loading, PlusIcon } from '../../components/ui';
import { PageHeader } from '../../layout/PageHeader';
import { listItems, listPurchaseAllocations } from '../../lib/api';
import { daysSince, money } from '../../lib/format';
import type { Item, PurchaseAllocation } from '../../lib/types';
import { useAsync } from '../../lib/useAsync';
import styles from './PurchasesList.module.css';

const dayFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

function dayLabel(iso: string): string {
  const days = daysSince(iso);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  const [y, m, d] = iso.split('-').map(Number);
  return dayFmt.format(new Date(y!, m! - 1, d!));
}

/** "Srixon P–5 irons, Odyssey putter + 2 more" */
function itemSummary(items: Item[]): string {
  if (items.length === 0) return 'No items';
  const names = items.slice(0, 2).map((i) => i.name);
  return items.length > 2 ? `${names.join(', ')} + ${items.length - 2} more` : names.join(', ');
}

export function PurchasesList() {
  const { data, error, loading } = useAsync(() => Promise.all([listPurchaseAllocations(), listItems()]), []);

  if (error) return <ErrorNote error={error} />;
  if (loading && !data) return <Loading />;
  const [purchases, items] = data!;

  const itemsByPurchase = new Map<string, Item[]>();
  for (const i of [...items].reverse()) {
    if (!i.purchase_id) continue;
    if (!itemsByPurchase.has(i.purchase_id)) itemsByPurchase.set(i.purchase_id, []);
    itemsByPurchase.get(i.purchase_id)!.push(i);
  }

  // Newest day first; purchases already arrive newest first.
  const days = new Map<string, PurchaseAllocation[]>();
  for (const p of purchases) {
    if (!days.has(p.purchased_on)) days.set(p.purchased_on, []);
    days.get(p.purchased_on)!.push(p);
  }

  return (
    <div className="page">
      <PageHeader
        title="Purchases"
        actions={
          <>
            <Link to="/calculator" className="btn btn-secondary desktop-only">
              What-if
            </Link>
            <Link to="/purchases/new" className="btn btn-primary desktop-only">
              + Log purchase
            </Link>
          </>
        }
      />

      <ErrorNote error={error} />
      {purchases.length === 0 && (
        <Empty>
          No purchases yet. <Link to="/purchases/new">Log your first purchase</Link>.
        </Empty>
      )}

      {[...days.entries()].map(([day, list]) => {
        const dayTotal = list.reduce((s, p) => s + p.total_cost, 0);
        return (
          <section key={day} className={styles.day}>
            <div className={styles.dayHead}>
              <h2 className={styles.dayTitle}>{dayLabel(day)}</h2>
              {list.length > 1 && <span className="muted">{money(dayTotal)}</span>}
            </div>
            <div className="list">
              {list.map((p) => {
                const its = itemsByPurchase.get(p.purchase_id) ?? [];
                return (
                  <Link key={p.purchase_id} to={`/purchases/${p.purchase_id}`} className="list-row">
                    <div className="list-row-main">
                      <span className="list-row-title">{itemSummary(its)}</span>
                      <span className="list-row-meta">
                        {its.length > 0 && <span className={styles.ids}>{its.slice(0, 4).map((i) => i.short_id).join(' ')}</span>}
                        {its.length > 0 && ' · '}
                        {p.source ?? 'No source'}
                        {its.length > 2 ? ` · ${its.length} items` : ''}
                      </span>
                    </div>
                    <div className="list-row-side">
                      <span>{money(p.total_cost)}</span>
                      {p.over_allocated && <span className="badge badge-warn">Over-allocated</span>}
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        );
      })}

      <Link to="/purchases/new" className="fab" aria-label="Log purchase">
        <PlusIcon />
      </Link>
    </div>
  );
}
