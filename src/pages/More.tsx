import { Link } from 'react-router';
import { useAuth } from '../auth/AuthProvider';
import { icons } from '../layout/icons';
import { moreNav } from '../layout/nav';
import { PageHeader } from '../layout/PageHeader';
import styles from './More.module.css';

/** Mobile-only menu for the sections that do not fit in the tab bar. */
export function More() {
  const { session, signOut } = useAuth();

  return (
    <div className="page">
      <PageHeader title="More" />
      <nav className={`card ${styles.list}`} aria-label="More sections">
        {moreNav.map((e) => (
          <Link key={e.path} to={e.path} className={styles.row}>
            <span>{e.label}</span>
            {icons.chevron}
          </Link>
        ))}
      </nav>
      <section className={`card ${styles.account}`}>
        <span className={styles.email}>{session?.user.email}</span>
        <button type="button" className="btn btn-secondary" onClick={() => void signOut()}>
          Sign out
        </button>
      </section>
    </div>
  );
}
