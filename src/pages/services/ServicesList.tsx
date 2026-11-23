import { Link } from 'react-router';
import { Empty, ErrorNote, Loading, PlusIcon } from '../../components/ui';
import { PageHeader } from '../../layout/PageHeader';
import { listPartTypes, listServices } from '../../lib/api';
import { money } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';

export function ServicesList() {
  const { data, error, loading } = useAsync(() => Promise.all([listServices(), listPartTypes()]), []);

  if (error) return <ErrorNote error={error} />;
  if (loading && !data) return <Loading />;
  const [services, types] = data!;
  const typeName = new Map(types.map((t) => [t.id, t.name]));

  return (
    <div className="page">
      <PageHeader
        title="Services"
        actions={
          <Link to="/services/new" className="btn btn-primary desktop-only">
            + Add service
          </Link>
        }
      />
      {services.length === 0 && (
        <Empty>
          No services yet. A service is a job you do to an item, such as Regrip, with its usual time and the parts it needs.{' '}
          <Link to="/services/new">Add your first service</Link>.
        </Empty>
      )}
      <div className="list">
        {services.map((s) => (
          <Link key={s.id} to={`/services/${s.id}`} className="list-row">
            <div className="list-row-main">
              <span className="list-row-title">{s.name}</span>
              <span className="list-row-meta">
                {s.default_minutes} min
                {s.service_parts.length > 0 &&
                  ` · needs ${s.service_parts.map((p) => `${p.qty} × ${typeName.get(p.part_type_id) ?? 'part'}`).join(', ')}`}
              </span>
            </div>
            <div className="list-row-side">
              <span>{money(s.price)}</span>
              <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>
                charged
              </span>
            </div>
          </Link>
        ))}
      </div>
      <Link to="/services/new" className="fab" aria-label="Add service">
        <PlusIcon />
      </Link>
    </div>
  );
}
