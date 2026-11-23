import { useState, type FormEvent } from 'react';
import { Empty, ErrorNote, Loading } from '../components/ui';
import { PageHeader } from '../layout/PageHeader';
import { addOverhead, deleteOverhead, listOverheads } from '../lib/api';
import { date, money, parseMoney, todayIso } from '../lib/format';
import { errorMessage, useAsync } from '../lib/useAsync';

const monthFmt = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' });

export function Overheads() {
  const { data, error, loading, reload } = useAsync(listOverheads, []);
  const [desc, setDesc] = useState('');
  const [amount, setAmount] = useState('');
  const [on, setOn] = useState(todayIso());
  const [actionError, setActionError] = useState<string | null>(null);
  const amountN = parseMoney(amount);
  const valid = desc.trim() && amountN !== null && !Number.isNaN(amountN);

  async function run(action: () => Promise<unknown>) {
    setActionError(null);
    try {
      await action();
      reload();
    } catch (err) {
      setActionError(errorMessage(err));
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!valid) return;
    await run(async () => {
      await addOverhead({ description: desc, amount: amountN ?? 0, spent_on: on });
      setDesc('');
      setAmount('');
    });
  }

  // Group by month, newest first.
  const groups = new Map<string, { label: string; total: number; rows: NonNullable<typeof data> }>();
  for (const o of data ?? []) {
    const key = o.spent_on.slice(0, 7);
    if (!groups.has(key)) {
      const [y, m] = key.split('-').map(Number);
      groups.set(key, { label: monthFmt.format(new Date(y!, m! - 1, 1)), total: 0, rows: [] });
    }
    const g = groups.get(key)!;
    g.total += o.amount;
    g.rows.push(o);
  }

  return (
    <div className="page" style={{ maxWidth: 760 }}>
      <PageHeader title="Overheads" />
      <p className="muted" style={{ margin: 0, fontSize: 14 }}>
        Costs not tied to one item, such as tools or bulk solvent. They come off profit on the dashboard.
      </p>

      <form className="card row-grid" style={{ borderBottom: undefined }} onSubmit={onSubmit} noValidate>
        <label className="field">
          <span className="field-label">What</span>
          <input className="input input-sm" value={desc} placeholder="e.g. Grip vice" onChange={(e) => setDesc(e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">Amount</span>
          <input className="input input-sm" inputMode="decimal" placeholder="£" value={amount} aria-invalid={Number.isNaN(amountN)} onChange={(e) => setAmount(e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">Date</span>
          <input className="input input-sm" type="date" value={on} onChange={(e) => setOn(e.target.value)} />
        </label>
        <button className="btn btn-primary" type="submit" disabled={!valid} style={{ minHeight: 40 }}>
          Add
        </button>
      </form>

      <ErrorNote error={error ?? actionError} />
      {loading && !data && <Loading />}
      {data?.length === 0 && <Empty>No overheads logged.</Empty>}

      {[...groups.entries()].map(([key, g]) => (
        <section key={key} className="card">
          <div className="section-head">
            <h2 className="section-title">{g.label}</h2>
            <span style={{ fontWeight: 700 }}>{money(g.total)}</span>
          </div>
          <div className="table-wrap">
            <table className="table">
              <tbody>
                {g.rows.map((o) => (
                  <tr key={o.id}>
                    <td className="muted" style={{ width: 110 }}>
                      {date(o.spent_on)}
                    </td>
                    <td>{o.description}</td>
                    <td className="num" style={{ fontWeight: 600 }}>
                      {money(o.amount)}
                    </td>
                    <td className="num" style={{ width: 40 }}>
                      <button
                        type="button"
                        className="link-button danger"
                        aria-label={`Delete ${o.description}`}
                        onClick={() => {
                          if (window.confirm(`Delete "${o.description}"?`)) void run(() => deleteOverhead(o.id));
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
        </section>
      ))}
    </div>
  );
}
