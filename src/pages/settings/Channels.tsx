import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { Empty, ErrorNote, Loading } from '../../components/ui';
import { PageHeader } from '../../layout/PageHeader';
import { createChannel, deleteChannel, listChannels, updateChannel } from '../../lib/api';
import { moneyInput, parseMoney } from '../../lib/format';
import type { Channel } from '../../lib/types';
import { errorMessage, useAsync } from '../../lib/useAsync';

function parsePercent(input: string): number {
  const s = input.replace('%', '').trim();
  if (s === '') return 0;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : Number.NaN;
}

export function Channels() {
  const { data, error, loading, reload } = useAsync(listChannels, []);
  const [actionError, setActionError] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>) {
    setActionError(null);
    try {
      await action();
      reload();
    } catch (err) {
      setActionError(
        errorMessage(err).includes('foreign key') ? 'This channel has listings or sales, so it cannot be deleted.' : errorMessage(err),
      );
    }
  }

  return (
    <div className="page" style={{ maxWidth: 760 }}>
      <Link to="/settings" className="back-link">
        ← Settings
      </Link>
      <PageHeader title="Channels" />
      <p className="muted" style={{ margin: 0, fontSize: 14 }}>
        Where you sell: eBay, Facebook, local or club. Fees pre-fill when you record a sale and feed the profit calculator.
      </p>
      <ErrorNote error={error ?? actionError} />
      {loading && !data && <Loading />}
      {data?.length === 0 && <Empty>No channels yet.</Empty>}
      {data?.map((c) => (
        <ChannelRow key={`${c.id}-${c.fee_percent}-${c.fixed_fee}`} channel={c} run={run} />
      ))}
      <ChannelForm onSave={(c) => run(() => createChannel(c))} />
    </div>
  );
}

function ChannelRow({ channel, run }: { channel: Channel; run: (a: () => Promise<unknown>) => Promise<void> }) {
  const [name, setName] = useState(channel.name);
  const [pct, setPct] = useState(String(channel.fee_percent));
  const [fixed, setFixed] = useState(moneyInput(channel.fixed_fee));
  const pctN = parsePercent(pct);
  const fixedN = parseMoney(fixed);
  const dirty = name !== channel.name || pctN !== channel.fee_percent || (fixedN ?? 0) !== channel.fixed_fee;
  const valid = name.trim() && !Number.isNaN(pctN) && !Number.isNaN(fixedN);

  return (
    <form
      className="card row-grid"
      style={{ borderBottom: undefined }}
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) void run(() => updateChannel(channel.id, { name: name.trim(), fee_percent: pctN, fixed_fee: fixedN ?? 0 }));
      }}
    >
      <label className="field">
        <span className="field-label">Name</span>
        <input className="input input-sm" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="field">
        <span className="field-label">Fee %</span>
        <input className="input input-sm" inputMode="decimal" value={pct} aria-invalid={Number.isNaN(pctN)} onChange={(e) => setPct(e.target.value)} />
      </label>
      <label className="field">
        <span className="field-label">Fixed fee per sale</span>
        <input className="input input-sm" inputMode="decimal" value={fixed} aria-invalid={Number.isNaN(fixedN)} onChange={(e) => setFixed(e.target.value)} />
      </label>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', minHeight: 40 }}>
        {dirty ? (
          <button className="btn btn-primary" type="submit" disabled={!valid} style={{ minHeight: 40 }}>
            Save
          </button>
        ) : (
          <button
            type="button"
            className="link-button danger"
            onClick={() => {
              if (window.confirm(`Delete ${channel.name}?`)) void run(() => deleteChannel(channel.id));
            }}
          >
            Delete
          </button>
        )}
      </div>
    </form>
  );
}

function ChannelForm({ onSave }: { onSave: (c: Omit<Channel, 'id'>) => Promise<void> }) {
  const [name, setName] = useState('');
  const [pct, setPct] = useState('');
  const [fixed, setFixed] = useState('');
  const pctN = parsePercent(pct);
  const fixedN = parseMoney(fixed);
  const valid = name.trim() && !Number.isNaN(pctN) && !Number.isNaN(fixedN);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!valid) return;
    await onSave({ name, fee_percent: pctN, fixed_fee: fixedN ?? 0 });
    setName('');
    setPct('');
    setFixed('');
  }

  return (
    <form className="card stack" onSubmit={onSubmit} noValidate>
      <h2 className="section-title">Add channel</h2>
      <div className="row-grid" style={{ borderBottom: 0, paddingBottom: 0 }}>
        <label className="field">
          <span className="field-label">Name</span>
          <input className="input input-sm" value={name} placeholder="e.g. eBay" onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">Fee %</span>
          <input className="input input-sm" inputMode="decimal" value={pct} placeholder="e.g. 12.8" aria-invalid={Number.isNaN(pctN)} onChange={(e) => setPct(e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">Fixed fee per sale</span>
          <input className="input input-sm" inputMode="decimal" value={fixed} placeholder="£" aria-invalid={Number.isNaN(fixedN)} onChange={(e) => setFixed(e.target.value)} />
        </label>
        <button className="btn btn-secondary" type="submit" disabled={!valid} style={{ minHeight: 40 }}>
          Add
        </button>
      </div>
    </form>
  );
}
