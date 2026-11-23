import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { ErrorNote, Loading, ShortId, StatusBadge } from '../../components/ui';
import { PageHeader } from '../../layout/PageHeader';
import {
  deletePurchase,
  getPurchase,
  getPurchaseAllocation,
  listItemCostsForPurchase,
  listItems,
  listSources,
  updateItem,
  updatePurchase,
} from '../../lib/api';
import { splitCost } from '../../lib/costSplit';
import { date, money, moneyInput, parseMoney } from '../../lib/format';
import type { Purchase } from '../../lib/types';
import { errorMessage, useAsync } from '../../lib/useAsync';

export function PurchaseDetail() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const justSaved = params.get('new') === '1';

  const { data, error, loading, reload } = useAsync(async () => {
    const [purchase, allocation, costs, items, sources] = await Promise.all([
      getPurchase(id),
      getPurchaseAllocation(id),
      listItemCostsForPurchase(id),
      listItems(),
      listSources(),
    ]);
    // allocated_cost lives on the item; the view has the resulting share.
    const allocatedById = new Map(items.filter((i) => i.purchase_id === id).map((i) => [i.id, i.allocated_cost]));
    return { purchase, allocation, costs, allocatedById, sources };
  }, [id]);

  const [allocInputs, setAllocInputs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    const next: Record<string, string> = {};
    for (const c of data.costs) next[c.item_id] = moneyInput(data.allocatedById.get(c.item_id) ?? null);
    setAllocInputs(next);
  }, [data]);

  if (loading && !data) return <Loading />;
  if (error) return <ErrorNote error={error} />;
  if (!data?.purchase) {
    return (
      <div className="page">
        <Link to="/purchases" className="back-link">
          ← Purchases
        </Link>
        <p>Purchase not found.</p>
      </div>
    );
  }

  const { purchase, allocation, costs, allocatedById, sources } = data;
  const total = purchase.price + purchase.postage_in;
  const parsed = costs.map((c) => parseMoney(allocInputs[c.item_id] ?? ''));
  const allocValid = parsed.every((p) => !Number.isNaN(p));
  const preview = allocValid ? splitCost(total, parsed) : null;
  const allocDirty = costs.some((c, i) => (parsed[i] ?? null) !== (allocatedById.get(c.item_id) ?? null));

  async function saveAllocations() {
    if (!allocValid || preview?.overAllocated) return;
    setBusy(true);
    setActionError(null);
    try {
      await Promise.all(
        costs.map((c, i) =>
          (parsed[i] ?? null) !== (allocatedById.get(c.item_id) ?? null)
            ? updateItem(c.item_id, { allocated_cost: parsed[i] ?? null })
            : Promise.resolve(),
        ),
      );
      setSavedNote('Allocations saved.');
      reload();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!window.confirm('Delete this purchase?')) return;
    try {
      await deletePurchase(purchase.id);
      navigate('/purchases', { replace: true });
    } catch (err) {
      setActionError(errorMessage(err));
    }
  }

  return (
    <div className="page" style={{ maxWidth: 900 }}>
      <Link to="/purchases" className="back-link">
        ← Purchases
      </Link>
      <PageHeader
        title={purchase.source || 'Purchase'}
        actions={
          <Link to={`/items/new?purchase=${purchase.id}`} className="btn btn-secondary">
            + Add item
          </Link>
        }
      />
      <span className="muted" style={{ marginTop: -10, fontSize: 14 }}>
        {date(purchase.purchased_on)} · {money(total)}
      </span>

      {justSaved && costs.length > 0 && (
        <p className="alert alert-ok" role="status">
          Saved. Write each item's ID on its tag: {costs.map((c) => c.short_id).join(', ')}.
        </p>
      )}

      <section className="card">
        <div className="section-head">
          <h2 className="section-title">Items and cost split</h2>
          {allocation && (
            <span className="muted" style={{ fontSize: 13 }}>
              {money(allocation.allocated_cost)} allocated ·{' '}
              {allocation.item_count > allocation.allocated_item_count
                ? `${money(allocation.unallocated_cost)} shared equally`
                : `${money(allocation.unallocated_cost)} unallocated`}
            </span>
          )}
        </div>

        {costs.length === 0 ? (
          <p className="muted">
            No items in this purchase. <Link to={`/items/new?purchase=${purchase.id}`}>Add one</Link>, or delete the purchase below.
          </p>
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th className="desktop-only">Status</th>
                    <th className="num">Allocated</th>
                    <th className="num">Share</th>
                  </tr>
                </thead>
                <tbody>
                  {costs.map((c, i) => (
                    <tr key={c.item_id}>
                      <td>
                        <Link to={`/items/${c.item_id}`} style={{ display: 'inline-flex', gap: 8, alignItems: 'center', color: 'inherit', textDecoration: 'none' }}>
                          <ShortId id={c.short_id} />
                          <span style={{ fontWeight: 600 }}>{c.name}</span>
                        </Link>
                      </td>
                      <td className="desktop-only">
                        <StatusBadge status={c.status} />
                      </td>
                      <td className="num">
                        <input
                          className="input input-sm"
                          style={{ width: 110, textAlign: 'right' }}
                          inputMode="decimal"
                          placeholder="Equal"
                          aria-label={`Allocated cost for ${c.short_id}`}
                          aria-invalid={Number.isNaN(parsed[i])}
                          value={allocInputs[c.item_id] ?? ''}
                          onChange={(e) => {
                            setSavedNote(null);
                            setAllocInputs({ ...allocInputs, [c.item_id]: e.target.value });
                          }}
                        />
                      </td>
                      <td className="num" style={{ fontWeight: 600 }}>
                        {allocDirty && preview ? money(preview.shares[i]) : money(c.purchase_share)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="field-hint" style={{ margin: '10px 0' }}>
              Leave an item's allocation blank to give it an equal share of whatever the others have not taken.
            </p>
            {preview?.overAllocated && (
              <p className="alert alert-error" role="alert">
                Allocated {money(preview.allocated)} is more than the purchase total of {money(total)}.
              </p>
            )}
            {!preview?.overAllocated && preview && preview.remaining > 0 && parsed.every((p) => p !== null) && (
              <p className="alert alert-warn" role="status">
                {money(preview.remaining)} of the purchase is not allocated to any item.
              </p>
            )}
            {(allocDirty || savedNote) && (
              <div className="form-actions">
                {allocDirty && (
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={busy || !allocValid || preview?.overAllocated}
                    onClick={() => void saveAllocations()}
                  >
                    Save allocations
                  </button>
                )}
                {savedNote && !allocDirty && <span className="muted">{savedNote}</span>}
              </div>
            )}
          </>
        )}
        <ErrorNote error={actionError} />
      </section>

      <PurchaseFields key={purchase.id + purchase.price + purchase.postage_in} purchase={purchase} sources={sources} onSaved={reload} />

      {costs.length === 0 && (
        <div>
          <button type="button" className="link-button danger" onClick={() => void onDelete()}>
            Delete purchase
          </button>
        </div>
      )}
    </div>
  );
}

function PurchaseFields({ purchase, sources, onSaved }: { purchase: Purchase; sources: string[]; onSaved: () => void }) {
  const [purchasedOn, setPurchasedOn] = useState(purchase.purchased_on);
  const [source, setSource] = useState(purchase.source ?? '');
  const [price, setPrice] = useState(moneyInput(purchase.price));
  const [postage, setPostage] = useState(moneyInput(purchase.postage_in));
  const [notes, setNotes] = useState(purchase.notes ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const priceN = parseMoney(price);
  const postageN = parseMoney(postage);
  const valid = priceN !== null && !Number.isNaN(priceN) && !Number.isNaN(postageN);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      await updatePurchase(purchase.id, {
        purchased_on: purchasedOn,
        source: source.trim() || null,
        price: priceN ?? 0,
        postage_in: postageN ?? 0,
        notes: notes.trim() || null,
      });
      setSaved(true);
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card stack" onSubmit={onSubmit} noValidate onChange={() => setSaved(false)}>
      <h2 className="section-title">Purchase details</h2>
      <div className="form-grid">
        <label className="field">
          <span className="field-label">Date</span>
          <input className="input" type="date" value={purchasedOn} onChange={(e) => setPurchasedOn(e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">Source</span>
          <input className="input" list="purchase-sources" value={source} onChange={(e) => setSource(e.target.value)} />
          <datalist id="purchase-sources">
            {sources.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </label>
        <label className="field">
          <span className="field-label">Price paid</span>
          <input className="input" inputMode="decimal" value={price} aria-invalid={!valid && Number.isNaN(priceN)} onChange={(e) => setPrice(e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">Postage in</span>
          <input className="input" inputMode="decimal" value={postage} aria-invalid={Number.isNaN(postageN)} onChange={(e) => setPostage(e.target.value)} />
        </label>
        <label className="field span-2">
          <span className="field-label">Notes</span>
          <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
      </div>
      <ErrorNote error={error} />
      <div className="form-actions">
        <button className="btn btn-secondary" type="submit" disabled={busy || !valid}>
          Save details
        </button>
        {saved && <span className="muted">Saved.</span>}
      </div>
    </form>
  );
}
