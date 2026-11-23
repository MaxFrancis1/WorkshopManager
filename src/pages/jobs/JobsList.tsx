import { Link, useSearchParams } from 'react-router';
import { Empty, ErrorNote, Loading, PlusIcon } from '../../components/ui';
import { PageHeader } from '../../layout/PageHeader';
import { listJobs, listJobTotals } from '../../lib/api';
import { date, hours, money } from '../../lib/format';
import { JOB_KIND_LABELS, JOB_STATUS_LABELS, type JobStatus } from '../../lib/types';
import { useAsync } from '../../lib/useAsync';

const OPEN: JobStatus[] = ['open', 'in_progress'];

export function JobsList() {
  const [params, setParams] = useSearchParams();
  const showAll = params.get('all') === '1';
  const { data, error, loading } = useAsync(() => Promise.all([listJobs(), listJobTotals()]), []);

  if (error) return <ErrorNote error={error} />;
  if (loading && !data) return <Loading />;
  const [jobs, totals] = data!;
  const totalsById = new Map(totals.map((t) => [t.job_id, t]));
  const openCount = jobs.filter((j) => OPEN.includes(j.status)).length;
  const visible = showAll ? jobs : jobs.filter((j) => OPEN.includes(j.status));

  return (
    <div className="page">
      <PageHeader
        title="Jobs"
        actions={
          <Link to="/jobs/new" className="btn btn-primary desktop-only">
            + New job
          </Link>
        }
      />
      <div className="chips" role="group" aria-label="Filter jobs">
        <button type="button" className="chip" aria-pressed={!showAll} onClick={() => setParams({}, { replace: true })}>
          Open {openCount}
        </button>
        <button type="button" className="chip" aria-pressed={showAll} onClick={() => setParams({ all: '1' }, { replace: true })}>
          All {jobs.length}
        </button>
      </div>

      {visible.length === 0 && (
        <Empty>
          {jobs.length === 0 ? (
            <>
              A job groups work on one or more items: a refurb, building a lot from several purchases, or customising.{' '}
              <Link to="/jobs/new">Start a job</Link>.
            </>
          ) : (
            'No open jobs.'
          )}
        </Empty>
      )}

      <div className="list">
        {visible.map((j) => {
          const t = totalsById.get(j.id);
          return (
            <Link key={j.id} to={`/jobs/${j.id}`} className="list-row">
              <div className="list-row-main">
                <span className="list-row-title">{j.title || `${JOB_KIND_LABELS[j.kind]} job`}</span>
                <span className="list-row-meta">
                  {JOB_KIND_LABELS[j.kind]} · {t?.item_count ?? 0} item{t?.item_count === 1 ? '' : 's'}
                  {t && t.labour_minutes > 0 ? ` · ~${hours(t.labour_minutes)}` : ''} · {date(j.created_at.slice(0, 10))}
                </span>
              </div>
              <div className="list-row-side">
                <span className="badge">{JOB_STATUS_LABELS[j.status]}</span>
                {j.target_price !== null && <span className="muted">Target {money(j.target_price)}</span>}
              </div>
            </Link>
          );
        })}
      </div>

      <Link to="/jobs/new" className="fab" aria-label="New job">
        <PlusIcon />
      </Link>
    </div>
  );
}
