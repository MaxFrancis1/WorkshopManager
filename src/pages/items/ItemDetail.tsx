import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { fieldPairs } from '../../components/FieldValuesEditor';
import { ErrorNote, Loading, ShortId, StatusBadge } from '../../components/ui';
import { WorkLinesTable } from '../../components/WorkLinesTable';
import {
  deleteWorkLine,
  getItem,
  getItemCost,
  getPurchase,
  getSaleProfit,
  getSettings,
  listCategories,
  listChannels,
  listListingsForItem,
  listPartStock,
  listSaleItemLinks,
  listServices,
  listToFindNotes,
  listWorkLinesForItem,
  updateItem,
} from '../../lib/api';
import { date, daysSince, hours, money, moneyInput, parseMoney } from '../../lib/format';
import { listingText } from '../../lib/listingText';
import { channelFees } from '../../lib/profit';
import { ACTIVE_STATUSES, ITEM_STATUSES, STATUS_LABELS, type ItemStatus } from '../../lib/types';
import { errorMessage, useAsync } from '../../lib/useAsync';
import styles from './ItemDetail.module.css';
import { ListingTextCard, PostedTo, ProfitCalculator, ToFindSection, withSale, type CalcState } from './sections';

const EMPTY_CALC: CalcState = { sale: '', channelId: '', postage: '', margin: '' };

/**
 * Channel and postage are remembered per item in this browser only. The expected
 * sale is saved on the item (its value), and the margin is worked out from it.
 */
function loadCalc(itemId: string): Pick<CalcState, 'channelId' | 'postage'> | null {
  try {
    const raw = localStorage.getItem(`calc:${itemId}`);
    if (!raw) return null;
    const saved = JSON.parse(raw) as Partial<CalcState>;
    return { channelId: saved.channelId ?? '', postage: saved.postage ?? '' };
  } catch {
    return null;
  }
}

function saveCalc(itemId: string, state: CalcState) {
  try {
    localStorage.setItem(`calc:${itemId}`, JSON.stringify({ channelId: state.channelId, postage: state.postage }));
  } catch {
    /* storage unavailable: fine, it's a convenience */
  }
}

