import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Empty, ErrorNote, Loading, PlusIcon, SearchIcon, ShortId, StatusBadge } from '../../components/ui';
import { PageHeader } from '../../layout/PageHeader';
import { listCategories, listItemCosts, listItems } from '../../lib/api';
import { daysSince, moneyWhole } from '../../lib/format';
import { ACTIVE_STATUSES, STATUS_LABELS, type ItemStatus } from '../../lib/types';
import { useAsync } from '../../lib/useAsync';

type Filter = 'active' | ItemStatus;

const FILTERS: Filter[] = ['active', 'in_stock', 'in_work', 'ready', 'listed', 'sold', 'written_off'];

export function ItemsList() {
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';
  const filter = (params.get('status') as Filter | null) ?? 'active';

  const { data, error, loading } = useAsync(
    () => Promise.all([listItems(), listItemCosts(), listCategories()]),
    [],
  );

  const rows = useMemo(() => {
    if (!data) return [];
    const [items, costs, categories] = data;
    const costById = new Map(costs.map((c) => [c.item_id, c]));
    const categoryById = new Map(categories.map((c) => [c.id, c.name]));
    return items.map((item) => ({
      item,
      cost: costById.get(item.id),
      category: item.category_id ? categoryById.get(item.category_id) : undefined,
    }));
  }, [data]);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { active: 0, in_stock: 0, in_work: 0, ready: 0, listed: 0, sold: 0, written_off: 0 };
    for (const { item } of rows) {
      if (item.customer_id) continue;
      c[item.status] += 1;
      if (ACTIVE_STATUSES.includes(item.status)) c.active += 1;
    }
    return c;
  }, [rows]);

  const q = query.trim().toLowerCase();
  const visible = rows.filter(({ item }) => {
    // Customers' own items are not stock; they show on their jobs (phase 4).
    if (item.customer_id) return false;
    if (q) {
      const match = item.short_id.toLowerCase().startsWith(q) || item.name.toLowerCase().includes(q);
      if (!match) return false;
      // A search from "All" also finds sold and written-off items, so a tag can always be looked up.
      return filter === 'active' ? true : item.status === filter;
    }
    return filter === 'active' ? ACTIVE_STATUSES.includes(item.status) : item.status === filter;
  });

  // An exact short-ID match goes first.
  visible.sort((a, b) => Number(b.item.short_id.toLowerCase() === q) - Number(a.item.short_id.toLowerCase() === q));

  function update(next: { q?: string; status?: Filter }) {
    const p = new URLSearchParams(params);
    if (next.q !== undefined) (next.q ? p.set('q', next.q) : p.delete('q'));
    if (next.status !== undefined) (next.status === 'active' ? p.delete('status') : p.set('status', next.status));
    setParams(p, { replace: true });
  }

  return (
    <div className="page">
      <PageHeader
        title="Items"
        actions={
          <Link to="/items/new" className="btn btn-primary desktop-only">
            + Add item
          </Link>
        }
      />

      <label className="search">
        <SearchIcon />
        <span className="sr-only">Search by ID or name</span>
        <input
          type="search"
          placeholder="ID or name, e.g. K7"
          autoCapitalize="characters"
          value={query}
          onChange={(e) => update({ q: e.target.value })}
        />
      </label>

      <div className="chips" role="group" aria-label="Filter by status">
        {FILTERS.filter((f) => f === 'active' || !['sold', 'written_off'].includes(f) || counts[f] > 0).map((f) => (
          <button key={f} type="button" className="chip" aria-pressed={filter === f} onClick={() => update({ status: f })}>
            {f === 'active' ? 'All' : STATUS_LABELS[f]} {counts[f]}
          </button>
        ))}
      </div>

      <ErrorNote error={error} />
      {loading && !data && <Loading />}

      {data && visible.length === 0 && (
        <Empty>
          {rows.length === 0 ? (
            <>
              No items yet. <Link to="/purchases/new">Log a purchase</Link> to add the items you bought, or{' '}
              <Link to="/items/new">add a single item</Link>.
            </>
          ) : (
            'No items match.'
          )}
        </Empty>
      )}

      <div className="list">
        {visible.map(({ item, cost, category }) => {
          const meta = [category, item.contents].filter(Boolean);
          if (cost?.open_to_find_count) meta.push(`${cost.open_to_find_count} to find`);
          const days = daysSince(cost?.purchased_on);
          if (days !== null && ACTIVE_STATUSES.includes(item.status) && days >= 30) meta.push(`${days} days`);
          return (
            <Link key={item.id} to={`/items/${item.id}`} className="list-row">
              <ShortId id={item.short_id} large dark={item.status === 'listed'} />
              <div className="list-row-main">
                <span className="list-row-title">{item.name}</span>
                <span className="list-row-meta">{meta.join(' · ') || ' '}</span>
              </div>
              <div className="list-row-side">
                <StatusBadge status={item.status} />
                <span className="muted">{cost ? `${moneyWhole(cost.total_cost)} cost` : ''}</span>
              </div>
            </Link>
          );
        })}
      </div>

      <Link to="/items/new" className="fab" aria-label="Add item">
        <PlusIcon />
      </Link>
    </div>
  );
}
