import { NavLink, Outlet, useLocation } from 'react-router';
import { useAuth } from '../auth/AuthProvider';
import { icons } from './icons';
import { isMoreSection, sideNav, tabNav } from './nav';
import styles from './AppShell.module.css';

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(' ');

export function AppShell() {
  const { session, signOut } = useAuth();
  const { pathname } = useLocation();
  const inMore = isMoreSection(pathname);

  return (
    <div className={styles.shell}>
      <nav className={styles.side} aria-label="Main">
        <span className={styles.brand}>Workshop</span>
        {sideNav.map((e) => (
          <NavLink
            key={e.path}
            to={e.path}
            end={e.path === '/'}
            className={({ isActive }) => cx(styles.sideLink, isActive && styles.sideLinkActive)}
          >
            {e.label}
          </NavLink>
        ))}
        <div className={styles.sideFooter}>
          <span className={styles.sideUser} title={session?.user.email}>
            {session?.user.email}
          </span>
          <button type="button" className={styles.sideLink} onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </nav>

      <main className={styles.main}>
        <Outlet />
      </main>

      <nav className={styles.tabs} aria-label="Main">
        {tabNav.map((t) => (
          <NavLink
            key={t.path}
            to={t.path}
            end={t.path === '/'}
            className={({ isActive }) =>
              cx(styles.tab, (t.path === '/more' ? inMore : isActive) && styles.tabActive)
            }
          >
            {icons[t.icon]}
            {t.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
