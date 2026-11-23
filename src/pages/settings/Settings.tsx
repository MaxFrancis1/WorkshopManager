import { Link } from 'react-router';
import { icons } from '../../layout/icons';
import { PageHeader } from '../../layout/PageHeader';
import styles from '../More.module.css';

export function Settings() {
  return (
    <div className="page">
      <PageHeader title="Settings" />
      <nav className={`card ${styles.list}`} aria-label="Settings sections">
        <Link to="/settings/categories" className={styles.row}>
          <span>Categories and custom fields</span>
          {icons.chevron}
        </Link>
      </nav>
      <section className="card empty">
        <p>Labour rate and aged-stock days come in phase 6.</p>
      </section>
    </div>
  );
}
