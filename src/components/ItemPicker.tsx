import { useState } from 'react';
import type { Item } from '../lib/types';
import { SearchIcon, ShortId, StatusBadge } from './ui';

interface Props {
  items: Item[];
  selected: string[];
  onChange: (ids: string[]) => void;
  /** Item ids that cannot be picked (already in the job, already sold…). */
  exclude?: string[];
}

/** Searchable multi-select of items by short ID or name. */
export function ItemPicker({ items, selected, onChange, exclude = [] }: Props) {
  const [q, setQ] = useState('');
  const query = q.trim().toLowerCase();
  const pickable = items.filter((i) => !exclude.includes(i.id));
  const matches = pickable
    .filter((i) => !query || i.short_id.toLowerCase().startsWith(query) || i.name.toLowerCase().includes(query))
    .slice(0, 30);

  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);

  return (
    <div className="stack" style={{ gap: 8 }}>
      <label className="search">
        <SearchIcon />
        <span className="sr-only">Find items by ID or name</span>
        <input type="search" placeholder="ID or name" autoCapitalize="characters" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      {pickable.length === 0 && <p className="muted" style={{ margin: 0, fontSize: 14 }}>No items available.</p>}
      <div className="stack" style={{ gap: 6, maxHeight: 320, overflowY: 'auto' }}>
        {matches.map((i) => (
          <label key={i.id} className="radio-card" style={{ minHeight: 48 }}>
            <input type="checkbox" checked={selected.includes(i.id)} onChange={() => toggle(i.id)} />
            <ShortId id={i.short_id} />
            <span className="radio-card-main">{i.name}</span>
            <StatusBadge status={i.status} />
          </label>
        ))}
      </div>
      {selected.length > 0 && (
        <span className="field-hint">
          {selected.length} selected
        </span>
      )}
    </div>
  );
}
