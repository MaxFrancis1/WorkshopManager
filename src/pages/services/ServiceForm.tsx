import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ErrorNote, Loading } from '../../components/ui';
import { PageHeader } from '../../layout/PageHeader';
import { deleteService, getService, listPartStock, listPartTypes, saveService, type ServicePartInput } from '../../lib/api';
import { money, moneyInput, parseMoney } from '../../lib/format';
import { errorMessage, useAsync } from '../../lib/useAsync';

interface PartRow {
  key: number;
  part_type_id: string;
  qty: string;
  default_part_id: string;
}

let nextKey = 1;

/** Add (/services/new) or edit (/services/:id) a service and the parts it needs. */
export function ServiceForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, error } = useAsync(
    () => Promise.all([id ? getService(id) : Promise.resolve(null), listPartTypes(), listPartStock()]),
    [id],
  );

  const [ready, setReady] = useState(false);
  const [name, setName] = useState('');
  const [minutes, setMinutes] = useState('');
  const [price, setPrice] = useState('');
  const [notes, setNotes] = useState('');
  const [rows, setRows] = useState<PartRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!data || ready) return;
    const svc = data[0];
    if (svc) {
      setName(svc.name);
      setMinutes(String(svc.default_minutes));
      setPrice(moneyInput(svc.price));
      setNotes(svc.notes ?? '');
      setRows(
        svc.service_parts.map((p) => ({
          key: nextKey++,
          part_type_id: p.part_type_id,
          qty: String(p.qty),
          default_part_id: p.default_part_id ?? '',
        })),
      );
    }
    setReady(true);
  }, [data, ready]);

  if (error) return <ErrorNote error={error} />;
  if (!data || !ready) return <Loading />;
  const [service, types, parts] = data;
  if (id && !service) return <p>Service not found.</p>;

  const minutesN = minutes.trim() === '' ? 0 : Number.parseInt(minutes, 10);
  const priceN = parseMoney(price);
  const rowsValid = rows.every((r) => r.part_type_id && Number.parseInt(r.qty, 10) > 0);
  const duplicateType = new Set(rows.map((r) => r.part_type_id)).size !== rows.length;
  const valid = name.trim() && minutesN >= 0 && !Number.isNaN(minutesN) && !Number.isNaN(priceN) && rowsValid && !duplicateType;
  const usedTypes = new Set(rows.map((r) => r.part_type_id));

  const update = (key: number, patch: Partial<PartRow>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setSaving(true);
    setSaveError(null);
    const partInputs: ServicePartInput[] = rows.map((r) => ({
      part_type_id: r.part_type_id,
      qty: Number.parseInt(r.qty, 10),
      default_part_id: r.default_part_id || null,
    }));
    try {
      await saveService(service?.id ?? null, { name, default_minutes: minutesN, price: priceN ?? 0, notes: notes.trim() || null }, partInputs);
      navigate('/services');
    } catch (err) {
      setSaveError(errorMessage(err));
      setSaving(false);
    }
  }

  return (
    <div className="page" style={{ maxWidth: 760 }}>
      <Link to="/services" className="back-link">
        ← Services
      </Link>
      <PageHeader title={service ? 'Edit service' : 'Add service'} />

      <form className="card stack" onSubmit={onSubmit} noValidate>
        <div className="form-grid">
          <label className="field span-2">
            <span className="field-label">Name</span>
            <input className="input" value={name} placeholder="e.g. Regrip" onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">Usual time, minutes</span>
            <input className="input" inputMode="numeric" value={minutes} placeholder="e.g. 10" onChange={(e) => setMinutes(e.target.value)} />
            <span className="field-hint">Per unit: a 5 × Regrip line takes 5 times this.</span>
          </label>
          <label className="field">
            <span className="field-label">Price charged to a customer</span>
            <input className="input" inputMode="decimal" placeholder="£ per unit" value={price} aria-invalid={Number.isNaN(priceN)} onChange={(e) => setPrice(e.target.value)} />
            <span className="field-hint">Used on customer service jobs. Leave blank for stock-only work.</span>
          </label>
          <label className="field span-2">
            <span className="field-label">Notes</span>
            <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
        </div>

        <div className="stack" style={{ gap: 10 }}>
          <h2 className="section-title">Parts needed per unit</h2>
          {types.length === 0 && (
            <p className="muted" style={{ margin: 0, fontSize: 14 }}>
              Add part types on the <Link to="/parts">Parts</Link> page first.
            </p>
          )}
          {rows.map((r) => {
            const options = parts.filter((p) => p.part_type_id === r.part_type_id);
            return (
              <div key={r.key} className="row-grid">
                <label className="field">
                  <span className="field-label">Part type</span>
                  <select className="input input-sm" value={r.part_type_id} onChange={(e) => update(r.key, { part_type_id: e.target.value, default_part_id: '' })}>
                    <option value="">Choose…</option>
                    {types
                      .filter((t) => t.id === r.part_type_id || !usedTypes.has(t.id))
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="field">
                  <span className="field-label">Qty</span>
                  <input className="input input-sm" inputMode="numeric" value={r.qty} onChange={(e) => update(r.key, { qty: e.target.value })} />
                </label>
                <label className="field">
                  <span className="field-label">Default part</span>
                  <select className="input input-sm" value={r.default_part_id} onChange={(e) => update(r.key, { default_part_id: e.target.value })}>
                    <option value="">None</option>
                    {options.map((p) => (
                      <option key={p.part_id} value={p.part_id}>
                        {p.name} · {money(p.unit_cost)}
                      </option>
                    ))}
                  </select>
                </label>
                <div>
                  <button type="button" className="link-button danger" onClick={() => setRows(rows.filter((x) => x.key !== r.key))}>
                    Remove
                  </button>
                </div>
              </div>
            );
          })}
          {types.length > usedTypes.size && (
            <button
              type="button"
              className="btn btn-secondary"
              style={{ alignSelf: 'flex-start' }}
              onClick={() => setRows([...rows, { key: nextKey++, part_type_id: '', qty: '1', default_part_id: '' }])}
            >
              + Part needed
            </button>
          )}
        </div>

        <ErrorNote error={saveError} />
        <div className="form-actions">
          <button className="btn btn-primary" type="submit" disabled={saving || !valid}>
            {saving ? 'Saving…' : service ? 'Save changes' : 'Add service'}
          </button>
          <Link to="/services" className="btn btn-secondary">
            Cancel
          </Link>
          <span className="spacer" />
          {service && (
            <button
              type="button"
              className="link-button danger"
              onClick={async () => {
                if (!window.confirm(`Delete ${service.name}?`)) return;
                try {
                  await deleteService(service.id);
                  navigate('/services', { replace: true });
                } catch (err) {
                  setSaveError(
                    errorMessage(err).includes('foreign key')
                      ? 'This service has been used on work lines, so it cannot be deleted.'
                      : errorMessage(err),
                  );
                }
              }}
            >
              Delete service
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
