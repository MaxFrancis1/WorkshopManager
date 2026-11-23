import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { cleanFieldValues, FieldValuesEditor } from '../../components/FieldValuesEditor';
import { ErrorNote, Loading, ShortId } from '../../components/ui';
import { PageHeader } from '../../layout/PageHeader';
import { createItem, deleteItem, getItem, listCategories, listPurchases, updateItem, type ItemInput } from '../../lib/api';
import { date, money, moneyInput, parseMoney } from '../../lib/format';
import { ITEM_STATUSES, STATUS_LABELS, type FieldValues, type Item, type ItemStatus } from '../../lib/types';
import { errorMessage, useAsync } from '../../lib/useAsync';

export const CONDITIONS = ['New', 'Excellent', 'Very good', 'Good', 'Fair', 'Poor'];

/** Add a single item (/items/new, optionally ?purchase=id) or edit one (/items/:id/edit). */
export function ItemForm() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const editing = Boolean(id);

  const { data, error } = useAsync(
    () => Promise.all([listCategories(), listPurchases(), id ? getItem(id) : Promise.resolve(null)]),
    [id],
  );

  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Initialise the form once data arrives.
  useEffect(() => {
    if (!data || form) return;
    const item = data[2];
    setForm(item ? fromItem(item) : { ...EMPTY, purchase_id: params.get('purchase') ?? '' });
  }, [data, form, params]);

  if (error) return <ErrorNote error={error} />;
  if (!data || !form) return <Loading />;

  const [categories, purchases, item] = data;
  if (editing && !item) return <p>Item not found.</p>;

  const category = categories.find((c) => c.id === form.category_id);
  const allocated = parseMoney(form.allocated_cost);
  const allocatedInvalid = Number.isNaN(allocated);
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm({ ...form, [key]: value });

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form || !form.name.trim() || allocatedInvalid) return;
    setSaving(true);
    setSaveError(null);
    const input: ItemInput = {
      name: form.name.trim(),
      category_id: form.category_id || null,
      contents: form.contents.trim() || null,
      field_values: category ? cleanFieldValues(category.category_fields, form.field_values) : {},
      condition: form.condition.trim() || null,
      purchase_id: form.purchase_id || null,
      allocated_cost: form.purchase_id ? allocated : null,
      notes: form.notes.trim() || null,
    };
    try {
      if (item) {
        await updateItem(item.id, { ...input, status: form.status });
        navigate(`/items/${item.id}`);
      } else {
        const created = await createItem(input);
        navigate(`/items/${created.id}`);
      }
    } catch (err) {
      setSaveError(errorMessage(err));
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!item) return;
    if (!window.confirm(`Delete ${item.short_id} ${item.name}? This cannot be undone.`)) return;
    try {
      await deleteItem(item.id);
      navigate('/items', { replace: true });
    } catch (err) {
      setSaveError(errorMessage(err));
    }
  }

  return (
    <div className="page" style={{ maxWidth: 760 }}>
      <Link to={item ? `/items/${item.id}` : '/items'} className="back-link">
        ← {item ? item.name : 'Items'}
      </Link>
      <PageHeader title={item ? 'Edit item' : 'Add item'} actions={item && <ShortId id={item.short_id} large dark />} />
      {!item && (
        <p className="muted" style={{ margin: 0, fontSize: 14 }}>
          Bought several things at once? <Link to="/purchases/new">Log a purchase</Link> instead, to add them all and split the cost.
        </p>
      )}

      <form className="card stack" onSubmit={onSubmit} noValidate>
        <div className="form-grid">
          <label className="field span-2">
            <span className="field-label">Name</span>
            <input className="input" required value={form.name} placeholder="e.g. Srixon P–5 irons" onChange={(e) => set('name', e.target.value)} />
          </label>

          <label className="field">
            <span className="field-label">Category</span>
            <select className="input" value={form.category_id} onChange={(e) => set('category_id', e.target.value)}>
              <option value="">None</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <span className="field-hint">
              <Link to="/settings/categories">Manage categories</Link>
            </span>
          </label>

          <label className="field">
            <span className="field-label">Contents</span>
            <input className="input" value={form.contents} placeholder="e.g. 5–PW" onChange={(e) => set('contents', e.target.value)} />
          </label>

          {category && (
            <FieldValuesEditor fields={category.category_fields} values={form.field_values} onChange={(v) => set('field_values', v)} />
          )}

          <label className="field">
            <span className="field-label">Condition</span>
            <input className="input" list="conditions" value={form.condition} onChange={(e) => set('condition', e.target.value)} />
            <datalist id="conditions">
              {CONDITIONS.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </label>

          {item && (
            <label className="field">
              <span className="field-label">Status</span>
              <select className="input" value={form.status} onChange={(e) => set('status', e.target.value as ItemStatus)}>
                {ITEM_STATUSES.map((s) => (
                  <option key={s} value={s} disabled={s === 'sold' && item.status !== 'sold'}>
                    {STATUS_LABELS[s]}
                    {s === 'sold' && item.status !== 'sold' ? ' (use Mark sold)' : ''}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="field span-2">
            <span className="field-label">Purchase</span>
            <select className="input" value={form.purchase_id} onChange={(e) => set('purchase_id', e.target.value)}>
              <option value="">Not linked to a purchase</option>
              {purchases.map((p) => (
                <option key={p.id} value={p.id}>
                  {date(p.purchased_on)} · {p.source || 'No source'} · {money(p.price + p.postage_in)}
                </option>
              ))}
            </select>
          </label>

          {form.purchase_id && (
            <label className="field span-2">
              <span className="field-label">Cost allocated to this item</span>
              <input
                className="input"
                inputMode="decimal"
                placeholder="Blank = equal share"
                aria-invalid={allocatedInvalid}
                value={form.allocated_cost}
                onChange={(e) => set('allocated_cost', e.target.value)}
              />
              {allocatedInvalid ? (
                <span className="field-error">Enter an amount like 45 or 45.50.</span>
              ) : (
                <span className="field-hint">
                  Leave blank to share whatever the purchase has not allocated equally with its other blank items.
                </span>
              )}
            </label>
          )}

          <label className="field span-2">
            <span className="field-label">Notes</span>
            <textarea className="input" value={form.notes} onChange={(e) => set('notes', e.target.value)} />
          </label>
        </div>

        <ErrorNote error={saveError} />

        <div className="form-actions">
          <button className="btn btn-primary" type="submit" disabled={saving || !form.name.trim() || allocatedInvalid}>
            {saving ? 'Saving…' : item ? 'Save changes' : 'Add item'}
          </button>
          <Link to={item ? `/items/${item.id}` : '/items'} className="btn btn-secondary">
            Cancel
          </Link>
          <span className="spacer" />
          {item && (
            <button type="button" className="link-button danger" onClick={() => void onDelete()}>
              Delete item
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

interface FormState {
  name: string;
  category_id: string;
  contents: string;
  field_values: FieldValues;
  condition: string;
  status: ItemStatus;
  purchase_id: string;
  allocated_cost: string;
  notes: string;
}

const EMPTY: FormState = {
  name: '',
  category_id: '',
  contents: '',
  field_values: {},
  condition: '',
  status: 'in_stock',
  purchase_id: '',
  allocated_cost: '',
  notes: '',
};

function fromItem(item: Item): FormState {
  return {
    name: item.name,
    category_id: item.category_id ?? '',
    contents: item.contents ?? '',
    field_values: item.field_values ?? {},
    condition: item.condition ?? '',
    status: item.status,
    purchase_id: item.purchase_id ?? '',
    allocated_cost: moneyInput(item.allocated_cost),
    notes: item.notes ?? '',
  };
}
