import { useState } from 'react';
import { Link } from 'react-router';
import { addToFindNote, createListing, deleteToFindNote, markSourced, reopenToFindNote, updateListingPrice, withdrawListing } from '../../lib/api';
import { daysSince, money, moneyInput, parseMoney, todayIso } from '../../lib/format';
import { estimate, labourLine, type ChannelFees } from '../../lib/profit';
import type { Channel, Listing, ToFindNote } from '../../lib/types';
import { errorMessage } from '../../lib/useAsync';
import styles from './ItemDetail.module.css';

type Run = (action: () => Promise<unknown>) => Promise<void>;

// ---------------------------------------------------------------------------
// To-find notes
// ---------------------------------------------------------------------------

export function ToFindSection({ itemId, notes, run, canAdd }: { itemId: string; notes: ToFindNote[]; run: Run; canAdd: boolean }) {
  const [adding, setAdding] = useState(false);
  const [desc, setDesc] = useState('');
  const open = notes.filter((n) => n.status === 'open');
  const sourced = notes.filter((n) => n.status === 'sourced');

  return (
    <>
      {open.map((n) => (
        <OpenNote key={n.id} note={n} run={run} />
      ))}
      {sourced.length > 0 && (
        <p className="field-hint" style={{ margin: 0 }}>
          Sourced:{' '}
          {sourced.map((n, i) => (
            <span key={n.id}>
              {i > 0 && ', '}
              {n.description} ({money(n.cost)}){' '}
              {canAdd && (
                <button type="button" className="link-button" style={{ fontSize: 12, minHeight: 0 }} onClick={() => void run(() => reopenToFindNote(n.id))}>
                  undo
                </button>
              )}
            </span>
          ))}
        </p>
      )}
      {canAdd &&
        (adding ? (
          <form
            className="card"
            style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}
            onSubmit={(e) => {
              e.preventDefault();
              if (!desc.trim()) return;
              void run(async () => {
                await addToFindNote(itemId, desc);
                setDesc('');
                setAdding(false);
              });
            }}
          >
            <label className="field" style={{ flex: 1 }}>
              <span className="field-label">What's needed</span>
              <input className="input input-sm" autoFocus value={desc} placeholder="e.g. 7-iron, Srixon Z-Forged, stiff" onChange={(e) => setDesc(e.target.value)} />
            </label>
            <button className="btn btn-primary" type="submit" style={{ minHeight: 40 }} disabled={!desc.trim()}>
              Add
            </button>
            <button type="button" className="link-button" onClick={() => setAdding(false)}>
              Cancel
            </button>
          </form>
        ) : (
          <button type="button" className="link-button" style={{ alignSelf: 'flex-start' }} onClick={() => setAdding(true)}>
            + Something to find
          </button>
        ))}
    </>
  );
}

