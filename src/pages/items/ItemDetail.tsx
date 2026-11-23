import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { fieldPairs } from '../../components/FieldValuesEditor';
import { ErrorNote, Loading, ShortId, StatusBadge } from '../../components/ui';
import { getItem, getItemCost, getPurchase, listCategories, updateItem } from '../../lib/api';
import { date, daysSince, hours, money } from '../../lib/format';
import { ACTIVE_STATUSES, ITEM_STATUSES, STATUS_LABELS, type ItemStatus } from '../../lib/types';
import { errorMessage, useAsync } from '../../lib/useAsync';
import styles from './ItemDetail.module.css';

export function ItemDetail() {
  const { id = '' } = useParams();
  const { data, error, loading, reload } = useAsync(async () => {
    const [item, cost, categories] = await Promise.all([getItem(id), getItemCost(id), listCategories()]);
    const purchase = item?.purchase_id ? await getPurchase(item.purchase_id) : null;
    return { item, cost, categories, purchase };
  }, [id]);
  const [statusError, setStatusError] = useState<string | null>(null);

  if (loading && !data) return <Loading />;
  if (error) return <ErrorNote error={error} />;
  if (!data?.item) {
    return (
      <div className="page">
        <Link to="/items" className="back-link">
          ← Items
        </Link>
        <p>Item not found.</p>
      </div>
    );
  }

  const { item, cost, categories, purchase } = data;
  const category = categories.find((c) => c.id === item.category_id);
  const pairs = category ? fieldPairs(category.category_fields, item.field_values) : [];
  const days = daysSince(purchase?.purchased_on);

  const meta: string[] = [];
  if (category) meta.push(category.name);
  if (purchase) meta.push(`bought ${date(purchase.purchased_on)}${purchase.source ? ` from ${purchase.source}` : ''}`);
  if (days !== null && ACTIVE_STATUSES.includes(item.status)) meta.push(`${days} day${days === 1 ? '' : 's'} in stock`);

  async function changeStatus(status: ItemStatus) {
    setStatusError(null);
    try {
      await updateItem(item.id, { status });
      reload();
    } catch (err) {
      setStatusError(errorMessage(err));
    }
  }

  return (
    <div className="page">
      <Link to="/items" className="back-link">
        ← Items
      </Link>

      <header className={styles.header}>
        <ShortId id={item.short_id} large dark />
        <div className={styles.titleBlock}>
          <h1 className={styles.title}>{item.name}</h1>
          {meta.length > 0 && <span className="muted">{meta.join(' · ')}</span>}
        </div>
        <div className={styles.headerSide}>
          <StatusBadge status={item.status} />
          <Link to={`/items/${item.id}/edit`} className="btn btn-secondary">
            Edit
          </Link>
        </div>
      </header>

      <div className={styles.columns}>
        <div className="stack">
          <section className="card">
            <h2 className="section-title" style={{ marginBottom: 4 }}>
              Details
            </h2>
            <div className="kv">
              <span>Contents</span>
              <span>{item.contents || '—'}</span>
            </div>
            {pairs.map((p) => (
              <div className="kv" key={p.name}>
                <span>{p.name}</span>
                <span>{p.value}</span>
              </div>
            ))}
            <div className="kv">
              <span>Condition</span>
              <span>{item.condition || '—'}</span>
            </div>
            {item.notes && <p className={styles.notes}>{item.notes}</p>}
          </section>

          <section className="card empty">
            <p>Services, parts and the listing text are added in phase 4 and later.</p>
          </section>
        </div>

        <aside className="stack">
          <section className="card">
            <h2 className="section-title" style={{ marginBottom: 4 }}>
              Cost
            </h2>
            {cost ? (
              <>
                <div className="kv">
                  <span>{purchase ? <Link to={`/purchases/${purchase.id}`}>Purchase share</Link> : 'Purchase share'}</span>
                  <span>{money(cost.purchase_share)}</span>
                </div>
                {cost.parts_cost > 0 && (
                  <div className="kv">
                    <span>Parts</span>
                    <span>{money(cost.parts_cost)}</span>
                  </div>
                )}
                {cost.extras_cost > 0 && (
                  <div className="kv">
                    <span>Extras</span>
                    <span>{money(cost.extras_cost)}</span>
                  </div>
                )}
                {cost.to_find_cost > 0 && (
                  <div className="kv">
                    <span>Sourced parts</span>
                    <span>{money(cost.to_find_cost)}</span>
                  </div>
                )}
                <div className="kv kv-total">
                  <span>Total cost</span>
                  <span>{money(cost.total_cost)}</span>
                </div>
                {cost.labour_minutes > 0 && (
                  <p className={styles.labour}>
                    ~{hours(cost.labour_minutes)} labour
                    {cost.labour_cost !== null ? ` at ${money(cost.labour_cost)}` : ''} required
                  </p>
                )}
                {!purchase && !item.customer_id && (
                  <p className="field-hint" style={{ margin: '8px 0 0' }}>
                    Not linked to a purchase, so there is no purchase cost. <Link to={`/items/${item.id}/edit`}>Link one</Link>.
                  </p>
                )}
              </>
            ) : (
              <p className="muted">No cost data.</p>
            )}
          </section>

          <section className="card">
            <label className="field">
              <span className="field-label">Status</span>
              <select className="input" value={item.status} onChange={(e) => void changeStatus(e.target.value as ItemStatus)}>
                {ITEM_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </label>
            <ErrorNote error={statusError} />
          </section>
        </aside>
      </div>
    </div>
  );
}