export function ItemDetail() {
  const { id = '' } = useParams();
  const { data, error, loading, reload } = useAsync(async () => {
    const [item, cost, categories, lines, services, parts, notes, listings, channels, settings, saleLinks] = await Promise.all([
      getItem(id),
      getItemCost(id),
      listCategories(),
      listWorkLinesForItem(id),
      listServices(),
      listPartStock(),
      listToFindNotes(id),
      listListingsForItem(id),
      listChannels(),
      getSettings(),
      listSaleItemLinks(),
    ]);
    const purchase = item?.purchase_id ? await getPurchase(item.purchase_id) : null;
    const saleId = saleLinks.find((l) => l.item_id === id)?.sale_id;
    const sale = saleId ? await getSaleProfit(saleId) : null;
    return { item, cost, categories, purchase, lines, services, parts, notes, listings, channels, settings, sale };
  }, [id]);

  const [actionError, setActionError] = useState<string | null>(null);
  const [calc, setCalc] = useState<CalcState>(EMPTY_CALC);
  const [calcReady, setCalcReady] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [saleTyped, setSaleTyped] = useState(false);

  // Calculator defaults: the item's value (else its live listing's price), and the
  // channel and postage last used for it in this browser.
  useEffect(() => {
    if (!data?.item || calcReady) return;
    const saved = loadCalc(id);
    const live = data.listings.find((l) => l.status === 'live');
    const start: CalcState = {
      ...EMPTY_CALC,
      channelId: saved?.channelId ?? live?.channel_id ?? data.channels[0]?.id ?? '',
      postage: saved?.postage ?? '',
    };
    const sale = moneyInput(data.item.expected_price ?? live?.asking_price ?? null);
    setCalc(
      withSale(start, sale, {
        cost: data.cost?.total_cost ?? 0,
        labourMinutes: data.cost?.labour_minutes ?? 0,
        labourRate: data.settings.labour_rate,
        channels: data.channels,
      }),
    );
    setCalcReady(true);
  }, [data, calcReady, id]);

  // Save the expected sale as the item's value, shortly after you type it (never
  // just from opening the page, which pre-fills it from a listing's price).
  const savedPrice = data?.item?.expected_price ?? null;
  useEffect(() => {
    if (!calcReady || !saleTyped) return;
    const n = parseMoney(calc.sale);
    if (Number.isNaN(n) || n === savedPrice) return;
    const t = window.setTimeout(() => {
      updateItem(id, { expected_price: n }).then(reload, (err: unknown) => setActionError(errorMessage(err)));
    }, 800);
    return () => window.clearTimeout(t);
  }, [calc.sale, calcReady, saleTyped, savedPrice, id, reload]);

  if (loading && !data) return <Loading />;
  if (error) return <ErrorNote error={error} />;
  if (!data?.item) {
    return (
      <div className="page">
        <Link to="/items" className="back-link">
          ← Items
        </Link>
        <p>Item not found.</p>
      </div>
    );
  }

  const { item, cost, categories, purchase, lines, services, parts, notes, listings, channels, settings, sale } = data;
  const category = categories.find((c) => c.id === item.category_id);
  const pairs = category ? fieldPairs(category.category_fields, item.field_values) : [];
  const active = ACTIVE_STATUSES.includes(item.status);
  const days = daysSince(purchase?.purchased_on);

  const meta: string[] = [];
  if (category) meta.push(category.name);
  if (purchase) meta.push(`bought ${date(purchase.purchased_on)}${purchase.source ? ` from ${purchase.source}` : ''}`);
  if (days !== null && active) meta.push(`${days} day${days === 1 ? '' : 's'} in stock`);

  async function run(action: () => Promise<unknown>) {
    setActionError(null);
    try {
      await action();
      reload();
    } catch (err) {
      setActionError(errorMessage(err));
    }
  }

  const serviceName = (sid: string) => services.find((s) => s.id === sid)?.name ?? 'Service';
  const text = listingText({
    name: item.name,
    contents: item.contents,
    fields: pairs,
    condition: item.condition,
    work: lines.map((l) => {
      const first = l.work_line_parts.find((p) => !p.customer_supplied && p.part_id);
      return { service: serviceName(l.service_id), qty: l.qty, part: first ? (parts.find((p) => p.part_id === first.part_id)?.name ?? null) : null };
    }),
  });

  const totalCost = cost?.total_cost ?? 0;
  const labourMinutes = cost?.labour_minutes ?? 0;
  const saleN = parseMoney(calc.sale);
  const calcChannel = channels.find((c) => c.id === calc.channelId) ?? null;
  const postageN = parseMoney(calc.postage);
  // Value: what's being typed in the calculator, else the item's saved value.
  const listedPrice = cost?.listed_price ?? null;
  const valueN = saleN !== null && !Number.isNaN(saleN) ? saleN : (cost?.sale_value ?? null);
  const quickProfit =
    saleN !== null && !Number.isNaN(saleN) && !Number.isNaN(postageN)
      ? saleN - channelFees(saleN, calcChannel) - (postageN ?? 0) - totalCost
      : null;

  const breakdown = cost
    ? [
        { label: 'Purchase share', amount: cost.purchase_share },
        { label: 'Parts', amount: cost.parts_cost },
        { label: 'Extras', amount: cost.extras_cost },
        { label: 'Sourced parts', amount: cost.to_find_cost },
      ]
    : [];

  return (
    <div className="page">
      <Link to="/items" className="back-link">
        ← Items
      </Link>

      <header className={styles.header}>
        <ShortId id={item.short_id} large dark />
        <div className={styles.titleBlock}>
          <h1 className={styles.title}>{item.name}</h1>
          {meta.length > 0 && <span className="muted">{meta.join(' · ')}</span>}
        </div>
        <div className={styles.headerSide}>
          <StatusBadge status={item.status} />
          <Link to={`/items/${item.id}/edit`} className="btn btn-secondary">
            Edit
          </Link>
          {active && (
            <Link to={`/sales/new?items=${item.id}${calc.channelId ? `&channel=${calc.channelId}` : ''}${saleN ? `&price=${saleN}` : ''}`} className="btn btn-primary desktop-only">
              Mark sold
            </Link>
          )}
        </div>
      </header>

      <ErrorNote error={actionError} />

      {sale ? (
        <section className="tiles tiles-3">
          <div className="tile">
            <span className="tile-label">Cost</span>
            <span className="tile-value">{money(sale.items_cost)}</span>
          </div>
          <div className="tile">
            <span className="tile-label">Sold for</span>
            <span className="tile-value">{money(sale.sale_price)}</span>
            <span className="tile-sub">{date(sale.sold_on)}</span>
          </div>
          <Link to={`/sales/${sale.sale_id}`} className={`tile ${sale.profit >= 0 ? 'tile-accent' : ''}`} style={{ textDecoration: 'none', color: sale.profit >= 0 ? '#fff' : 'var(--danger)' }}>
            <span className="tile-label">Profit{sale.item_count > 1 ? ` (lot of ${sale.item_count})` : ''}</span>
            <span className="tile-value">{money(sale.profit)}</span>
            <span className="tile-sub">View sale →</span>
          </Link>
        </section>
      ) : (
        <section className="tiles tiles-3">
          <div className="tile">
            <span className="tile-label">Cost</span>
            <span className="tile-value">{money(totalCost)}</span>
            <span className="tile-sub">What you've put in</span>
          </div>
          <div className="tile">
            <span className="tile-label">Value</span>
            <span className="tile-value">{valueN !== null ? money(valueN) : '—'}</span>
            <span className="tile-sub">{listedPrice !== null ? 'Asking price' : valueN !== null ? 'Hope to sell for' : 'Set below'}</span>
          </div>
          <div className={`tile ${quickProfit !== null && quickProfit >= 0 ? 'tile-accent' : ''}`}>
            <span className="tile-label">Profit</span>
            <span className={`tile-value${quickProfit !== null && quickProfit < 0 ? ' negative' : ''}`}>{quickProfit !== null ? money(quickProfit) : '—'}</span>
            <span className="tile-sub">After fees, est.</span>
          </div>
        </section>
      )}

      <ToFindSection itemId={item.id} notes={notes} run={run} canAdd={item.status !== 'sold' && item.status !== 'written_off'} />

      <div className={styles.columns}>
        <div className="stack">
          <section className="card">
            <h2 className="section-title" style={{ marginBottom: 4 }}>
              Details
            </h2>
            <div className="kv">
              <span>Contents</span>
              <span>{item.contents || '—'}</span>
            </div>
            {pairs.map((p) => (
              <div className="kv" key={p.name}>
                <span>{p.name}</span>
                <span>{p.value}</span>
              </div>
            ))}
            <div className="kv">
              <span>Condition</span>
              <span>{item.condition || '—'}</span>
            </div>
            {item.notes && <p className={styles.notes}>{item.notes}</p>}
          </section>

          <section className="card">
            <div className="section-head">
              <h2 className="section-title">Services</h2>
              {active && (
                <Link to={`/items/${item.id}/add-service`} className="btn btn-secondary" style={{ minHeight: 40 }}>
                  + Add service
                </Link>
              )}
            </div>
            {lines.length === 0 ? (
              <p className="muted" style={{ margin: 0, fontSize: 14 }}>
                No work yet.
              </p>
            ) : (
              <WorkLinesTable
                lines={lines}
                services={services}
                parts={parts}
                onDelete={
                  active
                    ? (l) => {
                        if (window.confirm(`Remove ${l.qty} × ${serviceName(l.service_id)}? Its parts go back into stock.`)) void run(() => deleteWorkLine(l.id));
                      }
                    : undefined
                }
              />
            )}
            {labourMinutes > 0 && (
              <p className="field-hint" style={{ margin: '8px 0 0' }}>
                ~{hours(labourMinutes)} labour in total.
              </p>
            )}
          </section>

          <ListingTextCard text={text} />
        </div>

        <aside className="stack">
          {!sale && (
            <section className="card">
              <h2 className="section-title" style={{ marginBottom: 10 }}>
                Profit
              </h2>
              <ProfitCalculator
                cost={totalCost}
                labourMinutes={labourMinutes}
                labourRate={settings.labour_rate}
                channels={channels}
                state={calc}
                onChange={(s) => {
                  if (s.sale !== calc.sale) setSaleTyped(true);
                  setCalc(s);
                  saveCalc(item.id, s);
                }}
                breakdown={breakdown}
              />
            </section>
          )}
          {sale && cost && (
            <section className="card">
              <h2 className="section-title" style={{ marginBottom: 4 }}>
                Cost
              </h2>
              {breakdown
                .filter((b) => b.amount > 0)
                .map((b) => (
                  <div className="kv" key={b.label}>
                    <span>{b.label}</span>
                    <span>{money(b.amount)}</span>
                  </div>
                ))}
              <div className="kv kv-total">
                <span>Total cost</span>
                <span>{money(totalCost)}</span>
              </div>
            </section>
          )}

          <section className="card">
            <h2 className="section-title" style={{ marginBottom: 6 }}>
              Posted to
            </h2>
            <PostedTo
              itemId={item.id}
              channels={channels}
              listings={listings}
              defaultPrice={saleN !== null && !Number.isNaN(saleN) ? saleN : null}
              run={run}
              editable={active}
            />
          </section>

          <section className="card">
            <label className="field">
              <span className="field-label">Status</span>
              <select className="input" value={item.status} onChange={(e) => void run(() => updateItem(item.id, { status: e.target.value as ItemStatus }))}>
                {ITEM_STATUSES.map((s) => (
                  <option key={s} value={s} disabled={s === 'sold' && item.status !== 'sold'}>
                    {STATUS_LABELS[s]}
                    {s === 'sold' && item.status !== 'sold' ? ' (use Mark sold)' : ''}
                  </option>
                ))}
              </select>
            </label>
            {purchase && (
              <p className="field-hint" style={{ margin: '10px 0 0' }}>
                From <Link to={`/purchases/${purchase.id}`}>{purchase.source || 'purchase'}</Link>, {date(purchase.purchased_on)}.
              </p>
            )}
          </section>
        </aside>
      </div>

      {active && (
        <div className={`${styles.actions} mobile-only`}>
          <button
            type="button"
            className="btn btn-secondary btn-block"
            onClick={() => {
              navigator.clipboard.writeText(text).then(
                () => setCopied('Copied'),
                () => setCopied('Copy failed'),
              );
              window.setTimeout(() => setCopied(null), 2500);
            }}
          >
            {copied ?? 'Copy listing'}
          </button>
          <Link
            to={`/sales/new?items=${item.id}${calc.channelId ? `&channel=${calc.channelId}` : ''}${saleN ? `&price=${saleN}` : ''}`}
            className="btn btn-primary btn-block"
          >
            Mark sold
          </Link>
        </div>
      )}
    </div>
  );
}