function OpenNote({ note, run }: { note: ToFindNote; run: Run }) {
  const [sourcing, setSourcing] = useState(false);
  const [cost, setCost] = useState('');
  const costN = parseMoney(cost);

  return (
    <section className="to-find">
      <div style={{ flex: 1, minWidth: 160, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span className="to-find-label">TO FIND</span>
        <span style={{ fontSize: 14, fontWeight: 600 }}>{note.description}</span>
      </div>
      {sourcing ? (
        <form
          style={{ display: 'flex', gap: 8, alignItems: 'center' }}
          onSubmit={(e) => {
            e.preventDefault();
            if (costN === null || Number.isNaN(costN)) return;
            void run(() => markSourced(note.id, costN, todayIso()));
          }}
        >
          <input
            className="input input-sm"
            style={{ width: 100 }}
            autoFocus
            inputMode="decimal"
            placeholder="Cost £"
            aria-label="Cost of the sourced part"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
          />
          <button className="btn btn-warn" type="submit" disabled={costN === null || Number.isNaN(costN)}>
            Save
          </button>
        </form>
      ) : (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button type="button" className="btn btn-warn" onClick={() => setSourcing(true)}>
            Mark sourced
          </button>
          <button
            type="button"
            className="link-button danger"
            aria-label={`Delete note ${note.description}`}
            onClick={() => {
              if (window.confirm('Delete this note?')) void run(() => deleteToFindNote(note.id));
            }}
          >
            ✕
          </button>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Posted to: one checkbox per channel
// ---------------------------------------------------------------------------

export function PostedTo({
  itemId,
  channels,
  listings,
  defaultPrice,
  run,
  editable,
}: {
  itemId: string;
  channels: Channel[];
  listings: Listing[];
  defaultPrice: number | null;
  run: Run;
  editable: boolean;
}) {
  if (channels.length === 0) {
    return (
      <p className="muted" style={{ margin: 0, fontSize: 14 }}>
        Add your selling channels in <Link to="/settings/channels">Settings</Link> to tick where it's posted.
      </p>
    );
  }
  return (
    <div className="stack" style={{ gap: 4 }}>
      {channels.map((c) => {
        const live = listings.find((l) => l.channel_id === c.id && l.status === 'live');
        const sold = listings.find((l) => l.channel_id === c.id && l.status === 'sold');
        return (
          <ChannelTick
            key={`${c.id}-${live?.id ?? ''}-${live?.asking_price ?? ''}`}
            itemId={itemId}
            channel={c}
            live={live}
            sold={sold}
            defaultPrice={defaultPrice}
            run={run}
            editable={editable}
          />
        );
      })}
    </div>
  );
}

function ChannelTick({
  itemId,
  channel,
  live,
  sold,
  defaultPrice,
  run,
  editable,
}: {
  itemId: string;
  channel: Channel;
  live: Listing | undefined;
  sold: Listing | undefined;
  defaultPrice: number | null;
  run: Run;
  editable: boolean;
}) {
  const [price, setPrice] = useState(moneyInput(live?.asking_price ?? null));
  const priceN = parseMoney(price);
  const age = live ? daysSince(live.posted_on) : null;

  async function toggle(checked: boolean) {
    if (checked) {
      let asking = defaultPrice;
      if (asking === null) {
        const entered = window.prompt(`Asking price on ${channel.name}?`, '');
        if (entered === null) return;
        const n = parseMoney(entered);
        if (n === null || Number.isNaN(n)) return;
        asking = n;
      }
      await run(() => createListing({ channel_id: channel.id, asking_price: asking }, [itemId]));
    } else if (live && window.confirm(`Take it off ${channel.name}?`)) {
      await run(() => withdrawListing(live.id));
    }
  }

  return (
    <div className={styles.tickRow}>
      <label className={styles.tickLabel}>
        <input type="checkbox" checked={Boolean(live) || Boolean(sold)} disabled={!editable || Boolean(sold)} onChange={(e) => void toggle(e.target.checked)} />
        <span style={{ fontWeight: 600 }}>{channel.name}</span>
      </label>
      {sold ? (
        <span className="badge badge-sold">Sold here</span>
      ) : live ? (
        <span className={styles.tickMeta}>
          <input
            className="input input-sm"
            style={{ width: 90, textAlign: 'right' }}
            inputMode="decimal"
            aria-label={`Asking price on ${channel.name}`}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            onBlur={() => {
              if (priceN !== null && !Number.isNaN(priceN) && priceN !== live.asking_price) void run(() => updateListingPrice(live.id, priceN));
            }}
          />
          <span className="muted">{age} d</span>
        </span>
      ) : (
        <span className="muted" style={{ fontSize: 13 }}>
          Not posted
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Profit calculator (estimate)
// ---------------------------------------------------------------------------

export interface CalcState {
  sale: string;
  channelId: string;
  postage: string;
  target: string;
}

export function ProfitCalculator({
  cost,
  labourMinutes,
  labourRate,
  channels,
  state,
  onChange,
  breakdown,
}: {
  cost: number;
  labourMinutes: number;
  labourRate: number | null;
  channels: Channel[];
  state: CalcState;
  onChange: (s: CalcState) => void;
  breakdown: { label: string; amount: number }[];
}) {
  const saleN = parseMoney(state.sale);
  const postageN = parseMoney(state.postage);
  const targetN = state.target.trim() === '' ? null : Number(state.target.replace('%', ''));
  const channel: ChannelFees | null = channels.find((c) => c.id === state.channelId) ?? null;
  const ok = !Number.isNaN(saleN) && !Number.isNaN(postageN) && (targetN === null || Number.isFinite(targetN));
  const e = ok
    ? estimate({ cost, salePrice: saleN, channel, postageOut: postageN ?? 0, labourMinutes, labourRate, targetMarginPercent: targetN })
    : null;

  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className={styles.calcInputs}>
        <label className="field">
          <span className="field-label">Expected sale</span>
          <input className="input input-sm" inputMode="decimal" placeholder="£" value={state.sale} aria-invalid={Number.isNaN(saleN)} onChange={(ev) => onChange({ ...state, sale: ev.target.value })} />
        </label>
        <label className="field">
          <span className="field-label">Channel</span>
          <select className="input input-sm" value={state.channelId} onChange={(ev) => onChange({ ...state, channelId: ev.target.value })}>
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
          <input className="input input-sm" inputMode="decimal" placeholder="£" value={state.postage} aria-invalid={Number.isNaN(postageN)} onChange={(ev) => onChange({ ...state, postage: ev.target.value })} />
        </label>
        <label className="field">
          <span className="field-label">Target margin %</span>
          <input className="input input-sm" inputMode="decimal" placeholder="e.g. 30" value={state.target} onChange={(ev) => onChange({ ...state, target: ev.target.value })} />
        </label>
      </div>

      <div>
        {breakdown
          .filter((b) => b.amount > 0)
          .map((b) => (
            <div className="kv" key={b.label}>
              <span>{b.label}</span>
              <span>{money(b.amount)}</span>
            </div>
          ))}
        {e && saleN !== null && (
          <>
            <div className="kv">
              <span>Fees (est.)</span>
              <span>{money(e.fees)}</span>
            </div>
            <div className="kv">
              <span>Postage out</span>
              <span>{money(postageN ?? 0)}</span>
            </div>
            <div className="kv kv-total">
              <span>Profit</span>
              <span className={e.profit < 0 ? 'negative' : undefined}>{money(e.profit)}</span>
            </div>
            <div className="kv">
              <span>Margin</span>
              <span>{e.marginPercent !== null ? `${e.marginPercent}%` : '—'}</span>
            </div>
            {e.profitAfterLabour !== null && (
              <div className="kv">
                <span>After labour</span>
                <span className={e.profitAfterLabour < 0 ? 'negative' : undefined}>{money(e.profitAfterLabour)}</span>
              </div>
            )}
          </>
        )}
        {e && (
          <>
            <div className="kv">
              <span>Break-even price{labourRate !== null ? ' (incl. labour)' : ''}</span>
              <span>{money(e.breakEven)}</span>
            </div>
            {targetN !== null && (
              <div className="kv">
                <span>Price for {targetN}% margin</span>
                <span>{e.priceForTarget !== null ? money(e.priceForTarget) : 'Not possible'}</span>
              </div>
            )}
          </>
        )}
      </div>

      {labourMinutes > 0 && e && <p className={styles.labour}>{labourLine(e.labourHours, e.labourCost, money)}</p>}
      <p className="field-hint" style={{ margin: 0 }}>
        Estimate only.{' '}
        {labourRate === null ? (
          <>
            Set a labour rate in <Link to="/settings">Settings</Link> to cost labour.
          </>
        ) : (
          <>Labour at {money(labourRate)}/h.</>
        )}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Listing text with copy
// ---------------------------------------------------------------------------

export function ListingTextCard({ text }: { text: string }) {
  const [copied, setCopied] = useState<string | null>(null);
  return (
    <section className="card">
      <div className="section-head">
        <h2 className="section-title">Listing text</h2>
        <button
          type="button"
          className="btn"
          style={{ background: 'var(--ink)', color: '#fff', minHeight: 40 }}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text);
              setCopied('Copied');
            } catch (err) {
              setCopied(`Copy failed: ${errorMessage(err)}`);
            }
            window.setTimeout(() => setCopied(null), 2500);
          }}
        >
          {copied ?? 'Copy'}
        </button>
      </div>
      <pre className="listing-text">{text}</pre>
    </section>
  );
}
