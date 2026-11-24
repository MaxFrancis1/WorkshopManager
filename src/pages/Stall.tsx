import { useState } from 'react';
import { Link } from 'react-router';
import { ErrorNote, Loading, ShortId } from '../components/ui';
import { PageHeader } from '../layout/PageHeader';
import { listCategories, listChannels, listItems, listLiveListings } from '../lib/api';
import { daysSince, money, moneyWhole } from '../lib/format';
import type { Item, Listing } from '../lib/types';
import { useAsync } from '../lib/useAsync';
import styles from './Stall.module.css';

type Sort = 'newest' | 'oldest' | 'price-high' | 'price-low';

interface Card {
  key: string;
  items: Item[];
  listings: Listing[];
  price: number | null;
  postedOn: string;
}

// Soft display colours, picked per category so similar things sit together.
const SWATCHES = ['#E3EFE8', '#E8EEFD', '#FDF0E1', '#F3E8FD', '#E6F4F1', '#FDE8EC', '#EEF0EC', '#FFF6D6'];

function swatch(key: string | null): string {
  if (!key) return SWATCHES[6]!;
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return SWATCHES[h % SWATCHES.length]!;
}

/** Posted items laid out like a market stall: one card per item (or lot) on sale. */
export function Stall() {
  const { data, error, loading } = useAsync(() => Promise.all([listLiveListings(), listItems(), listCategories(), listChannels()]), []);
  const [channelFilter, setChannelFilter] = useState('');
  const [sort, setSort] = useState<Sort>('newest');

  if (error) return <ErrorNote error={error} />;
  if (loading && !data) return <Loading />;
  const [listings, items, categories, channels] = data!;
  const itemById = new Map(items.map((i) => [i.id, i]));
  const categoryName = new Map(categories.map((c) => [c.id, c.name]));
  const channelName = new Map(channels.map((c) => [c.id, c.name]));

  // One card per set of items: the same item posted on two channels is one card.
  const cards = new Map<string, Card>();
  for (const l of listings) {
    const ids = l.listing_items.map((li) => li.item_id).sort();
    const key = ids.join(',');
    const card = cards.get(key) ?? { key, items: ids.map((id) => itemById.get(id)).filter((i): i is Item => Boolean(i)), listings: [], price: null, postedOn: l.posted_on };
    card.listings.push(l);
    if (l.asking_price !== null) card.price = card.price === null ? l.asking_price : Math.min(card.price, l.asking_price);
    if (l.posted_on < card.postedOn) card.postedOn = l.posted_on;
    cards.set(key, card);
  }

  let visible = [...cards.values()].filter((c) => c.items.length > 0);
  if (channelFilter) visible = visible.filter((c) => c.listings.some((l) => l.channel_id === channelFilter));
  visible.sort((a, b) => {
    switch (sort) {
      case 'oldest':
        return a.postedOn.localeCompare(b.postedOn);
      case 'price-high':
        return (b.price ?? -1) - (a.price ?? -1);
      case 'price-low':
        return (a.price ?? Infinity) - (b.price ?? Infinity);
      default:
        return b.postedOn.localeCompare(a.postedOn);
    }
  });

  const total = visible.reduce((s, c) => s + (c.price ?? 0), 0);
  const usedChannels = channels.filter((ch) => listings.some((l) => l.channel_id === ch.id));

  return (
    <div className="page">
      <PageHeader
        title="Stall"
        actions={
          <select className="input input-sm" aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            <option value="newest">Newest first</option>
            <option value="oldest">Longest on the stall</option>
            <option value="price-high">Price, high to low</option>
            <option value="price-low">Price, low to high</option>
          </select>
        }
      />
      <span className="muted" style={{ marginTop: -10, fontSize: 14 }}>
        {visible.length} on the stall · {moneyWhole(total)} asking
      </span>

      {usedChannels.length > 1 && (
        <div className="chips" role="group" aria-label="Filter by channel">
          <button type="button" className="chip" aria-pressed={channelFilter === ''} onClick={() => setChannelFilter('')}>
            All
          </button>
          {usedChannels.map((ch) => (
            <button key={ch.id} type="button" className="chip" aria-pressed={channelFilter === ch.id} onClick={() => setChannelFilter(ch.id)}>
              {ch.name}
            </button>
          ))}
        </div>
      )}

      <div className={styles.stall}>
        <div className={styles.awning} aria-hidden="true" />
        {visible.length === 0 ? (
          <p className={styles.empty}>
            Nothing on the stall yet. Tick the channels an item is posted on, from its page, and it appears here.
          </p>
        ) : (
          <div className={styles.table}>
            {visible.map((c) => {
              const first = c.items[0]!;
              const lot = c.items.length > 1;
              const category = first.category_id ? categoryName.get(first.category_id) : undefined;
              const days = daysSince(c.postedOn);
              return (
                <Link key={c.key} to={`/items/${first.id}`} className={styles.card}>
                  <div className={styles.display} style={{ background: swatch(first.category_id) }}>
                    <span className={styles.initial} aria-hidden="true">
                      {(category ?? first.name).slice(0, 1).toUpperCase()}
                    </span>
                    <span className={styles.ids}>
                      {c.items.slice(0, 4).map((i) => (
                        <ShortId key={i.id} id={i.short_id} />
                      ))}
                    </span>
                    {c.price !== null && (
                      <span className={styles.tag}>
                        <span className={styles.hole} aria-hidden="true" />
                        {money(c.price)}
                      </span>
                    )}
                  </div>
                  <div className={styles.body}>
                    <span className={styles.name}>{lot ? `Lot of ${c.items.length}: ${c.items.map((i) => i.name).join(', ')}` : first.name}</span>
                    <span className={styles.meta}>{[category, first.contents].filter(Boolean).join(' · ') || ' '}</span>
                    <div className={styles.channels}>
                      {c.listings.map((l) => (
                        <span key={l.id} className={styles.channel}>
                          {channelName.get(l.channel_id) ?? 'Channel'}
                          {l.asking_price !== null && c.listings.length > 1 ? ` ${moneyWhole(l.asking_price)}` : ''}
                        </span>
                      ))}
                      <span className={styles.days}>{days === 0 ? 'today' : `${days} d`}</span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
