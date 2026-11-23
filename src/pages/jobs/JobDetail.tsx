import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ItemPicker } from '../../components/ItemPicker';
import { ErrorNote, Loading, ShortId, StatusBadge } from '../../components/ui';
import { WorkLinesTable } from '../../components/WorkLinesTable';
import {
  addJobItems,
  deleteJob,
  deleteWorkLine,
  getJob,
  getJobTotals,
  listItemCosts,
  listItems,
  listJobItemIds,
  listPartStock,
  listServices,
  listWorkLinesForJob,
  removeJobItem,
  updateJob,
} from '../../lib/api';
import { hours, money, moneyInput, parseMoney } from '../../lib/format';
import { ACTIVE_STATUSES, JOB_KIND_LABELS, JOB_STATUSES, JOB_STATUS_LABELS, type Job, type JobStatus } from '../../lib/types';
import { errorMessage, useAsync } from '../../lib/useAsync';

export function JobDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { data, error, loading, reload } = useAsync(
    () =>
      Promise.all([
        getJob(id),
        getJobTotals(id),
        listJobItemIds(id),
        listItems(),
        listItemCosts(),
        listWorkLinesForJob(id),
        listServices(),
        listPartStock(),
      ]),
    [id],
  );
  const [adding, setAdding] = useState<string[] | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  if (error) return <ErrorNote error={error} />;
  if (loading && !data) return <Loading />;
  const [job, totals, itemIds, items, costs, lines, services, parts] = data!;
  if (!job) return <p>Job not found.</p>;

  const jobItems = items.filter((i) => itemIds.includes(i.id));
  const costById = new Map(costs.map((c) => [c.item_id, c]));
  const itemsCost = jobItems.reduce((s, i) => s + (costById.get(i.id)?.total_cost ?? 0), 0);
  const labourMinutes = totals?.labour_minutes ?? 0;
  const unsold = jobItems.filter((i) => ACTIVE_STATUSES.includes(i.status));

  async function run(action: () => Promise<unknown>) {
    setActionError(null);
    try {
      await action();
      reload();
    } catch (err) {
      setActionError(errorMessage(err));
    }
  }

  const label = (itemId: string) => {
    const i = items.find((x) => x.id === itemId);
    return i ? `${i.short_id} · ${i.name}` : '';
  };

  return (
    <div className="page" style={{ maxWidth: 960 }}>
      <Link to="/jobs" className="back-link">
        ← Jobs
      </Link>
      <header className="page-header">
        <div className="page-header-text">
          <span className="page-header-date">{JOB_KIND_LABELS[job.kind]} job</span>
          <h1 className="page-title">{job.title || `${JOB_KIND_LABELS[job.kind]} job`}</h1>
        </div>
        <div className="page-header-actions">
          <select
            className="input input-sm"
            aria-label="Job status"
            value={job.status}
            onChange={(e) => void run(() => updateJob(job.id, { status: e.target.value as JobStatus }))}
          >
            {JOB_STATUSES.map((s) => (
              <option key={s} value={s}>
                {JOB_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
      </header>

      <section className="tiles">
        <div className="tile">
          <span className="tile-label">Cost of items</span>
          <span className="tile-value">{money(itemsCost)}</span>
          <span className="tile-sub">{jobItems.length} items, incl. work</span>
        </div>
        <div className="tile">
          <span className="tile-label">Target price</span>
          <span className="tile-value">{money(job.target_price)}</span>
          <span className="tile-sub">
            {job.target_price !== null ? `${money(job.target_price - itemsCost)} before fees and postage` : 'Not set'}
          </span>
        </div>
        <div className="tile">
          <span className="tile-label">Labour</span>
          <span className="tile-value">~{hours(labourMinutes)}</span>
          <span className="tile-sub">{totals?.labour_cost !== null && totals?.labour_cost !== undefined ? `at ${money(totals.labour_cost)}` : 'On this job'}</span>
        </div>
      </section>

      <ErrorNote error={actionError} />

      <section className="card">
        <div className="section-head">
          <h2 className="section-title">Items</h2>
          <button type="button" className="link-button" onClick={() => setAdding(adding ? null : [])}>
            {adding ? 'Cancel' : '+ Add items'}
          </button>
        </div>
        {adding && (
          <div className="stack" style={{ marginBottom: 14 }}>
            <ItemPicker items={items.filter((i) => ACTIVE_STATUSES.includes(i.status))} exclude={itemIds} selected={adding} onChange={setAdding} />
            <button
              type="button"
              className="btn btn-primary"
              style={{ alignSelf: 'flex-start' }}
              disabled={adding.length === 0}
              onClick={() =>
                void run(async () => {
                  await addJobItems(job.id, adding);
                  setAdding(null);
                })
              }
            >
              Add {adding.length || ''} to job
            </button>
          </div>
        )}
        {jobItems.length === 0 ? (
          <p className="muted" style={{ margin: 0, fontSize: 14 }}>
            No items yet.
          </p>
        ) : (
          <div className="list">
            {jobItems.map((i) => (
              <div key={i.id} className="list-row" style={{ padding: 10 }}>
                <ShortId id={i.short_id} />
                <Link to={`/items/${i.id}`} className="list-row-main" style={{ color: 'inherit', textDecoration: 'none' }}>
                  <span className="list-row-title">{i.name}</span>
                </Link>
                <StatusBadge status={i.status} />
                <span style={{ fontWeight: 600, fontSize: 14 }}>{money(costById.get(i.id)?.total_cost)}</span>
                <button
                  type="button"
                  className="link-button danger"
                  aria-label={`Remove ${i.short_id} from job`}
                  onClick={() => void run(() => removeJobItem(job.id, i.id))}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card">
        <div className="section-head">
          <h2 className="section-title">Work on this job</h2>
          {jobItems.length > 0 && (
            <Link to={`/jobs/${job.id}/add-service`} className="btn btn-secondary">
              + Add service to all items
            </Link>
          )}
        </div>
        {lines.length === 0 ? (
          <p className="muted" style={{ margin: 0, fontSize: 14 }}>
            No work yet. Add a service to every item here, or to one item from its own page.
          </p>
        ) : (
          <WorkLinesTable
            lines={lines}
            services={services}
            parts={parts}
            itemLabel={label}
            onDelete={(l) => {
              if (window.confirm('Remove this work line? Its parts go back into stock.')) void run(() => deleteWorkLine(l.id));
            }}
          />
        )}
      </section>

      {unsold.length > 1 && (
        <section className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14 }}>Selling these together? Record one sale for the lot.</span>
          <Link to={`/sales/new?items=${unsold.map((i) => i.id).join(',')}`} className="btn btn-primary">
            Sell as a lot
          </Link>
        </section>
      )}

      <JobFields key={`${job.id}-${job.target_price}-${job.title}`} job={job} onSaved={reload} />

      <div>
        <button
          type="button"
          className="link-button danger"
          onClick={async () => {
            if (!window.confirm('Delete this job? Its items and their work lines are kept.')) return;
            try {
              await deleteJob(job.id);
              navigate('/jobs', { replace: true });
            } catch (err) {
              setActionError(errorMessage(err));
            }
          }}
        >
          Delete job
        </button>
      </div>
    </div>
  );
}

function JobFields({ job, onSaved }: { job: Job; onSaved: () => void }) {
  const [title, setTitle] = useState(job.title ?? '');
  const [target, setTarget] = useState(moneyInput(job.target_price));
  const [notes, setNotes] = useState(job.notes ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const targetN = parseMoney(target);

  return (
    <form
      className="card stack"
      noValidate
      onChange={() => setSaved(false)}
      onSubmit={async (e) => {
        e.preventDefault();
        if (Number.isNaN(targetN)) return;
        try {
          await updateJob(job.id, { title: title.trim() || null, target_price: targetN, notes: notes.trim() || null });
          setSaved(true);
          onSaved();
        } catch (err) {
          setError(errorMessage(err));
        }
      }}
    >
      <h2 className="section-title">Job details</h2>
      <div className="form-grid">
        <label className="field">
          <span className="field-label">Title</span>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">Target price</span>
          <input className="input" inputMode="decimal" value={target} aria-invalid={Number.isNaN(targetN)} onChange={(e) => setTarget(e.target.value)} />
        </label>
        <label className="field span-2">
          <span className="field-label">Notes</span>
          <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
      </div>
      <ErrorNote error={error} />
      <div className="form-actions">
        <button className="btn btn-secondary" type="submit" disabled={Number.isNaN(targetN)}>
          Save details
        </button>
        {saved && <span className="muted">Saved.</span>}
      </div>
    </form>
  );
}
