import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { Empty, ErrorNote, Loading } from '../../components/ui';
import { PageHeader } from '../../layout/PageHeader';
import {
  countItemsInCategory,
  createCategory,
  createField,
  deleteCategory,
  deleteField,
  listCategories,
  renameCategory,
  updateField,
} from '../../lib/api';
import type { Category, CategoryField, FieldKind } from '../../lib/types';
import { errorMessage, useAsync } from '../../lib/useAsync';
import styles from './Categories.module.css';

const KIND_LABELS: Record<FieldKind, string> = { text: 'Text', number: 'Number', select: 'Choice' };

/** Comma-separated options, trimmed and de-duplicated. */
function parseOptions(input: string): string[] {
  return [...new Set(input.split(',').map((o) => o.trim()).filter(Boolean))];
}

export function Categories() {
  const { data, error, loading, reload } = useAsync(listCategories, []);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>) {
    setActionError(null);
    try {
      await action();
      reload();
    } catch (err) {
      setActionError(errorMessage(err));
    }
  }

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setBusy(true);
    await run(async () => {
      await createCategory(newName);
      setNewName('');
    });
    setBusy(false);
  }

  return (
    <div className="page">
      <Link to="/settings" className="back-link">
        ← Settings
      </Link>
      <PageHeader title="Categories" />
      <p className="muted" style={{ margin: 0, fontSize: 14 }}>
        Categories group your items (Iron set, Putter). Custom fields are the details you record for each one,
        such as shaft, flex or loft. They show on the item and in the listing text.
      </p>

      <form className={`card ${styles.addRow}`} onSubmit={onAdd}>
        <label className="field" style={{ flex: 1 }}>
          <span className="field-label">New category</span>
          <input className="input" value={newName} placeholder="e.g. Iron set" onChange={(e) => setNewName(e.target.value)} />
        </label>
        <button className="btn btn-primary" type="submit" disabled={busy || !newName.trim()}>
          Add
        </button>
      </form>

      <ErrorNote error={error ?? actionError} />
      {loading && !data && <Loading />}
      {data && data.length === 0 && <Empty>No categories yet.</Empty>}
      {data?.map((c) => (
        <CategoryCard key={c.id} category={c} run={run} />
      ))}
    </div>
  );
}

function CategoryCard({ category, run }: { category: Category; run: (a: () => Promise<unknown>) => Promise<void> }) {
  const [name, setName] = useState(category.name);
  const fields = category.category_fields;

  async function onDelete() {
    const count = await countItemsInCategory(category.id).catch(() => 0);
    const msg = count
      ? `Delete "${category.name}"? ${count} item${count === 1 ? '' : 's'} will be left without a category, and their custom field values will no longer show.`
      : `Delete "${category.name}"?`;
    if (window.confirm(msg)) await run(() => deleteCategory(category.id));
  }

  async function move(field: CategoryField, dir: -1 | 1) {
    const i = fields.indexOf(field);
    const other = fields[i + dir];
    if (!other) return;
    // Renumber the whole list so ties from older rows cannot block a move.
    const order = fields.slice();
    order[i] = other;
    order[i + dir] = field;
    await run(() => Promise.all(order.map((f, idx) => updateField(f.id, { sort_order: idx }))));
  }

  return (
    <section className="card stack">
      <div className={styles.nameRow}>
        <input
          className={`input input-sm ${styles.nameInput}`}
          aria-label="Category name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            if (name.trim() && name.trim() !== category.name) void run(() => renameCategory(category.id, name));
            else setName(category.name);
          }}
        />
        <button type="button" className="link-button danger" onClick={() => void onDelete()}>
          Delete
        </button>
      </div>

      {fields.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Field</th>
                <th>Type</th>
                <th>Choices</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {fields.map((f, i) => (
                <tr key={f.id}>
                  <td style={{ fontWeight: 600 }}>{f.name}</td>
                  <td>{KIND_LABELS[f.kind]}</td>
                  <td className="muted">{f.kind === 'select' ? f.options.join(', ') : ''}</td>
                  <td className="num" style={{ whiteSpace: 'nowrap' }}>
                    <button type="button" className={styles.iconBtn} aria-label={`Move ${f.name} up`} disabled={i === 0} onClick={() => void move(f, -1)}>
                      ↑
                    </button>
                    <button
                      type="button"
                      className={styles.iconBtn}
                      aria-label={`Move ${f.name} down`}
                      disabled={i === fields.length - 1}
                      onClick={() => void move(f, 1)}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className={`${styles.iconBtn} ${styles.danger}`}
                      aria-label={`Delete ${f.name}`}
                      onClick={() => {
                        if (window.confirm(`Delete the "${f.name}" field? Values already entered on items stop showing.`)) {
                          void run(() => deleteField(f.id));
                        }
                      }}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AddFieldForm categoryId={category.id} nextOrder={fields.length} run={run} />
    </section>
  );
}

function AddFieldForm({
  categoryId,
  nextOrder,
  run,
}: {
  categoryId: string;
  nextOrder: number;
  run: (a: () => Promise<unknown>) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<FieldKind>('text');
  const [options, setOptions] = useState('');
  const optionList = parseOptions(options);
  const valid = name.trim() && (kind !== 'select' || optionList.length > 0);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!valid) return;
    await run(async () => {
      await createField({
        category_id: categoryId,
        name,
        kind,
        options: kind === 'select' ? optionList : [],
        sort_order: nextOrder,
      });
      setName('');
      setOptions('');
      setKind('text');
    });
  }

  return (
    <form className={styles.fieldForm} onSubmit={onSubmit}>
      <label className="field">
        <span className="field-label">Add field</span>
        <input className="input input-sm" value={name} placeholder="e.g. Shaft" onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="field">
        <span className="field-label">Type</span>
        <select className="input input-sm" value={kind} onChange={(e) => setKind(e.target.value as FieldKind)}>
          {Object.entries(KIND_LABELS).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
      </label>
      {kind === 'select' && (
        <label className="field">
          <span className="field-label">Choices, comma separated</span>
          <input className="input input-sm" value={options} placeholder="Regular, Stiff, X-Stiff" onChange={(e) => setOptions(e.target.value)} />
        </label>
      )}
      <button className="btn btn-secondary" type="submit" disabled={!valid}>
        Add field
      </button>
    </form>
  );
}
