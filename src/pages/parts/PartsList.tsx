import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Empty, ErrorNote, Loading } from '../../components/ui';
import { PageHeader } from '../../layout/PageHeader';
import { createPart, createPartType, deletePartType, listPartStock, listPartTypes, renamePartType } from '../../lib/api';
import { money, parseMoney } from '../../lib/format';
import { errorMessage, useAsync } from '../../lib/useAsync';

export function PartsList() {
  const [params, setParams] = useSearchParams();
  const lowOnly = params.get('low') === '1';
  const { data, error, loading, reload } = useAsync(() => Promise.all([listPartTypes(), listPartStock()]), []);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  async function run(action: () => Promise<unknown>) {
    setActionError(null);
    try {
      await action();
      reload();
    } catch (err) {
      setActionError(errorMessage(err));
    }
  }

  if (error) return <ErrorNote error={error} />;
  if (loading && !data) return <Loading />;
  const [types, parts] = data!;
  const lowCount = parts.filter((p) => p.low_stock).length;
  const visible = lowOnly ? parts.filter((p) => p.low_stock) : parts;

  return (
    <div className="page">
      <PageHeader
        title="Parts"
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setShowAdd((s) => !s)} disabled={types.length === 0}>
            + Add part
          </button>
        }
      />

      <div className="chips" role="group" aria-label="Filter parts">
        <button type="button" className="chip" aria-pressed={!lowOnly} onClick={() => setParams({}, { replace: true })}>
          All {parts.length}
        </button>
        <button type="button" className="chip" aria-pressed={lowOnly} onClick={() => setParams({ low: '1' }, { replace: true })}>
          Low stock {lowCount}
        </button>
      </div>

      <ErrorNote error={actionError} />

      {types.length === 0 && (
        <Empty>
          Start with a part type: a group of interchangeable parts, such as Grip or Tape. Then add the parts you stock under it.
        </Empty>
      )}

      {showAdd && types.length > 0 && (
        <AddPartForm
          types={types}
          onDone={() => {
            setShowAdd(false);
            reload();
          }}
        />
      )}

      {types.map((t) => {
        const rows = visible.filter((p) => p.part_type_id === t.id);
        if (lowOnly && rows.length === 0) return null;
        return (
          <section key={t.id} className="card">
            <div className="section-head">
              <TypeName
                name={t.name}
                onRename={(name) => run(() => renamePartType(t.id, name))}
              />
              {rows.length === 0 && !lowOnly && (
                <button
                  type="button"
                  className="link-button danger"
                  onClick={() => {
                    if (window.confirm(`Delete the part type "${t.name}"?`)) void run(() => deletePartType(t.id));
                  }}
                >
                  Delete
                </button>
              )}
            </div>
            {rows.length === 0 ? (
              <p className="muted" style={{ margin: 0, fontSize: 14 }}>
                No parts of this type yet.
              </p>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Part</th>
                      <th className="num">Unit cost</th>
                      <th className="num">In stock</th>
                      <th className="num desktop-only">Reorder at</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((p) => (
                      <tr key={p.part_id}>
                        <td>
                          <Link to={`/parts/${p.part_id}`} style={{ fontWeight: 600 }}>
                            {p.name}
                          </Link>
                          {p.low_stock && (
                            <span className="badge badge-warn" style={{ marginLeft: 8 }}>
                              Low
                            </span>
                          )}
                        </td>
                        <td className="num">{money(p.unit_cost)}</td>
                        <td className={`num${p.qty_on_hand < 0 ? ' negative' : ''}`} style={{ fontWeight: 600 }}>
                          {p.qty_on_hand}
                        </td>
                        <td className="num desktop-only muted">{p.reorder_level || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        );
      })}

      {!lowOnly && <AddTypeForm onAdd={(name) => run(() => createPartType(name))} />}
    </div>
  );
}

function TypeName({ name, onRename }: { name: string; onRename: (name: string) => void }) {
  const [value, setValue] = useState(name);
  return (
    <input
      className="input input-sm"
      style={{ fontWeight: 700, maxWidth: 260 }}
      aria-label="Part type name"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        if (value.trim() && value.trim() !== name) onRename(value);
        else setValue(name);
      }}
    />
  );
}

function AddTypeForm({ onAdd }: { onAdd: (name: string) => Promise<void> }) {
  const [name, setName] = useState('');
  return (
    <form
      className="card"
      style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}
      onSubmit={async (e) => {
        e.preventDefault();
        if (!name.trim()) return;
        await onAdd(name);
        setName('');
      }}
    >
      <label className="field" style={{ flex: 1 }}>
        <span className="field-label">New part type</span>
        <input className="input input-sm" value={name} placeholder="e.g. Grip, Tape, Ferrule" onChange={(e) => setName(e.target.value)} />
      </label>
      <button className="btn btn-secondary" type="submit" disabled={!name.trim()}>
        Add type
      </button>
    </form>
  );
}

function AddPartForm({ types, onDone }: { types: { id: string; name: string }[]; onDone: () => void }) {
  const [typeId, setTypeId] = useState(types[0]?.id ?? '');
  const [name, setName] = useState('');
  const [cost, setCost] = useState('');
  const [qty, setQty] = useState('0');
  const [reorder, setReorder] = useState('0');
  const [error, setError] = useState<string | null>(null);
  const costN = parseMoney(cost);
  const qtyN = Number.parseInt(qty, 10);
  const reorderN = Number.parseInt(reorder, 10);
  const valid = typeId && name.trim() && costN !== null && !Number.isNaN(costN) && !Number.isNaN(qtyN) && reorderN >= 0;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!valid) return;
    try {
      await createPart({ part_type_id: typeId, name, unit_cost: costN ?? 0, qty_on_hand: qtyN, reorder_level: reorderN });
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <form className="card stack" onSubmit={onSubmit} noValidate>
      <h2 className="section-title">Add part</h2>
      <div className="form-grid">
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
          <span className="field-label">Name</span>
          <input className="input" value={name} placeholder="e.g. Golf Pride MCC Std" onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">Unit cost</span>
          <input className="input" inputMode="decimal" placeholder="£" value={cost} aria-invalid={Number.isNaN(costN)} onChange={(e) => setCost(e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">In stock now</span>
          <input className="input" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">Reorder at</span>
          <input className="input" inputMode="numeric" value={reorder} onChange={(e) => setReorder(e.target.value)} />
          <span className="field-hint">Flagged as low once stock is down to this. 0 = never.</span>
        </label>
      </div>
      <ErrorNote error={error} />
      <div className="form-actions">
        <button className="btn btn-primary" type="submit" disabled={!valid}>
          Add part
        </button>
        <button type="button" className="btn btn-secondary" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}
