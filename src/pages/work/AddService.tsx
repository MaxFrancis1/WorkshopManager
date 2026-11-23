import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ErrorNote, Loading, ShortId } from '../../components/ui';
import { addWorkLine, getItem, getJob, listItems, listJobItemIds, listPartStock, listPartTypes, listServices } from '../../lib/api';
import { hoursMinutes, money, moneyInput, parseMoney } from '../../lib/format';
import type { Item, Service } from '../../lib/types';
import { errorMessage, useAsync } from '../../lib/useAsync';
import styles from './AddService.module.css';

const CUSTOMER = 'customer';

/**
 * Add a service to one item (/items/:id/add-service) or to every item in a job
 * (/jobs/:id/add-service). Each item gets its own work line, saved atomically.
 */
export function AddService({ mode }: { mode: 'item' | 'job' }) {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const backTo = mode === 'item' ? `/items/${id}` : `/jobs/${id}`;

  const { data, error } = useAsync(async () => {
    const [services, parts, types] = await Promise.all([listServices(), listPartStock(), listPartTypes()]);
    let items: Item[] = [];
    let jobTitle: string | null = null;
    if (mode === 'item') {
      const item = await getItem(id);
      items = item ? [item] : [];
    } else {
      const [job, itemIds, all] = await Promise.all([getJob(id), listJobItemIds(id), listItems()]);
      jobTitle = job?.title ?? 'Job';
      items = all.filter((i) => itemIds.includes(i.id));
    }
    return { services, parts, types, items, jobTitle };
  }, [id, mode]);

  const [serviceId, setServiceId] = useState('');
  const [qty, setQty] = useState(1);
  const [choice, setChoice] = useState<Record<string, string>>({}); // part_type_id → part_id | CUSTOMER
  const [minutes, setMinutes] = useState('');
  const [price, setPrice] = useState('');
  const [extra, setExtra] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const service: Service | undefined = data?.services.find((s) => s.id === serviceId);

  // Pick the first service, then reset defaults whenever the service changes.
  useEffect(() => {
    if (data && !serviceId && data.services[0]) setServiceId(data.services[0].id);
  }, [data, serviceId]);

  useEffect(() => {
    if (!service || !data) return;
    const next: Record<string, string> = {};
    for (const sp of service.service_parts) {
      const options = data.parts.filter((p) => p.part_type_id === sp.part_type_id);
      next[sp.part_type_id] = sp.default_part_id && options.some((o) => o.part_id === sp.default_part_id) ? sp.default_part_id : (options[0]?.part_id ?? CUSTOMER);
    }
    setChoice(next);
    setMinutes(String(service.default_minutes));
    setPrice(moneyInput(service.price));
  }, [service, data]);

  const itemCount = data?.items.length ?? 0;
  const summary = useMemo(() => {
    if (!service || !data) return { partsCost: 0, lines: [] as { label: string; amount: number }[] };
    const lines = service.service_parts.map((sp) => {
      const typeName = data.types.find((t) => t.id === sp.part_type_id)?.name ?? 'Part';
      const picked = choice[sp.part_type_id];
      const part = data.parts.find((p) => p.part_id === picked);
      const n = sp.qty * qty;
      if (!part) return { label: `${typeName} · ${n} × customer's own`, amount: 0 };
      return { label: `${typeName} · ${n} × ${money(part.unit_cost)}`, amount: Math.round(n * part.unit_cost * 100) / 100 };
    });
    return { partsCost: lines.reduce((s, l) => s + l.amount, 0), lines };
  }, [service, data, choice, qty]);

  if (error) return <ErrorNote error={error} />;
  if (!data) return <Loading />;

  const minutesN = Number.parseInt(minutes, 10);
  const priceN = parseMoney(price);
  const extraN = parseMoney(extra);
  const valid = service && itemCount > 0 && minutesN >= 0 && !Number.isNaN(priceN) && !Number.isNaN(extraN);

  async function onSave() {
    if (!service || !data || !valid) return;
    setSaving(true);
    setSaveError(null);
    try {
      for (const item of data.items) {
        await addWorkLine(
          {
            item_id: item.id,
            service_id: service.id,
            qty,
            job_id: mode === 'job' ? id : null,
            minutes_each: minutesN,
            price_each: priceN ?? 0,
            extra_cost: extraN ?? 0,
            notes: notes.trim() || null,
          },
          service.service_parts.map((sp) => {
            const picked = choice[sp.part_type_id];
            return picked && picked !== CUSTOMER
              ? { part_id: picked, qty: sp.qty * qty, customer_supplied: false }
              : { part_id: null, qty: sp.qty * qty, customer_supplied: true, description: `Customer's own ${data.types.find((t) => t.id === sp.part_type_id)?.name ?? 'part'}` };
          }),
        );
      }
      navigate(backTo);
    } catch (err) {
      setSaveError(errorMessage(err));
      setSaving(false);
    }
  }

  return (
    <div className={`page ${styles.sheet}`}>
      <div className={styles.head}>
        <div>
          <h1 className={styles.title}>Add service</h1>
          {mode === 'item' && data.items[0] ? (
            <span className="muted" style={{ fontSize: 13 }}>
              <ShortId id={data.items[0].short_id} /> {data.items[0].name}
            </span>
          ) : (
            <span className="muted" style={{ fontSize: 13 }}>
              {data.jobTitle} · applies to each of {itemCount} item{itemCount === 1 ? '' : 's'}
            </span>
          )}
        </div>
        <Link to={backTo} className={styles.close} aria-label="Close">
          ✕
        </Link>
      </div>

      {itemCount === 0 && (
        <p className="alert alert-warn">{mode === 'job' ? 'Add items to this job first.' : 'Item not found.'}</p>
      )}

      {data.services.length === 0 ? (
        <p className="alert alert-warn">
          No services yet. <Link to="/services/new">Add a service</Link> first.
        </p>
      ) : (
        <>
          <fieldset className={styles.fieldset}>
            <legend className="field-label">Service</legend>
            <div className="chips">
              {data.services.map((s) => (
                <button key={s.id} type="button" className="pill" aria-pressed={s.id === serviceId} onClick={() => setServiceId(s.id)}>
                  {s.name}
                </button>
              ))}
            </div>
          </fieldset>

          <div className={styles.qtyRow}>
            <span style={{ fontSize: 15, fontWeight: 600 }}>Quantity</span>
            <div className="stepper">
              <button type="button" aria-label="Decrease quantity" disabled={qty <= 1} onClick={() => setQty((q) => Math.max(1, q - 1))}>
                −
              </button>
              <output aria-live="polite">{qty}</output>
              <button type="button" aria-label="Increase quantity" onClick={() => setQty((q) => Math.min(99, q + 1))}>
                +
              </button>
            </div>
          </div>

          {service?.service_parts.map((sp) => {
            const typeName = data.types.find((t) => t.id === sp.part_type_id)?.name ?? 'Part';
            const options = data.parts.filter((p) => p.part_type_id === sp.part_type_id);
            const needed = sp.qty * qty * itemCount;
            return (
              <fieldset key={sp.id} className={styles.fieldset}>
                <legend className="field-label">
                  {typeName} · {sp.qty * qty} per item
                </legend>
                <div className="stack" style={{ gap: 8 }}>
                  {options.map((p) => {
                    const short = p.qty_on_hand < needed;
                    return (
                      <label key={p.part_id} className="radio-card">
                        <input
                          type="radio"
                          name={`type-${sp.part_type_id}`}
                          checked={choice[sp.part_type_id] === p.part_id}
                          onChange={() => setChoice({ ...choice, [sp.part_type_id]: p.part_id })}
                        />
                        <span className="radio-card-main">
                          {p.name}
                          <small className={short ? 'warn' : undefined}>
                            {p.qty_on_hand} in stock{short ? ' · not enough' : ''}
                          </small>
                        </span>
                        <span style={{ fontWeight: 600, fontSize: 14 }}>{money(p.unit_cost)}</span>
                      </label>
                    );
                  })}
                  <label className="radio-card">
                    <input
                      type="radio"
                      name={`type-${sp.part_type_id}`}
                      checked={choice[sp.part_type_id] === CUSTOMER}
                      onChange={() => setChoice({ ...choice, [sp.part_type_id]: CUSTOMER })}
                    />
                    <span className="radio-card-main">
                      Customer's own
                      <small>No cost, stock not touched</small>
                    </span>
                  </label>
                </div>
              </fieldset>
            );
          })}

          <div className="stack" style={{ gap: 8, fontSize: 14 }}>
            {summary.lines.map((l) => (
              <div key={l.label} className={styles.sumRow}>
                <span className="muted">{l.label}</span>
                <span>{money(l.amount)}</span>
              </div>
            ))}
            <label className={styles.sumRow}>
              <span className="muted">
                Time each, minutes{qty > 1 ? ` (total ${hoursMinutes(qty * (Number.isNaN(minutesN) ? 0 : minutesN))})` : ''}
              </span>
              <input className={`input input-sm ${styles.smallInput}`} inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)} />
            </label>
            <label className={styles.sumRow}>
              <span className="muted">Extra cost (e.g. solvent, paint)</span>
              <input
                className={`input input-sm ${styles.smallInput}`}
                inputMode="decimal"
                placeholder="£"
                value={extra}
                aria-invalid={Number.isNaN(extraN)}
                onChange={(e) => setExtra(e.target.value)}
              />
            </label>
            <details>
              <summary className="field-label" style={{ cursor: 'pointer', minHeight: 32 }}>
                Customer charge and notes
              </summary>
              <div className="stack" style={{ gap: 8, paddingTop: 8 }}>
                <label className={styles.sumRow}>
                  <span className="muted">Charged per unit</span>
                  <input
                    className={`input input-sm ${styles.smallInput}`}
                    inputMode="decimal"
                    value={price}
                    aria-invalid={Number.isNaN(priceN)}
                    onChange={(e) => setPrice(e.target.value)}
                  />
                </label>
                <input className="input input-sm" placeholder="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </details>
            <div className={`${styles.sumRow} ${styles.total}`}>
              <span>Parts cost{itemCount > 1 ? ' per item' : ''}</span>
              <span>{money(summary.partsCost + (extraN && !Number.isNaN(extraN) ? extraN : 0))}</span>
            </div>
          </div>

          <ErrorNote error={saveError} />
          <button type="button" className="btn btn-primary btn-block" disabled={saving || !valid} onClick={() => void onSave()}>
            {saving ? 'Saving…' : `Add ${qty} × ${service?.name ?? 'service'}${itemCount > 1 ? ` to ${itemCount} items` : ''}`}
          </button>
        </>
      )}
    </div>
  );
}
