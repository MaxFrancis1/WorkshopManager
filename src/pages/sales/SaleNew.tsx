import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { ItemPicker } from '../../components/ItemPicker';
import { ErrorNote, Loading } from '../../components/ui';
import { PageHeader } from '../../layout/PageHeader';
import { listChannels, listItemCosts, listItems, recordSale } from '../../lib/api';
import { money, moneyInput, parseMoney, todayIso } from '../../lib/format';
import { channelFees } from '../../lib/profit';
import { ACTIVE_STATUSES } from '../../lib/types';
import { errorMessage, useAsync } from '../../lib/useAsync';

/** Record a sale: one item, or several sold together as a lot (?items=a,b). */
export function SaleNew() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { data, error } = useAsync(() => Promise.all([listItems(), listItemCosts(), listChannels()]), []);

  const [selected, setSelected] = useState<string[]>(() => (params.get('items') ?? '').split(',').filter(Boolean));
  const [channelId, setChannelId] = useState(params.get('channel') ?? '');
  const [price, setPrice] = useState(params.get('price') ?? '');
  const [fees, setFees] = useState('');
  const [feesTouched, setFeesTouched] = useState(false);
  const [postage, setPostage] = useState('');
  const [soldOn, setSoldOn] = useState(todayIso());
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  if (error) return <ErrorNote error={error} />;
  if (!data) return <Loading />;
  const [items, costs, channels] = data;
  const channel = channels.find((c) => c.id === channelId) ?? null;

  const priceN = parseMoney(price);
  // Fees follow the channel and price until edited by hand.
  const autoFees = priceN && !Number.isNaN(priceN) ? channelFees(priceN, channel) : 0;
  const feesN = feesTouched ? parseMoney(fees) : autoFees;
  const postageN = parseMoney(postage);
  const cost = selected.reduce((s, id) => s + (costs.find((c) => c.item_id === id)?.total_cost ?? 0), 0);
  const numbersOk = priceN !== null && !Number.isNaN(priceN) && !Number.isNaN(feesN) && !Number.isNaN(postageN);
  const profit = numbersOk ? (priceN ?? 0) - (feesN ?? 0) - (postageN ?? 0) - cost : null;
  const valid = numbersOk && selected.length > 0;

  const sellable = items.filter((i) => ACTIVE_STATUSES.includes(i.status) && !i.customer_id);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setSaving(true);
    setSaveError(null);
    try {
      const id = await recordSale(
        {
          sold_on: soldOn,
          channel_id: channelId || null,
          sale_price: priceN ?? 0,
          fees: feesN ?? 0,
          postage_out: postageN ?? 0,
          notes: notes.trim() || null,
        },
        selected,
      );
      navigate(`/sales/${id}`, { replace: true });
    } catch (err) {
      setSaveError(errorMessage(err));
      setSaving(false);
    }
  }

  return (
    <div className="page" style={{ maxWidth: 760 }}>
      <Link to="/sales" className="back-link">
        ← Sales
      </Link>
      <PageHeader title={selected.length > 1 ? `Sell a lot of ${selected.length}` : 'Record sale'} />

      <form className="stack" onSubmit={onSubmit} noValidate>
        <section className="card stack">
          <h2 className="section-title">What sold</h2>
          <ItemPicker items={sellable} selected={selected} onChange={setSelected} />
        </section>

        <section className="card stack">
          <div className="form-grid">
            <label className="field">
              <span className="field-label">Sold on</span>
              <select
                className="input"
                value={channelId}
                onChange={(e) => {
                  setChannelId(e.target.value);
                  setFeesTouched(false);
                }}
              >
                <option value="">Direct / no channel</option>
                {channels.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field-label">Date</span>
              <input className="input" type="date" value={soldOn} onChange={(e) => setSoldOn(e.target.value)} />
            </label>
            <label className="field">
              <span className="field-label">Final sale price</span>
              <input className="input" inputMode="decimal" placeholder="£" value={price} aria-invalid={Number.isNaN(priceN)} onChange={(e) => setPrice(e.target.value)} />
            </label>
            <label className="field">
              <span className="field-label">Fees</span>
              <input
                className="input"
                inputMode="decimal"
                value={feesTouched ? fees : moneyInput(autoFees)}
                aria-invalid={Number.isNaN(feesN)}
                onChange={(e) => {
                  setFeesTouched(true);
                  setFees(e.target.value);
                }}
              />
              <span className="field-hint">
                {channel && !feesTouched ? `${channel.fee_percent}% + ${money(channel.fixed_fee)} from ${channel.name}. Edit if different.` : 'As charged.'}
              </span>
            </label>
            <label className="field">
              <span className="field-label">Postage out</span>
              <input className="input" inputMode="decimal" placeholder="£" value={postage} aria-invalid={Number.isNaN(postageN)} onChange={(e) => setPostage(e.target.value)} />
            </label>
            <label className="field">
              <span className="field-label">Notes</span>
              <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </label>
          </div>
          {profit !== null && selected.length > 0 && (
            <div className="kv kv-total" style={{ borderTop: 0 }}>
              <span>Profit (cost so far {money(cost)})</span>
              <span className={profit < 0 ? 'negative' : undefined}>{money(profit)}</span>
            </div>
          )}
        </section>

        <ErrorNote error={saveError} />
        <div className="form-actions">
          <button className="btn btn-primary" type="submit" disabled={saving || !valid}>
            {saving ? 'Saving…' : selected.length > 1 ? `Record sale of ${selected.length} items` : 'Record sale'}
          </button>
          <Link to="/sales" className="btn btn-secondary">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
