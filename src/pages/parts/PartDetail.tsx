import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ErrorNote, Loading } from '../../components/ui';
import { PageHeader } from '../../layout/PageHeader';
import { addRestock, deletePart, deleteRestock, getPartStock, listPartTypes, listRestocks, updatePart } from '../../lib/api';
import { date, money, moneyInput, parseMoney, todayIso } from '../../lib/format';
import type { PartStock, PartType } from '../../lib/types';
import { errorMessage, useAsync } from '../../lib/useAsync';

export function PartDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { data, error, loading, reload } = useAsync(
    () => Promise.all([getPartStock(id), listPartTypes(), listRestocks(id)]),
    [id],
  );
  const [actionError, setActionError] = useState<string | null>(null);

  if (error) return <ErrorNote error={error} />;
  if (loading && !data) return <Loading />;
  const [part, types, restocks] = data!;
  if (!part) return <p>Part not found.</p>;

  async function run(action: () => Promise<unknown>) {
    setActionError(null);
    try {
      await action();
      reload();
    } catch (err) {
      setActionError(errorMessage(err));
    }
  }

  return (
    <div className="page" style={{ maxWidth: 820 }}>
      <Link to="/parts" className="back-link">
        ← Parts
      </Link>
      <PageHeader title={part.name} actions={part.low_stock ? <span className="badge badge-warn">Low stock</span> : undefined} />
      <span className="muted" style={{ marginTop: -10, fontSize: 14 }}>
        {part.part_type_name} · {part.qty_on_hand} in stock at {money(part.unit_cost)} each
      </span>

      <RestockForm partId={part.part_id} currentCost={part.unit_cost} onSaved={reload} />

      <section className="card">
        <h2 className="section-title" style={{ marginBottom: 8 }}>
          Restocks
        </h2>
        {restocks.length === 0 ? (
          <p className="muted" style={{ margin: 0, fontSize: 14 }}>
            None logged yet.
          </p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th className="num">Qty</th>
                  <th className="num">Unit cost</th>
                  <th className="desktop-only">Supplier</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {restocks.map((r) => (
                  <tr key={r.id}>
                    <td>{date(r.restocked_on)}</td>
                    <td className="num">{r.qty}</td>
                    <td className="num">{money(r.unit_cost)}</td>
                    <td className="desktop-only muted">{r.supplier ?? ''}</td>
                    <td className="num">
                      <button
                        type="button"
                        className="link-button danger"
                        onClick={() => {
                          if (window.confirm(`Delete this restock? ${r.qty} will be taken off stock. The average cost stays as it is.`)) {
                            void run(() => deleteRestock(r.id));
                          }
                        }}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <PartFields key={`${part.part_id}-${part.unit_cost}-${part.qty_on_hand}`} part={part} types={types} onSaved={reload} />

      <ErrorNote error={actionError} />
      <div>
        <button
          type="button"
          className="link-button danger"
          onClick={async () => {
            if (!window.confirm(`Delete ${part.name}? Parts already used on work lines cannot be deleted.`)) return;
            try {
              await deletePart(part.part_id);
              navigate('/parts', { replace: true });
            } catch (err) {
              setActionError(
                errorMessage(err).includes('foreign key') ? 'This part has been used on work lines, so it cannot be deleted.' : errorMessage(err),
              );
            }
          }}
        >
          Delete part
        </button>
      </div>
    </div>
  );
}

function RestockForm({ partId, currentCost, onSaved }: { partId: string; currentCost: number; onSaved: () => void }) {
  const [qty, setQty] = useState('');
  const [cost, setCost] = useState(moneyInput(currentCost));
  const [supplier, setSupplier] = useState('');
  const [on, setOn] = useState(todayIso());
  const [error, setError] = useState<string | null>(null);
  const qtyN = Number.parseInt(qty, 10);
  const costN = parseMoney(cost);
  const valid = qtyN > 0 && costN !== null && !Number.isNaN(costN);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!valid) return;
    try {
      await addRestock({ part_id: partId, qty: qtyN, unit_cost: costN ?? 0, supplier: supplier.trim() || null, restocked_on: on });
      setQty('');
      setSupplier('');
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <form className="card stack" onSubmit={onSubmit} noValidate>
      <h2 className="section-title">Restock</h2>
      <div className="form-grid">
        <label className="field">
          <span className="field-label">Quantity bought</span>
          <input className="input" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">Cost each</span>
          <input className="input" inputMode="decimal" value={cost} aria-invalid={Number.isNaN(costN)} onChange={(e) => setCost(e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">Supplier</span>
          <input className="input" value={supplier} onChange={(e) => setSupplier(e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">Date</span>
          <input className="input" type="date" value={on} onChange={(e) => setOn(e.target.value)} />
        </label>
      </div>
      <p className="field-hint" style={{ margin: 0 }}>
        Stock goes up by the quantity, and the unit cost becomes the average of old and new stock.
      </p>
      <ErrorNote error={error} />
      <div className="form-actions">
        <button className="btn btn-primary" type="submit" disabled={!valid}>
          Log restock
        </button>
      </div>
    </form>
  );
}

function PartFields({ part, types, onSaved }: { part: PartStock; types: PartType[]; onSaved: () => void }) {
  const [name, setName] = useState(part.name);
  const [typeId, setTypeId] = useState(part.part_type_id);
  const [cost, setCost] = useState(moneyInput(part.unit_cost));
  const [qty, setQty] = useState(String(part.qty_on_hand));
  const [reorder, setReorder] = useState(String(part.reorder_level));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const costN = parseMoney(cost);
  const qtyN = Number.parseInt(qty, 10);
  const reorderN = Number.parseInt(reorder, 10);
  const valid = name.trim() && costN !== null && !Number.isNaN(costN) && !Number.isNaN(qtyN) && reorderN >= 0;

  return (
    <form
      className="card stack"
      noValidate
      onChange={() => setSaved(false)}
      onSubmit={async (e) => {
        e.preventDefault();
        if (!valid) return;
        try {
          await updatePart(part.part_id, { name: name.trim(), part_type_id: typeId, unit_cost: costN ?? 0, qty_on_hand: qtyN, reorder_level: reorderN });
          setSaved(true);
          onSaved();
        } catch (err) {
          setError(errorMessage(err));
        }
      }}
    >
      <h2 className="section-title">Details</h2>
      <div className="form-grid">
        <label className="field">
          <span className="field-label">Name</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">Type</span>
          <select className="input" value={typeId} onChange={(e) => setTypeId(e.target.value)}>
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Unit cost</span>
          <input className="input" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">In stock (stock-take correction)</span>
          <input className="input" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">Reorder at</span>
          <input className="input" inputMode="numeric" value={reorder} onChange={(e) => setReorder(e.target.value)} />
        </label>
      </div>
      <ErrorNote error={error} />
      <div className="form-actions">
        <button className="btn btn-secondary" type="submit" disabled={!valid}>
          Save details
        </button>
        {saved && <span className="muted">Saved.</span>}
      </div>
    </form>
  );
}
