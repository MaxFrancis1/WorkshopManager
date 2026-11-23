import type { CategoryField, FieldValues } from '../lib/types';

interface Props {
  fields: CategoryField[];
  values: FieldValues;
  onChange: (values: FieldValues) => void;
  /** Prefix for input ids when several editors share a page. */
  idPrefix?: string;
  small?: boolean;
}

/** Inputs for a category's custom fields. Values are keyed by field id. */
export function FieldValuesEditor({ fields, values, onChange, idPrefix = 'cf', small }: Props) {
  if (fields.length === 0) return null;
  const set = (id: string, v: string) => onChange({ ...values, [id]: v });
  const cls = small ? 'input input-sm' : 'input';

  return (
    <>
      {fields.map((f) => {
        const id = `${idPrefix}-${f.id}`;
        const value = values[f.id] ?? '';
        return (
          <label key={f.id} className="field" htmlFor={id}>
            <span className="field-label">{f.name}</span>
            {f.kind === 'select' ? (
              <select id={id} className={cls} value={value} onChange={(e) => set(f.id, e.target.value)}>
                <option value="">—</option>
                {/* Keep a stored value that is no longer in the options list. */}
                {value && !f.options.includes(value) && <option value={value}>{value}</option>}
                {f.options.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id={id}
                className={cls}
                inputMode={f.kind === 'number' ? 'decimal' : undefined}
                value={value}
                onChange={(e) => set(f.id, e.target.value)}
              />
            )}
          </label>
        );
      })}
    </>
  );
}

/** Drops empty values and values for fields not in this category. */
export function cleanFieldValues(fields: CategoryField[], values: FieldValues): FieldValues {
  const out: FieldValues = {};
  for (const f of fields) {
    const v = values[f.id]?.trim();
    if (v) out[f.id] = v;
  }
  return out;
}

/** "Shaft: KBS Tour · Flex: Stiff" style pairs, in field order, skipping blanks. */
export function fieldPairs(fields: CategoryField[], values: FieldValues): { name: string; value: string }[] {
  return fields.filter((f) => values[f.id]).map((f) => ({ name: f.name, value: values[f.id]! }));
}
