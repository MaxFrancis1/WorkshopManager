import { useState } from 'react';
import { createSource } from '../lib/api';
import type { Source } from '../lib/types';
import { errorMessage } from '../lib/useAsync';

const NEW = '__new__';

interface Props {
  sources: Source[];
  value: string;
  onChange: (sourceId: string) => void;
  /** Called with the new source after it is created inline. */
  onCreated: (source: Source) => void;
  id?: string;
}

/** Picks a configured purchase source, with "Add new source…" to create one on the spot. */
export function SourceSelect({ sources, value, onChange, onCreated, id }: Props) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function add() {
    const trimmed = name.trim();
    if (!trimmed) return;
    const existing = sources.find((s) => s.name.toLowerCase() === trimmed.toLowerCase());
    if (existing) {
      onChange(existing.id);
      setAdding(false);
      setName('');
      return;
    }
    try {
      const created = await createSource(trimmed);
      onCreated(created);
      onChange(created.id);
      setAdding(false);
      setName('');
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  if (adding) {
    return (
      <div className="stack" style={{ gap: 6 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            className="input"
            style={{ flex: 1 }}
            autoFocus
            placeholder="e.g. Car boot, Present"
            aria-label="New source name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void add();
              }
              if (e.key === 'Escape') setAdding(false);
            }}
          />
          <button type="button" className="btn btn-primary" disabled={!name.trim()} onClick={() => void add()}>
            Add
          </button>
          <button type="button" className="link-button" onClick={() => setAdding(false)}>
            Cancel
          </button>
        </div>
        {error && <span className="field-error">{error}</span>}
      </div>
    );
  }

  return (
    <select
      id={id}
      className="input"
      value={value}
      onChange={(e) => {
        if (e.target.value === NEW) setAdding(true);
        else onChange(e.target.value);
      }}
    >
      <option value="">No source</option>
      {sources.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
      <option value={NEW}>+ Add new source…</option>
    </select>
  );
}
