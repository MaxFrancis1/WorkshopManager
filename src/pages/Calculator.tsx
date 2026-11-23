import { useState } from 'react';
import { Link } from 'react-router';
import { ErrorNote, Loading } from '../components/ui';
import { PageHeader } from '../layout/PageHeader';
import { getSettings, listChannels } from '../lib/api';
import { money, parseMoney } from '../lib/format';
import { channelFees, maxPurchasePrice } from '../lib/profit';
import { useAsync } from '../lib/useAsync';

/** What-if mode: the most you can pay for something before buying it. */
export function Calculator() {
  const { data, error } = useAsync(() => Promise.all([listChannels(), getSettings()]), []);
  const [sale, setSale] = useState('');
  const [channelId, setChannelId] = useState('');
  const [postage, setPostage] = useState('');
  const [work, setWork] = useState('');
  const [hoursIn, setHoursIn] = useState('');
  const [margin, setMargin] = useState('30');

  if (error) return <ErrorNote error={error} />;
  if (!data) return <Loading />;
  const [channels, settings] = data;
  const channel = channels.find((c) => c.id === channelId) ?? null;

  const saleN = parseMoney(sale);
  const postageN = parseMoney(postage);
  const workN = parseMoney(work);
  const hoursN = hoursIn.trim() === '' ? 0 : Number(hoursIn);
  const marginN = margin.trim() === '' ? 0 : Number(margin.replace('%', ''));
  const ok = saleN !== null && [saleN, postageN, workN].every((n) => !Number.isNaN(n)) && Number.isFinite(hoursN) && Number.isFinite(marginN);

  const max = ok
    ? maxPurchasePrice({
        expectedSale: saleN ?? 0,
        channel,
        postageOut: postageN ?? 0,
        workCost: workN ?? 0,
        labourMinutes: hoursN * 60,
        labourRate: settings.labour_rate,
        targetMarginPercent: marginN,
      })
    : null;

  return (
    <div className="page" style={{ maxWidth: 640 }}>
      <Link to="/purchases" className="back-link">
        ← Purchases
      </Link>
      <PageHeader title="What-if" />
      <p className="muted" style={{ margin: 0, fontSize: 14 }}>
        Before you buy: what's the most you can pay and still make your margin?
      </p>

      <section className="card stack">
        <div className="form-grid">
          <label className="field">
            <span className="field-label">Expected sale price</span>
            <input className="input" inputMode="decimal" placeholder="£" value={sale} aria-invalid={Number.isNaN(saleN)} onChange={(e) => setSale(e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">Selling on</span>
            <select className="input" value={channelId} onChange={(e) => setChannelId(e.target.value)}>
              <option value="">No fees</option>
              {channels.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field-label">Postage out</span>
            <input className="input" inputMode="decimal" placeholder="£" value={postage} aria-invalid={Number.isNaN(postageN)} onChange={(e) => setPostage(e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">Parts and extras needed</span>
            <input className="input" inputMode="decimal" placeholder="£" value={work} aria-invalid={Number.isNaN(workN)} onChange={(e) => setWork(e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">Labour, hours</span>
            <input className="input" inputMode="decimal" value={hoursIn} onChange={(e) => setHoursIn(e.target.value)} />
            <span className="field-hint">
              {settings.labour_rate !== null ? `Costed at ${money(settings.labour_rate)}/h.` : 'Not costed: no labour rate set.'}
            </span>
          </label>
          <label className="field">
            <span className="field-label">Target margin %</span>
            <input className="input" inputMode="decimal" value={margin} onChange={(e) => setMargin(e.target.value)} />
          </label>
        </div>

        {max !== null && (
          <div className="stack" style={{ gap: 0 }}>
            <div className="kv">
              <span>Fees (est.)</span>
              <span>{money(channelFees(saleN ?? 0, channel))}</span>
            </div>
            <div className="kv">
              <span>Margin kept</span>
              <span>{money(((saleN ?? 0) * marginN) / 100)}</span>
            </div>
            <div className="kv kv-total">
              <span>Pay no more than</span>
              <span className={max < 0 ? 'negative' : undefined}>{money(max)}</span>
            </div>
            {max < 0 && (
              <p className="alert alert-warn" style={{ marginTop: 10 }}>
                At that sale price you can't make a {marginN}% margin even if it's free.
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
