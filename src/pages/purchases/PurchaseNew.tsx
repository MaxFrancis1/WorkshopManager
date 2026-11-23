import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { cleanFieldValues, FieldValuesEditor } from '../../components/FieldValuesEditor';
import { ErrorNote, Loading } from '../../components/ui';
import { PageHeader } from '../../layout/PageHeader';
import { listCategories, listSources, logPurchase } from '../../lib/api';
import { splitCost } from '../../lib/costSplit';
import { money, parseMoney, todayIso } from '../../lib/format';
import type { FieldValues } from '../../lib/types';
import { errorMessage, useAsync } from '../../lib/useAsync';
import { CONDITIONS } from '../items/ItemForm';
import styles from './PurchaseNew.module.css';

interface Row {
  key: number;
  name: string;
  category_id: string;
  contents: string;
  condition: string;
  field_values: FieldValues;
  allocated: string;
}

let nextKey = 1;
const newRow = (): Row => ({ key: nextKey++, name: '', category_id: '', contents: '', condition: '', field_values: {}, allocated: '' });

export function PurchaseNew() {
  const navigate = useNavigate();
  const { data, error } = useAsync(() => Promise.all([listCategories(), listSources()]), []);

  const [purchasedOn, setPurchasedOn] = useState(todayIso());
  const [source, setSource] = useState('');
  const [price, setPrice] = useState('');
  const [postage, setPostage] = useState('');
  const [notes, setNotes] = useState('');
  const [rows, setRows] = useState<Row[]>(() => [newRow()]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  if (error) return <ErrorNote error={error} />;
  if (!data) return <Loading />;
  const [categories, sources] = data;

  const priceN = parseMoney(price);
  const postageN = parseMoney(postage);
  const allocations = rows.map((r) => parseMoney(r.allocated));
  const total = (priceN ?? 0) + (postageN ?? 0);
  const validNumbers = [priceN, postageN, ...allocations].every((n) => !Number.isNaN(n));
  const split = validNumbers ? splitCost(total, allocations) : null;
  const namesOk = rows.every((r) => r.name.trim());
  const canSave = validNumbers && namesOk && priceN !== null && !split?.overAllocated;

  const updateRow = (key: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (!canSave) return;
    setSaving(true);
    setSaveError(null);
    try {
      const id = await logPurchase(
        { purchased_on: purchasedOn, source: source.trim() || null, price: priceN ?? 0, postage_in: postageN ?? 0, notes: notes.trim() || null },
        rows.map((r, i) => {
          const category = categories.find((c) => c.id === r.category_id);
          return {
            name: r.name.trim(),
            category_id: r.category_id || null,
            contents: r.contents.trim() || null,
            condition: r.condition.trim() || null,
            field_values: category ? cleanFieldValues(category.category_fields, r.field_values) : {},
            allocated_cost: allocations[i] ?? null,
          };
        }),
      );
      navigate(`/purchases/${id}?new=1`, { replace: true });
    } catch (err) {
      setSaveError(errorMessage(err));
      setSaving(false);
    }
  }

  return (
    <div className="page" style={{ maxWidth: 860 }}>
      <Link to="/purchases" className="back-link">
        ← Purchases
      </Link>
      <PageHeader title="Log purchase" />

      <form className="stack" onSubmit={onSubmit} noValidate>
        <section className="card">
          <div className="form-grid">
            <label className="field">
              <span className="field-label">Date</span>
              <input className="input" type="date" value={purchasedOn} onChange={(e) => setPurchasedOn(e.target.value)} />
            </label>
            <label className="field">
              <span className="field-label">Source</span>
              <input className="input" list="sources" value={source} placeholder="e.g. eBay, car boot" onChange={(e) => setSource(e.target.value)} />
              <datalist id="sources">
                {sources.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </label>
            <label className="field">
              <span className="field-label">Price paid</span>
              <input
                className="input"
                inputMode="decimal"
                placeholder="£"
                value={price}
                aria-invalid={Number.isNaN(priceN) || (submitted && priceN === null)}
                onChange={(e) => setPrice(e.target.value)}
              />
              {submitted && priceN === null && <span className="field-error">Enter the price paid (0 if free).</span>}
            </label>
            <label className="field">
              <span className="field-label">Postage in</span>
              <input
                className="input"
                inputMode="decimal"
                placeholder="£"
                value={postage}
                aria-invalid={Number.isNaN(postageN)}
                onChange={(e) => setPostage(e.target.value)}
              />
            </label>
            <label className="field span-2">
              <span className="field-label">Notes</span>
              <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </label>
          </div>
        </section>

        <section className="stack">
          <div className="section-head" style={{ margin: 0 }}>
            <h2 className="section-title">Items in this purchase</h2>
            <span className="muted" style={{ fontSize: 14 }}>
              Total {money(total)}
            </span>
          </div>

          {rows.map((r, i) => {
            const category = categories.find((c) => c.id === r.category_id);
            const alloc = allocations[i];
            return (
              <div key={r.key} className={`card ${styles.itemCard}`}>
                <div className={styles.itemHead}>
                  <span className={styles.itemNo}>Item {i + 1}</span>
                  <span className="muted">
                    {split && !Number.isNaN(alloc) ? `Share ${money(split.shares[i])}${alloc === null ? ' (equal)' : ''}` : ''}
                  </span>
                  {rows.length > 1 && (
                    <button type="button" className="link-button danger" onClick={() => setRows(rows.filter((x) => x.key !== r.key))}>
                      Remove
                    </button>
                  )}
                </div>
                <div className="form-grid">
                  <label className="field span-2">
                    <span className="field-label">Name</span>
                    <input
                      className="input input-sm"
                      value={r.name}
                      placeholder="e.g. Srixon P–5 irons"
                      aria-invalid={submitted && !r.name.trim()}
                      onChange={(e) => updateRow(r.key, { name: e.target.value })}
                    />
                  </label>
                  <label className="field">
                    <span className="field-label">Category</span>
                    <select className="input input-sm" value={r.category_id} onChange={(e) => updateRow(r.key, { category_id: e.target.value })}>
                      <option value="">None</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span className="field-label">Contents</span>
                    <input className="input input-sm" value={r.contents} placeholder="e.g. 5–PW" onChange={(e) => updateRow(r.key, { contents: e.target.value })} />
                  </label>
                  {category && (
                    <FieldValuesEditor
                      fields={category.category_fields}
                      values={r.field_values}
                      idPrefix={`row${r.key}`}
                      small
                      onChange={(v) => updateRow(r.key, { field_values: v })}
                    />
                  )}
                  <label className="field">
                    <span className="field-label">Condition</span>
                    <input className="input input-sm" list="conditions" value={r.condition} onChange={(e) => updateRow(r.key, { condition: e.target.value })} />
                  </label>
                  <label className="field">
                    <span className="field-label">Allocated cost</span>
                    <input
                      className="input input-sm"
                      inputMode="decimal"
                      placeholder="Blank = equal share"
                      value={r.allocated}
                      aria-invalid={Number.isNaN(alloc)}
                      onChange={(e) => updateRow(r.key, { allocated: e.target.value })}
                    />
                  </label>
                </div>
              </div>
            );
          })}
          <datalist id="conditions">
            {CONDITIONS.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>

          <button type="button" className="btn btn-secondary" style={{ alignSelf: 'flex-start' }} onClick={() => setRows([...rows, newRow()])}>
            + Another item
          </button>
        </section>

        {split?.overAllocated && (
          <p className="alert alert-error" role="alert">
            Allocated {money(split.allocated)} is more than the purchase total of {money(total)}.
          </p>
        )}
        {!validNumbers && (
          <p className="alert alert-error" role="alert">
            Check the amounts: use numbers like 45 or 45.50.
          </p>
        )}
        {submitted && !namesOk && (
          <p className="alert alert-error" role="alert">
            Every item needs a name.
          </p>
        )}
        <ErrorNote error={saveError} />

        <div className="form-actions">
          <button className="btn btn-primary" type="submit" disabled={saving}>
            {saving ? 'Saving…' : `Save purchase and ${rows.length} item${rows.length === 1 ? '' : 's'}`}
          </button>
          <Link to="/purchases" className="btn btn-secondary">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
