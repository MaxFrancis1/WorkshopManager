import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { ItemPicker } from '../../components/ItemPicker';
import { ErrorNote, Loading } from '../../components/ui';
import { PageHeader } from '../../layout/PageHeader';
import { createJob, listItems } from '../../lib/api';
import { parseMoney } from '../../lib/format';
import { ACTIVE_STATUSES, JOB_KINDS, JOB_KIND_LABELS, type JobKind } from '../../lib/types';
import { errorMessage, useAsync } from '../../lib/useAsync';

export function JobNew() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { data: items, error } = useAsync(listItems, []);
  const [kind, setKind] = useState<JobKind>('refurb');
  const [title, setTitle] = useState('');
  const [target, setTarget] = useState('');
  const [notes, setNotes] = useState('');
  const [selected, setSelected] = useState<string[]>(() => (params.get('item') ? [params.get('item')!] : []));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  if (error) return <ErrorNote error={error} />;
  if (!items) return <Loading />;

  const targetN = parseMoney(target);
  const active = items.filter((i) => ACTIVE_STATUSES.includes(i.status));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (Number.isNaN(targetN)) return;
    setSaving(true);
    setSaveError(null);
    try {
      const id = await createJob({ kind, title: title.trim() || null, target_price: targetN, notes: notes.trim() || null }, selected);
      navigate(`/jobs/${id}`, { replace: true });
    } catch (err) {
      setSaveError(errorMessage(err));
      setSaving(false);
    }
  }

  return (
    <div className="page" style={{ maxWidth: 760 }}>
      <Link to="/jobs" className="back-link">
        ← Jobs
      </Link>
      <PageHeader title="New job" />
      <form className="card stack" onSubmit={onSubmit} noValidate>
        <div className="form-grid">
          <label className="field">
            <span className="field-label">Type</span>
            <select className="input" value={kind} onChange={(e) => setKind(e.target.value as JobKind)}>
              {JOB_KINDS.map((k) => (
                <option key={k} value={k}>
                  {JOB_KIND_LABELS[k]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field-label">Title</span>
            <input className="input" value={title} placeholder="e.g. Mixed wedge lot" onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">Target price</span>
            <input className="input" inputMode="decimal" placeholder="£" value={target} aria-invalid={Number.isNaN(targetN)} onChange={(e) => setTarget(e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">Notes</span>
            <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
        </div>
        <div className="stack" style={{ gap: 8 }}>
          <h2 className="section-title">Items</h2>
          <ItemPicker items={active} selected={selected} onChange={setSelected} />
        </div>
        <ErrorNote error={saveError} />
        <div className="form-actions">
          <button className="btn btn-primary" type="submit" disabled={saving || Number.isNaN(targetN)}>
            {saving ? 'Saving…' : 'Create job'}
          </button>
          <Link to="/jobs" className="btn btn-secondary">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
