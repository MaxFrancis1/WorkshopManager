# Workshop Manager — Spec

## Overview

Single-user web app to buy, work on and sell stock in any trade, with costs per item and a profit calculator. First use: golf clubs.

- **In:** items, parts stock, jobs, work, sales, profit.
- **Out:** storefront, payments, marketplace integrations, multi-user, accounting.

## Tech stack

| Area | Choice |
| --- | --- |
| Hosting | GitHub Pages, deployed by GitHub Actions |
| Front end | Vite + React + TypeScript, hash routing (Pages 404s deep links) |
| Layout | Responsive: mobile in the workshop, desktop for admin and dashboard |
| Data | Supabase Postgres; cost roll-ups in SQL views |
| Auth | Supabase Auth, one user, sign-ups disabled |
| Security | RLS on every table (`owner_id = auth.uid()`); anon key is public, service-role key never in client |
| Files | Private Supabase Storage bucket for photos |

## Data model

Nothing is hard-coded to one trade: categories, parts and services are all entered by the user. Cost is tracked per item, so items can be split, combined or sold singly.

| Entity | Key fields |
| --- | --- |
| Category | Name (e.g. Iron set, Putter), custom fields (e.g. loft, shaft, flex) |
| Item | Short ID (e.g. K7), name (e.g. Srixon P–5 irons), category, contents (editable, e.g. 5–PW), custom field values, condition, status, purchase, allocated cost |
| To-find note | Item, what's needed (e.g. 7-iron, Srixon Z-Forged, stiff), status (Open / Sourced), cost when sourced |
| Purchase | Date, source, price, postage in |
| Part type | Name (e.g. Grip, Tape); groups interchangeable parts |
| Part | Name, part type, unit cost, qty, reorder level (e.g. Golf Pride MCC £8.50, Lamkin Crossline £6.20) |
| Service | Name, default time (min), price charged, parts needed by type + qty, default part |
| Job | Type (Refurb/Build/Customise/Service), status, items, customer, target price |
| Work line | Item, service, qty (e.g. 5 × Regrip), parts chosen, time, extra cost |
| Channel | Name (eBay, Facebook, local), fee %, fixed fee |
| Listing | Item or lot, channel, date posted, asking price, status (Live / Sold / Withdrawn) |
| Sale | Date, channel sold on, items, final sale price, fees, postage out |
| Overhead | Date, description (tools, bulk solvent), amount |
| Customer | Name, contact |
| Settings | Labour rate £/h (blank by default), aged-stock days |

**Short ID:** auto-assigned, 2 characters from an unambiguous set (no 0/O, 1/I), growing to 3 when used up. Shown on every screen, searchable, and written on a tag on the item.

**Sets:** entered as one item with editable contents; split if selling clubs separately.

**How a service costs out:** Regrip needs 1 × Grip + 1 × Tape. On the work line you pick which grip; that grip's cost is used and its stock drops. Time and price default from the service, editable per line.

Item status: In stock → In work → Ready → Listed → Sold / Written off.

## User journeys

1. **Buy, refurb, sell:** log purchase + item (Srixon P–5 irons) → add services with qty (5 × Regrip, 1 × Groove sharpen), picking parts → summary shows cost, expected profit, ~labour → generate listing text → tick channels posted to → mark where it sold, enter final price.
2. **Single item, repair + customise:** same flow, one item.
3. **Build a lot:** job pulling items from any purchase → services → sell as one lot.
4. **Customer service:** job on a customer's items (not stock) → services + parts → optional PDF quote → mark paid → optional PDF receipt.
5. **Incomplete set:** buy a set missing a 7-iron (or with a broken one) → add a to-find note → dashboard reminds you → when found, mark Sourced with its cost, added to the item.
6. **Split an item:** break a set into separate items (e.g. sell the 7-iron alone); cost divided across them.
7. **Return / refund:** item back to In stock, sale reversed, lost fees and postage logged as cost.
8. **Price drop / relist:** change asking price or channels; listing age kept.
9. **Restock parts:** log a parts purchase; qty and unit cost update.
10. **Part exchange:** customer trades an item against a sale; it enters stock at the agreed value.
11. **Customer's own parts:** service charged, no part cost or stock movement.
12. **Keep or write off:** item leaves stock; its cost is logged as a loss.

## Features

| Feature | Priority |
| --- | --- |
| Login + RLS | MVP |
| Responsive layout, mobile + desktop | MVP |
| Categories with custom fields | MVP |
| Item register: short ID, search, filters | MVP |
| Purchases with cost split | MVP |
| Parts stock: cost per part, auto-decrement, low-stock flag | MVP |
| Services: time, price, parts needed by type | MVP |
| Work lines: service × qty, bulk add, pick specific part | MVP |
| Item summary: cost, expected profit, labour hours | MVP |
| To-find notes with dashboard reminder | MVP |
| Profit calculator with optional labour rate | MVP |
| Listing text helper (no AI): item details + services done as plain text, one-click copy | MVP |
| Channels + listings: tick where posted, mark where sold | MVP |
| Sales: final sale price + fees, single or lot | MVP |
| Overheads log | MVP |
| Dashboard | MVP |
| Settings: labour rate, aged-stock days | MVP |
| Split item, return, write-off, part exchange | Next |
| PDF quote / receipt for service jobs, optional, generated in browser | Next |
| Photos | Next |
| Customers | Next |
| CSV export | Later |

Listing text format (fields left out when empty):

```
Srixon P–5 irons (5–PW)
Shaft: KBS Tour, Stiff
Condition: Good

Work done:
- 5 × Regrip (Golf Pride MCC)
- Groove sharpen
```

## Dashboard

Built from actual sale prices; calculator figures are estimates only.

| Widget | Detail |
| --- | --- |
| To find | Open to-find notes by item ID; flagged when the item is Ready or Listed |
| Aged stock | Unsold items/lots older than N days since purchase (N in settings, default 90), with cost tied up |
| Avg days to sell | Purchase date → sale date, overall and by category |
| Profit / loss | Per sale, per month, year to date, before and after overheads; losses highlighted |
| Channels | Posted vs sold per channel (e.g. 30 posted, 15 sold), sell-through %, avg days to sell |
| Stock value | Cost of unsold stock |
| Low-stock parts | Parts below reorder level |

## Profit calculator

Profit = sale − fees − postage out − (purchase share + parts + extras + labour)

- Labour hours = Σ service time × qty; always shown.
- Labour rate blank (default): "~4 h labour required"; profit excludes labour.
- Labour rate £30: "~4 h labour at £120 required"; profit shown before and after labour.
- Outputs: cost, profit, margin %, break-even, price for target margin.
- Estimate on the job; actuals on sale.
- What-if mode: max price to pay before buying.
