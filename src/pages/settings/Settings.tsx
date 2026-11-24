import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { ErrorNote, Loading } from '../../components/ui';
import { icons } from '../../layout/icons';
import { PageHeader } from '../../layout/PageHeader';
import { getSettings, saveSettings } from '../../lib/api';
import { moneyInput, parseMoney } from '../../lib/format';
import { errorMessage, useAsync } from '../../lib/useAsync';
import styles from '../More.module.css';

export function Settings() {
  const { data, error } = useAsync(getSettings, []);
  const [rate, setRate] = useState('');
  const [days, setDays] = useState('90');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!data) return;
    setRate(moneyInput(data.labour_rate));
    setDays(String(data.aged_stock_days));
  }, [data]);

  const rateN = parseMoney(rate);
  const daysN = Number.parseInt(days, 10);
  const valid = !Number.isNaN(rateN) && daysN > 0;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setSaveError(null);
    try {
      await saveSettings({ labour_rate: rateN, aged_stock_days: daysN });
      setSaved(true);
    } catch (err) {
      setSaveError(errorMessage(err));
    }
  }

  return (
    <div className="page" style={{ maxWidth: 760 }}>
      <PageHeader title="Settings" />
      <ErrorNote error={error} />
      {!data && !error ? (
        <Loading />
      ) : (
        <form className="card stack" onSubmit={onSubmit} onChange={() => setSaved(false)} noValidate>
          <div className="form-grid">
            <label className="field">
              <span className="field-label">Labour rate, £ per hour</span>
              <input className="input" inputMode="decimal" placeholder="Blank = not costed" value={rate} aria-invalid={Number.isNaN(rateN)} onChange={(e) => setRate(e.target.value)} />
              <span className="field-hint">
                Blank shows "~4 h labour required" and leaves labour out of profit. With a rate, profit is shown before and after labour.
              </span>
            </label>
            <label className="field">
              <span className="field-label">Aged stock after, days</span>
              <input className="input" inputMode="numeric" value={days} aria-invalid={!(daysN > 0)} onChange={(e) => setDays(e.target.value)} />
              <span className="field-hint">Unsold items older than this (since purchase) show on the dashboard.</span>
            </label>
          </div>
          <ErrorNote error={saveError} />
          <div className="form-actions">
            <button className="btn btn-primary" type="submit" disabled={!valid}>
              Save settings
            </button>
            {saved && <span className="muted">Saved.</span>}
          </div>
        </form>
      )}

      <nav className={`card ${styles.list}`} aria-label="Settings sections">
        <Link to="/settings/categories" className={styles.row}>
          <span>Categories and custom fields</span>
          {icons.chevron}
        </Link>
        <Link to="/settings/sources" className={styles.row}>
          <span>Purchase sources</span>
          {icons.chevron}
        </Link>
        <Link to="/settings/channels" className={styles.row}>
          <span>Selling channels and fees</span>
          {icons.chevron}
        </Link>
        <Link to="/calculator" className={styles.row}>
          <span>What-if calculator</span>
          {icons.chevron}
        </Link>
      </nav>
    </div>
  );
}
