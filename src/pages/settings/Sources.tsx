import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { Empty, ErrorNote, Loading } from '../../components/ui';
import { PageHeader } from '../../layout/PageHeader';
import { countPurchasesBySource, createSource, deleteSource, listSources, renameSource } from '../../lib/api';
import type { Source } from '../../lib/types';
import { errorMessage, useAsync } from '../../lib/useAsync';

export function Sources() {
  const { data, error, loading, reload } = useAsync(() => Promise.all([listSources(), countPurchasesBySource()]), []);
  const [name, setName] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>) {
    setActionError(null);
    try {
      await action();
      reload();
    } catch (err) {
      const msg = errorMessage(err);
      setActionError(msg.includes('duplicate key') ? 'There is already a source with that name.' : msg);
    }
  }

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    await run(async () => {
      await createSource(name);
      setName('');
    });
  }

  return (
    <div className="page" style={{ maxWidth: 640 }}>
      <Link to="/settings" className="back-link">
        ← Settings
      </Link>
      <PageHeader title="Purchase sources" />
      <p className="muted" style={{ margin: 0, fontSize: 14 }}>
        Where you buy from: Facebook, eBay, car boot, auctions, or Present for gifts. Pick one when you log a purchase.
      </p>

      <form className="card" style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }} onSubmit={onAdd}>
        <label className="field" style={{ flex: 1 }}>
          <span className="field-label">New source</span>
          <input className="input input-sm" value={name} placeholder="e.g. Car boot" onChange={(e) => setName(e.target.value)} />
        </label>
        <button className="btn btn-primary" type="submit" style={{ minHeight: 40 }} disabled={!name.trim()}>
          Add
        </button>
      </form>

      <ErrorNote error={error ?? actionError} />
      {loading && !data && <Loading />}
      {data && data[0].length === 0 && <Empty>No sources yet.</Empty>}
      {data && data[0].length > 0 && (
        <section className="card">
          {data[0].map((s) => (
            <SourceRow key={`${s.id}-${s.name}`} source={s} uses={data[1][s.id] ?? 0} run={run} />
          ))}
        </section>
      )}
    </div>
  );
}

function SourceRow({ source, uses, run }: { source: Source; uses: number; run: (a: () => Promise<unknown>) => Promise<void> }) {
  const [name, setName] = useState(source.name);
  return (
    <div className="kv" style={{ alignItems: 'center' }}>
      <input
        className="input input-sm"
        style={{ maxWidth: 260, fontWeight: 600 }}
        aria-label="Source name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => {
          if (name.trim() && name.trim() !== source.name) void run(() => renameSource(source.id, name));
          else setName(source.name);
        }}
      />
      <span style={{ display: 'flex', gap: 12, alignItems: 'center', fontWeight: 400 }}>
        <span className="muted" style={{ fontSize: 13 }}>
          {uses} purchase{uses === 1 ? '' : 's'}
        </span>
        {uses === 0 && (
          <button
            type="button"
            className="link-button danger"
            onClick={() => {
              if (window.confirm(`Delete "${source.name}"?`)) void run(() => deleteSource(source.id));
            }}
          >
            Delete
          </button>
        )}
      </span>
    </div>
  );
}
